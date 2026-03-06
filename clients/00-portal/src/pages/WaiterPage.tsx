import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed,
  Users,
  Clock,
  CheckCircle,
  Plus,
  Minus,
  Trash2,
  Send,
  CreditCard,
  Banknote,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react';
import api from '../lib/api';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n);

function normalize<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) return d.data as T[];
    if (Array.isArray(d.tables)) return d.tables as T[];
    if (Array.isArray(d.floors)) return d.floors as T[];
    if (Array.isArray(d.items)) return d.items as T[];
    if (Array.isArray(d.products)) return d.products as T[];
  }
  return [];
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';

interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
  orderTotal?: number;
}

interface Floor {
  id: string;
  name: string;
  tables: RestaurantTable[];
}

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface Order {
  id: string;
  tableId: string;
  status: string;
  items: OrderItem[];
  total: number;
}

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  category?: string | { name?: string };
  sku?: string;
}

type PaymentMethod = 'CASH' | 'CREDIT';

// ─────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TableStatus,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  AVAILABLE: {
    label: 'פנוי',
    bg: 'bg-emerald-900/60',
    border: 'border-emerald-500',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  OCCUPIED: {
    label: 'תפוס',
    bg: 'bg-red-900/60',
    border: 'border-red-500',
    text: 'text-red-300',
    dot: 'bg-red-400',
  },
  RESERVED: {
    label: 'שמור',
    bg: 'bg-amber-900/60',
    border: 'border-amber-500',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
  },
  CLEANING: {
    label: 'ניקוי',
    bg: 'bg-sky-900/60',
    border: 'border-sky-500',
    text: 'text-sky-300',
    dot: 'bg-sky-400',
  },
};

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────

