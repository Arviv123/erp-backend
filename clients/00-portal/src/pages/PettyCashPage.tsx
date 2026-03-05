import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Plus, Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw,
  ClipboardList, X, Loader2, ChevronDown,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');

const TX_LABEL: Record<string, string> = {
  WITHDRAWAL: 'הוצאה',
  DEPOSIT: 'הכנסה',
  REPLENISHMENT: 'מילוי מחדש',
};
const TX_COLOR: Record<string, string> = {
  WITHDRAWAL: 'bg-red-100 text-red-700',
  DEPOSIT: 'bg-green-100 text-green-700',
  REPLENISHMENT: 'bg-blue-100 text-blue-700',
};

const CATEGORIES = ['מזון ושתייה', 'משרד', 'תחבורה', 'חניה', 'אחר'];

// ─── types ────────────────────────────────────────────────────────────────────
interface Fund {
  id: string;
  name: string;
  balance: number;
  maxBalance?: number;
  custodianId?: string;
  custodian?: { firstName: string; lastName: string };
  createdAt: string;
}

interface Transaction {
  id: string;
  type: 'WITHDRAWAL' | 'DEPOSIT' | 'REPLENISHMENT';
  amount: number;
  description: string;
  category?: string;
  createdAt: string;
  userName?: string;
}

