import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Plus,
  Wifi,
  WifiOff,
  Trash2,
  Edit2,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  CreditCard,
  Activity,
  Terminal,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentTerminal {
  id: string;
  name: string;
  provider: string;
  serialNumber: string;
  isActive: boolean;
  lastPing?: string;
  branchId?: string;
  branch?: { name: string };
}

interface Transaction {
  id: string;
  terminalId: string;
  amount: number;
  status: 'APPROVED' | 'DECLINED' | 'PENDING' | 'CANCELLED';
  createdAt: string;
  authCode?: string;
  last4?: string;
}

interface TerminalFormData {
  name: string;
  provider: string;
  serialNumber: string;
  config: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROVIDERS: Record<string, string> = {
  PeleCard: 'פלא כארד',
  CardCom: 'קארדקום',
  Tranzila: 'טרנזילה',
  PayPlus: 'פיי פלוס',
  Meshulam: 'משולם',
};

const TX_STATUS: Record<string, { label: string; color: string }> = {
  APPROVED: { label: 'אושר', color: 'bg-green-100 text-green-700' },
  DECLINED: { label: 'נדחה', color: 'bg-red-100 text-red-700' },
  PENDING: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-700' },
  CANCELLED: { label: 'בוטל', color: 'bg-gray-100 text-gray-600' },
};

const PROVIDER_COLORS: Record<string, string> = {
  PeleCard: 'bg-blue-600',
  CardCom: 'bg-emerald-600',
  Tranzila: 'bg-violet-600',
  PayPlus: 'bg-orange-500',
  Meshulam: 'bg-rose-600',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLastPing(d?: string) {
  if (!d) return 'אין מידע';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return formatDate(d);
}

function StatusBadge({ status }: { status: string }) {
  const s = TX_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── Terminal Form Modal ──────────────────────────────────────────────────────

function TerminalFormModal({
  terminal,
  onClose,
  onSuccess,
}: {
  terminal?: PaymentTerminal;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<TerminalFormData>({
    name: terminal?.name ?? '',
    provider: terminal?.provider ?? 'PeleCard',
    serialNumber: terminal?.serialNumber ?? '',
    config: terminal ? '{}' : '{}',
  });
  const [configError, setConfigError] = useState('');

  const isEdit = !!terminal;

  const mutation = useMutation({
    mutationFn: async () => {
      let parsedConfig: unknown = {};
      try {
        parsedConfig = JSON.parse(form.config);
      } catch {
        throw new Error('JSON_CONFIG_INVALID');
      }
      if (isEdit) {
        return api.patch(`/payment-terminal/terminals/${terminal.id}`, { ...form, config: parsedConfig });
      }
      return api.post('/payment-terminal/terminals', { ...form, config: parsedConfig });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (e: unknown) => {
      if ((e as Error).message === 'JSON_CONFIG_INVALID') {
        setConfigError('הגדרות ה-JSON אינן תקינות');
      }
    },
  });

  const handleSubmit = () => {
    setConfigError('');
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'עריכת מסוף' : 'הוסף מסוף תשלום'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם המסוף</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder='לדוגמה: קופה 1'
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ספק</label>
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              {Object.entries(PROVIDERS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר סידורי</label>
            <input
              type="text"
              value={form.serialNumber}
              onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
              placeholder="SN-XXXXXXXX"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הגדרות (JSON)</label>
            <textarea
              rows={4}
              value={form.config}
              onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full font-mono resize-none"
              placeholder='{ "apiKey": "...", "merchantId": "..." }'
            />
            {configError && (
              <p className="text-xs text-red-500 mt-1">{configError}</p>
            )}
          </div>

          {mutation.isError && !configError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>שגיאה בשמירת המסוף</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-100">
          <button
            onClick={onClose}
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
          >
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !form.name || !form.serialNumber}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isEdit ? 'שמור שינויים' : 'הוסף מסוף'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Terminal Card ────────────────────────────────────────────────────────────

function TerminalCard({
  terminal,
  onEdit,
  onDelete,
  onTest,
  testResult,
  testing,
}: {
  terminal: PaymentTerminal;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testResult: { success: boolean; message: string } | null;
  testing: boolean;
}) {
  const providerColor = PROVIDER_COLORS[terminal.provider] ?? 'bg-gray-600';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${providerColor} flex items-center justify-center text-white`}>
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{terminal.name}</h3>
            <p className="text-xs text-gray-500">{PROVIDERS[terminal.provider] ?? terminal.provider}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {terminal.isActive ? (
            <div className="flex items-center gap-1.5 text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium">פעיל</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-xs font-medium">לא פעיל</span>
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">מספר סידורי</span>
          <span className="font-mono text-gray-700">{terminal.serialNumber}</span>
        </div>
        {terminal.branch && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">סניף</span>
            <span className="text-gray-700">{terminal.branch.name}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">תקשורת אחרונה</span>
          <span className="text-gray-700">{formatLastPing(terminal.lastPing)}</span>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 text-xs p-2.5 rounded-lg ${
            testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {testResult.success ? (
            <Wifi className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          )}
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <button
          onClick={onTest}
          disabled={testing}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Activity className="w-3.5 h-3.5" />
          )}
          בדוק חיבור
        </button>
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          ערוך
        </button>
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          מחק
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaymentTerminalsPage() {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editTerminal, setEditTerminal] = useState<PaymentTerminal | undefined>(undefined);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Terminals query
  const { data: terminals, isLoading: terminalsLoading } = useQuery<PaymentTerminal[]>({
    queryKey: ['payment-terminals'],
    queryFn: async () => {
      const r = await api.get('/payment-terminal/terminals');
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  // Transactions query
  const { data: transactions, isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ['payment-transactions'],
    queryFn: async () => {
      const r = await api.get('/payment-terminal/transactions');
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payment-terminal/terminals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terminals'] });
      showToast('success', 'המסוף נמחק');
      setDeleteConfirm(null);
    },
    onError: () => showToast('error', 'שגיאה במחיקת המסוף'),
  });

  // Test connection
  const testConnection = async (terminalId: string) => {
    setTestingId(terminalId);
    try {
      const r = await api.post(`/payment-terminal/terminals/${terminalId}/test`);
      const result: { success: boolean; message: string } = r.data;
      setTestResults((prev) => ({ ...prev, [terminalId]: result }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [terminalId]: { success: false, message: 'לא ניתן להתחבר למסוף' },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const terminalMap = new Map((terminals ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 text-center" dir="rtl">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת מסוף</h3>
            <p className="text-sm text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק מסוף זה? פעולה זו אינה הפיכה.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                ביטול
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm flex items-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                מחק
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מסופי תשלום</h1>
          <p className="text-sm text-gray-500 mt-1">ניהול מסופי סליקה וטרנזקציות</p>
        </div>
        <button
          onClick={() => { setEditTerminal(undefined); setShowForm(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          הוסף מסוף
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">סה"כ מסופים</p>
              <p className="text-xl font-bold text-gray-900">{terminals?.length ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">מסופים פעילים</p>
              <p className="text-xl font-bold text-gray-900">{terminals?.filter((t) => t.isActive).length ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">טרנזקציות היום</p>
              <p className="text-xl font-bold text-gray-900">
                {transactions?.filter((t) => {
                  const d = new Date(t.createdAt);
                  const now = new Date();
                  return d.toDateString() === now.toDateString();
                }).length ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Terminals grid */}
      {terminalsLoading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : !terminals || terminals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Terminal className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">לא נמצאו מסופי תשלום</p>
          <button
            onClick={() => { setEditTerminal(undefined); setShowForm(true); }}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            הוסף מסוף ראשון
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {terminals.map((terminal) => (
            <TerminalCard
              key={terminal.id}
              terminal={terminal}
              onEdit={() => { setEditTerminal(terminal); setShowForm(true); }}
              onDelete={() => setDeleteConfirm(terminal.id)}
              onTest={() => testConnection(terminal.id)}
              testResult={testResults[terminal.id] ?? null}
              testing={testingId === terminal.id}
            />
          ))}
        </div>
      )}

      {/* Transactions table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-800">טרנזקציות אחרונות</h2>
        </div>

        {txLoading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">אין טרנזקציות</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-right font-medium text-gray-600">מסוף</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">סכום</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">קוד אישור</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">4 ספרות</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">תאריך</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.slice(0, 20).map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">
                      {terminalMap.get(tx.terminalId) ?? tx.terminalId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{ILS(tx.amount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{tx.authCode ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-600">
                      {tx.last4 ? `****${tx.last4}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <TerminalFormModal
          terminal={editTerminal}
          onClose={() => { setShowForm(false); setEditTerminal(undefined); }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['payment-terminals'] });
            showToast('success', editTerminal ? 'המסוף עודכן' : 'המסוף נוסף בהצלחה');
          }}
        />
      )}
    </div>
  );
}
