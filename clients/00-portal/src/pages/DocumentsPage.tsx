import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Truck, Receipt, ClipboardList, Package, Search, X, Loader2 } from 'lucide-react';
import api from '../lib/api';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');
const fmtCur  = (n: number | string) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Number(n));

const TYPE_META: Record<string, { label: string; labelShort: string; icon: any; color: string; prefix: string }> = {
  QUOTE:         { label: 'הצעת מחיר',    labelShort: 'הצעה',   icon: ClipboardList, color: 'text-purple-700 bg-purple-50', prefix: 'QUO' },
  DELIVERY_NOTE: { label: 'תעודת משלוח',  labelShort: 'ת.מ.',   icon: Truck,         color: 'text-orange-700 bg-orange-50', prefix: 'DN'  },
  RECEIPT:       { label: 'קבלה',         labelShort: 'קבלה',   icon: Receipt,       color: 'text-green-700 bg-green-50',   prefix: 'RCP' },
  PROFORMA:      { label: 'חשבון עסקה',   labelShort: 'פרופ.',  icon: FileText,      color: 'text-blue-700 bg-blue-50',     prefix: 'PRF' },
  CREDIT_NOTE:   { label: 'הודעת זיכוי',  labelShort: 'זיכוי',  icon: FileText,      color: 'text-red-700 bg-red-50',       prefix: 'CN'  },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'טיוטה',       cls: 'bg-gray-100 text-gray-600' },
  SENT:      { label: 'נשלח',        cls: 'bg-blue-100 text-blue-700' },
  ACCEPTED:  { label: 'אושר',        cls: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'נדחה',        cls: 'bg-red-100 text-red-700' },
  CONVERTED: { label: 'הומר לחשבונית', cls: 'bg-teal-100 text-teal-700' },
  CANCELLED: { label: 'מבוטל',       cls: 'bg-gray-100 text-gray-400' },
};

async function getDocs(type?: string, status?: string) {
  const r = await api.get('/documents', { params: { type, status, limit: 100 } });
  return (r.data?.data?.data ?? r.data?.data ?? r.data) as any[];
}
async function getCustomers() {
  const r = await api.get('/crm/customers');
  return (Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : []) as any[];
}

// ─── Product Picker Modal ─────────────────────────────────────────────────────

interface Product { id: string; name: string; sku?: string; barcode?: string; unit?: string; sellingPrice?: number; vatRate?: number; stockQuantity?: number; }

