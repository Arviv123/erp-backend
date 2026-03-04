import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Save, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

interface Line {
  description:     string;
  sku:             string;
  barcode:         string;
  unit:            string;
  quantity:        number;
  unitPrice:       number;
  discountPercent: number;
  vatRate:         number;
  notes:           string;
}

const emptyLine = (): Line => ({
  description: '', sku: '', barcode: '', unit: 'יח׳',
  quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 0.18, notes: '',
});

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none';
const headerInputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none';

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const [customerId,    setCustomerId]    = useState('');
  const [date,          setDate]          = useState(new Date().toISOString().slice(0, 10));
  const [dueDate,       setDueDate]       = useState('');
  const [notes,         setNotes]         = useState('');
  const [reference,     setReference]     = useState('');
  const [paymentTerms,  setPaymentTerms]  = useState('שוטף + 30');
  const [discountPct,   setDiscountPct]   = useState(0);
  const [lines,         setLines]         = useState<Line[]>([emptyLine()]);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [error,         setError]         = useState('');

  const { data: custData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/crm/customers'),
  });
  const customers: any[] = Array.isArray(custData?.data) ? custData.data
    : Array.isArray(custData?.data?.data) ? custData.data.data : [];

  const saveMutation = useMutation({
    mutationFn: async (andSend: boolean) => {
      const validLines = lines.filter(l => l.description && l.unitPrice >= 0 && l.quantity > 0);
      const payload = {
        customerId,
        date:            date,
        dueDate:         dueDate,
        notes:           notes || undefined,
        paymentTerms:    paymentTerms || undefined,
        reference:       reference || undefined,
        discountPercent: discountPct || undefined,
        lines:           validLines,
      };
      const res = await api.post('/invoices', payload);
      const inv = res.data?.data ?? res.data;
      if (andSend && inv?.id) {
        await api.post(`/invoices/${inv.id}/send`);
      }
      return inv;
    },
    onSuccess: inv => navigate(`/invoices/${inv.id ?? inv}`),
    onError:   (err: any) => setError(err.response?.data?.error || err.response?.data?.message || 'שגיאה בשמירה'),
  });

  const updateLine = (idx: number, field: keyof Line, value: string | number) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Calculations
  const lineSubtotals = lines.map(l => {
    const gross    = l.quantity * l.unitPrice;
    const discAmt  = gross * (l.discountPercent / 100);
    const net      = gross - discAmt;
    const vatAmt   = net * l.vatRate;
    return { gross, discAmt, net, vatAmt, total: net + vatAmt };
  });
  const subtotal       = lineSubtotals.reduce((s, l) => s + l.net, 0);
  const overallDiscAmt = subtotal * (discountPct / 100);
  const afterDisc      = subtotal - overallDiscAmt;
  const vatTotal       = lineSubtotals.reduce((s, l) => s + l.vatAmt, 0) * (1 - discountPct / 100);
  const grandTotal     = afterDisc + vatTotal;

  const valid = customerId && date && dueDate && lines.some(l => l.description && l.unitPrice >= 0 && l.quantity > 0);

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-xl font-bold text-gray-800">חשבונית חדשה</h2>

      {/* Header fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={headerInputCls}>
              <option value="">בחר לקוח...</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חשבונית *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={headerInputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך לתשלום *</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={headerInputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תנאי תשלום</label>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className={headerInputCls + ' bg-white'}>
              <option value="שוטף">שוטף</option>
              <option value="שוטף + 30">שוטף + 30</option>
              <option value="שוטף + 45">שוטף + 45</option>
              <option value="שוטף + 60">שוטף + 60</option>
              <option value="COD">מזומן בעת מסירה</option>
              <option value="מראש">תשלום מראש</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר הזמנה / אסמכתא</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="PO-1234" className={headerInputCls} />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={headerInputCls} />
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-medium text-gray-700">פריטים</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAdvanced ? 'הסתר עמודות נוספות' : 'הצג מק"ט / ברקוד / יחידה'}
            </button>
            <button
              onClick={() => setLines(prev => [...prev, emptyLine()])}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={16} /> הוסף שורה
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-medium w-7">#</th>
                {showAdvanced && <th className="px-3 py-2 text-right font-medium w-24">מק"ט</th>}
                {showAdvanced && <th className="px-3 py-2 text-right font-medium w-28">ברקוד</th>}
                <th className="px-3 py-2 text-right font-medium">תיאור פריט</th>
                {showAdvanced && <th className="px-3 py-2 text-right font-medium w-16">יחידה</th>}
                <th className="px-3 py-2 text-right font-medium w-20">כמות</th>
                <th className="px-3 py-2 text-right font-medium w-28">מחיר יחידה (₪)</th>
                <th className="px-3 py-2 text-right font-medium w-20">הנחה %</th>
                <th className="px-3 py-2 text-right font-medium w-20">מע"מ %</th>
                <th className="px-3 py-2 text-left font-medium w-28">סה"כ שורה</th>
                <th className="px-3 py-2 w-9"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, idx) => {
                const lt = lineSubtotals[idx];
                return (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-400 text-center">{idx + 1}</td>
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <input value={line.sku} onChange={e => updateLine(idx, 'sku', e.target.value)}
                          placeholder="12345" className={inputCls} />
                      </td>
                    )}
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <input value={line.barcode} onChange={e => updateLine(idx, 'barcode', e.target.value)}
                          placeholder="789012345" className={inputCls} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)}
                        placeholder="תיאור פריט / שירות" className={inputCls} />
                    </td>
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <input value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)}
                          placeholder="יח׳" className={inputCls} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <input type="number" min={0.001} step={1} value={line.quantity}
                        onChange={e => updateLine(idx, 'quantity', +e.target.value)}
                        className={inputCls + ' text-center'} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step={0.01} value={line.unitPrice}
                        onChange={e => updateLine(idx, 'unitPrice', +e.target.value)}
                        className={inputCls + ' text-center'} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <input type="number" min={0} max={100} step={1} value={line.discountPercent}
                          onChange={e => updateLine(idx, 'discountPercent', +e.target.value)}
                          className={inputCls + ' text-center pr-5'} />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select value={line.vatRate}
                        onChange={e => updateLine(idx, 'vatRate', +e.target.value)}
                        className={inputCls + ' bg-white text-center'}>
                        <option value={0.18}>18%</option>
                        <option value={0}>0%</option>
                        <option value={0.17}>17%</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-left font-medium text-gray-800">
                      {fmt(lt.net)}
                      {lt.discAmt > 0 && (
                        <div className="text-xs text-red-500">-{fmt(lt.discAmt)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        className="text-gray-300 hover:text-red-400 transition disabled:opacity-20">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 p-5 bg-gray-50">
          <div className="flex justify-between items-start">
            {/* Overall discount */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 font-medium">הנחה כללית על החשבונית:</label>
              <div className="relative">
                <input
                  type="number" min={0} max={100} step={1} value={discountPct}
                  onChange={e => setDiscountPct(+e.target.value)}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-blue-500 outline-none pr-5"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
              </div>
              {discountPct > 0 && (
                <span className="text-sm text-red-600">-{fmt(overallDiscAmt)}</span>
              )}
            </div>

            {/* Summary */}
            <div className="text-sm space-y-1 min-w-[240px]">
              <div className="flex justify-between">
                <span className="text-gray-500">סכום לפני מע"מ:</span>
                <span className="font-medium">{fmt(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>הנחה כללית ({discountPct}%):</span>
                  <span>-{fmt(overallDiscAmt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">מע"מ:</span>
                <span className="font-medium">{fmt(vatTotal)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-bold text-gray-800">סה"כ לתשלום:</span>
                <span className="font-bold text-lg text-blue-700">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">{error}</div>}

      <div className="flex gap-3">
        <button onClick={() => saveMutation.mutate(false)} disabled={!valid || saveMutation.isPending}
          className="bg-gray-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-700 transition disabled:opacity-50 flex items-center gap-2">
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          שמור כטיוטה
        </button>
        <button onClick={() => saveMutation.mutate(true)} disabled={!valid || saveMutation.isPending}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          שמור ושלח
        </button>
      </div>
    </div>
  );
}
