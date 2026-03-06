import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  ArrowLeftRight,
  Power,
} from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDateTime = (str: string) =>
  new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(str));

const EVENT_TYPE_LABELS: Record<string, string> = {
  CASH_IN: 'הכנסת מזומן',
  CASH_OUT: 'הוצאת מזומן',
  NO_SALE: 'מגירה ללא מכירה',
  OPENING: 'פתיחה',
  CLOSING: 'סגירה',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  CASH_IN: 'text-green-600',
  CASH_OUT: 'text-red-600',
  NO_SALE: 'text-gray-500',
  OPENING: 'text-blue-600',
  CLOSING: 'text-orange-600',
};

// Israeli denominations
const BILLS = [200, 100, 50, 20];
const COINS = [10, 5, 2, 1];
const HALF_AGORA = 0.5;

function buildDenominationState() {
  const state: Record<string, number> = {};
  BILLS.forEach(b => (state[`bill_${b}`] = 0));
  COINS.forEach(c => (state[`coin_${c}`] = 0));
  state['coin_050'] = 0;
  return state;
}

function calcDenominationTotal(counts: Record<string, number>): number {
  let total = 0;
  BILLS.forEach(b => (total += (counts[`bill_${b}`] ?? 0) * b));
  COINS.forEach(c => (total += (counts[`coin_${c}`] ?? 0) * c));
  total += (counts['coin_050'] ?? 0) * HALF_AGORA;
  return Math.round(total * 100) / 100;
}

interface DrawerBalance {
  balance: number;
  lastEvent?: string;
  lastEventTime?: string;
}

interface DrawerEvent {
  id: string;
  type: string;
  amount: number;
  reason?: string;
  createdAt: string;
  userName?: string;
}

interface ShiftData {
  id: string;
  startedAt: string;
  cashierName?: string;
  openingFloat: number;
  salesTotal?: number;
  cashInTotal?: number;
  cashOutTotal?: number;
}

