import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Check } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_LABEL: Record<string, string> = { DRAFT: 'טיוטה', POSTED: 'מאושר', VOID: 'מבוטל' };
const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', POSTED: 'bg-green-100 text-green-700', VOID: 'bg-red-100 text-red-600',
};

async function getTx(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  const r = await api.get(`/accounting/transactions${q ? '?' + q : ''}`);
  return r.data;
}
async function getAccounts() { const r = await api.get('/accounting/accounts'); return r.data; }

export default function JournalPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (dateFrom) params.from = dateFrom;
  if (dateTo) params.to = dateTo;

  const { data } = useQuery({ queryKey: ['acc-tx', params], queryFn: () => getTx(params) });
  const { data: accData } = useQuery({ queryKey: ['acc-accounts'], queryFn: getAccounts });
  const transactions: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  const accounts: any[] = Array.isArray(accData) ? accData : Array.isArray(accData?.data) ? accData.data : [];

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '', description: '',
    lines: [{ debitAccountId: '', creditAccountId: '', amount: '', description: '' }],
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/transactions/${id}/post`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc-tx'] }),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/accounting/transactions', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc-tx'] });
      setShowModal(false);
      setForm({ date: new Date().toISOString().split('T')[0], reference: '', description: '', lines: [{ debitAccountId: '', creditAccountId: '', amount: '', description: '' }] });
    },
    onError: (e: any) => setError(e?.response?.data?.error || 'שגיאה'),
  });

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white';
  const fieldCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500 outline-none bg-white';

  const addLine = () => setForm(p => ({ ...p, lines: [...p.lines, { debitAccountId: '', creditAccountId: '', amount: '', description: '' }] }));
  const removeLine = (i: number) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, key: string, val: string) =>
    setForm(p => ({ ...p, lines: p.lines.map((l, idx) => idx === i ? { ...l, [key]: val } : l) }));

  const handleCreate = () => {
    setError('');
    const body = {
      date: form.date, reference: form.reference, description: form.description,
      sourceType: 'MANUAL',
      lines: form.lines.map(l => ({ debitAccountId: l.debitAccountId, creditAccountId: l.creditAccountId, amount: Number(l.amount), description: l.description })),
    };
    createMutation.mutate(body);
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">יומן חשבונאי</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm px-4 py-2 rounded-lg transition">
          <Plus className="w-4 h-4" />פעולה ידנית
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3">
        <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">כל הסטאטוסים</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className={inputCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button onClick={() => { setStatus(''); setDateFrom(''); setDateTo(''); }}
          className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg">נקה</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">אין פעולות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">אסמכתא</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תיאור</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סכום</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטאטוס</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx: any) => {
                const total = Array.isArray(tx.lines)
                  ? tx.lines.reduce((s: number, l: any) => s + (l.amount ?? 0), 0) / 2
                  : 0;
                return (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(tx.date)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{tx.reference ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-800">{tx.description}</td>
                    <td className="px-4 py-3 font-medium">{fmtCurrency(total)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[tx.status] ?? ''}`}>
                        {STATUS_LABEL[tx.status] ?? tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.status === 'DRAFT' && (
                        <button onClick={() => postMutation.mutate(tx.id)}
                          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800">
                          <Check className="w-3.5 h-3.5" />אשר
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* New transaction modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">פעולה חשבונאית ידנית</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">תאריך</label>
                  <input type="date" className={inputCls + ' w-full'} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">אסמכתא</label>
                  <input className={inputCls + ' w-full'} value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">תיאור</label>
                  <input className={inputCls + ' w-full'} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-700">שורות חיוב / זיכוי</h4>
                <button onClick={addLine} className="text-xs text-teal-600 hover:text-teal-800">+ שורה</button>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_100px_1fr_24px] gap-2 items-center">
                    <select className={fieldCls} value={line.debitAccountId} onChange={e => updateLine(i, 'debitAccountId', e.target.value)}>
                      <option value="">חיוב (חשבון)</option>
                      {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                    <select className={fieldCls} value={line.creditAccountId} onChange={e => updateLine(i, 'creditAccountId', e.target.value)}>
                      <option value="">זיכוי (חשבון)</option>
                      {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                    <input type="number" className={fieldCls} placeholder="סכום" value={line.amount} onChange={e => updateLine(i, 'amount', e.target.value)} />
                    <input className={fieldCls} placeholder="תיאור" value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                    {form.lines.length > 1 && (
                      <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white py-2 rounded-lg text-sm font-medium">
                {createMutation.isPending ? 'שומר...' : 'שמור פעולה'}
              </button>
              <button onClick={() => setShowModal(false)} className="px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
