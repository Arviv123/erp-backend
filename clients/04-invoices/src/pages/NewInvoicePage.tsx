import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Save, Send, Loader2 } from 'lucide-react';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const emptyLine = (): Line => ({ description: '', quantity: 1, unitPrice: 0, vatRate: 0.18 });

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('שוטף +30');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState('');

  const { data: custData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/crm/customers'),
  });
  const customers: any[] = Array.isArray(custData?.data) ? custData.data : Array.isArray(custData) ? custData : [];

  const saveMutation = useMutation({
    mutationFn: async (andSend: boolean) => {
      const payload = {
        customerId,
        date: new Date(date).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        notes: notes || undefined,
        paymentTerms: paymentTerms || undefined,
        lines: lines.filter((l) => l.description && l.unitPrice > 0),
      };
      const res = await api.post('/invoices', payload);
      const inv = res.data?.id ? res.data : res;
      if (andSend && inv?.id) {
        await api.post(`/invoices/${inv.id}/send`);
      }
      return inv;
    },
    onSuccess: (inv) => navigate(`/invoices/${inv.id}`),
    onError: (err: any) => setError(err.response?.data?.message || 'שגיאה בשמירה'),
  });

  const updateLine = (idx: number, field: keyof Line, value: string | number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vatTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.vatRate, 0);
  const total = subtotal + vatTotal;
  const valid = customerId && date && dueDate && lines.some((l) => l.description && l.unitPrice > 0);

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-xl font-bold text-gray-800">חשבונית חדשה</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">לקוח</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">בחר לקוח...</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חשבונית</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך לתשלום</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תנאי תשלום</label>
            <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-medium text-gray-700">שורות חשבונית</h3>
          <button onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <Plus size={16} /> הוסף שורה
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="px-4 py-2 text-right font-medium w-8">#</th>
              <th className="px-4 py-2 text-right font-medium">תיאור</th>
              <th className="px-4 py-2 text-right font-medium w-24">כמות</th>
              <th className="px-4 py-2 text-right font-medium w-32">מחיר יחידה</th>
              <th className="px-4 py-2 text-right font-medium w-24">מע״מ</th>
              <th className="px-4 py-2 text-right font-medium w-32">סה״כ שורה</th>
              <th className="px-4 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line, idx) => {
              const lineTotal = line.quantity * line.unitPrice * (1 + line.vatRate);
              return (
                <tr key={idx}>
                  <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <input type="text" value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      placeholder="תיאור שורה"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" min={1} value={line.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', +e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-blue-500 outline-none" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" min={0} value={line.unitPrice}
                      onChange={(e) => updateLine(idx, 'unitPrice', +e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-blue-500 outline-none" />
                  </td>
                  <td className="px-4 py-2 text-center text-gray-500">{(line.vatRate * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 font-medium text-left">{fmtCurrency(lineTotal)}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                      className="text-gray-400 hover:text-red-500 transition disabled:opacity-30">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex flex-col items-start gap-1 max-w-xs mr-auto text-sm">
            <div className="flex justify-between w-full">
              <span className="text-gray-500">לפני מע״מ:</span>
              <span className="font-medium">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full">
              <span className="text-gray-500">מע״מ 18%:</span>
              <span className="font-medium">{fmtCurrency(vatTotal)}</span>
            </div>
            <div className="flex justify-between w-full pt-2 border-t border-gray-300">
              <span className="font-bold text-gray-800">סה״כ לתשלום:</span>
              <span className="font-bold text-lg text-blue-700">{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}

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