interface Reconciliation {
  fundId: string;
  balance: number;
  totalWithdrawals: number;
  totalDeposits: number;
  transactions: Transaction[];
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Create Fund Modal ─────────────────────────────────────────────────────────
function CreateFundModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [maxBalance, setMaxBalance] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/petty-cash', { name, ...(maxBalance ? { maxBalance: Number(maxBalance) } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petty-cash'] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'שגיאה'),
  });

  return (
    <Modal title="קופה קטנה חדשה" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">שם הקופה *</label>
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: קופה קטנה ראשית"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">יתרה מקסימלית (אופציונלי)</label>
          <input
            type="number"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={maxBalance}
            onChange={(e) => setMaxBalance(e.target.value)}
            placeholder="500"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            צור קופה
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Transaction Modal ─────────────────────────────────────────────────────────
function TransactionModal({
  fundId,
  type,
  onClose,
}: {
  fundId: string;
  type: 'WITHDRAWAL' | 'DEPOSIT' | 'REPLENISHMENT';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/petty-cash/${fundId}/transactions`, {
        type,
        amount: Number(amount),
        description,
        ...(type === 'WITHDRAWAL' && category ? { category } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petty-cash'] });
      qc.invalidateQueries({ queryKey: ['petty-cash-txs', fundId] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'שגיאה'),
  });

  const titles: Record<string, string> = {
    WITHDRAWAL: 'רשום הוצאה',
    DEPOSIT: 'רשום הכנסה',
    REPLENISHMENT: 'מילוי מחדש',
  };

  return (
    <Modal title={titles[type]} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">סכום (₪) *</label>
          <input
            type="number"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">תיאור *</label>
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור העסקה"
          />
        </div>
        {type === 'WITHDRAWAL' && (
          <div>
            <label className="text-xs text-gray-500 block mb-2">קטגוריה</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c === category ? '' : c)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    category === c
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || !description.trim() || mutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            שמור
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PettyCashPage() {
  const qc = useQueryClient();
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [showCreateFund, setShowCreateFund] = useState(false);
  const [txModal, setTxModal] = useState<'WITHDRAWAL' | 'DEPOSIT' | 'REPLENISHMENT' | null>(null);
  const [showRecon, setShowRecon] = useState(false);

  // Fetch all funds
  const { data: fundsData, isLoading: fundsLoading } = useQuery({
    queryKey: ['petty-cash'],
    queryFn: () => api.get('/petty-cash'),
  });
  const funds: Fund[] = Array.isArray(fundsData?.data) ? fundsData.data : Array.isArray(fundsData) ? fundsData : [];

  // Auto-select first fund
  const activeFundId = selectedFundId ?? funds[0]?.id ?? null;
  const activeFund = funds.find((f) => f.id === activeFundId) ?? null;

  // Fetch transactions for selected fund
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['petty-cash-txs', activeFundId],
    queryFn: () => api.get(`/petty-cash/${activeFundId}/transactions`),
    enabled: !!activeFundId,
  });
  const transactions: Transaction[] = Array.isArray(txData?.data)
    ? txData.data
    : Array.isArray(txData)
    ? txData
    : [];

  // Reconciliation
  const { data: reconData, isLoading: reconLoading, refetch: fetchRecon } = useQuery({
    queryKey: ['petty-cash-recon', activeFundId],
    queryFn: () => api.get(`/petty-cash/${activeFundId}/reconciliation`),
    enabled: false,
  });
  const recon: Reconciliation | null = reconData?.data ?? reconData ?? null;

  const handleRecon = () => {
    setShowRecon(true);
    fetchRecon();
  };

  // Balance progress bar
  const balancePct =
    activeFund && activeFund.maxBalance && activeFund.maxBalance > 0
      ? Math.min(100, (activeFund.balance / activeFund.maxBalance) * 100)
      : null;
  const progressColor =
    balancePct !== null && balancePct < 20 ? 'bg-red-500' : 'bg-blue-500';

  if (fundsLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400" dir="rtl">
        <Loader2 className="animate-spin ml-2" size={22} /> טוען קופה קטנה...
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet className="text-blue-600" size={26} />
          <h1 className="text-xl font-bold text-gray-800">קופה קטנה</h1>
        </div>
        <button
          onClick={() => setShowCreateFund(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5"
        >
          <Plus size={16} /> קופה קטנה חדשה
        </button>
      </div>

      {/* Fund tabs */}
      {funds.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {funds.map((f) => (
            <button
              key={f.id}
              onClick={() => { setSelectedFundId(f.id); setShowRecon(false); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                f.id === activeFundId
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {funds.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          <Wallet size={36} className="mx-auto mb-3 text-gray-300" />
          <p>אין קופות קטנות. צור קופה חדשה כדי להתחיל.</p>
        </div>
      )}

      {activeFund && (
        <>
          {/* Fund card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{activeFund.name}</h2>
                {activeFund.custodian && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    אחראי: {activeFund.custodian.firstName} {activeFund.custodian.lastName}
                  </p>
                )}
              </div>
              <div className="text-left">
                <p className="text-3xl font-bold text-gray-900">{fmtILS(activeFund.balance)}</p>
                {activeFund.maxBalance && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    מתוך {fmtILS(activeFund.maxBalance)}
                  </p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {balancePct !== null && (
              <div className="mb-5">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>יתרה</span>
                  <span>{balancePct.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor}`}
                    style={{ width: `${balancePct}%` }}
                  />
                </div>
                {balancePct < 20 && (
                  <p className="text-xs text-red-500 mt-1">יתרה נמוכה — מומלץ לבצע מילוי מחדש</p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTxModal('WITHDRAWAL')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 border border-red-200 transition"
              >
                <ArrowDownCircle size={16} /> הוצאה
              </button>
              <button
                onClick={() => setTxModal('DEPOSIT')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-50 text-green-600 text-sm font-medium hover:bg-green-100 border border-green-200 transition"
              >
                <ArrowUpCircle size={16} /> הכנסה
              </button>
              <button
                onClick={() => setTxModal('REPLENISHMENT')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 border border-blue-200 transition"
              >
                <RefreshCw size={16} /> מילוי מחדש
              </button>
              <button
                onClick={handleRecon}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-50 text-gray-600 text-sm font-medium hover:bg-gray-100 border border-gray-200 transition mr-auto"
              >
                <ClipboardList size={16} /> דוח פיוס
              </button>
            </div>
          </div>

          {/* Reconciliation card */}
          {showRecon && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <ClipboardList size={18} className="text-blue-600" /> דוח פיוס
              </h3>
              {reconLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin" /> טוען...
                </div>
              ) : recon ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">יתרה נוכחית</p>
                    <p className="text-xl font-bold text-gray-800">{fmtILS(recon.balance)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">סה"כ הוצאות</p>
                    <p className="text-xl font-bold text-red-600">{fmtILS(recon.totalWithdrawals)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">סה"כ הכנסות</p>
                    <p className="text-xl font-bold text-green-600">{fmtILS(recon.totalDeposits)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">לא נמצאו נתוני פיוס</p>
              )}
            </div>
          )}

          {/* Transactions table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700">עסקאות</h3>
            </div>
            {txLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="animate-spin ml-2" size={18} /> טוען עסקאות...
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">אין עסקאות עדיין</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">תאריך</th>
                    <th className="px-4 py-3 text-right font-medium">סוג</th>
                    <th className="px-4 py-3 text-right font-medium">תיאור</th>
                    <th className="px-4 py-3 text-right font-medium">קטגוריה</th>
                    <th className="px-4 py-3 text-left font-medium">סכום</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-500">{fmtDate(tx.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${TX_COLOR[tx.type]}`}>
                          {TX_LABEL[tx.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{tx.description}</td>
                      <td className="px-4 py-3 text-gray-500">{tx.category ?? '—'}</td>
                      <td className="px-4 py-3 text-left font-semibold">
                        {tx.type === 'WITHDRAWAL' ? (
                          <span className="text-red-600">-{fmtILS(tx.amount)}</span>
                        ) : (
                          <span className="text-green-600">+{fmtILS(tx.amount)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {showCreateFund && <CreateFundModal onClose={() => setShowCreateFund(false)} />}
      {txModal && activeFundId && (
        <TransactionModal
          fundId={activeFundId}
          type={txModal}
          onClose={() => setTxModal(null)}
        />
      )}
    </div>
  );
}
