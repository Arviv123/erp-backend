import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Plus, Search, X, Loader2, Eye, ChevronDown, FileText,
  ShoppingCart, Calendar, ArrowRight, Send,
} from 'lucide-react';
import SendDocumentModal from '../components/SendDocumentModal';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');

const isOverdue = (dateStr: string, status: string) => {
  if (!dateStr) return false;
  if (['DELIVERED', 'CANCELLED', 'INVOICED'].includes(status)) return false;
  return new Date(dateStr) < new Date();
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ממתין',
  CONFIRMED: 'מאושר',
  IN_PRODUCTION: 'בייצור',
  READY: 'מוכן',
  DELIVERED: 'נמסר',
  CANCELLED: 'בוטל',
  INVOICED: 'הוזמן',
};
const STATUS_CLS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PRODUCTION: 'bg-purple-100 text-purple-700',
  READY: 'bg-teal-100 text-teal-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  INVOICED: 'bg-gray-100 text-gray-500',
};

const ALL_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED', 'INVOICED'] as const;
type OrderStatus = typeof ALL_STATUSES[number];

// ─── types ────────────────────────────────────────────────────────────────────
interface SalesOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerId: string;
  customer: { name: string };
  orderDate: string;
  deliveryDate?: string;
  total: number;
  invoiceId?: string;
}