function ProductPickerModal({ onSelect, onClose }: { onSelect: (p: Product) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const { data, isLoading } = useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/inventory/items') });
  const items: Product[] = Array.isArray(data?.data?.data) ? data.data.data : Array.isArray(data?.data) ? data.data : [];
  const filtered = items.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-bold flex items-center gap-2 text-gray-800"><Package size={16} className="text-blue-600" /> בחר מהקטלוג</h4>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, מקט, ברקוד..."
              className="w-full border border-gray-300 rounded-lg pr-8 pl-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-24 text-gray-400"><Loader2 size={18} className="animate-spin mr-1" /> טוען...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">לא נמצאו פריטים</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['שם פריט', 'מקט', 'יחידה', 'מחיר', 'מלאי'].map(h => (
                    <th key={h} className="px-3 py-2 text-right font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => onSelect(p)} className="hover:bg-blue-50 cursor-pointer">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{p.name}</div>
                      {p.barcode && <div className="text-gray-400">{p.barcode}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{p.sku ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{p.unit ?? 'יח'}</td>
                    <td className="px-3 py-2.5 font-medium text-blue-700">{p.sellingPrice != null ? `${p.sellingPrice} ₪` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{p.stockQuantity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Document Modal ───────────────────────────────────────────────────────

interface Line { description: string; sku: string; unit: string; quantity: number; unitPrice: number; discountPercent: number; vatRate: number; }
const emptyLine = (): Line => ({ description: '', sku: '', unit: 'יח', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 0.18 });

function NewDocModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [docType,   setDocType]   = useState('QUOTE');
  const [customerId, setCustId]   = useState('');
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValid]    = useState('');
  const [reference, setRef]       = useState('');
  const [notes,     setNotes]     = useState('');
  const [discPct,   setDiscPct]   = useState(0);
  const [lines,     setLines]     = useState<Line[]>([emptyLine()]);
  const [error,        setError]      = useState('');
  const [step,         setStep]       = useState(1);
  const [pickerIdx,    setPickerIdx]  = useState<number | null>(null);

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: getCustomers });

  const mutation = useMutation({
    mutationFn: (body: any) => api.post('/documents', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); onClose(); },
    onError:   (e: any) => setError(e?.response?.data?.error || 'שגיאה'),
  });

  const updateLine = (idx: number, field: keyof Line, val: any) =>
    setLines(p => p.map((l, i) => i === idx ? { ...l, [field]: val } : l));

  const handleProductSelect = (product: Product) => {
    if (pickerIdx === null) return;
    setLines(p => p.map((l, i) => i === pickerIdx ? {
      ...l,
      description: product.name,
      sku:         product.sku ?? '',
      unit:        product.unit ?? 'יח',
      unitPrice:   product.sellingPrice ?? l.unitPrice,
      vatRate:     product.vatRate ?? 0.18,
    } : l));
    setPickerIdx(null);
  };

  const lineSubtotals = lines.map(l => {
    const gross = l.quantity * l.unitPrice;
    const disc  = gross * (l.discountPercent / 100);
    return { net: gross - disc };
  });
  const subtotal = lineSubtotals.reduce((s, l) => s + l.net, 0);
  const afterDisc = subtotal * (1 - discPct / 100);
  const vat       = afterDisc * (lines[0]?.vatRate ?? 0.18);
  const total     = afterDisc + vat;

  const save = () => {
    const validLines = lines.filter(l => l.description && l.quantity > 0);
    if (!validLines.length) { setError('נדרשת לפחות שורה אחת'); return; }
    mutation.mutate({
      type: docType, customerId: customerId || undefined,
      date, validUntil: validUntil || undefined, reference: reference || undefined,
      notes: notes || undefined, discountPercent: discPct || undefined,
      lines: validLines,
    });
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400 bg-white';
  const lineInput = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-400';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="font-bold text-gray-900 text-lg">מסמך חדש</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Step 1: Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">סוג מסמך</label>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(TYPE_META).map(([type, meta]) => (
                  <button key={type} onClick={() => setDocType(type)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition ${
                      docType === type ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}>
                    <meta.icon className="w-5 h-5" />
                    {meta.labelShort}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">לקוח</label>
              <select value={customerId} onChange={e => setCustId(e.target.value)} className={inputCls}>
                <option value="">בחר לקוח (אופציונלי)</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">תאריך</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            {docType === 'QUOTE' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">תוקף הצעה עד</label>
                <input type="date" value={validUntil} onChange={e => setValid(e.target.value)} className={inputCls} />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">אסמכתא / מספר הזמנה</label>
              <input type="text" value={reference} onChange={e => setRef(e.target.value)} placeholder="PO-1234" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">פריטים</span>
              <button onClick={() => setLines(p => [...p, emptyLine()])}
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
                <Plus size={13} /> הוסף שורה
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead className="bg-gray-50">
                  <tr>
                    {['תיאור', 'מקט', 'יחידה', 'כמות', 'מחיר', 'הנחה%', 'מעמ%', 'סהכ', ''].map(h => (
                      <th key={h} className="px-2 py-1.5 text-right font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, idx) => {
                    const lt = lineSubtotals[idx];
                    return (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder="תיאור פריט" className={lineInput} />
                            <button type="button" onClick={() => setPickerIdx(idx)} title="בחר מהקטלוג" className="shrink-0 text-gray-400 hover:text-blue-600 transition"><Package size={14} /></button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5"><input value={line.sku} onChange={e => updateLine(idx, 'sku', e.target.value)} placeholder="מקט" className={lineInput} /></td>
                        <td className="px-2 py-1.5"><input value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} className={lineInput + ' w-14'} /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} value={line.quantity} onChange={e => updateLine(idx, 'quantity', +e.target.value)} className={lineInput + ' w-16 text-center'} /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', +e.target.value)} className={lineInput + ' w-24 text-center'} /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} max={100} value={line.discountPercent} onChange={e => updateLine(idx, 'discountPercent', +e.target.value)} className={lineInput + ' w-16 text-center'} /></td>
                        <td className="px-2 py-1.5">
                          <select value={line.vatRate} onChange={e => updateLine(idx, 'vatRate', +e.target.value)} className={lineInput + ' w-16 bg-white'}>
                            <option value={0.18}>18%</option><option value={0}>0%</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-left font-medium">{lt.net.toFixed(2)} ₪</td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => lines.length > 1 && setLines(p => p.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-400 disabled:opacity-20">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-between items-center bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">הנחה כללית:</label>
              <input type="number" min={0} max={100} value={discPct} onChange={e => setDiscPct(+e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center outline-none" />
              <span className="text-gray-400 text-sm">%</span>
            </div>
            <div className="text-sm space-y-1 text-left">
              <div className="flex justify-between gap-8"><span className="text-gray-500">לפני מע"מ:</span><span>{subtotal.toFixed(2)} ₪</span></div>
              {discPct > 0 && <div className="flex justify-between gap-8 text-red-600"><span>הנחה:</span><span>-{(subtotal * discPct / 100).toFixed(2)} ₪</span></div>}
              <div className="flex justify-between gap-8"><span className="text-gray-500">מע"מ:</span><span>{vat.toFixed(2)} ₪</span></div>
              <div className="flex justify-between gap-8 font-bold border-t pt-1"><span>סה"כ:</span><span className="text-purple-700">{total.toFixed(2)} ₪</span></div>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">ביטול</button>
          <button onClick={save} disabled={mutation.isPending}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium">
            {mutation.isPending ? 'שומר...' : 'צור מסמך'}
          </button>
        </div>
      </div>

      {pickerIdx !== null && (
        <ProductPickerModal onSelect={handleProductSelect} onClose={() => setPickerIdx(null)} />
      )}
    </div>
  );
}

// ─── Documents List Page ──────────────────────────────────────────────────────

export default function DocumentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [typeFilter,   setTypeFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal,    setShowModal]    = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', typeFilter, statusFilter],
    queryFn:  () => getDocs(typeFilter || undefined, statusFilter || undefined),
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => api.post(`/documents/${id}/send`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  const typeTabs = [
    { key: '', label: 'הכל' },
    { key: 'QUOTE', label: 'הצעות מחיר' },
    { key: 'DELIVERY_NOTE', label: 'תעודות משלוח' },
    { key: 'RECEIPT', label: 'קבלות' },
    { key: 'PROFORMA', label: 'חשבון עסקה' },
    { key: 'CREDIT_NOTE', label: 'זיכויים' },
  ];

  const totalValue = docs.reduce((s: number, d: any) => s + Number(d.total), 0);

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מסמכים עסקיים</h1>
          <p className="text-sm text-gray-500 mt-0.5">הצעות מחיר, תעודות משלוח, קבלות ועוד</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition">
          <Plus className="w-4 h-4" /> מסמך חדש
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'סה"כ מסמכים', value: docs.length, sub: '' },
          { label: 'טיוטות', value: docs.filter((d: any) => d.status === 'DRAFT').length, sub: '' },
          { label: 'שווי כולל', value: new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(totalValue), sub: '' },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-xl font-bold text-gray-800">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Type tabs */}
      <div className="flex overflow-x-auto border-b border-gray-200 mb-4">
        {typeTabs.map(t => (
          <button key={t.key} onClick={() => setTypeFilter(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              typeFilter === t.key ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {[
          { v: '', l: 'כל הסטטוסים' }, { v: 'DRAFT', l: 'טיוטה' }, { v: 'SENT', l: 'נשלח' },
          { v: 'ACCEPTED', l: 'אושר' }, { v: 'CONVERTED', l: 'הומר' },
        ].map(s => (
          <button key={s.v} onClick={() => setStatusFilter(s.v)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              statusFilter === s.v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {s.l}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['מספר', 'סוג', 'לקוח', 'תאריך', 'תוקף / אסמכתא', 'סה"כ', 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium text-gray-600 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">אין מסמכים</td></tr>
              )}
              {docs.map((doc: any) => {
                const typeMeta   = TYPE_META[doc.type] ?? TYPE_META.QUOTE;
                const statusMeta = STATUS_META[doc.status] ?? STATUS_META.DRAFT;
                const TypeIcon   = typeMeta.icon;
                return (
                  <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/documents/${doc.id}`)}>
                    <td className="px-4 py-3 font-mono font-medium text-gray-700">{doc.number}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeMeta.color}`}>
                        <TypeIcon className="w-3 h-3" />{typeMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{doc.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(doc.date)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{doc.validUntil ? fmtDate(doc.validUntil) : doc.reference ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{fmtCur(doc.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {doc.status === 'DRAFT' && (
                          <button onClick={() => sendMut.mutate(doc.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline">שלח</button>
                        )}
                        <button onClick={() => navigate(`/documents/${doc.id}`)}
                          className="text-xs text-gray-500 hover:text-gray-700">צפה</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <NewDocModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
