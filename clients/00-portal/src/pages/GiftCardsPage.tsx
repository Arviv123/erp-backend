import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus, CreditCard, X } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

interface GiftCard {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  isActive: boolean;
  expiryDate: string;
  soldAt: string;
  purchaserName: string;
}

interface CreateForm {
  initialAmount: string;
  purchaserName: string;
  purchaserEmail: string;
  expiryDate: string;
}

const EMPTY_CREATE: CreateForm = {
  initialAmount: '',
  purchaserName: '',
  purchaserEmail: '',
  expiryDate: '',
};

interface RedeemState {
  cardId: string;
  code: string;
  balance: number;
  amount: string;
}

export default function GiftCardsPage() {
  const queryClient = useQueryClient();
  const [activeOnly, setActiveOnly] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState('');
  const [redeemState, setRedeemState] = useState<RedeemState | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data: cards = [], isLoading } = useQuery<GiftCard[]>({
    queryKey: ['gift-cards'],
    queryFn: async () => {
      const res = await api.get('/pos/gift-cards');
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/pos/gift-cards', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      setShowCreateForm(false);
      setCreateForm(EMPTY_CREATE);
      setCreateError('');
      setSuccessMsg('כרטיס המתנה נוצר בהצלחה');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setCreateError('שגיאה ביצירת כרטיס המתנה'),
  });

  const redeemMutation = useMutation({
    mutationFn: ({ code, amount }: { code: string; amount: number }) =>
      api.post(`/pos/gift-cards/${code}/redeem`, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      setRedeemState(null);
      setRedeemError('');
      setSuccessMsg('המימוש בוצע בהצלחה');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setRedeemError('שגיאה במימוש הכרטיס — בדוק יתרה ותוקף'),
  });

  const handleCreate = () => {
    if (!createForm.initialAmount || isNaN(Number(createForm.initialAmount)) || Number(createForm.initialAmount) <= 0) {
      setCreateError('יש להזין סכום תקין'); return;
    }
    if (!createForm.purchaserName.trim()) {
      setCreateError('שם הרוכש הוא שדה חובה'); return;
    }
    createMutation.mutate({
      initialAmount: Number(createForm.initialAmount),
      purchaserName: createForm.purchaserName.trim(),
      purchaserEmail: createForm.purchaserEmail.trim() || undefined,
      expiryDate: createForm.expiryDate || undefined,
    });
  };

  const handleRedeem = () => {
    if (!redeemState) return;
    const amount = Number(redeemState.amount);
    if (!redeemState.amount || isNaN(amount) || amount <= 0) {
      setRedeemError('יש להזין סכום תקין'); return;
    }
    if (amount > redeemState.balance) {
      setRedeemError('הסכום גבוה מהיתרה הזמינה'); return;
    }
    redeemMutation.mutate({ code: redeemState.code, amount });
  };

  const displayCards = activeOnly ? cards.filter(c => c.isActive) : cards;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="text-pink-500" size={24} />
          <h1 className="text-2xl font-bold text-gray-900">כרטיסי מתנה</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={e => setActiveOnly(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            פעילים בלבד
          </label>
          <button
            onClick={() => { setShowCreateForm(v => !v); setCreateError(''); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            כרטיס חדש
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')}><X size={14} /></button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">יצירת כרטיס מתנה חדש</h2>
          {createError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">
              {createError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
              <input
                type="number"
                min="1"
                value={createForm.initialAmount}
                onChange={e => setCreateForm(f => ({ ...f, initialAmount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הרוכש</label>
              <input
                type="text"
                value={createForm.purchaserName}
                onChange={e => setCreateForm(f => ({ ...f, purchaserName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ישראל ישראלי"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אימייל הרוכש</label>
              <input
                type="email"
                value={createForm.purchaserEmail}
                onChange={e => setCreateForm(f => ({ ...f, purchaserEmail: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="example@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך פקיעה</label>
              <input
                type="date"
                value={createForm.expiryDate}
                onChange={e => setCreateForm(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-60"
            >
              {createMutation.isPending ? 'יוצר...' : 'צור כרטיס מתנה'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setCreateError(''); setCreateForm(EMPTY_CREATE); }}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : displayCards.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Gift size={40} className="mx-auto mb-3 opacity-40" />
            <p>אין כרטיסי מתנה{activeOnly ? ' פעילים' : ''}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">קוד</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סכום מקורי</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">יתרה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">רוכש</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">פקיעה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayCards.map((card) => {
                  const pct = card.initialAmount > 0 ? Math.round((card.balance / card.initialAmount) * 100) : 0;
                  return (
                    <tr key={card.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-xs">
                          {card.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{fmtCurrency(card.initialAmount)}</td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-semibold ${card.balance === 0 ? 'text-gray-400' : 'text-green-700'}`}>
                              {fmtCurrency(card.balance)}
                            </span>
                            <span className="text-xs text-gray-400">{pct}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{card.purchaserName || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(card.expiryDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          card.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {card.isActive ? 'פעיל' : 'לא פעיל'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {card.isActive && card.balance > 0 && (
                          <button
                            onClick={() => {
                              setRedeemState({ cardId: card.id, code: card.code, balance: card.balance, amount: '' });
                              setRedeemError('');
                            }}
                            className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2 py-1 rounded-lg transition-colors font-medium"
                          >
                            <CreditCard size={12} />
                            מימוש
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Redeem dialog */}
      {redeemState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">מימוש כרטיס מתנה</h3>
              <button onClick={() => setRedeemState(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">קוד כרטיס</span>
                <span className="font-mono font-bold">{redeemState.code}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">יתרה זמינה</span>
                <span className="font-semibold text-green-700">{fmtCurrency(redeemState.balance)}</span>
              </div>
            </div>
            {redeemError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-4 text-sm">
                {redeemError}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">סכום לממש (₪)</label>
              <input
                type="number"
                min="1"
                max={redeemState.balance}
                value={redeemState.amount}
                onChange={e => setRedeemState(s => s ? { ...s, amount: e.target.value } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`עד ${fmtCurrency(redeemState.balance)}`}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRedeem}
                disabled={redeemMutation.isPending}
                className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm disabled:opacity-60 font-medium"
              >
                {redeemMutation.isPending ? 'מממש...' : 'בצע מימוש'}
              </button>
              <button
                onClick={() => { setRedeemState(null); setRedeemError(''); }}
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