interface OrderLine {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  discount?: number;
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 relative mx-4`} dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-800 text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Customer Search ───────────────────────────────────────────────────────────
function CustomerSearch({ onChange, placeholder = 'חפש לקוח...' }: { onChange: (id: string, name: string) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['cust-search-so', q],
    queryFn: () => api.get('/scan/customers', { params: { q } }),
    enabled: q.length > 1,
  });
  const results: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  const pick = (id: string, name: string) => {
    setSelected(name);
    setQ('');
    setOpen(false);
    onChange(id, name);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="border border-gray-300 rounded-lg pr-8 pl-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={selected || placeholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((c: any) => (
            <button
              key={c.id}
              onMouseDown={() => pick(c.id, c.name)}
              className="w-full text-right px-3 py-2 hover:bg-blue-50 text-sm text-gray-700"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Status Change Dropdown ────────────────────────────────────────────────────
function StatusDropdown({ orderId, current }: { orderId: string; current: OrderStatus }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (status: OrderStatus) => api.patch(`/sales-orders/${orderId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      setOpen(false);
    },
  });

  const nextStatuses = ALL_STATUSES.filter((s) => s !== current && s !== 'INVOICED');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1.5 rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
      >
        <ChevronDown size={12} />
        שנה סטטוס
      </button>
      {open && (
        <div className="absolute z-10 left-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => mutation.mutate(s)}
              disabled={mutation.isPending}
              className="w-full text-right px-3 py-2 hover:bg-gray-50 text-xs text-gray-700 flex items-center justify-between"
            >
              <span>{STATUS_LABEL[s]}</span>
              <span className={`w-2 h-2 rounded-full ${STATUS_CLS[s].split(' ')[0]}`} />
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="w-full text-right px-3 py-2 hover:bg-gray-50 text-xs text-gray-400 border-t border-gray-100"
          >
            סגור
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Order Detail Modal ────────────────────────────────────────────────────────
function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sales-order-detail', orderId],
    queryFn: () => api.get(`/sales-orders/${orderId}`),
  });
  const order: any = data?.data ?? data ?? null;

  return (
    <Modal title={`הזמנה ${order?.orderNumber ?? ''}`} onClose={onClose} wide>
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin ml-2" size={18} /> טוען...
        </div>
      ) : order ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">לקוח</p>
              <p className="font-medium">{order.customer?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">סטטוס</p>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[order.status]}`}>
                {STATUS_LABEL[order.status]}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500">תאריך הזמנה</p>
              <p>{fmtDate(order.orderDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">תאריך אספקה</p>
              <p className={isOverdue(order.deliveryDate, order.status) ? 'text-red-600 font-semibold' : ''}>
                {fmtDate(order.deliveryDate)}
              </p>
            </div>
          </div>

          {Array.isArray(order.lines) && order.lines.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">שורות הזמנה</p>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-right">תיאור</th>
                      <th className="px-3 py-2 text-right">כמות</th>
                      <th className="px-3 py-2 text-right">מחיר</th>
                      <th className="px-3 py-2 text-right">סה"כ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2">{l.quantity}</td>
                        <td className="px-3 py-2">{fmtILS(l.unitPrice)}</td>
                        <td className="px-3 py-2 font-semibold">{fmtILS(l.quantity * l.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <p className="text-gray-500 text-sm">סה"כ</p>
            <p className="font-bold text-lg">{fmtILS(order.total)}</p>
          </div>

          {order.notes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">הערות</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{order.notes}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-400 text-sm text-center py-8">לא נמצאה הזמנה</p>
      )}
    </Modal>
  );
}

// ─── New Order Modal ───────────────────────────────────────────────────────────
function NewOrderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([
    { description: '', quantity: 1, unitPrice: 0, vatRate: 17, discount: 0 },
  ]);
  const [error, setError] = useState('');

  const addLine = () =>
    setLines((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, vatRate: 17, discount: 0 }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof OrderLine, val: string | number) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/sales-orders', {
        customerId,
        ...(deliveryDate ? { deliveryDate } : {}),
        ...(notes ? { notes } : {}),
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          vatRate: Number(l.vatRate ?? 17),
          ...(Number(l.discount) > 0 ? { discount: Number(l.discount) } : {}),
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'שגיאה'),
  });

  const total = lines.reduce((s, l) => {
    const net = Number(l.quantity) * Number(l.unitPrice) * (1 - Number(l.discount ?? 0) / 100);
    const vat = net * (Number(l.vatRate ?? 17) / 100);
    return s + net + vat;
  }, 0);

  return (
    <Modal title="הזמנת מכירה חדשה" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">לקוח *</label>
            <CustomerSearch onChange={(id) => setCustomerId(id)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">תאריך אספקה</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">הערות</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הערות להזמנה"
            />
          </div>
        </div>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">פריטים *</label>
            <button onClick={addLine} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus size={12} /> הוסף שורה
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <input
                  className="col-span-4 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="תיאור"
                  value={line.description}
                  onChange={(e) => updateLine(i, 'description', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="כמות"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="מחיר"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="מע״מ%"
                  value={line.vatRate ?? 17}
                  onChange={(e) => updateLine(i, 'vatRate', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="הנחה%"
                  value={line.discount ?? 0}
                  onChange={(e) => updateLine(i, 'discount', e.target.value)}
                />
                <button
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  className="col-span-1 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <p className="text-xs text-gray-400">תיאור | כמות | מחיר | מע"מ% | הנחה%</p>
          </div>
          <div className="text-left mt-2 text-sm font-semibold text-gray-700">
            סה"כ: {fmtILS(total)}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!customerId || lines.some((l) => !l.description) || mutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            צור הזמנה
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SalesOrdersPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertedInvoiceId, setConvertedInvoiceId] = useState<string | null>(null);
  const [sendModal, setSendModal] = useState<{id:string, number:string, name:string, phone?:string, email?:string, amount?:number} | null>(null);

  const params: Record<string, string> = { limit: '50' };
  if (statusFilter) params.status = statusFilter;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading } = useQuery({
    queryKey: ['sales-orders', params],
    queryFn: () => api.get('/sales-orders', { params }),
  });
  const ordersRaw: SalesOrder[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];

  // Client-side customer name filter
  const orders = customerSearch
    ? ordersRaw.filter((o) => (o.customer?.name ?? '').includes(customerSearch))
    : ordersRaw;

  const convertMutation = useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/convert-to-invoice`),
    onSuccess: (res: any, id) => {
      const invoiceId = res?.data?.invoiceId ?? res?.invoiceId ?? null;
      setConvertedInvoiceId(invoiceId);
      setConvertingId(null);
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
    },
    onError: () => setConvertingId(null),
  });

  // Stats per status
  const countByStatus = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = ordersRaw.filter((o) => o.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="text-blue-600" size={26} />
          <h1 className="text-xl font-bold text-gray-800">הזמנות מכירה</h1>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5"
        >
          <Plus size={16} /> הזמנה חדשה
        </button>
      </div>

      {/* Converted banner */}
      {convertedInvoiceId && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-green-700 text-sm font-medium">
            חשבונית הופקה בהצלחה (ID: {convertedInvoiceId})
          </p>
          <button onClick={() => setConvertedInvoiceId(null)} className="text-green-500 hover:text-green-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Kanban-style status bar */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`rounded-xl border p-3 text-center transition ${
              statusFilter === s ? 'ring-2 ring-blue-400 border-blue-300' : 'border-gray-200 hover:border-gray-300'
            } bg-white`}
          >
            <p className={`text-xl font-bold ${STATUS_CLS[s].split(' ')[1]}`}>{countByStatus[s]}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{STATUS_LABEL[s]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="חפש לקוח..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="border border-gray-300 rounded-lg pr-8 pl-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">כל הסטטוסים</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="מתאריך"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="עד תאריך"
          />
          {(statusFilter || customerSearch || from || to) && (
            <button
              onClick={() => { setStatusFilter(''); setCustomerSearch(''); setFrom(''); setTo(''); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X size={13} /> נקה
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="animate-spin ml-2" size={20} /> טוען הזמנות...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <ShoppingCart size={36} className="mx-auto mb-3 text-gray-300" />
            לא נמצאו הזמנות
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3 text-right font-medium">מספר</th>
                <th className="px-4 py-3 text-right font-medium">לקוח</th>
                <th className="px-4 py-3 text-right font-medium">תאריך הזמנה</th>
                <th className="px-4 py-3 text-right font-medium">תאריך אספקה</th>
                <th className="px-4 py-3 text-right font-medium">סכום</th>
                <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                <th className="px-4 py-3 text-right font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => {
                const deliveryOverdue = isOverdue(order.deliveryDate ?? '', order.status);
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{order.orderNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{order.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} className="text-gray-400" />
                        {fmtDate(order.orderDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.deliveryDate ? (
                        <span
                          className={`flex items-center gap-1 ${
                            deliveryOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'
                          }`}
                        >
                          <Calendar size={12} className={deliveryOverdue ? 'text-red-500' : 'text-gray-400'} />
                          {fmtDate(order.deliveryDate)}
                          {deliveryOverdue && <span className="text-xs text-red-500">(עבר)</span>}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{fmtILS(order.total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          STATUS_CLS[order.status]
                        }`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* View */}
                        <button
                          onClick={() => setViewOrderId(order.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="צפה"
                        >
                          <Eye size={15} />
                        </button>
                        {/* Send */}
                        <button
                          onClick={() => setSendModal({ id: order.id, number: order.orderNumber, name: order.customer?.name ?? '', amount: Number(order.total) })}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="שלח ללקוח"
                        >
                          <Send size={15} />
                        </button>
                        {/* Status change */}
                        {order.status !== 'CANCELLED' && order.status !== 'INVOICED' && (
                          <StatusDropdown orderId={order.id} current={order.status} />
                        )}
                        {/* Convert to invoice */}
                        {order.status === 'DELIVERED' && !order.invoiceId && (
                          <button
                            onClick={() => {
                              setConvertingId(order.id);
                              convertMutation.mutate(order.id);
                            }}
                            disabled={convertMutation.isPending && convertingId === order.id}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 border border-blue-200 disabled:opacity-50"
                            title="המר לחשבונית"
                          >
                            {convertMutation.isPending && convertingId === order.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <FileText size={12} />
                            )}
                            המר לחשבונית
                          </button>
                        )}
                        {/* Show invoice link if invoiced */}
                        {order.invoiceId && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <ArrowRight size={12} /> חשבונית
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showNew && <NewOrderModal onClose={() => setShowNew(false)} />}
      {viewOrderId && <OrderDetailModal orderId={viewOrderId} onClose={() => setViewOrderId(null)} />}
      {sendModal && (
        <SendDocumentModal
          isOpen={!!sendModal}
          onClose={() => setSendModal(null)}
          documentType="salesOrder"
          documentId={sendModal.id}
          documentNumber={sendModal.number}
          recipientName={sendModal.name}
          recipientPhone={sendModal.phone}
          recipientEmail={sendModal.email}
          amount={sendModal.amount}
        />
      )}
    </div>
  );
}
