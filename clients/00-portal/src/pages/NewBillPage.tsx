import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';

const VAT_RATE = 0.18;

interface BillLine {
  description: string;
  quantity: string;
  unitCost: string;
  vatRate: number;
}

async function getVendors() {
  const r = await api.get('/purchasing/vendors');
  return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(n);

export default function NewBillPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors', ''], queryFn: getVendors });

  const today = new Date().toISOString().slice(0, 10);
  const due30  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();

  const [vendorId,  setVendorId]  = useState('');
  const [vendorRef, setVendorRef] = useState('');
  const [date,      setDate]      = useState(today);
  const [dueDate,   setDueDate]   = useState(due30);
  const [notes,     setNotes]     = useState('');
  const [lines, setLines] = useState<BillLine[]>([{ description: '', quantity: '1', unitCost: '', vatRate: VAT_RATE }]);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/purchasing/bills', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }); navigate('/purchasing/bills'); },
    onError: (e: any) => setError(e.response?.data?.error ?? e.message),
  });

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const vatTotal  = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0) * l.vatRate, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) { setError('יש לבחור ספק'); return; }
    if (lines.some(l => !l.description.trim() || !l.unitCost)) { setError('יש למלא תיאור ומחיר לכל שורה'); return; }
    mutation.mutate({
      vendorId,
      vendorRef: vendorRef || undefined,
      date:    new Date(date).toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      notes:   notes || undefined,
      lines: lines.map(l => ({
        description: l.description,
        quantity:    Number(l.quantity),
        unitCost:    Number(l.unitCost),
        vatRate:     l.vatRate,
      })),
    });
  };

  const updateLine = (i: number, key: keyof BillLine, val: string | number) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">← חזרה</button>
        <h1 className="text-2xl font-bold text-gray-900">חשבונית ספק חדשה</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ספק *</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">-- בחר ספק --</option>
                {(vendors as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מס&apos; חשבונית ספק (חיצוני)</label>
              <input type="text" value={vendorRef} onChange={e => setVendorRef(e.target.value)} placeholder="INV-XXXX"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חשבונית</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך פירעון</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">פירוט שורות</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 px-1 mb-1">
              <span className="col-span-5">תיאור</span>
              <span className="col-span-2">כמות</span>
              <span className="col-span-3">מחיר יחידה</span>
              <span className="col-span-2">סה&quot;כ שורה</span>
            </div>
            {lines.map((line, i) => {
              const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input type="text" placeholder="תיאור" value={line.description}
                    onChange={e => updateLine(i, 'description', e.target.value)}
                    className="col-span-5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <input type="number" placeholder="1" value={line.quantity} min="0.01" step="0.01"
                    onChange={e => updateLine(i, 'quantity', e.target.value)}
                    className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <input type="number" placeholder="0.00" value={line.unitCost} min="0" step="0.01"
                    onChange={e => updateLine(i, 'unitCost', e.target.value)}
                    className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <span className="col-span-1 text-sm text-gray-600 text-left">{fmtNum(lineTotal)}</span>
                  <button type="button" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}
                    disabled={lines.length === 1}
                    className="col-span-1 flex justify-center text-gray-400 hover:text-red-500 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button"
            onClick={() => setLines(prev => [...prev, { description: '', quantity: '1', unitCost: '', vatRate: VAT_RATE }])}
            className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
            <Plus className="w-3.5 h-3.5" /> הוסף שורה
          </button>

          <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-sm text-left">
            <div className="flex justify-between text-gray-600">
              <span>סכום לפני מע&quot;מ:</span><span>{fmtNum(subtotal)}</span>
            </div>
            <div className="flex justify-between text-teal-700">
              <span>מע&quot;מ 18%:</span><span>{fmtNum(vatTotal)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base pt-1.5 border-t border-gray-200">
              <span>סה&quot;כ לתשלום:</span><span>{fmtNum(subtotal + vatTotal)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="הערות לחשבונית..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {mutation.isPending ? 'שומר...' : '💾 שמור חשבונית'}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