// Generic modal wrapper
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-lg text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function POSCashPage() {
  const queryClient = useQueryClient();

  // Drawer modals
  const [showCashIn, setShowCashIn] = useState(false);
  const [showCashOut, setShowCashOut] = useState(false);
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerReason, setDrawerReason] = useState('');

  // Shift modals
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('');
  const [showHandover, setShowHandover] = useState(false);
  const [nextCashier, setNextCashier] = useState('');
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<string, number>>(buildDenominationState);

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  // Fetch active (open) POS session for this user
  const { data: sessionsData } = useQuery({
    queryKey: ['pos-open-sessions'],
    queryFn: () => api.get('/pos/sessions', { params: { status: 'OPEN', pageSize: 5 } }).then(r => r.data?.data ?? r.data),
    refetchInterval: 60000,
  });
  const sessions: any[] = Array.isArray(sessionsData) ? sessionsData : [];
  const activeSession = sessions[0] ?? null;
  const sessionId: string | null = activeSession?.id ?? null;

  // Queries (only run when we have an active sessionId)
  const { data: drawerBalance, refetch: refetchBalance } = useQuery<DrawerBalance>({
    queryKey: ['pos-drawer-balance', sessionId],
    queryFn: () => api.get('/pos/drawer/balance', { params: { sessionId } }).then(r => r.data?.data ?? r.data),
    enabled: !!sessionId,
    refetchInterval: 30000,
  });

  const { data: drawerHistory = [] } = useQuery<DrawerEvent[]>({
    queryKey: ['pos-drawer-history', sessionId],
    queryFn: () =>
      api.get('/pos/drawer/history', { params: { sessionId } }).then(r => (Array.isArray(r.data) ? r.data : r.data?.data ?? [])),
    enabled: !!sessionId,
    refetchInterval: 30000,
  });

  const {
    data: currentShift,
    refetch: refetchShift,
    isError: shiftNotFound,
  } = useQuery<ShiftData>({
    queryKey: ['pos-current-shift', sessionId],
    queryFn: () => api.get('/pos/shifts/current', { params: { sessionId } }).then(r => r.data?.data ?? r.data),
    enabled: !!sessionId,
    retry: (count, err: any) => {
      if (err?.response?.status === 404) return false;
      return count < 2;
    },
    refetchInterval: 30000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['pos-open-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['pos-drawer-balance', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['pos-drawer-history', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['pos-current-shift', sessionId] });
  };

  // Mutations
  const cashInMut = useMutation({
    mutationFn: () => api.post('/pos/drawer/cash-in', { sessionId, amount: Number(drawerAmount), reason: drawerReason }),
    onSuccess: () => {
      setShowCashIn(false);
      setDrawerAmount('');
      setDrawerReason('');
      invalidateAll();
      notify('success', 'מזומן הוכנס');
    },
    onError: () => notify('error', 'שגיאה בהכנסת מזומן'),
  });

  const cashOutMut = useMutation({
    mutationFn: () => api.post('/pos/drawer/cash-out', { sessionId, amount: Number(drawerAmount), reason: drawerReason }),
    onSuccess: () => {
      setShowCashOut(false);
      setDrawerAmount('');
      setDrawerReason('');
      invalidateAll();
      notify('success', 'מזומן הוצא');
    },
    onError: () => notify('error', 'שגיאה בהוצאת מזומן'),
  });

  const noSaleMut = useMutation({
    mutationFn: () => api.post('/pos/drawer/no-sale', { sessionId }),
    onSuccess: () => {
      invalidateAll();
      notify('success', 'אירוע "ללא מכירה" נרשם');
    },
    onError: () => notify('error', 'שגיאה'),
  });

  const openShiftMut = useMutation({
    mutationFn: () => api.post('/pos/shifts/start', { sessionId, openingFloat: Number(openingFloat) || 0 }),
    onSuccess: () => {
      setShowOpenShift(false);
      setOpeningFloat('');
      invalidateAll();
      notify('success', 'משמרת נפתחה');
    },
    onError: () => notify('error', 'שגיאה בפתיחת משמרת'),
  });

  const handoverMut = useMutation({
    mutationFn: () =>
      api.post(`/pos/shifts/${currentShift?.id}/handover`, { nextCashierName: nextCashier }),
    onSuccess: () => {
      setShowHandover(false);
      setNextCashier('');
      invalidateAll();
      notify('success', 'מסירת משמרת בוצעה');
    },
    onError: () => notify('error', 'שגיאה במסירת משמרת'),
  });

  const closeShiftMut = useMutation({
    mutationFn: () =>
      api.post(`/pos/shifts/${currentShift?.id}/close`, { denominationCounts: denomCounts }),
    onSuccess: () => {
      setShowCloseShift(false);
      setDenomCounts(buildDenominationState());
      invalidateAll();
      notify('success', 'משמרת נסגרה');
    },
    onError: () => notify('error', 'שגיאה בסגירת משמרת'),
  });

  const denomTotal = calcDenominationTotal(denomCounts);
  const balance = drawerBalance?.balance ?? 0;
  const hasShift = !!currentShift && !shiftNotFound;

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">ניהול קופה ומשמרות</h1>

      {/* No active session warning */}
      {!sessionId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">אין סשן קופה פתוח</p>
            <p className="text-xs mt-0.5 text-amber-600">
              כדי לנהל את הקופה יש קודם לפתוח סשן — עבור ל
              <a href="/pos" className="underline mr-1">דף הקופה</a>
              ובחר מסוף.
            </p>
          </div>
        </div>
      )}

      {activeSession && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-sm text-blue-700 flex items-center gap-2">
          <Power className="w-4 h-4" />
          <span>סשן פעיל: <strong>{activeSession.terminal?.name ?? activeSession.id.slice(-6)}</strong></span>
        </div>
      )}

      {/* Status message */}
      {statusMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
            statusMsg.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {statusMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== DRAWER BALANCE CARD ===== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Banknote className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">יתרת קופה</h2>
              {drawerBalance?.lastEventTime && (
                <p className="text-xs text-gray-400">
                  עדכון אחרון: {fmtDateTime(drawerBalance.lastEventTime)}
                </p>
              )}
            </div>
          </div>

          {/* Big balance */}
          <div className="text-center mb-6">
            <p className="text-5xl font-extrabold text-gray-900">{fmtCurrency(balance)}</p>
            {drawerBalance?.lastEvent && (
              <p className="text-sm text-gray-400 mt-1">
                אירוע אחרון: {EVENT_TYPE_LABELS[drawerBalance.lastEvent] ?? drawerBalance.lastEvent}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <button
              onClick={() => setShowCashIn(true)}
              className="flex flex-col items-center gap-1 bg-green-50 border border-green-200 text-green-700 py-3 px-2 rounded-xl hover:bg-green-100 transition text-sm font-medium"
            >
              <TrendingUp className="w-5 h-5" />
              הכנסה
            </button>
            <button
              onClick={() => setShowCashOut(true)}
              className="flex flex-col items-center gap-1 bg-red-50 border border-red-200 text-red-700 py-3 px-2 rounded-xl hover:bg-red-100 transition text-sm font-medium"
            >
              <TrendingDown className="w-5 h-5" />
              הוצאה
            </button>
            <button
              onClick={() => noSaleMut.mutate()}
              disabled={noSaleMut.isPending}
              className="flex flex-col items-center gap-1 bg-gray-50 border border-gray-200 text-gray-600 py-3 px-2 rounded-xl hover:bg-gray-100 transition text-sm font-medium"
            >
              <ArrowLeftRight className="w-5 h-5" />
              ללא מכירה
            </button>
          </div>

          {/* Event history */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">היסטוריית אירועים</h3>
          {drawerHistory.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">אין אירועים</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-right pb-2 font-medium text-gray-500">זמן</th>
                    <th className="text-right pb-2 font-medium text-gray-500">סוג</th>
                    <th className="text-right pb-2 font-medium text-gray-500">סכום</th>
                    <th className="text-right pb-2 font-medium text-gray-500">קופאי</th>
                  </tr>
                </thead>
                <tbody>
                  {drawerHistory.slice(0, 20).map((ev: DrawerEvent) => (
                    <tr key={ev.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-400">{fmtDateTime(ev.createdAt)}</td>
                      <td className={`py-2 font-medium ${EVENT_TYPE_COLORS[ev.type] ?? 'text-gray-700'}`}>
                        {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                      </td>
                      <td className="py-2 font-semibold text-gray-800">
                        {ev.amount ? fmtCurrency(ev.amount) : '—'}
                      </td>
                      <td className="py-2 text-gray-500">{ev.userName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== SHIFT CARD ===== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-700" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">משמרת נוכחית</h2>
          </div>

          {!hasShift ? (
            /* No active shift */
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Power className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">אין משמרת פעילה</p>
              <button
                onClick={() => setShowOpenShift(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
              >
                פתח משמרת
              </button>
            </div>
          ) : (
            /* Active shift */
            <div className="space-y-4">
              {/* Shift summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500">קופאי</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{currentShift.cashierName ?? '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500">פתיחה</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{fmtDateTime(currentShift.startedAt)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-600 font-medium mb-0.5">מכירות</p>
                  <p className="text-base font-bold text-green-700">
                    {fmtCurrency(currentShift.salesTotal ?? 0)}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-blue-600 font-medium mb-0.5">הכנסות</p>
                  <p className="text-base font-bold text-blue-700">
                    {fmtCurrency(currentShift.cashInTotal ?? 0)}
                  </p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-red-600 font-medium mb-0.5">הוצאות</p>
                  <p className="text-base font-bold text-red-700">
                    {fmtCurrency(currentShift.cashOutTotal ?? 0)}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm text-gray-600">פלוטה פתיחה</span>
                <span className="text-sm font-semibold text-gray-800">
                  {fmtCurrency(currentShift.openingFloat)}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowHandover(true)}
                  className="flex-1 flex items-center justify-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded-lg hover:bg-yellow-100 text-sm font-medium"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  מסירת משמרת
                </button>
                <button
                  onClick={() => { setDenomCounts(buildDenominationState()); setShowCloseShift(true); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg hover:bg-red-100 text-sm font-medium"
                >
                  <Power className="w-4 h-4" />
                  סגור משמרת
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== CASH IN MODAL ===== */}
      {showCashIn && (
        <Modal title="הכנסת מזומן לקופה" onClose={() => setShowCashIn(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">סכום</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="הזן סכום..."
                value={drawerAmount}
                onChange={e => setDrawerAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">סיבה</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="לדוגמה: קופה קטנה..."
                value={drawerReason}
                onChange={e => setDrawerReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => cashInMut.mutate()}
                disabled={cashInMut.isPending || !drawerAmount}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:bg-gray-300"
              >
                {cashInMut.isPending ? 'מבצע...' : 'אשר הכנסה'}
              </button>
              <button
                onClick={() => setShowCashIn(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== CASH OUT MODAL ===== */}
      {showCashOut && (
        <Modal title="הוצאת מזומן מהקופה" onClose={() => setShowCashOut(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">סכום</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="הזן סכום..."
                value={drawerAmount}
                onChange={e => setDrawerAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">סיבה</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="לדוגמה: ספק קטן..."
                value={drawerReason}
                onChange={e => setDrawerReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => cashOutMut.mutate()}
                disabled={cashOutMut.isPending || !drawerAmount}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm disabled:bg-gray-300"
              >
                {cashOutMut.isPending ? 'מבצע...' : 'אשר הוצאה'}
              </button>
              <button
                onClick={() => setShowCashOut(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== OPEN SHIFT MODAL ===== */}
      {showOpenShift && (
        <Modal title="פתיחת משמרת" onClose={() => setShowOpenShift(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">פלוטה פתיחה (מזומן התחלתי)</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="לדוגמה: 500"
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => openShiftMut.mutate()}
                disabled={openShiftMut.isPending}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
              >
                {openShiftMut.isPending ? 'פותח...' : 'פתח משמרת'}
              </button>
              <button
                onClick={() => setShowOpenShift(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== HANDOVER MODAL ===== */}
      {showHandover && (
        <Modal title="מסירת משמרת" onClose={() => setShowHandover(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">שם קופאי הבא</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="הזן שם..."
                value={nextCashier}
                onChange={e => setNextCashier(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handoverMut.mutate()}
                disabled={handoverMut.isPending || !nextCashier}
                className="flex-1 bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 text-sm disabled:bg-gray-300"
              >
                {handoverMut.isPending ? 'מבצע...' : 'מסור משמרת'}
              </button>
              <button
                onClick={() => setShowHandover(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== CLOSE SHIFT (DENOMINATION COUNT) MODAL ===== */}
      {showCloseShift && (
        <Modal title="סגירת משמרת — ספירת מזומן" onClose={() => setShowCloseShift(false)}>
          <div className="space-y-4">
            {/* Bills */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">שטרות</h4>
              <div className="space-y-2">
                {BILLS.map(b => (
                  <div key={b} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700 w-20">₪{b}</span>
                    <input
                      type="number"
                      min={0}
                      className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-center"
                      value={denomCounts[`bill_${b}`] ?? 0}
                      onChange={e =>
                        setDenomCounts(prev => ({ ...prev, [`bill_${b}`]: Number(e.target.value) }))
                      }
                    />
                    <span className="text-sm text-gray-500 w-24 text-left">
                      = {fmtCurrency((denomCounts[`bill_${b}`] ?? 0) * b)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coins */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">מטבעות</h4>
              <div className="space-y-2">
                {COINS.map(c => (
                  <div key={c} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700 w-20">₪{c}</span>
                    <input
                      type="number"
                      min={0}
                      className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-center"
                      value={denomCounts[`coin_${c}`] ?? 0}
                      onChange={e =>
                        setDenomCounts(prev => ({ ...prev, [`coin_${c}`]: Number(e.target.value) }))
                      }
                    />
                    <span className="text-sm text-gray-500 w-24 text-left">
                      = {fmtCurrency((denomCounts[`coin_${c}`] ?? 0) * c)}
                    </span>
                  </div>
                ))}
                {/* 50 agorot */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-700 w-20">50 אג'</span>
                  <input
                    type="number"
                    min={0}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-center"
                    value={denomCounts['coin_050'] ?? 0}
                    onChange={e =>
                      setDenomCounts(prev => ({ ...prev, coin_050: Number(e.target.value) }))
                    }
                  />
                  <span className="text-sm text-gray-500 w-24 text-left">
                    = {fmtCurrency((denomCounts['coin_050'] ?? 0) * HALF_AGORA)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="bg-blue-50 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-blue-800">סה"כ נספר</span>
              <span className="text-xl font-bold text-blue-700">{fmtCurrency(denomTotal)}</span>
            </div>

            {currentShift && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>צפוי לפי מערכת:</span>
                <span className="font-medium">
                  {fmtCurrency(
                    (currentShift.openingFloat ?? 0) +
                      (currentShift.salesTotal ?? 0) +
                      (currentShift.cashInTotal ?? 0) -
                      (currentShift.cashOutTotal ?? 0)
                  )}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => closeShiftMut.mutate()}
                disabled={closeShiftMut.isPending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm"
              >
                {closeShiftMut.isPending ? 'סוגר...' : 'סגור משמרת'}
              </button>
              <button
                onClick={() => setShowCloseShift(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