interface ToastMsg {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let toastCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const addToast = useCallback(
    (text: string, type: ToastMsg['type'] = 'info') => {
      const id = ++toastCounter;
      setToasts((prev) => [...prev, { id, text, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
    },
    []
  );

  const removeToast = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, addToast, removeToast };
}

// ─────────────────────────────────────────────
// Category color palette
// ─────────────────────────────────────────────

const CAT_COLORS = [
  'bg-violet-700 hover:bg-violet-600',
  'bg-rose-700 hover:bg-rose-600',
  'bg-orange-700 hover:bg-orange-600',
  'bg-teal-700 hover:bg-teal-600',
  'bg-cyan-700 hover:bg-cyan-600',
  'bg-indigo-700 hover:bg-indigo-600',
  'bg-pink-700 hover:bg-pink-600',
  'bg-lime-700 hover:bg-lime-600',
];

function catColor(index: number) {
  return CAT_COLORS[index % CAT_COLORS.length];
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function WaiterPage() {
  const qc = useQueryClient();
  const { toasts, addToast, removeToast } = useToast();

  // ── State ──────────────────────────────────
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [cashInput, setCashInput] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [optimisticItems, setOptimisticItems] = useState<OrderItem[] | null>(null);

  // ── Queries ────────────────────────────────

  const floorQuery = useQuery({
    queryKey: ['floor-map'],
    queryFn: () => api.get('/pos/floor-map').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const rawFloors: unknown = floorQuery.data;
  const floors: Floor[] = (() => {
    // API may return { floors: [...] } or just an array
    if (
      rawFloors &&
      typeof rawFloors === 'object' &&
      !Array.isArray(rawFloors) &&
      Array.isArray((rawFloors as Record<string, unknown>).floors)
    ) {
      return (rawFloors as { floors: Floor[] }).floors;
    }
    return normalize<Floor>(rawFloors);
  })();

  // Auto-select first floor
  useEffect(() => {
    if (floors.length > 0 && !selectedFloorId) {
      setSelectedFloorId(floors[0].id);
    }
  }, [floors, selectedFloorId]);

  const currentFloor = floors.find((f) => f.id === selectedFloorId) ?? null;
  const currentTables: RestaurantTable[] = currentFloor?.tables ?? [];

  const productsQuery = useQuery({
    queryKey: ['waiter-products'],
    queryFn: () =>
      api.get('/inventory/products?isActive=true&pageSize=100').then((r) => r.data),
    staleTime: 60_000,
  });

  const rawProducts = productsQuery.data;
  const products: Product[] = normalize<Product>(rawProducts);

  // Group products by category
  const catMap = new Map<string, Product[]>();
  for (const p of products) {
    const cat =
      typeof p.category === 'string'
        ? p.category
        : (p.category as { name?: string })?.name ?? 'כללי';
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(p);
  }
  const categories = Array.from(catMap.keys());

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  const displayedProducts = selectedCategory ? (catMap.get(selectedCategory) ?? []) : products;

  // Fetch order when table is selected
  const orderQuery = useQuery({
    queryKey: ['waiter-order', selectedTable?.currentOrderId],
    queryFn: () =>
      api.get(`/pos/orders/${selectedTable!.currentOrderId}`).then((r) => r.data),
    enabled: !!selectedTable?.currentOrderId,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (orderQuery.data) {
      const raw = orderQuery.data as Record<string, unknown>;
      const order: Order = {
        id: String(raw.id ?? ''),
        tableId: String(raw.tableId ?? ''),
        status: String(raw.status ?? ''),
        total: Number(raw.total ?? raw.subtotal ?? 0),
        items: normalize<OrderItem>(raw.items ?? []).map((it: Record<string, unknown>) => ({
          id: String(it.id ?? ''),
          productId: String(it.productId ?? ''),
          name: String(it.name ?? it.productName ?? ''),
          quantity: Number(it.quantity ?? 1),
          unitPrice: Number(it.unitPrice ?? it.price ?? 0),
          notes: String(it.notes ?? ''),
        })),
      };
      setCurrentOrder(order);
      setOptimisticItems(null);
    } else if (!selectedTable?.currentOrderId) {
      setCurrentOrder(null);
      setOptimisticItems(null);
    }
  }, [orderQuery.data, selectedTable?.currentOrderId]);

  // ── Mutations ──────────────────────────────

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.post('/pos/orders', { tableId: selectedTable!.id, type: 'DINE_IN' }),
    onSuccess: (res) => {
      const raw = res.data as Record<string, unknown>;
      const newOrderId = String(raw.id ?? '');
      // Update local table state
      setSelectedTable((prev) =>
        prev ? { ...prev, currentOrderId: newOrderId, status: 'OCCUPIED' } : prev
      );
      setCurrentOrder({
        id: newOrderId,
        tableId: selectedTable!.id,
        status: 'OPEN',
        items: [],
        total: 0,
      });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      addToast('הזמנה נפתחה בהצלחה', 'success');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      addToast(e?.response?.data?.error ?? e?.message ?? 'שגיאה בפתיחת הזמנה', 'error');
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({
      orderId,
      productId,
      quantity,
      notes,
    }: {
      orderId: string;
      productId: string;
      quantity: number;
      notes?: string;
    }) =>
      api.post(`/pos/orders/${orderId}/items`, { productId, quantity, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waiter-order', selectedTable?.currentOrderId] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setOptimisticItems(null);
      addToast(e?.response?.data?.error ?? e?.message ?? 'שגיאה בהוספת פריט', 'error');
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      api
        .delete(`/pos/orders/${orderId}/items/${itemId}`)
        .catch(() =>
          api.post(`/pos/orders/${orderId}/items/${itemId}/void`)
        ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waiter-order', selectedTable?.currentOrderId] });
    },
    onError: () => {
      setOptimisticItems(null);
      qc.invalidateQueries({ queryKey: ['waiter-order', selectedTable?.currentOrderId] });
    },
  });

  const sendToKitchenMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`/pos/orders/${orderId}/send-to-kitchen`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waiter-order', selectedTable?.currentOrderId] });
      addToast('ההזמנה נשלחה למטבח!', 'success');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      addToast(e?.response?.data?.error ?? e?.message ?? 'שגיאה בשליחה למטבח', 'error');
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: ({
      orderId,
      paymentMethod,
      amount,
    }: {
      orderId: string;
      paymentMethod: PaymentMethod;
      amount: number;
    }) => api.post(`/pos/orders/${orderId}/checkout`, { paymentMethod, amount }),
    onSuccess: () => {
      setShowPayment(false);
      setCurrentOrder(null);
      setSelectedTable((prev) =>
        prev ? { ...prev, currentOrderId: undefined, status: 'CLEANING' } : prev
      );
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      addToast('התשלום בוצע בהצלחה!', 'success');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      addToast(e?.response?.data?.error ?? e?.message ?? 'שגיאה בתשלום', 'error');
    },
  });

  // ── Handlers ───────────────────────────────

  const handleSelectTable = (table: RestaurantTable) => {
    setSelectedTable(table);
    setShowPayment(false);
    setCurrentOrder(null);
    setOptimisticItems(null);
  };

  const handleAddProduct = (product: Product) => {
    if (!currentOrder) return;
    // Optimistic update
    const existing = (optimisticItems ?? currentOrder.items).find(
      (it) => it.productId === product.id
    );
    const newItems = existing
      ? (optimisticItems ?? currentOrder.items).map((it) =>
          it.productId === product.id ? { ...it, quantity: it.quantity + 1 } : it
        )
      : [
          ...(optimisticItems ?? currentOrder.items),
          {
            id: `optimistic-${Date.now()}`,
            productId: product.id,
            name: product.name,
            quantity: 1,
            unitPrice: Number(product.sellingPrice ?? 0),
          },
        ];
    setOptimisticItems(newItems);

    addItemMutation.mutate({
      orderId: currentOrder.id,
      productId: product.id,
      quantity: 1,
    });
  };

  const handleQtyChange = (item: OrderItem, delta: number) => {
    if (!currentOrder) return;
    if (delta < 0 && item.quantity <= 1) {
      handleRemoveItem(item);
      return;
    }
    const newItems = (optimisticItems ?? currentOrder.items).map((it) =>
      it.id === item.id ? { ...it, quantity: it.quantity + delta } : it
    );
    setOptimisticItems(newItems);
    addItemMutation.mutate({
      orderId: currentOrder.id,
      productId: item.productId,
      quantity: delta,
    });
  };

  const handleRemoveItem = (item: OrderItem) => {
    if (!currentOrder) return;
    setOptimisticItems(
      (optimisticItems ?? currentOrder.items).filter((it) => it.id !== item.id)
    );
    removeItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id });
  };

  const handleSendToKitchen = () => {
    if (!currentOrder) return;
    sendToKitchenMutation.mutate(currentOrder.id);
  };

  const handleConfirmPayment = () => {
    if (!currentOrder) return;
    const amount = payMethod === 'CASH' && cashInput ? Number(cashInput) : orderTotal;
    checkoutMutation.mutate({ orderId: currentOrder.id, paymentMethod: payMethod, amount });
  };

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['floor-map'] });
    qc.invalidateQueries({ queryKey: ['waiter-order', selectedTable?.currentOrderId] });
    addToast('מרענן נתונים...', 'info');
  };

  // ── Computed ───────────────────────────────

  const displayItems = optimisticItems ?? currentOrder?.items ?? [];
  const orderTotal = displayItems.reduce(
    (s, it) => s + it.unitPrice * it.quantity,
    0
  );
  const cashChange =
    payMethod === 'CASH' && cashInput ? Math.max(0, Number(cashInput) - orderTotal) : 0;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div
      dir="rtl"
      className="flex h-screen w-screen bg-gray-950 text-white overflow-hidden select-none"
    >
      {/* ── Toast notifications ── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-base font-medium transition-all ${
              t.type === 'success'
                ? 'bg-emerald-600 text-white'
                : t.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            <span className="flex-1">{t.text}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          LEFT PANEL — 35% — Table Map
      ══════════════════════════════════════════ */}
      <div className="w-[35%] flex flex-col bg-gray-900 border-l border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-amber-400" />
            <span className="text-lg font-bold text-white">מפת שולחנות</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition active:scale-95"
            title="רענן"
          >
            <RefreshCw
              className={`w-5 h-5 text-gray-300 ${floorQuery.isFetching ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Floor tabs */}
        {floors.length > 1 && (
          <div className="flex gap-1 px-3 py-2 bg-gray-850 border-b border-gray-700 overflow-x-auto">
            {floors.map((floor) => (
              <button
                key={floor.id}
                onClick={() => setSelectedFloorId(floor.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-95 ${
                  selectedFloorId === floor.id
                    ? 'bg-amber-500 text-gray-900'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {floor.name}
              </button>
            ))}
          </div>
        )}

        {/* Tables grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {floorQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-gray-700/50 animate-pulse"
                />
              ))}
            </div>
          ) : currentTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <UtensilsCrossed className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-base">אין שולחנות</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {currentTables.map((table) => {
                const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.AVAILABLE;
                const isSelected = selectedTable?.id === table.id;
                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-3 min-h-[90px] transition active:scale-95
                      ${cfg.bg} ${cfg.border}
                      ${isSelected ? 'ring-4 ring-white/40 scale-105 shadow-xl' : 'opacity-90 hover:opacity-100'}
                    `}
                  >
                    {/* Status dot */}
                    <span
                      className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${cfg.dot}`}
                    />
                    <span className="text-xl font-extrabold text-white leading-tight">
                      {table.name}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-300 mt-1">
                      <Users className="w-3.5 h-3.5" />
                      {table.capacity}
                    </span>
                    {table.status === 'OCCUPIED' && table.orderTotal !== undefined && (
                      <span className="mt-1 text-xs font-bold text-amber-300">
                        {fmt(table.orderTotal)}
                      </span>
                    )}
                    <span className={`mt-1 text-xs font-medium ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="border-t border-gray-700 px-4 py-3 bg-gray-850">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {(Object.entries(STATUS_CONFIG) as [TableStatus, (typeof STATUS_CONFIG)[TableStatus]][]).map(
              ([, cfg]) => (
                <div key={cfg.label} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                  <span className="text-sm text-gray-400">{cfg.label}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Open table button */}
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={() => {
              /* Could open a "new table" flow */
              addToast('פנייה למנהל לפתיחת שולחן חדש', 'info');
            }}
            className="w-full flex items-center justify-center gap-2 h-14 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-200 text-base font-semibold transition active:scale-95"
          >
            <Plus className="w-5 h-5" />
            פתח שולחן
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT PANEL — 65%
      ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          /* ── No table selected ── */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
            <UtensilsCrossed className="w-20 h-20 mb-4 opacity-20" />
            <p className="text-2xl font-bold">בחר שולחן כדי להתחיל</p>
          </div>
        ) : !currentOrder ? (
          /* ── Table selected but no order ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-extrabold text-white mb-1">
                שולחן {selectedTable.name}
              </p>
              <p className="text-gray-400 text-lg">
                {STATUS_CONFIG[selectedTable.status]?.label} ·{' '}
                {selectedTable.capacity} מקומות
              </p>
            </div>
            {orderQuery.isLoading ? (
              <div className="flex items-center gap-3 text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span className="text-lg">טוען הזמנה...</span>
              </div>
            ) : (
              <button
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending}
                className="flex items-center gap-3 h-16 px-10 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-900 text-xl font-extrabold shadow-xl transition active:scale-95"
              >
                <Plus className="w-6 h-6" />
                {createOrderMutation.isPending ? 'פותח הזמנה...' : 'פתח הזמנה'}
              </button>
            )}
          </div>
        ) : (
          /* ── Active order view ── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Order header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedTable(null);
                    setCurrentOrder(null);
                  }}
                  className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition"
                >
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </button>
                <div>
                  <p className="text-lg font-bold text-white">
                    שולחן {selectedTable.name}
                  </p>
                  <p className="text-sm text-gray-400">
                    הזמנה #{currentOrder.id.slice(-6).toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {currentOrder.status === 'SENT_TO_KITCHEN' && (
                  <span className="flex items-center gap-1.5 text-sm text-amber-300 bg-amber-900/50 px-3 py-1.5 rounded-full">
                    <Clock className="w-4 h-4" />
                    במטבח
                  </span>
                )}
                {currentOrder.status === 'READY' && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-300 bg-emerald-900/50 px-3 py-1.5 rounded-full">
                    <CheckCircle className="w-4 h-4" />
                    מוכן
                  </span>
                )}
              </div>
            </div>

            {/* Split: top=menu, bottom=order */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* ── Menu section (top half) ── */}
              <div className="flex flex-col h-[55%] border-b border-gray-700">
                {/* Category tabs */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 overflow-x-auto border-b border-gray-800">
                  {productsQuery.isLoading ? (
                    <div className="flex gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-10 w-24 rounded-xl bg-gray-700 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
                    categories.map((cat, idx) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-base font-bold transition active:scale-95 ${
                          selectedCategory === cat
                            ? 'bg-white text-gray-900 shadow-lg'
                            : `${catColor(idx)} text-white`
                        }`}
                      >
                        {cat}
                      </button>
                    ))
                  )}
                </div>

                {/* Product grid */}
                <div className="flex-1 overflow-y-auto p-3">
                  {productsQuery.isLoading ? (
                    <div className="grid grid-cols-4 gap-3">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-20 rounded-xl bg-gray-700 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : displayedProducts.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-gray-500">
                      אין פריטים בקטגוריה זו
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                      {displayedProducts.map((p, idx) => {
                        const catIdx = categories.indexOf(
                          typeof p.category === 'string'
                            ? p.category
                            : (p.category as { name?: string })?.name ?? 'כללי'
                        );
                        return (
                          <button
                            key={p.id}
                            onClick={() => handleAddProduct(p)}
                            className={`flex flex-col items-center justify-center rounded-xl p-3 min-h-[80px] text-white font-bold text-center transition active:scale-95 shadow-md ${catColor(
                              catIdx
                            )}`}
                          >
                            <span className="text-base leading-tight mb-1">
                              {p.name}
                            </span>
                            <span className="text-sm font-extrabold text-white/80">
                              {fmt(Number(p.sellingPrice ?? 0))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Order items section (bottom half) ── */}
              <div className="flex flex-col h-[45%] overflow-hidden">
                {/* Items list */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                  {displayItems.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-gray-600 text-base">
                      טרם נבחרו פריטים — לחץ על מנה להוספה
                    </div>
                  ) : (
                    displayItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-2 border border-gray-700"
                      >
                        {/* Name + notes */}
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-white truncate">
                            {item.name}
                          </p>
                          <input
                            type="text"
                            placeholder="הערה..."
                            value={itemNotes[item.id] ?? item.notes ?? ''}
                            onChange={(e) =>
                              setItemNotes((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="text-xs bg-transparent border-0 border-b border-gray-600 text-gray-400 placeholder-gray-600 focus:outline-none w-full mt-0.5"
                          />
                        </div>

                        {/* Line total */}
                        <span className="text-base font-bold text-amber-400 w-20 text-left">
                          {fmt(item.unitPrice * item.quantity)}
                        </span>

                        {/* Qty controls */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleQtyChange(item, -1)}
                            className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition active:scale-95"
                          >
                            <Minus className="w-4 h-4 text-white" />
                          </button>
                          <span className="text-lg font-extrabold text-white w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleQtyChange(item, 1)}
                            className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition active:scale-95"
                          >
                            <Plus className="w-4 h-4 text-white" />
                          </button>
                          <button
                            onClick={() => handleRemoveItem(item)}
                            className="w-10 h-10 rounded-lg bg-red-900/50 hover:bg-red-800 flex items-center justify-center transition active:scale-95"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Total + action buttons */}
                {!showPayment ? (
                  <div className="border-t border-gray-700 px-4 py-3 bg-gray-900">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl font-bold text-gray-300">סה"כ</span>
                      <span className="text-2xl font-extrabold text-amber-400">
                        {fmt(orderTotal)}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleSendToKitchen}
                        disabled={
                          displayItems.length === 0 || sendToKitchenMutation.isPending
                        }
                        className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-lg font-bold transition active:scale-95"
                      >
                        <Send className="w-5 h-5" />
                        {sendToKitchenMutation.isPending ? 'שולח...' : 'שלח למטבח'}
                      </button>
                      <button
                        onClick={() => {
                          setCashInput(String(Math.ceil(orderTotal)));
                          setShowPayment(true);
                        }}
                        disabled={displayItems.length === 0}
                        className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-lg font-bold transition active:scale-95"
                      >
                        <CreditCard className="w-5 h-5" />
                        תשלום
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Payment panel (inline slide-up) ── */
                  <div className="border-t border-gray-700 bg-gray-900 px-4 py-3 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-lg font-bold text-white">תשלום</span>
                      <button
                        onClick={() => setShowPayment(false)}
                        className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600"
                      >
                        <X className="w-4 h-4 text-gray-300" />
                      </button>
                    </div>

                    {/* Total to pay */}
                    <div className="flex items-center justify-between mb-4 bg-gray-800 rounded-xl px-4 py-3">
                      <span className="text-gray-400 text-base">סה"כ לתשלום</span>
                      <span className="text-2xl font-extrabold text-amber-400">
                        {fmt(orderTotal)}
                      </span>
                    </div>

                    {/* Payment method toggle */}
                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={() => setPayMethod('CASH')}
                        className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-xl border-2 text-lg font-bold transition active:scale-95 ${
                          payMethod === 'CASH'
                            ? 'border-emerald-500 bg-emerald-900/60 text-emerald-300'
                            : 'border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        <Banknote className="w-5 h-5" />
                        מזומן
                      </button>
                      <button
                        onClick={() => setPayMethod('CREDIT')}
                        className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-xl border-2 text-lg font-bold transition active:scale-95 ${
                          payMethod === 'CREDIT'
                            ? 'border-blue-500 bg-blue-900/60 text-blue-300'
                            : 'border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        <CreditCard className="w-5 h-5" />
                        אשראי
                      </button>
                    </div>

                    {/* Cash amount input */}
                    {payMethod === 'CASH' && (
                      <div className="mb-3">
                        <label className="text-sm text-gray-400 mb-1 block">
                          סכום שהתקבל (₪)
                        </label>
                        <input
                          type="number"
                          value={cashInput}
                          onChange={(e) => setCashInput(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-emerald-500 text-left"
                          dir="ltr"
                        />
                        {cashInput && cashChange > 0 && (
                          <p className="text-base font-bold text-emerald-400 mt-1">
                            עודף: {fmt(cashChange)}
                          </p>
                        )}
                        {cashInput && Number(cashInput) < orderTotal && (
                          <p className="text-base font-bold text-red-400 mt-1">
                            חסר: {fmt(orderTotal - Number(cashInput))}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Confirm */}
                    <button
                      onClick={handleConfirmPayment}
                      disabled={
                        checkoutMutation.isPending ||
                        (payMethod === 'CASH' &&
                          cashInput !== '' &&
                          Number(cashInput) < orderTotal)
                      }
                      className="w-full flex items-center justify-center gap-2 h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xl font-extrabold transition active:scale-95"
                    >
                      <CheckCircle className="w-6 h-6" />
                      {checkoutMutation.isPending ? 'מעבד...' : 'אשר תשלום'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
