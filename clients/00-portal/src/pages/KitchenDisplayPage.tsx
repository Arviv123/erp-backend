import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChefHat,
  Clock,
  CheckCircle,
  Circle,
  Bell,
  RefreshCw,
  Utensils,
} from 'lucide-react';
import api from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  status?: string;
}

interface KitchenOrder {
  id: string;
  orderNumber?: string;
  tableNumber?: string | number;
  tableName?: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeOrders(data: unknown): KitchenOrder[] {
  if (!data) return [];
  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown }).data)
    ? ((data as { data: unknown[] }).data)
    : [];
  return raw as KitchenOrder[];
}

function elapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/** Generate a short beep using the Web Audio API */
function playBeep() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => ctx.close();
  } catch {
    // AudioContext may be blocked; silently ignore
  }
}

// ---------------------------------------------------------------------------
// Border / urgency helpers
// ---------------------------------------------------------------------------
function cardBorderClass(minutes: number): string {
  if (minutes > 20) return 'border-red-500 animate-pulse';
  if (minutes >= 10) return 'border-yellow-500';
  return 'border-gray-600';
}

function elapsedBadgeClass(minutes: number): string {
  if (minutes > 20) return 'text-red-400';
  if (minutes >= 10) return 'text-yellow-400';
  return 'text-gray-400';
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------
type FilterTab = 'הכל' | 'ממתין' | 'בהכנה' | 'מוכן';

const FILTER_TABS: FilterTab[] = ['הכל', 'ממתין', 'בהכנה', 'מוכן'];

const STATUS_MAP: Record<FilterTab, string[]> = {
  הכל: [],
  ממתין: ['OPEN', 'PENDING'],
  בהכנה: ['IN_PROGRESS', 'IN_KITCHEN'],
  מוכן: ['READY', 'DONE'],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function KitchenDisplayPage() {
  const queryClient = useQueryClient();

  // Clock state — updates every minute
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Filter tab
  const [activeTab, setActiveTab] = useState<FilterTab>('הכל');

  // Locally marked ready items — optimistic UI
  // Key: orderId-itemId
  const [readyItems, setReadyItems] = useState<Set<string>>(new Set());

  // Track known order IDs for new-order sound alerts
  const knownOrderIds = useRef<Set<string>>(new Set());

  // Refresh indicator flash
  const [justRefreshed, setJustRefreshed] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching — try IN_PROGRESS first, fall back to OPEN
  // ---------------------------------------------------------------------------
  const { data: inProgressData, dataUpdatedAt: ts1 } = useQuery({
    queryKey: ['kitchen-orders', 'IN_PROGRESS'],
    queryFn: () =>
      api.get('/pos/orders?status=IN_PROGRESS').then((r) => r.data),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: openData, dataUpdatedAt: ts2 } = useQuery({
    queryKey: ['kitchen-orders', 'OPEN'],
    queryFn: () => api.get('/pos/orders?status=OPEN').then((r) => r.data),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const allOrders: KitchenOrder[] = [
    ...normalizeOrders(inProgressData),
    ...normalizeOrders(openData),
  ].filter(
    (order, index, self) => self.findIndex((o) => o.id === order.id) === index
  );

  // ---------------------------------------------------------------------------
  // Sound alert on new orders
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (allOrders.length === 0) return;
    let isNew = false;
    allOrders.forEach((order) => {
      if (!knownOrderIds.current.has(order.id)) {
        knownOrderIds.current.add(order.id);
        isNew = true;
      }
    });
    if (isNew && knownOrderIds.current.size > 0) {
      // Only beep after initial load (if we already had orders tracked)
      playBeep();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts1, ts2]);

  // Flash refresh indicator
  useEffect(() => {
    setJustRefreshed(true);
    const id = setTimeout(() => setJustRefreshed(false), 800);
    return () => clearTimeout(id);
  }, [ts1, ts2]);

  // ---------------------------------------------------------------------------
  // Filter orders by active tab
  // ---------------------------------------------------------------------------
  const filteredOrders = allOrders.filter((order) => {
    if (activeTab === 'הכל') return true;
    const allowed = STATUS_MAP[activeTab];
    return allowed.includes(order.status);
  });

  // ---------------------------------------------------------------------------
  // Toggle an item's ready state
  // ---------------------------------------------------------------------------
  const toggleItem = useCallback(
    (orderId: string, itemId: string) => {
      const key = `${orderId}-${itemId}`;
      setReadyItems((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    []
  );

  // Mark all items in an order ready
  const markAllReady = useCallback(
    (order: KitchenOrder) => {
      setReadyItems((prev) => {
        const next = new Set(prev);
        order.items.forEach((item) => next.add(`${order.id}-${item.id}`));
        return next;
      });
    },
    []
  );

  // Check whether all items in an order are marked ready
  const isOrderFullyReady = useCallback(
    (order: KitchenOrder): boolean => {
      if (order.items.length === 0) return false;
      return order.items.every((item) =>
        readyItems.has(`${order.id}-${item.id}`)
      );
    },
    [readyItems]
  );

  // Serve (send-to-kitchen serves as the action available from the spec)
  const handleServe = useCallback(
    async (orderId: string) => {
      try {
        await api.post(`/pos/orders/${orderId}/send-to-kitchen`);
        // Invalidate both queries so list refreshes immediately
        queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
        // Remove from local ready tracking for this order
        setReadyItems((prev) => {
          const next = new Set(prev);
          [...next].forEach((k) => {
            if (k.startsWith(`${orderId}-`)) next.delete(k);
          });
          return next;
        });
      } catch {
        // Silently ignore — order may already be in correct state
      }
    },
    [queryClient]
  );

  // Manual refresh
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
  }, [queryClient]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-900 text-white flex flex-col select-none"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-20 bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center gap-4 shadow-lg">
        {/* Logo / title */}
        <div className="flex items-center gap-2">
          <ChefHat className="w-7 h-7 text-orange-400" />
          <span className="text-2xl font-bold tracking-wide text-white">
            מטבח
          </span>
        </div>

        {/* Order count badge */}
        <span className="bg-orange-500 text-white text-sm font-bold px-2.5 py-0.5 rounded-full">
          {filteredOrders.length} הזמנות
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Filter tabs */}
        <nav className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-orange-500 text-white shadow'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tab}
              {tab !== 'הכל' && (
                <span className="mr-1.5 text-xs opacity-70">
                  (
                  {
                    allOrders.filter((o) =>
                      STATUS_MAP[tab].includes(o.status)
                    ).length
                  }
                  )
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Clock */}
        <div className="flex items-center gap-1.5 text-gray-300 text-lg font-mono">
          <Clock className="w-5 h-5 text-gray-400" />
          {formatClock(now)}
        </div>

        {/* Refresh indicator / button */}
        <button
          onClick={handleRefresh}
          title="רענן עכשיו"
          className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm text-gray-300 transition"
        >
          <RefreshCw
            className={`w-4 h-4 transition-transform ${
              justRefreshed ? 'animate-spin text-green-400' : ''
            }`}
          />
          <span className="hidden sm:inline">רענן</span>
        </button>

        {/* Bell icon for audio cue hint */}
        <Bell className="w-5 h-5 text-gray-500" />
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Orders grid                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 p-5 overflow-y-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-gray-600">
            <Utensils className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-2xl font-semibold opacity-50">
              {allOrders.length === 0
                ? 'אין הזמנות פעילות'
                : 'אין הזמנות בסינון זה'}
            </p>
            <p className="text-sm mt-2 opacity-30">מתרענן כל 10 שניות</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                readyItems={readyItems}
                isFullyReady={isOrderFullyReady(order)}
                onToggleItem={toggleItem}
                onMarkAllReady={markAllReady}
                onServe={handleServe}
              />
            ))}
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Footer — auto-refresh note                                          */}
      {/* ------------------------------------------------------------------ */}
      <footer className="text-center text-xs text-gray-700 py-2">
        מתרענן אוטומטית כל 10 שניות
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrderCard sub-component
// ---------------------------------------------------------------------------
interface OrderCardProps {
  order: KitchenOrder;
  readyItems: Set<string>;
  isFullyReady: boolean;
  onToggleItem: (orderId: string, itemId: string) => void;
  onMarkAllReady: (order: KitchenOrder) => void;
  onServe: (orderId: string) => void;
}

function OrderCard({
  order,
  readyItems,
  isFullyReady,
  onToggleItem,
  onMarkAllReady,
  onServe,
}: OrderCardProps) {
  const minutes = elapsedMinutes(order.createdAt);
  const borderClass = cardBorderClass(minutes);
  const elapsedClass = elapsedBadgeClass(minutes);

  const tableName =
    order.tableName ??
    (order.tableNumber != null ? `שולחן ${order.tableNumber}` : 'שולחן?');

  const orderNum = order.orderNumber ?? order.id.slice(-5).toUpperCase();
  const readyCount = order.items.filter((item) =>
    readyItems.has(`${order.id}-${item.id}`)
  ).length;

  return (
    <div
      className={`bg-gray-800 border-2 ${borderClass} rounded-2xl flex flex-col overflow-hidden shadow-lg`}
    >
      {/* Card header */}
      <div className="bg-gray-750 bg-opacity-60 px-4 py-3 border-b border-gray-700">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white leading-none">
              {tableName}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">הזמנה #{orderNum}</p>
          </div>
          <div className="text-left shrink-0">
            <p className="text-base font-semibold text-gray-200">
              {formatTime(order.createdAt)}
            </p>
            <p className={`text-sm font-medium ${elapsedClass}`}>
              {minutes} דק׳
              {minutes > 20 && ' ⚠️'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {order.items.length > 0 && (
          <div className="mt-2">
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(readyCount / order.items.length) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {readyCount}/{order.items.length} מוכן
            </p>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 px-4 py-3 space-y-2 overflow-y-auto max-h-72">
        {order.items.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">אין פריטים</p>
        ) : (
          order.items.map((item) => {
            const key = `${order.id}-${item.id}`;
            const isReady = readyItems.has(key);
            return (
              <button
                key={item.id}
                onClick={() => onToggleItem(order.id, item.id)}
                className={`w-full flex items-start gap-3 rounded-xl px-3 py-2.5 transition text-right ${
                  isReady
                    ? 'bg-green-900/40 border border-green-700'
                    : 'bg-gray-700/50 border border-gray-600 hover:border-gray-500'
                }`}
              >
                {/* Checkbox icon */}
                <span className="mt-0.5 shrink-0">
                  {isReady ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-500" />
                  )}
                </span>

                {/* Item details */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-base font-semibold leading-snug ${
                      isReady ? 'line-through text-gray-500' : 'text-white'
                    }`}
                  >
                    {item.quantity} × {item.name}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-yellow-400 mt-0.5 leading-tight">
                      {item.notes}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Card footer */}
      <div className="px-4 py-3 border-t border-gray-700 space-y-2">
        {!isFullyReady ? (
          <button
            onClick={() => onMarkAllReady(order)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2 rounded-xl text-sm transition border border-gray-600"
          >
            סמן הכל מוכן
          </button>
        ) : (
          <button
            onClick={() => onServe(order.id)}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-xl text-base transition flex items-center justify-center gap-2 shadow-lg shadow-green-900/40"
          >
            <CheckCircle className="w-5 h-5" />
            הגש
          </button>
        )}
      </div>
    </div>
  );
}
