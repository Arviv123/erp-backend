import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const TYPE_LABEL: Record<string, string> = {
  ASSET: 'נכסים', LIABILITY: 'התחייבויות', EQUITY: 'הון עצמי', REVENUE: 'הכנסות', EXPENSE: 'הוצאות',
};
const TYPE_COLOR: Record<string, string> = {
  ASSET: 'text-blue-700 bg-blue-50', LIABILITY: 'text-orange-700 bg-orange-50',
  EQUITY: 'text-purple-700 bg-purple-50', REVENUE: 'text-green-700 bg-green-50', EXPENSE: 'text-red-700 bg-red-50',
};

async function getAccounts() { const r = await api.get('/accounting/accounts'); return r.data; }

export default function ChartOfAccountsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ code: '', name: '', type: 'ASSET', parentId: '' });
  const [error, setError] = useState('');

  const { data } = useQuery({ queryKey: ['acc-accounts'], queryFn: getAccounts });
  const accounts: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/accounting/accounts', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['acc-accounts'] }); setShowModal(false); setForm({ code: '', name: '', type: 'ASSET', parentId: '' }); },
    onError: (e: any) => setError(e?.response?.data?.error || 'שגיאה'),
  });

  const grouped: Record<string, any[]> = {};
  accounts.forEach(a => {
    if (!grouped[a.type]) grouped[a.type] = [];
    grouped[a.type].push(a);
  });

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none';
  const selectCls = inputCls + ' bg-white';

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">תרשים חשבונות</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm px-4 py-2 rounded-lg transition">
          <Plus className="w-4 h-4" />חשבון חדש
        </button>
      </div>

      <div className="space-y-3">
        {Object.entries(TYPE_LABEL).map(([type, label]) => {
          const items = grouped[type] ?? [];
          const isOpen = !collapsed[type];
          return (
            <div key={type} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <button
                onClick={() => setCollapsed(p => ({ ...p, [type]: !p[type] }))}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[type]}`}>{label}</span>
                  <span className="text-xs text-gray-400">{items.length} חשבונות</span>
                </div>
              </button>
              {isOpen && items.length > 0 && (
                <table className="w-full text-sm border-t border-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">קוד</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">שם</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">יתרה</th>
                      <th className="px-4 py-2 text-xs text-gray-400 text-center">כרטסת</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.sort((a, b) => a.code - b.code).map((acc: any) => (
                      <tr key={acc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-sm text-gray-600">{acc.code}</td>
                        <td className="px-4 py-2.5 text-gray-900">{acc.name}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-700">
                          {acc.balance != null ? fmtCurrency(acc.balance) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => navigate(`/accounting/ledger?accountId=${acc.id}`)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            כרטסת
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {isOpen && items.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-400">אין חשבונות</p>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">חשבון חדש</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">קוד חשבון</label>
                <input className={inputCls} placeholder="1200" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">שם חשבון</label>
                <input className={inputCls} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">סוג</label>
                <select className={selectCls} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => createMutation.mutate({ code: Number(form.code), name: form.name, type: form.type })}
                  disabled={createMutation.isPending}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white py-2 rounded-lg text-sm font-medium">
                  {createMutation.isPending ? 'שומר...' : 'צור חשבון'}
                </button>
                <button onClick={() => setShowModal(false)} className="px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
