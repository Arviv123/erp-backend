import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Plus,
  Search,
  Mail,
  Printer,
  Download,
  Eye,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  Trash2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Receipt {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: 'CASH' | 'CREDIT_CARD' | 'CHECK' | 'BANK_TRANSFER';
  status: 'DRAFT' | 'ISSUED' | 'CANCELLED';
  createdAt: string;
  invoiceId?: string;
}

interface ReceiptLine {
  description: string;
  amount: number;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS: Record<string, string> = {
  CASH: 'מזומן',
  CREDIT_CARD: 'כרטיס אשראי',
  CHECK: 'שיק',
  BANK_TRANSFER: 'העברה בנקאית',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'טיוטה', color: 'bg-gray-100 text-gray-700' },
  ISSUED: { label: 'הונפקה', color: 'bg-blue-100 text-blue-700' },
  CANCELLED: { label: 'בוטלה', color: 'bg-red-100 text-red-700' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── Create Receipt Modal ─────────────────────────────────────────────────────

function CreateReceiptModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ReceiptLine[]>([{ description: '', amount: 0 }]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customer-search', customerQuery],
    queryFn: async () => {
      if (customerQuery.length < 2) return [];
      const r = await api.get('/scan/customers', { params: { q: customerQuery } });
      return Array.isArray(r.data) ? r.data : [];
    },
    enabled: customerQuery.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await api.post('/receipts', {
        customerId: selectedCustomer?.id,
        amount: parseFloat(amount),
        paymentMethod,
        lines,
        notes,
      });
      return r.data;
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const addLine = () => setLines((prev) => [...prev, { description: '', amount: 0 }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof ReceiptLine, value: string | number) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };

  const linesTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">קבלה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Customer search */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">לקוח</label>
            <input
              type="text"
              placeholder="חפש לקוח..."
              value={selectedCustomer ? selectedCustomer.name : customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setSelectedCustomer(null);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            />
            {showDropdown && customers && customers.length > 0 && !selectedCustomer && (
              <div
                ref={dropdownRef}
                className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto"
              >
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50 block"
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerQuery(c.name);
                      setShowDropdown(false);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount + Payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סכום כולל</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">שורות</label>
              <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:underline">
                + הוסף שורה
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="תיאור"
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="סכום"
                    value={line.amount || ''}
                    onChange={(e) => updateLine(i, 'amount', parseFloat(e.target.value) || 0)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
                  />
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {linesTotal > 0 && (
              <div className="text-left text-sm text-gray-600 mt-1">
                סה"כ שורות: <strong>{ILS(linesTotal)}</strong>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full resize-none"
            />
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>שגיאה ביצירת הקבלה</span>
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selectedCustomer}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            צור קבלה
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const { data, isLoading } = useQuery<Receipt[]>({
    queryKey: ['receipts'],
    queryFn: async () => {
      const r = await api.get('/receipts');
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  const receipts: Receipt[] = data ?? [];

  // Filter
  const filtered = receipts.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.customerName?.toLowerCase().includes(q) ||
      r.receiptNumber?.toLowerCase().includes(q);
    const matchPayment = !filterPayment || r.paymentMethod === filterPayment;
    const matchFrom = !dateFrom || r.createdAt >= dateFrom;
    const matchTo = !dateTo || r.createdAt <= dateTo + 'T23:59:59';
    return matchSearch && matchPayment && matchFrom && matchTo;
  });

  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0);

  // Email action
  const emailMutation = useMutation({
    mutationFn: (id: string) => api.post(`/receipts/${id}/email`),
    onSuccess: () => showToast('success', 'הקבלה נשלחה בדואר אלקטרוני'),
    onError: () => showToast('error', 'שגיאה בשליחת הדואר האלקטרוני'),
  });

  // Print action
  const printMutation = useMutation({
    mutationFn: (id: string) => api.post(`/receipts/${id}/print`),
    onSuccess: () => showToast('success', 'הקבלה נשלחה למדפסת'),
    onError: () => showToast('error', 'שגיאה בהדפסה'),
  });

  // Download PDF
  const downloadPdf = async (id: string, receiptNumber: string) => {
    try {
      const r = await api.get(`/receipts/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receiptNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('error', 'שגיאה בהורדת ה-PDF');
    }
  };

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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">קבלות</h1>
          <p className="text-sm text-gray-500 mt-1">ניהול קבלות תשלום ללקוחות</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          קבלה חדשה
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="חפש לקוח / מספר קבלה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="text-gray-400 text-sm">עד</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">כל אמצעי התשלום</option>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Receipts table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>לא נמצאו קבלות</p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-right font-medium text-gray-600">מספר</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">לקוח</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">סכום</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">אמצעי תשלום</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">תאריך</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{receipt.receiptNumber}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{receipt.customerName}</td>
                  <td className="px-4 py-3 text-gray-800 font-semibold">{ILS(receipt.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {PAYMENT_METHODS[receipt.paymentMethod] ?? receipt.paymentMethod}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(receipt.createdAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        title="צפה"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        onClick={() => {/* future: open detail modal */}}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        title="שלח מייל"
                        onClick={() => emailMutation.mutate(receipt.id)}
                        disabled={emailMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                      <button
                        title="הדפס"
                        onClick={() => printMutation.mutate(receipt.id)}
                        disabled={printMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        title="הורד PDF"
                        onClick={() => downloadPdf(receipt.id, receipt.receiptNumber)}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Totals footer */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-gray-500">סה"כ קבלות: </span>
                <span className="font-bold text-gray-900">{filtered.length}</span>
              </div>
              <div>
                <span className="text-gray-500">סה"כ סכום: </span>
                <span className="font-bold text-blue-700">{ILS(totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateReceiptModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['receipts'] });
            showToast('success', 'הקבלה נוצרה בהצלחה');
          }}
        />
      )}
    </div>
  );
}
