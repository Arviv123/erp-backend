/**
 * ReportGeneratorPage — מחולל דוחות מתקדם ומותאם אישית
 * Self-service BI builder: data source → columns → filters → grouping → sort → Excel
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Plus, Trash2, Play, Download, RefreshCw } from 'lucide-react';
import api from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type FieldType = 'text' | 'number' | 'currency' | 'date' | 'enum' | 'boolean';
type Operator = 'eq' | 'neq' | 'contains' | 'starts' | 'gt' | 'lt' | 'gte' | 'lte' | 'empty' | 'notempty';
type SortDir = 'asc' | 'desc';

interface FieldDef {
  key:           string;
  label:         string;
  type:          FieldType;
  enumValues?:   { value: string; label: string }[];
  filterable?:   boolean;
  groupable?:    boolean;
  defaultVisible?: boolean;
  isNumeric?:    boolean;  // aggregated (sum) when grouping
}

interface DataSource {
  id:            string;
  label:         string;
  icon:          string;
  endpoint:      string;
  defaultParams?: Record<string, any>;
  extractData:   (r: any) => any[];
  dateField?:    string;
  fields:        FieldDef[];
}

interface FilterRow {
  id:    number;
  field: string;
  op:    Operator;
  value: string;
}

interface SortConfig { field: string; dir: SortDir; }

// ── Operator definitions ───────────────────────────────────────────────────────
const OPS: { value: Operator; label: string; types: FieldType[] }[] = [
  { value: 'eq',       label: 'שווה ל',         types: ['text','number','currency','date','enum','boolean'] },
  { value: 'neq',      label: 'שונה מ',          types: ['text','number','currency','date','enum','boolean'] },
  { value: 'contains', label: 'מכיל',            types: ['text'] },
  { value: 'starts',   label: 'מתחיל ב',         types: ['text'] },
  { value: 'gt',       label: 'גדול מ',          types: ['number','currency','date'] },
  { value: 'lt',       label: 'קטן מ',           types: ['number','currency','date'] },
  { value: 'gte',      label: 'גדול שווה',       types: ['number','currency','date'] },
  { value: 'lte',      label: 'קטן שווה',        types: ['number','currency','date'] },
  { value: 'empty',    label: 'ריק',             types: ['text','number','currency','date','enum'] },
  { value: 'notempty', label: 'לא ריק',          types: ['text','number','currency','date','enum'] },
];

// ── Data Sources ──────────────────────────────────────────────────────────────
const DATA_SOURCES: DataSource[] = [
  {
    id: 'invoices', label: 'חשבוניות', icon: '🧾',
    endpoint: '/invoices',
    defaultParams: { pageSize: 1000 },
    extractData: r => Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []),
    dateField: 'date',
    fields: [
      { key: 'invoiceNumber',         label: 'מספר חשבונית',  type: 'text',     defaultVisible: true, filterable: true },
      { key: 'date',                  label: 'תאריך',         type: 'date',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'dueDate',               label: 'תאריך פירעון',  type: 'date',     filterable: true },
      { key: 'customer.name',         label: 'לקוח',          type: 'text',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'customer.businessNumber', label: 'ח.פ./ע.מ.',   type: 'text',     filterable: true },
      { key: 'status',                label: 'סטטוס',         type: 'enum',     defaultVisible: true, filterable: true, groupable: true,
        enumValues: [
          { value: 'DRAFT',     label: 'טיוטה' },
          { value: 'SENT',      label: 'נשלח' },
          { value: 'PAID',      label: 'שולם' },
          { value: 'OVERDUE',   label: 'פג תוקף' },
          { value: 'PARTIAL',   label: 'חלקי' },
          { value: 'CANCELLED', label: 'בוטל' },
        ],
      },
      { key: 'type',                  label: 'סוג מסמך',      type: 'enum',     filterable: true, groupable: true,
        enumValues: [
          { value: 'INVOICE',     label: 'חשבונית' },
          { value: 'TAX_INVOICE', label: 'חשבונית מס' },
          { value: 'RECEIPT',     label: 'קבלה' },
          { value: 'CREDIT_NOTE', label: 'זיכוי' },
          { value: 'PROFORMA',    label: 'עסקה' },
          { value: 'QUOTE',       label: 'הצעת מחיר' },
          { value: 'DELIVERY',    label: 'תעודת משלוח' },
        ],
      },
      { key: 'subtotal',    label: 'לפני מע"מ', type: 'currency', defaultVisible: true, filterable: true, isNumeric: true },
      { key: 'vatAmount',   label: 'מע"מ',       type: 'currency', filterable: true, isNumeric: true },
      { key: 'totalAmount', label: 'סה"כ',        type: 'currency', defaultVisible: true, filterable: true, isNumeric: true },
      { key: 'reference',   label: 'הפניה',       type: 'text',     filterable: true },
      { key: 'notes',       label: 'הערות',        type: 'text',     filterable: true },
    ],
  },
  {
    id: 'employees', label: 'עובדים', icon: '👤',
    endpoint: '/employees',
    defaultParams: { pageSize: 500 },
    extractData: r => Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []),
    dateField: 'startDate',
    fields: [
      { key: 'name',        label: 'שם עובד',     type: 'text',     defaultVisible: true, filterable: true },
      { key: 'idNumber',    label: 'ת.ז.',         type: 'text',     filterable: true },
      { key: 'department',  label: 'מחלקה',        type: 'text',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'position',    label: 'תפקיד',        type: 'text',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'jobType',     label: 'סוג משרה',     type: 'enum',     defaultVisible: true, filterable: true, groupable: true,
        enumValues: [
          { value: 'FULL_TIME',  label: 'משרה מלאה' },
          { value: 'PART_TIME',  label: 'חלקית' },
          { value: 'CONTRACTOR', label: 'קבלן' },
          { value: 'TEMP',       label: 'זמני' },
        ],
      },
      { key: 'grossSalary', label: 'שכר ברוטו',   type: 'currency', defaultVisible: true, filterable: true, isNumeric: true },
      { key: 'startDate',   label: 'תאריך התחלה', type: 'date',     filterable: true },
      { key: 'email',       label: 'אימייל',       type: 'text',     filterable: true },
      { key: 'phone',       label: 'טלפון',        type: 'text',     filterable: true },
      { key: 'isActive',    label: 'פעיל',         type: 'boolean',  filterable: true, groupable: true,
        enumValues: [{ value: 'true', label: 'פעיל' }, { value: 'false', label: 'לא פעיל' }],
      },
    ],
  },
  {
    id: 'customers', label: 'לקוחות CRM', icon: '🏢',
    endpoint: '/crm/customers',
    defaultParams: { pageSize: 500 },
    extractData: r => Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []),
    dateField: 'createdAt',
    fields: [
      { key: 'name',           label: 'שם לקוח',    type: 'text', defaultVisible: true, filterable: true },
      { key: 'businessNumber', label: 'ח.פ./ע.מ.',   type: 'text', defaultVisible: true, filterable: true },
      { key: 'email',          label: 'אימייל',       type: 'text', defaultVisible: true, filterable: true },
      { key: 'phone',          label: 'טלפון',        type: 'text', filterable: true },
      { key: 'city',           label: 'עיר',          type: 'text', filterable: true, groupable: true },
      { key: 'address',        label: 'כתובת',        type: 'text', filterable: true },
      { key: 'createdAt',      label: 'נוצר',         type: 'date', filterable: true, groupable: true },
    ],
  },
  {
    id: 'payroll-runs', label: 'ריצות שכר', icon: '💰',
    endpoint: '/payroll/runs',
    defaultParams: { pageSize: 100 },
    extractData: r => Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []),
    dateField: 'createdAt',
    fields: [
      { key: 'period',       label: 'תקופה',        type: 'text',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'status',       label: 'סטטוס',        type: 'enum',     defaultVisible: true, filterable: true, groupable: true,
        enumValues: [
          { value: 'DRAFT',     label: 'טיוטה' },
          { value: 'APPROVED',  label: 'מאושר' },
          { value: 'PAID',      label: 'שולם' },
          { value: 'CANCELLED', label: 'בוטל' },
        ],
      },
      { key: 'totalGross',   label: 'ברוטו כולל',  type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'totalNet',     label: 'נטו כולל',    type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'totalTax',     label: 'מס הכנסה',    type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'totalNI',      label: 'ב.ל. כולל',   type: 'currency', isNumeric: true },
      { key: 'totalPension', label: 'פנסיה מעסיק', type: 'currency', isNumeric: true },
      { key: 'paidAt',       label: 'תאריך תשלום', type: 'date',     filterable: true },
      { key: 'approvedAt',   label: 'תאריך אישור', type: 'date',     filterable: true },
    ],
  },
  {
    id: 'transactions', label: 'יומן הנה"ח', icon: '📒',
    endpoint: '/accounting/transactions',
    defaultParams: { pageSize: 500 },
    extractData: r => {
      const d = r?.data ?? r;
      return Array.isArray(d) ? d : (Array.isArray(d?.transactions) ? d.transactions : []);
    },
    dateField: 'date',
    fields: [
      { key: 'date',        label: 'תאריך',    type: 'date',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'reference',   label: 'אסמכתא',   type: 'text',     defaultVisible: true, filterable: true },
      { key: 'description', label: 'תיאור',    type: 'text',     defaultVisible: true, filterable: true },
      { key: 'status',      label: 'סטטוס',    type: 'enum',     defaultVisible: true, filterable: true, groupable: true,
        enumValues: [
          { value: 'DRAFT',  label: 'טיוטה' },
          { value: 'POSTED', label: 'מוסדר' },
          { value: 'VOID',   label: 'מבוטל' },
        ],
      },
      { key: 'sourceType',  label: 'מקור',     type: 'enum',     filterable: true, groupable: true,
        enumValues: [
          { value: 'INVOICE', label: 'חשבונית' },
          { value: 'PAYROLL', label: 'שכר' },
          { value: 'MANUAL',  label: 'ידני' },
          { value: 'PAYMENT', label: 'תשלום' },
          { value: 'EXPENSE', label: 'הוצאה' },
        ],
      },
      { key: 'totalAmount', label: 'סכום',     type: 'currency', defaultVisible: true, filterable: true, isNumeric: true },
    ],
  },
  {
    id: 'bills', label: 'חשבוניות ספקים', icon: '📄',
    endpoint: '/purchasing/bills',
    defaultParams: { pageSize: 500 },
    extractData: r => Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []),
    dateField: 'date',
    fields: [
      { key: 'billNumber',  label: 'מספר',          type: 'text',     defaultVisible: true, filterable: true },
      { key: 'date',        label: 'תאריך',         type: 'date',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'dueDate',     label: 'פירעון',        type: 'date',     filterable: true },
      { key: 'vendor.name', label: 'ספק',           type: 'text',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'status',      label: 'סטטוס',         type: 'enum',     defaultVisible: true, filterable: true, groupable: true,
        enumValues: [
          { value: 'DRAFT',   label: 'טיוטה' },
          { value: 'PENDING', label: 'ממתין' },
          { value: 'PAID',    label: 'שולם' },
          { value: 'OVERDUE', label: 'פג תוקף' },
        ],
      },
      { key: 'subtotal',    label: 'לפני מע"מ',    type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'vatAmount',   label: 'מע"מ',          type: 'currency', isNumeric: true },
      { key: 'totalAmount', label: 'סה"כ',          type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'reference',   label: 'הפניה',         type: 'text',     filterable: true },
    ],
  },
  {
    id: 'payroll-reports', label: 'דוח שכר מפורט', icon: '📊',
    endpoint: '/payroll/reports/generate',
    defaultParams: { type: 'monthly-summary', period: new Date().toISOString().slice(0, 7) },
    extractData: r => Array.isArray(r?.data?.rows) ? r.data.rows : (Array.isArray(r?.rows) ? r.rows : []),
    fields: [
      { key: 'עובד',           label: 'עובד',           type: 'text',     defaultVisible: true, filterable: true, groupable: false },
      { key: 'מחלקה',         label: 'מחלקה',          type: 'text',     defaultVisible: true, filterable: true, groupable: true },
      { key: 'ברוטו',         label: 'ברוטו',          type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'מס הכנסה',     label: 'מס הכנסה',       type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'ביטוח לאומי',  label: 'ב.ל. עובד',      type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'ביטוח בריאות', label: 'בריאות',         type: 'currency', isNumeric: true },
      { key: 'פנסיה עובד',   label: 'פנסיה עובד',     type: 'currency', isNumeric: true },
      { key: 'נטו',           label: 'נטו',            type: 'currency', defaultVisible: true, isNumeric: true },
      { key: 'עלות מעסיק',   label: 'עלות מעסיק',     type: 'currency', defaultVisible: true, isNumeric: true },
    ],
  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function getVal(obj: any, path: string): any {
  // First try exact flat key (for grouped rows with dot-keys stored flat)
  if (obj != null && path in obj) return obj[path];
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}

function matchesFilter(row: any, filter: FilterRow): boolean {
  const raw = getVal(row, filter.field);
  const val = String(raw ?? '');
  const fval = filter.value.toLowerCase();
  const valLow = val.toLowerCase();
  const numVal = Number(raw);
  const numF   = Number(filter.value);

  if (filter.op === 'empty')    return !val || val === 'undefined' || val === 'null';
  if (filter.op === 'notempty') return !!(val && val !== 'undefined' && val !== 'null');
  if (!filter.value) return true;

  switch (filter.op) {
    case 'eq':       return valLow === fval;
    case 'neq':      return valLow !== fval;
    case 'contains': return valLow.includes(fval);
    case 'starts':   return valLow.startsWith(fval);
    case 'gt':       return !isNaN(numVal) && !isNaN(numF) ? numVal > numF : val > filter.value;
    case 'lt':       return !isNaN(numVal) && !isNaN(numF) ? numVal < numF : val < filter.value;
    case 'gte':      return !isNaN(numVal) && !isNaN(numF) ? numVal >= numF : val >= filter.value;
    case 'lte':      return !isNaN(numVal) && !isNaN(numF) ? numVal <= numF : val <= filter.value;
    default:         return true;
  }
}

const fmtCur  = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string) => {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('he-IL'); } catch { return s; }
};

function formatCell(val: any, field: FieldDef): string {
  if (val === null || val === undefined || val === '') return '—';
  if (field.type === 'currency') {
    const n = Number(val);
    return isNaN(n) ? String(val) : fmtCur(n);
  }
  if (field.type === 'number') {
    const n = Number(val);
    return isNaN(n) ? String(val) : n.toLocaleString('he-IL');
  }
  if (field.type === 'date') return fmtDate(String(val));
  if (field.type === 'boolean') return String(val) === 'true' ? 'כן' : 'לא';
  if (field.type === 'enum' && field.enumValues) {
    return field.enumValues.find(e => e.value === String(val))?.label ?? String(val);
  }
  return String(val);
}

function exportExcel(title: string, rows: any[], fields: FieldDef[]) {
  const data = rows.map(row => {
    const out: Record<string, any> = {};
    for (const f of fields) {
      const v = getVal(row, f.key);
      out[f.label] = (f.type === 'currency' || f.type === 'number') ? Number(v ?? 0) : (v ?? '');
    }
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = fields.map(f => ({ wch: Math.max(f.label.length + 4, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'דוח');
  XLSX.writeFile(wb, `${title}.xlsx`);
}

// ── Result Table ──────────────────────────────────────────────────────────────
function ResultTable({ rows, fields }: { rows: any[]; fields: FieldDef[] }) {
  const numericFields = fields.filter(f => f.isNumeric);
  const totals: Record<string, number> = {};
  for (const f of numericFields) {
    totals[f.key] = rows.reduce((s, r) => s + Number(getVal(r, f.key) ?? 0), 0);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-900 text-white sticky top-0 z-10">
            <th className="px-3 py-3 text-right text-gray-400 font-medium w-10">#</th>
            {fields.map(f => (
              <th key={f.key} className="px-3 py-3 text-right font-semibold whitespace-nowrap text-gray-100">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
              <td className="px-3 py-2.5 text-gray-400 text-xs text-right">{i + 1}</td>
              {fields.map(f => {
                const val = getVal(row, f.key);
                const numVal = Number(val);
                const isNeg = (f.type === 'currency' || f.type === 'number') && !isNaN(numVal) && numVal < 0;
                return (
                  <td key={f.key} className={`px-3 py-2.5 ${f.isNumeric || f.type === 'number' ? 'font-mono' : ''} ${isNeg ? 'text-red-600' : ''}`}>
                    {formatCell(val, f)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {numericFields.length > 0 && (
          <tfoot>
            <tr className="bg-blue-900 text-white font-bold border-t-2 border-blue-400">
              <td className="px-3 py-3 text-xs text-blue-300">סה"כ</td>
              {fields.map(f => (
                <td key={f.key} className={`px-3 py-3 ${f.isNumeric ? 'font-mono' : ''}`}>
                  {f.isNumeric ? fmtCur(totals[f.key]) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportGeneratorPage() {
  const [sourceId,    setSourceId]    = useState<string>('invoices');
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    DATA_SOURCES[0].fields.filter(f => f.defaultVisible).map(f => f.key)
  );
  const [filters,     setFilters]     = useState<FilterRow[]>([]);
  const [groupBy,     setGroupBy]     = useState<string>('');
  const [subGroupBy,  setSubGroupBy]  = useState<string>('');
  const [sort,        setSort]        = useState<SortConfig>({ field: '', dir: 'asc' });
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [generated,   setGenerated]   = useState(false);
  const [nextId,      setNextId]      = useState(1);
  // Payroll-specific: period selector
  const [payrollPeriod, setPayrollPeriod] = useState(new Date().toISOString().slice(0, 7));

  const source = DATA_SOURCES.find(s => s.id === sourceId)!;

  const handleSourceChange = (id: string) => {
    const s = DATA_SOURCES.find(s => s.id === id)!;
    setSourceId(id);
    setVisibleKeys(s.fields.filter(f => f.defaultVisible).map(f => f.key));
    setFilters([]);
    setGroupBy('');
    setSubGroupBy('');
    setSort({ field: '', dir: 'asc' });
    setGenerated(false);
  };

  // API params
  const apiParams = useMemo(() => {
    const p: any = { ...(source.defaultParams ?? {}) };
    if (sourceId === 'payroll-reports') {
      p.period = payrollPeriod;
      return p;
    }
    if (dateFrom && source.dateField) p.from = dateFrom;
    if (dateTo   && source.dateField) p.to   = dateTo;
    return p;
  }, [source, sourceId, dateFrom, dateTo, payrollPeriod]);

  const { data: rawData, isLoading, error, refetch } = useQuery({
    queryKey: [sourceId, apiParams],
    queryFn:  () => api.get(source.endpoint, { params: apiParams }).then(r => source.extractData(r.data)),
    enabled:  generated,
    staleTime: 30_000,
  });

  // Process: filter → group → sort
  const processedRows = useMemo(() => {
    if (!rawData) return [];
    let rows = [...rawData];

    // Date range filter
    if (dateFrom && source.dateField && sourceId !== 'payroll-reports') {
      rows = rows.filter(r => {
        const d = getVal(r, source.dateField!);
        return d && new Date(d) >= new Date(dateFrom);
      });
    }
    if (dateTo && source.dateField && sourceId !== 'payroll-reports') {
      rows = rows.filter(r => {
        const d = getVal(r, source.dateField!);
        return d && new Date(d) <= new Date(dateTo + 'T23:59:59');
      });
    }

    // Custom filters
    for (const f of filters) {
      if (!f.field) continue;
      rows = rows.filter(r => matchesFilter(r, f));
    }

    // Grouping
    if (groupBy) {
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const k1 = String(getVal(row, groupBy) ?? '—');
        const k2 = subGroupBy ? String(getVal(row, subGroupBy) ?? '—') : '';
        const key = subGroupBy ? `${k1}|||${k2}` : k1;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      const numericFields = source.fields.filter(f => f.isNumeric);
      rows = Array.from(groups.entries()).map(([key, grpRows]) => {
        const [gv, sv] = key.split('|||');
        const agg: any = { [groupBy]: gv, _count: grpRows.length };
        if (subGroupBy && sv) agg[subGroupBy] = sv;
        for (const f of numericFields) {
          agg[f.key] = grpRows.reduce((s, r) => s + Number(getVal(r, f.key) ?? 0), 0);
        }
        // first-value for text fields
        for (const f of source.fields) {
          if (!agg[f.key] && !f.isNumeric && f.key !== groupBy && f.key !== subGroupBy) {
            agg[f.key] = getVal(grpRows[0], f.key);
          }
        }
        return agg;
      });
    }

    // Sort
    if (sort.field) {
      rows.sort((a, b) => {
        const va = getVal(a, sort.field) ?? '';
        const vb = getVal(b, sort.field) ?? '';
        const nA = Number(va), nB = Number(vb);
        const cmp = !isNaN(nA) && !isNaN(nB)
          ? nA - nB
          : String(va).localeCompare(String(vb), 'he');
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }

    return rows;
  }, [rawData, filters, groupBy, subGroupBy, sort, dateFrom, dateTo, source, sourceId]);

  // Display fields — when grouped, show group key + count + numeric only
  const displayFields = useMemo((): FieldDef[] => {
    if (!groupBy) return source.fields.filter(f => visibleKeys.includes(f.key));
    const groupField    = source.fields.find(f => f.key === groupBy)!;
    const subGroupField = subGroupBy ? source.fields.find(f => f.key === subGroupBy) : undefined;
    const numFields     = source.fields.filter(f => f.isNumeric && visibleKeys.includes(f.key));
    const countField: FieldDef = { key: '_count', label: 'כמות', type: 'number', isNumeric: false };
    return [groupField, ...(subGroupField ? [subGroupField] : []), countField, ...numFields];
  }, [groupBy, subGroupBy, visibleKeys, source.fields]);

  const addFilter = () => {
    const firstF = source.fields.find(f => f.filterable !== false);
    if (!firstF) return;
    setFilters(prev => [...prev, { id: nextId, field: firstF.key, op: 'eq', value: '' }]);
    setNextId(n => n + 1);
  };

  const setDatePreset = (preset: string) => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const today = now.toISOString().slice(0, 10);
    switch (preset) {
      case 'all':          setDateFrom('');                                         setDateTo('');                                       break;
      case 'this-month':   setDateFrom(new Date(y, m, 1).toISOString().slice(0,10));  setDateTo(today);                                    break;
      case 'last-month':   setDateFrom(new Date(y, m-1, 1).toISOString().slice(0,10)); setDateTo(new Date(y, m, 0).toISOString().slice(0,10)); break;
      case 'this-quarter': setDateFrom(new Date(y, Math.floor(m/3)*3, 1).toISOString().slice(0,10)); setDateTo(today); break;
      case 'this-year':    setDateFrom(`${y}-01-01`);                               setDateTo(today);                                    break;
      case 'last-year':    setDateFrom(`${y-1}-01-01`);                             setDateTo(`${y-1}-12-31`);                           break;
    }
  };

  const handleGenerate = () => {
    setGenerated(false);
    setTimeout(() => setGenerated(true), 30);
  };

  const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const periodOptions = () => {
    const opts = []; const d = new Date();
    for (let i = 0; i < 18; i++) {
      opts.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  };

  return (
    <div dir="rtl" className="max-w-full mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">מחולל דוחות מתקדם</h1>
          <p className="text-gray-500 text-sm mt-0.5">בחר מקור · עמודות · סינונים · קיבוץ · מיון · ייצוא Excel</p>
        </div>
        {generated && processedRows.length > 0 && (
          <button
            onClick={() => exportExcel(`דוח-${source.label}-${new Date().toLocaleDateString('he-IL')}`, processedRows, displayFields)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl shadow transition-all"
          >
            <Download size={16} /> ייצוא Excel
          </button>
        )}
      </div>

      {/* Data Source Selector */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">מקור נתונים</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {DATA_SOURCES.map(ds => (
            <button
              key={ds.id}
              onClick={() => handleSourceChange(ds.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-xs font-bold ${
                sourceId === ds.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                  : 'bg-white border-gray-100 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <span className="text-xl">{ds.icon}</span>
              <span className="leading-tight text-center">{ds.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">

        {/* ① Date Range (or payroll period) */}
        {source.dateField && (
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span>📅</span>
              <h3 className="font-bold text-gray-800 text-sm">
                {sourceId === 'payroll-reports' ? 'תקופת שכר' : 'טווח תאריכים'}
              </h3>
              {sourceId !== 'payroll-reports' && (
                <div className="flex gap-1 mr-auto flex-wrap">
                  {[
                    { k: 'all',          l: 'הכל' },
                    { k: 'this-month',   l: 'החודש' },
                    { k: 'last-month',   l: 'חודש קודם' },
                    { k: 'this-quarter', l: 'הרבעון' },
                    { k: 'this-year',    l: 'השנה' },
                    { k: 'last-year',    l: 'שנה קודמת' },
                  ].map(p => (
                    <button key={p.k} onClick={() => setDatePreset(p.k)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-600 font-medium transition-colors">
                      {p.l}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sourceId === 'payroll-reports' ? (
              <select value={payrollPeriod} onChange={e => setPayrollPeriod(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                {periodOptions().map(p => {
                  const [y, m] = p.split('-');
                  return <option key={p} value={p}>{MONTHS_HE[+m]} {y}</option>;
                })}
              </select>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">מתאריך</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <span className="text-gray-400 mt-4">—</span>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">עד תאריך</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                    className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline">
                    נקה
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ② Columns */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span>📋</span>
            <h3 className="font-bold text-gray-800 text-sm">עמודות</h3>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold ml-auto">
              {visibleKeys.length} נבחרו
            </span>
            <button onClick={() => setVisibleKeys(source.fields.map(f => f.key))}
              className="text-xs text-gray-400 hover:text-blue-600">בחר הכל</button>
            <button onClick={() => setVisibleKeys([])}
              className="text-xs text-gray-400 hover:text-red-500">נקה</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {source.fields.map(f => {
              const checked = visibleKeys.includes(f.key);
              return (
                <label key={f.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer select-none transition-all text-xs font-semibold ${
                  checked
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                }`}>
                  <input type="checkbox" checked={checked}
                    onChange={e => setVisibleKeys(prev =>
                      e.target.checked ? [...prev, f.key] : prev.filter(k => k !== f.key)
                    )}
                    className="hidden" />
                  {f.isNumeric ? '∑ ' : ''}{f.label}
                </label>
              );
            })}
          </div>
        </div>

        {/* ③ Filters */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span>🔍</span>
            <h3 className="font-bold text-gray-800 text-sm">סינונים</h3>
            {filters.length > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                {filters.length} פעילים
              </span>
            )}
            <button onClick={addFilter}
              className="mr-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-bold px-2.5 py-1 rounded-lg hover:bg-blue-50 border border-blue-200 transition-colors">
              <Plus size={12} /> הוסף סינון
            </button>
          </div>

          {filters.length === 0 ? (
            <p className="text-xs text-gray-400 italic">אין סינונים — כל הרשומות מוצגות</p>
          ) : (
            <div className="space-y-2">
              {filters.map((filter, idx) => {
                const fd = source.fields.find(f => f.key === filter.field);
                const availOps = OPS.filter(o => !fd || o.types.includes(fd.type));
                const needsVal = filter.op !== 'empty' && filter.op !== 'notempty';
                return (
                  <div key={filter.id} className="flex items-center gap-2 flex-wrap bg-gray-50 p-2 rounded-xl border border-gray-100">
                    <span className="text-xs text-gray-400 w-5 text-center">{idx + 1}</span>

                    {/* שדה */}
                    <select value={filter.field}
                      onChange={e => setFilters(prev => prev.map(f =>
                        f.id === filter.id ? { ...f, field: e.target.value, op: 'eq', value: '' } : f
                      ))}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      {source.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>

                    {/* אופרטור */}
                    <select value={filter.op}
                      onChange={e => setFilters(prev => prev.map(f =>
                        f.id === filter.id ? { ...f, op: e.target.value as Operator } : f
                      ))}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      {availOps.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    {/* ערך */}
                    {needsVal && (
                      fd?.type === 'enum' || fd?.type === 'boolean' ? (
                        <select value={filter.value}
                          onChange={e => setFilters(prev => prev.map(f =>
                            f.id === filter.id ? { ...f, value: e.target.value } : f
                          ))}
                          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                          <option value="">-- בחר --</option>
                          {(fd.enumValues ?? [{ value: 'true', label: 'כן' }, { value: 'false', label: 'לא' }]).map(e => (
                            <option key={e.value} value={e.value}>{e.label}</option>
                          ))}
                        </select>
                      ) : fd?.type === 'date' ? (
                        <input type="date" value={filter.value}
                          onChange={e => setFilters(prev => prev.map(f =>
                            f.id === filter.id ? { ...f, value: e.target.value } : f
                          ))}
                          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
                      ) : (
                        <input
                          type={fd?.type === 'currency' || fd?.type === 'number' ? 'number' : 'text'}
                          value={filter.value}
                          placeholder="ערך..."
                          onChange={e => setFilters(prev => prev.map(f =>
                            f.id === filter.id ? { ...f, value: e.target.value } : f
                          ))}
                          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400 min-w-[110px]" />
                      )
                    )}

                    <button onClick={() => setFilters(prev => prev.filter(f => f.id !== filter.id))}
                      className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors ml-auto">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ④ Grouping + Sort */}
        <div className="p-5">
          <div className="flex flex-wrap gap-8">

            {/* קיבוץ */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span>📊</span>
                <h3 className="font-bold text-gray-800 text-sm">קיבוץ (GROUP BY)</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={groupBy} onChange={e => { setGroupBy(e.target.value); setSubGroupBy(''); }}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">ללא קיבוץ</option>
                  {source.fields.filter(f => f.groupable).map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                {groupBy && (
                  <>
                    <span className="text-xs text-gray-400">→ ואז</span>
                    <select value={subGroupBy} onChange={e => setSubGroupBy(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">ללא תת-קיבוץ</option>
                      {source.fields.filter(f => f.groupable && f.key !== groupBy).map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {groupBy && (
                <p className="text-xs text-gray-400 mt-1.5">
                  עמודות מספריות יסוכמו (SUM) · עמודות טקסט יציגו את ערך הקיבוץ
                </p>
              )}
            </div>

            {/* מיון */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span>↕</span>
                <h3 className="font-bold text-gray-800 text-sm">מיון (ORDER BY)</h3>
              </div>
              <div className="flex items-center gap-2">
                <select value={sort.field} onChange={e => setSort(s => ({ ...s, field: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">ברירת מחדל</option>
                  {(groupBy
                    ? [source.fields.find(f => f.key === groupBy)!, ...source.fields.filter(f => f.isNumeric)]
                    : source.fields.filter(f => visibleKeys.includes(f.key))
                  ).filter(Boolean).map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <select value={sort.dir} onChange={e => setSort(s => ({ ...s, dir: e.target.value as SortDir }))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="asc">עולה ↑</option>
                  <option value="desc">יורד ↓</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ⑤ Generate */}
        <div className="p-4 bg-gradient-to-l from-blue-50 to-white flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
              {source.label}
            </span>
            <span>{visibleKeys.length} עמודות</span>
            {filters.length > 0 && <span className="text-orange-600 font-semibold">{filters.length} סינונים</span>}
            {groupBy && <span className="text-purple-600 font-semibold">מקובץ לפי {source.fields.find(f=>f.key===groupBy)?.label}</span>}
            {sort.field && <span>ממוין לפי {source.fields.find(f=>f.key===sort.field)?.label} {sort.dir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          <button onClick={handleGenerate} disabled={isLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-black px-8 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-blue-200">
            {isLoading
              ? <><RefreshCw size={16} className="animate-spin" /> מחשב...</>
              : <><Play size={16} /> הפק דוח</>
            }
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {!generated && (
          <div className="text-center py-24 text-gray-300">
            <p className="text-6xl mb-4">📊</p>
            <p className="text-base font-semibold text-gray-400">הגדר פרמטרים ולחץ "הפק דוח"</p>
            <p className="text-sm text-gray-300 mt-2">
              בחר מקור נתונים · עמודות · סינונים · קיבוץ · מיון
            </p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">מביא נתונים מהשרת...</p>
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
              <span>⚠️</span>
              <span>{(error as any)?.response?.data?.error ?? 'שגיאה בטעינת הנתונים. ייתכן שאין מידע לתקופה זו.'}</span>
            </div>
            <button onClick={() => refetch()} className="mt-3 text-sm text-blue-600 hover:underline flex items-center gap-1">
              <RefreshCw size={13} /> נסה שנית
            </button>
          </div>
        )}

        {generated && !isLoading && rawData && (
          <>
            {/* Results header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3 bg-gray-50/50">
              <div>
                <h3 className="font-black text-gray-900">
                  {source.label}
                  {dateFrom || dateTo
                    ? ` · ${dateFrom ? fmtDate(dateFrom) : '...'} – ${dateTo ? fmtDate(dateTo) : 'היום'}`
                    : ''}
                  {groupBy ? ` · מקובץ לפי ${source.fields.find(f=>f.key===groupBy)?.label}` : ''}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-bold text-blue-700">{processedRows.length}</span> רשומות
                  {rawData.length !== processedRows.length
                    ? ` (סוננו מתוך ${rawData.length})`
                    : ''}
                  {displayFields.filter(f => f.isNumeric).length > 0 && (
                    <> · סה"כ: {displayFields.filter(f => f.isNumeric).map(f => (
                      <span key={f.key} className="mr-2">
                        {f.label}: {fmtCur(processedRows.reduce((s, r) => s + Number(getVal(r, f.key) ?? 0), 0))}
                      </span>
                    ))}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => exportExcel(`דוח-${source.label}`, processedRows, displayFields)}
                className="flex items-center gap-1.5 text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-4 py-2 rounded-xl border border-emerald-200 transition-all">
                <Download size={14} /> Excel
              </button>
            </div>

            {processedRows.length === 0 ? (
              <div className="text-center py-16 text-gray-300">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-sm">אין נתונים התואמים את הסינונים שהגדרת</p>
              </div>
            ) : (
              <ResultTable rows={processedRows} fields={displayFields} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
