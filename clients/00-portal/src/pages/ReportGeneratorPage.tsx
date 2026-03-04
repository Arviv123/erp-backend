/**
 * ReportGeneratorPage — מחולל דוחות שכר
 * 7 סוגי דוחות + ייצוא Excel
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import api from '../lib/api';

const fmtILS = (n: number) =>
  n === 0 ? '—' : new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

// Generate last 18 months
const periodOptions = () => {
  const opts = [];
  const d = new Date();
  for (let i = 0; i < 18; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    opts.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return opts;
};

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const fmtPeriod = (p: string) => { const [y,m] = p.split('-'); return `${MONTHS_HE[+m]} ${y}`; };

const REPORT_TYPES = [
  {
    id: 'monthly-summary',
    label: 'דוח שכר חודשי',
    icon: '📊',
    desc: 'סיכום כל עובדי החברה לתקופה נבחרת — ברוטו, ניכויים, נטו, עלות מעסיק',
    needsPeriod: true,
  },
  {
    id: 'employee-cost',
    label: 'דוח עלות עובד',
    icon: '💰',
    desc: 'עלות כוללת למעסיק: שכר + פנסיה + ב.ל. + קרן השתלמות + פיצויים',
    needsPeriod: true,
  },
  {
    id: 'department',
    label: 'דוח לפי מחלקה',
    icon: '🏢',
    desc: 'פילוח עלויות שכר לפי מחלקות הארגון עם ממוצעים',
    needsPeriod: true,
  },
  {
    id: 'pension',
    label: 'דוח קרנות פנסיה',
    icon: '🏦',
    desc: 'הפרשות פנסיה לפי עובד — עובד/מעסיק/פיצויים + שם הקרן',
    needsPeriod: true,
  },
  {
    id: 'tax',
    label: 'דוח מסים',
    icon: '🏛️',
    desc: 'מס הכנסה + ביטוח לאומי + ביטוח בריאות לפי עובד',
    needsPeriod: true,
  },
  {
    id: 'annual-employee',
    label: 'דוח שנתי לעובד',
    icon: '📅',
    desc: 'כל תלושי השנה מקובצים — בסיס לטופס 106',
    needsPeriod: false,
  },
  {
    id: 'multi-period',
    label: 'השוואה חודשית',
    icon: '📈',
    desc: 'השוואת כל חודשי השנה — ברוטו, נטו, מסים לפי חודש',
    needsPeriod: false,
  },
] as const;

type ReportTypeId = typeof REPORT_TYPES[number]['id'];

// Currency columns that should be formatted as numbers in Excel
const CURRENCY_KEYS = new Set([
  'ברוטו','נטו','מס הכנסה','ביטוח לאומי','ביטוח בריאות','פנסיה עובד','קרן השתלמות',
  'עלות מעסיק','פנסיה מעסיק','ב.ל. מעסיק','קרן השתלמות מ.','עלות כוללת','עלות לשעה',
  'הכנסה חייבת','ערך נק. זיכוי','ב.ל. עובד','סה"כ מסים','שכר ברוטו',
  'פנסיה עובד','סה"כ לקרן','פיצויים','ברוטו לפנסיה','ברוטו כולל','נטו כולל',
  'ב.ל.','פנסיה','ברוטו סה"כ','נטו סה"כ','ממוצע ברוטו',
]);

function exportToExcel(title: string, rows: any[], totals?: any) {
  const allRows = totals ? [...rows, totals] : rows;
  const ws = XLSX.utils.json_to_sheet(allRows, { skipHeader: false });

  // Style currency cells as numbers
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let C = range.s.c; C <= range.e.c; C++) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
    if (headerCell && CURRENCY_KEYS.has(headerCell.v)) {
      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr] && typeof ws[addr].v === 'number') {
          ws[addr].z = '#,##0';
        }
      }
    }
  }

  // Set column widths
  const cols = Object.keys(allRows[0] || {}).map(k => ({ wch: Math.max(k.length + 4, 12) }));
  ws['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'נתונים');
  XLSX.writeFile(wb, `${title}.xlsx`, { bookType: 'xlsx' });
}

function ReportTable({ data }: { data: any }) {
  if (!data?.rows?.length) return (
    <div className="text-center py-16 text-gray-300">
      <p className="text-4xl mb-3">📭</p>
      <p className="text-sm">אין נתונים לתקופה זו</p>
    </div>
  );

  const cols = Object.keys(data.rows[0]);
  const numCols = new Set(cols.filter(c => CURRENCY_KEYS.has(c) || c === 'עובדים' || c.includes('%')));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-blue-50">
            {cols.map(c => (
              <th key={c} className="text-right px-3 py-2.5 font-bold text-blue-800 border-b-2 border-blue-200 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: any, i: number) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              {cols.map(c => (
                <td key={c} className={`px-3 py-2.5 ${numCols.has(c) ? 'text-left font-mono' : 'text-right'}`}>
                  {numCols.has(c) && typeof row[c] === 'number'
                    ? fmtILS(row[c])
                    : row[c] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {data.totals && (
          <tfoot>
            <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
              {cols.map(c => (
                <td key={c} className={`px-3 py-2.5 ${numCols.has(c) ? 'text-left font-mono text-blue-800' : 'text-right text-blue-900'}`}>
                  {numCols.has(c) && typeof data.totals[c] === 'number' && data.totals[c] !== 0
                    ? fmtILS(data.totals[c])
                    : data.totals[c] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ReportGeneratorPage() {
  const [selectedType, setSelectedType] = useState<ReportTypeId>('monthly-summary');
  const [period, setPeriod]             = useState(periodOptions()[0]);
  const [year, setYear]                 = useState(new Date().getFullYear());
  const [generated, setGenerated]       = useState(false);

  const reportType = REPORT_TYPES.find(r => r.id === selectedType)!;
  const periods    = periodOptions();
  const years      = [2026, 2025, 2024, 2023];

  const params: Record<string, string> = { type: selectedType };
  if (reportType.needsPeriod) params.period = period;
  else params.year = String(year);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-report', selectedType, period, year],
    queryFn:  () => api.get('/payroll/reports/generate', { params }).then(r => r.data?.data ?? r.data),
    enabled:  generated,
    staleTime: 60_000,
  });

  const generate = () => { setGenerated(false); setTimeout(() => setGenerated(true), 50); };

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">מחולל דוחות שכר</h1>
          <p className="text-gray-500 text-sm mt-0.5">הפק דוחות מקצועיים וייצא ל-Excel</p>
        </div>
        {data && (
          <button
            onClick={() => exportToExcel(data.title, data.rows, data.totals)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md"
          >
            <span>📥</span> ייצוא Excel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Sidebar — report types */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">סוג דוח</p>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => { setSelectedType(rt.id); setGenerated(false); }}
              className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all ${
                selectedType === rt.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{rt.icon}</span>
                <span className="text-sm font-bold">{rt.label}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-4">

          {/* Config panel */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="text-3xl">{reportType.icon}</div>
              <div>
                <h2 className="text-lg font-black text-gray-900">{reportType.label}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{reportType.desc}</p>
              </div>
            </div>

            <div className="flex items-end gap-3">
              {reportType.needsPeriod ? (
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">תקופה</label>
                  <select
                    value={period}
                    onChange={e => { setPeriod(e.target.value); setGenerated(false); }}
                    className="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none font-semibold text-right min-w-[160px]"
                  >
                    {periods.map(p => (
                      <option key={p} value={p}>{fmtPeriod(p)}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">שנה</label>
                  <select
                    value={year}
                    onChange={e => { setYear(Number(e.target.value)); setGenerated(false); }}
                    className="border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm outline-none font-semibold min-w-[120px]"
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}

              <button
                onClick={generate}
                disabled={isLoading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold px-6 py-2.5 rounded-xl transition-all"
              >
                {isLoading ? '⏳ מחשב...' : '▶ הפק דוח'}
              </button>

              {data && (
                <button
                  onClick={() => exportToExcel(data.title, data.rows, data.totals)}
                  className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-5 py-2.5 rounded-xl border border-emerald-200 transition-all"
                >
                  📥 Excel
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {!generated && (
              <div className="text-center py-20 text-gray-300">
                <p className="text-5xl mb-4">📊</p>
                <p className="text-base font-semibold">בחר סוג דוח ותקופה ולחץ "הפק דוח"</p>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-20 text-gray-400">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
                <p>מחשב דוח...</p>
              </div>
            )}

            {error && (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {(error as any)?.response?.data?.error ?? 'שגיאה בהפקת הדוח. ייתכן שאין נתוני שכר לתקופה זו.'}
                </div>
              </div>
            )}

            {data && !isLoading && (
              <>
                {/* Report header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div>
                    <h3 className="font-black text-gray-900">{data.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {data.rows?.length ?? 0} רשומות
                      {data.totals?.נטו ? ` · נטו כולל: ${fmtILS(data.totals.נטו)}` : ''}
                      {data.totals?.['ברוטו כולל'] ? ` · ברוטו: ${fmtILS(data.totals['ברוטו כולל'])}` : ''}
                    </p>
                  </div>
                  {data.status && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      data.status==='PAID'?'bg-emerald-100 text-emerald-700':
                      data.status==='APPROVED'?'bg-blue-100 text-blue-700':
                      'bg-amber-100 text-amber-700'}`}>
                      {data.status==='PAID'?'✓ שולם':data.status==='APPROVED'?'מאושר':'טיוטה'}
                    </span>
                  )}
                </div>
                <ReportTable data={data} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
