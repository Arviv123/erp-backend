import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Clock,
  Plus,
  Search,
  ChefHat,
  CreditCard,
  Banknote,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const TABLE_STATUSES = {
  AVAILABLE: { label: 'פנוי', color: 'bg-green-100 border-green-400 text-green-800' },
  OCCUPIED: { label: 'תפוס', color: 'bg-red-100 border-red-400 text-red-800' },
  RESERVED: { label: 'שמור', color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
  CLEANING: { label: 'ניקיון', color: 'bg-blue-100 border-blue-400 text-blue-800' },
} as const;

type TableStatus = keyof typeof TABLE_STATUSES;

function timeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} דק'`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}:${String(rem).padStart(2, '0')} שע'`;
}

interface FloorData {
  id: string;
  name: string;
  tables: TableData[];
}

interface TableData {
  id: string;
  tableNumber: number;
  seats: number;
  status: TableStatus;
  currentOrderId?: string;
}

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  status: string;
}

interface OrderDetail {
  id: string;
  tableId: string;
  type: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
  total: number;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sellingPrice: number;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function POSTablesPage() {
  const queryClient = useQueryClient();
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemNotes, setItemNotes] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [checkoutMethod, setCheckoutMethod] = useState<'CASH' | 'CREDIT'>('CASH');
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutAmount, setCheckoutAmount] = useState('');
  const [newTableForm, setNewTableForm] = useState({ floorId: '', tableNumber: '', seats: '2', x: '0', y: '0' });
  const [newFloorForm, setNewFloorForm] = useState({ name: '', description: '' });
  const debounceSearch = useDebounce(productSearch, 300);
  const searchRef = useRef<HTMLInputElement>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // --- Data queries ---
  const { data: floorsData = [] } = useQuery<FloorData[]>({
    queryKey: ['pos-floors'],
    queryFn: () => api.get('/pos/floors').then(r => (Array.isArray(r.data) ? r.data : r.data?.data ?? [])),
    refetchInterval: 15000,
  });

  const floors: FloorData[] = floorsData;

  const activeFloor: FloorData | undefined =
    floors.find(f => f.id === selectedFloorId) ?? floors[0];

  useEffect(() => {
    if (floors.length > 0 && !selectedFloorId) {
      setSelectedFloorId(floors[0].id);
    }
  }, [floors, selectedFloorId]);

  const { data: openOrders = [] } = useQuery<any[]>({
    queryKey: ['pos-orders'],
    queryFn: () => api.get('/pos/orders').then(r => (Array.isArray(r.data) ? r.data : r.data?.data ?? [])),
    refetchInterval: 15000,
  });

  const { data: orderDetail, refetch: refetchOrder } = useQuery<OrderDetail>({
    queryKey: ['pos-order-detail', selectedOrder?.id ?? selectedTable?.currentOrderId],
    queryFn: () => {
      const id = selectedOrder?.id ?? selectedTable?.currentOrderId;
      if (!id) return Promise.resolve(null as any);
      return api.get(`/pos/orders/${id}`).then(r => r.data?.data ?? r.data);
    },
    enabled: !!(selectedOrder?.id ?? selectedTable?.currentOrderId),
    refetchInterval: 10000,
  });

  const { data: productResults = [] } = useQuery<ProductSearchResult[]>({
    queryKey: ['pos-product-search', debounceSearch],
    queryFn: () =>
      debounceSearch
        ? api.get(`/scan/products?q=${encodeURIComponent(debounceSearch)}`).then(r =>
            Array.isArray(r.data) ? r.data : r.data?.data ?? []
          )
        : Promise.resolve([]),
    enabled: debounceSearch.length > 0,
  });

  // --- Mutations ---
  const createFloorMut = useMutation({
    mutationFn: (data: { name: string; description: string }) => api.post('/pos/floors', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-floors'] });
      setShowAddFloor(false);
      setNewFloorForm({ name: '', description: '' });
      notify('success', 'קומה נוספה');
    },
    onError: () => notify('error', 'שגיאה ביצירת קומה'),
  });

  const createTableMut = useMutation({
    mutationFn: (data: { floorId: string; tableNumber: number; seats: number; x: number; y: number }) =>
      api.post('/pos/tables', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-floors'] });
      setShowAddTable(false);
      setNewTableForm({ floorId: '', tableNumber: '', seats: '2', x: '0', y: '0' });
      notify('success', 'שולחן נוסף');
    },
    onError: () => notify('error', 'שגיאה ביצירת שולחן'),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TableStatus }) =>
      api.patch(`/pos/tables/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-floors'] });
      notify('success', 'סטטוס עודכן');
    },
    onError: () => notify('error', 'שגיאה בעדכון סטטוס'),
  });

  const createOrderMut = useMutation({
    mutationFn: ({ tableId, warehouseId }: { tableId: string; warehouseId?: string }) =>
      api.post('/pos/orders', { tableId, type: 'DINE_IN', warehouseId }),
    onSuccess: (res) => {
      const order = res.data?.data ?? res.data;
      setSelectedOrder(order);
      queryClient.invalidateQueries({ queryKey: ['pos-floors'] });
      queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
      notify('success', 'הזמנה נפתחה');
    },
    onError: () => notify('error', 'שגיאה בפתיחת הזמנה'),
  });

  const addItemMut = useMutation({
    mutationFn: ({ orderId, productId, quantity, notes }: { orderId: string; productId: string; quantity: number; notes: string }) =>
      api.post(`/pos/orders/${orderId}/items`, { productId, quantity, notes }),
    onSuccess: () => {
      const id = selectedOrder?.id ?? selectedTable?.currentOrderId;
      if (id) queryClient.invalidateQueries({ queryKey: ['pos-order-detail', id] });
      setProductSearch('');
      setItemQty(1);
      setItemNotes('');
      notify('success', 'פריט נוסף');
    },
    onError: () => notify('error', 'שגיאה בהוספת פריט'),
  });

  const sendKitchenMut = useMutation({
    mutationFn: (orderId: string) => api.post(`/pos/orders/${orderId}/send-to-kitchen`),
    onSuccess: () => {
      notify('success', 'נשלח למטבח!');
      const id = selectedOrder?.id ?? selectedTable?.currentOrderId;
      if (id) queryClient.invalidateQueries({ queryKey: ['pos-order-detail', id] });
    },
    onError: () => notify('error', 'שגיאה בשליחה למטבח'),
  });

  const checkoutMut = useMutation({
    mutationFn: ({ orderId, paymentMethod, amount }: { orderId: string; paymentMethod: 'CASH' | 'CREDIT'; amount: number }) =>
      api.post(`/pos/orders/${orderId}/checkout`, { paymentMethod, amount }),
    onSuccess: () => {
      setShowCheckout(false);
      setSelectedTable(null);
      setSelectedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['pos-floors'] });
      queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
      notify('success', 'תשלום בוצע בהצלחה');
    },
    onError: () => notify('error', 'שגיאה בתשלום'),
  });

  const releaseTableMut = useMutation({
    mutationFn: (id: string) => api.patch(`/pos/tables/${id}/status`, { status: 'AVAILABLE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-floors'] });
      setSelectedTable(null);
      setSelectedOrder(null);
      notify('success', 'שולחן שוחרר');
    },
    onError: () => notify('error', 'שגיאה בשחרור שולחן'),
  });

  const activeOrderId = selectedOrder?.id ?? selectedTable?.currentOrderId;
  const currentOrder = orderDetail ?? null;

  const handleTableClick = (table: TableData) => {
    setSelectedTable(table);
    setSelectedOrder(null);
    setProductSearch('');
    setItemQty(1);
    setItemNotes('');
  };

  const handleAddItem = (product: ProductSearchResult) => {
    if (!activeOrderId) {
      // Need to create order first
      if (!selectedTable) return;
      createOrderMut.mutate(
        { tableId: selectedTable.id },
        {
          onSuccess: (res) => {
            const order = res.data?.data ?? res.data;
            addItemMut.mutate({
              orderId: order.id,
              productId: product.id,
              quantity: itemQty,
              notes: itemNotes,
            });
          },
        }
      );
    } else {
      addItemMut.mutate({
        orderId: activeOrderId,
        productId: product.id,
        quantity: itemQty,
        notes: itemNotes,
      });
    }
  };

  const handleOpenOrder = () => {
    if (!selectedTable) return;
    createOrderMut.mutate({ tableId: selectedTable.id });
  };

  const orderTotal = currentOrder?.items?.reduce(
    (sum: number, item: OrderItem) => sum + item.quantity * item.unitPrice,
    0
  ) ?? 0;

  const getTableOrder = (table: TableData) =>
    openOrders.find((o: any) => o.tableId === table.id);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ניהול שולחנות</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddFloor(true)}
            className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm"
          >
            <Plus className="w-4 h-4" />
            הוסף קומה
          </button>
          <button
            onClick={() => setShowAddTable(true)}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            הוסף שולחן
          </button>
        </div>
      </div>

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

      <div className="flex gap-6">
        {/* Main floor map area */}
        <div className="flex-1 min-w-0">
          {/* Floor tabs */}
          {floors.length > 1 && (
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {floors.map(floor => (
                <button
                  key={floor.id}
                  onClick={() => setSelectedFloorId(floor.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                    (selectedFloorId ?? floors[0]?.id) === floor.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {floor.name}
                </button>
              ))}
            </div>
          )}

          {/* Table grid */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {!activeFloor ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                אין קומות מוגדרות — הוסף קומה ושולחנות
              </div>
            ) : activeFloor.tables.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                אין שולחנות בקומה זו — לחץ "הוסף שולחן"
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                {activeFloor.tables.map(table => {
                  const statusInfo = TABLE_STATUSES[table.status] ?? TABLE_STATUSES.AVAILABLE;
                  const tableOrder = getTableOrder(table);
                  const isSelected = selectedTable?.id === table.id;
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 min-h-[110px] transition hover:shadow-md ${statusInfo.color} ${
                        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                      }`}
                    >
                      <span className="text-2xl font-bold">{table.tableNumber}</span>
                      <span className="text-xs font-medium mt-0.5">{statusInfo.label}</span>
                      <div className="flex items-center gap-1 text-xs mt-1 opacity-70">
                        <Users className="w-3 h-3" />
                        {table.seats}
                      </div>
                      {tableOrder && (
                        <div className="mt-1 text-xs font-semibold">
                          {fmtCurrency(tableOrder.total ?? 0)}
                        </div>
                      )}
                      {tableOrder?.createdAt && (
                        <div className="flex items-center gap-0.5 text-xs opacity-70 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {timeSince(tableOrder.createdAt)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(TABLE_STATUSES).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`w-4 h-4 rounded border-2 ${val.color}`} />
                {val.label}
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        {selectedTable && (
          <div className="w-80 flex flex-col gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {/* Table header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  שולחן {selectedTable.tableNumber}
                </h2>
                <button
                  onClick={() => { setSelectedTable(null); setSelectedOrder(null); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status selector */}
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 mb-1 block">סטטוס</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(TABLE_STATUSES) as TableStatus[]).map(s => {
                    const info = TABLE_STATUSES[s];
                    return (
                      <button
                        key={s}
                        onClick={() => updateStatusMut.mutate({ id: selectedTable.id, status: s })}
                        className={`text-xs py-1.5 px-2 rounded-lg border font-medium transition ${
                          selectedTable.status === s
                            ? info.color
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {info.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Order section */}
              {!activeOrderId && selectedTable.status !== 'OCCUPIED' && (
                <button
                  onClick={handleOpenOrder}
                  disabled={createOrderMut.isPending}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm mb-4"
                >
                  {createOrderMut.isPending ? 'פותח הזמנה...' : 'פתח הזמנה'}
                </button>
              )}

              {/* Order items */}
              {activeOrderId && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">פריטי הזמנה</h3>
                  {!currentOrder?.items?.length ? (
                    <p className="text-xs text-gray-400">אין פריטים עדיין</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {currentOrder.items.map((item: OrderItem) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2 py-1.5"
                        >
                          <span className="font-medium text-gray-800 truncate flex-1">
                            {item.productName ?? item.productId}
                          </span>
                          <span className="text-gray-500 mx-2">x{item.quantity}</span>
                          <span className="font-semibold text-gray-700">
                            {fmtCurrency(item.quantity * item.unitPrice)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {currentOrder?.items && currentOrder.items.length > 0 && (
                    <div className="flex justify-between text-sm font-bold text-gray-900 mt-2 pt-2 border-t border-gray-100">
                      <span>סה"כ</span>
                      <span className="text-blue-600">{fmtCurrency(orderTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Quick add item */}
              {activeOrderId && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">הוסף פריט</h3>
                  <div className="relative mb-2">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      ref={searchRef}
                      type="text"
                      className="w-full border border-gray-300 rounded-lg pr-8 pl-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="חיפוש פריט..."
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      min={1}
                      className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      value={itemQty}
                      onChange={e => setItemQty(Math.max(1, Number(e.target.value)))}
                    />
                    <input
                      type="text"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="הערות..."
                      value={itemNotes}
                      onChange={e => setItemNotes(e.target.value)}
                    />
                  </div>
                  {productResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {productResults.map((p: ProductSearchResult) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddItem(p)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-blue-50 transition"
                        >
                          <span className="font-medium text-gray-800">{p.name}</span>
                          <span className="text-blue-600 font-semibold">{fmtCurrency(p.sellingPrice)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                {activeOrderId && (
                  <>
                    <button
                      onClick={() => sendKitchenMut.mutate(activeOrderId)}
                      disabled={sendKitchenMut.isPending}
                      className="flex items-center justify-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 text-sm"
                    >
                      <ChefHat className="w-4 h-4" />
                      {sendKitchenMut.isPending ? 'שולח...' : 'שלח למטבח'}
                    </button>
                    <button
                      onClick={() => { setCheckoutAmount(String(orderTotal)); setShowCheckout(true); }}
                      className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
                    >
                      <CreditCard className="w-4 h-4" />
                      צ'ק-אאוט
                    </button>
                  </>
                )}
                <button
                  onClick={() => releaseTableMut.mutate(selectedTable.id)}
                  disabled={releaseTableMut.isPending}
                  className="text-sm text-gray-500 hover:text-gray-700 py-1"
                >
                  שחרר שולחן
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checkout modal */}
      {showCheckout && activeOrderId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">תשלום</h3>
              <button onClick={() => setShowCheckout(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-base font-bold text-gray-900 mb-4">
                <span>סה"כ לתשלום</span>
                <span className="text-blue-600">{fmtCurrency(orderTotal)}</span>
              </div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">אמצעי תשלום</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([['CASH', 'מזומן', Banknote], ['CREDIT', 'אשראי', CreditCard]] as const).map(([val, label, Icon]) => (
                  <button
                    key={val}
                    onClick={() => setCheckoutMethod(val)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition ${
                      checkoutMethod === val
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="סכום"
                value={checkoutAmount}
                onChange={e => setCheckoutAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  checkoutMut.mutate({
                    orderId: activeOrderId,
                    paymentMethod: checkoutMethod,
                    amount: Number(checkoutAmount) || orderTotal,
                  })
                }
                disabled={checkoutMut.isPending}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
              >
                {checkoutMut.isPending ? 'מבצע...' : 'אשר תשלום'}
              </button>
              <button
                onClick={() => setShowCheckout(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add table modal */}
      {showAddTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">הוסף שולחן</h3>
              <button onClick={() => setShowAddTable(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">קומה</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newTableForm.floorId}
                  onChange={e => setNewTableForm(f => ({ ...f, floorId: e.target.value }))}
                >
                  <option value="">בחר קומה</option>
                  {floors.map(fl => (
                    <option key={fl.id} value={fl.id}>{fl.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">מספר שולחן</label>
                <input
                  type="number"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newTableForm.tableNumber}
                  onChange={e => setNewTableForm(f => ({ ...f, tableNumber: e.target.value }))}
                  placeholder="לדוגמה: 5"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">מושבים</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newTableForm.seats}
                  onChange={e => setNewTableForm(f => ({ ...f, seats: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() =>
                  createTableMut.mutate({
                    floorId: newTableForm.floorId,
                    tableNumber: Number(newTableForm.tableNumber),
                    seats: Number(newTableForm.seats),
                    x: Number(newTableForm.x),
                    y: Number(newTableForm.y),
                  })
                }
                disabled={createTableMut.isPending || !newTableForm.floorId || !newTableForm.tableNumber}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:bg-gray-300"
              >
                {createTableMut.isPending ? 'יוצר...' : 'הוסף'}
              </button>
              <button
                onClick={() => setShowAddTable(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add floor modal */}
      {showAddFloor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">הוסף קומה</h3>
              <button onClick={() => setShowAddFloor(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">שם קומה</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newFloorForm.name}
                  onChange={e => setNewFloorForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="לדוגמה: קומת קרקע"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">תיאור (אופציונלי)</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newFloorForm.description}
                  onChange={e => setNewFloorForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => createFloorMut.mutate(newFloorForm)}
                disabled={createFloorMut.isPending || !newFloorForm.name}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:bg-gray-300"
              >
                {createFloorMut.isPending ? 'יוצר...' : 'הוסף'}
              </button>
              <button
                onClick={() => setShowAddFloor(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
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
