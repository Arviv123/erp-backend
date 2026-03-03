import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { ArrowRight, Send, Ban, CreditCard, Plus, Loader2, X } from 'lucide-react';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלח', PAID: 'שולם', OVERDUE: 'פג תוקף', CANCELLED: 'בוטל',
};
const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700', OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-400',
};

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'העברה בנקאית', CREDIT_CARD: 'כרטיס אשראי',
  CASH: 'מזומן', CHECK: "צ'ק", OTHER: 'אחר',
};

const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'העברה בנקאית' },
  { value: 'CREDIT_CARD', label: 'כרטיס אשראי' },
  { value: 'CASH', label: 'מזומן' },
  { value: 'CHECK', label: "צ'ק" },
  { value: 'OTHER', label: 'אחר' },
];

function PaymentModal({ invoiceId, balance, onClose }: { invoiceId: string; balance: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${invoiceId}/payments`, {
        amount, method, date: new Date(date).toISOString(),
        reference: reference || undefined, notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.message || 'שגיאה ברישום תשלום'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-800">רישום תשלום</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סכום לתשלום <span className="text-gray-400">(יתרה: {fmtCurrency(balance)})</span>
            </label>
            <input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)}
              min={0} max={balance}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אסמכתא</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="מספר העברה / צ'ק"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition">
            ביטול
          </button>
          <button onClick={() => mutation.mutate()} disabled={amount <= 0 || mutation.isPending}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            רשום תשלום
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPay, setShowPay] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`),
    enabled: !!id,
  });

  const inv = data?.data ?? data;

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin ml-2" size={20} /> טוען...
      </div>
    );
  }

  if (!inv) {
    return <div className="text-center py-20 text-gray-400">חשבונית לא נמצאה</div>;
  }

  const statusCls = STATUS_CLS[inv.status] ?? 'bg-gray-100 text-gray-600';
  const statusLabel = STATUS_LABELS[inv.status] ?? inv.status;
  const lines: any[] = inv.lines || inv.invoiceLines || [];
  const payments: any[] = inv.payments || [];
  const vatAmount = inv.vatAmount ?? 0;
  const subtotal = inv.subtotalAmount ?? (inv.totalAmount - vatAmount);
  const paidAmount = payments.reduce((s: number, p: any) => s + p.amount, 0);
  const balance = inv.totalAmount - paidAmount;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/invoices')} className="text-gray-400 hover:text-gray-600">
            <ArrowRight size={20} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">חשבונית {inv.invoiceNumber}</h2>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusCls}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex gap-2">
          {inv.status === 'DRAFT' && (
            <>
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5">
                <Send size={15} /> שלח
              </button>
              <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}
                className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition disabled:opacity-50 flex items-center gap-1.5">
                <Ban size={15} /> בטל
              </button>
            </>
          )}
          {(inv.status === 'SENT' || inv.status === 'OVERDUE') && (
            <>
              <button onClick={() => setShowPay(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-1.5">
                <CreditCard size={15} /> רשום תשלום
              </button>
              <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}
                className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition disabled:opacity-50 flex items-center gap-1.5">
                <Ban size={15} /> בטל
              </button>
            </>
          )}
          {inv.status === 'PAID' && (
            <button onClick={() => navigate('/invoices/new')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1.5">
              <Plus size={15} /> חשבונית חדשה ללקוח
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-blue-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold">חשבונית מס {inv.invoiceNumber}</h3>
              <p className="text-blue-100 text-sm mt-1">תאריך: {fmtDate(inv.date)}</p>
              <p className="text-blue-100 text-sm">לתשלום עד: {fmtDate(inv.dueDate)}</p>
            </div>
            <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white">
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="border-b border-gray-200 p-4 bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">לכבוד</p>
          <p className="font-bold text-gray-800">{inv.customer?.name || '—'}</p>
          {inv.customer?.email && <p className="text-sm text-gray-500">{inv.customer.email}</p>}
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="px-4 py-3 text-right font-medium">תיאור</th>
              <th className="px-4 py-3 text-right font-medium w-20">כמות</th>
              <th className="px-4 py-3 text-right font-medium w-28">מחיר יחידה</th>
              <th className="px-4 py-3 text-right font-medium w-28">סה״כ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line: any, idx: number) => (
              <tr key={idx}>
                <td className="px-4 py-3">{line.description}</td>
                <td className="px-4 py-3 text-center">{line.quantity}</td>
                <td className="px-4 py-3">{fmtCurrency(line.unitPrice)}</td>
                <td className="px-4 py-3 font-medium">{fmtCurrency(line.lineTotal ?? line.quantity * line.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-gray-200 p-5 bg-gray-50">
          <div className="flex flex-col items-start gap-1.5 max-w-xs mr-auto text-sm">
            <div className="flex justify-between w-full">
              <span className="text-gray-500">לפני מע״מ:</span>
              <span className="font-medium">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full">
              <span className="text-gray-500">מע״מ 18%:</span>
              <span className="font-medium">{fmtCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between w-full pt-2 border-t border-gray-300">
              <span className="font-bold text-gray-800">סה״כ:</span>
              <span className="font-bold text-lg text-blue-700">{fmtCurrency(inv.totalAmount)}</span>
            </div>
            {paidAmount > 0 && (
              <>
                <div className="flex justify-between w-full text-green-600">
                  <span>שולם:</span>
                  <span className="font-medium">{fmtCurrency(paidAmount)}</span>
                </div>
                <div className="flex justify-between w-full font-bold text-red-600">
                  <span>יתרה:</span>
                  <span>{fmtCurrency(balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {inv.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">הערות</p>
          <p className="text-sm text-gray-700">{inv.notes}</p>
        </div>
      )}

      {payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-medium text-gray-700">היסטוריית תשלומים</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-right font-medium">תאריך</th>
                <th className="px-4 py-2 text-right font-medium">סכום</th>
                <th className="px-4 py-2 text-right font-medium">אמצעי תשלום</th>
                <th className="px-4 py-2 text-right font-medium">אסמכתא</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p: any, idx: number) => (
                <tr key={idx}>
                  <td className="px-4 py-3">{fmtDate(p.date || p.paidAt)}</td>
                  <td className="px-4 py-3 font-medium text-green-600">{fmtCurrency(p.amount)}</td>
                  <td className="px-4 py-3">{METHOD_LABELS[p.method] || p.method}</td>
                  <td className="px-4 py-3 text-gray-500">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPay && (
        <PaymentModal invoiceId={id!} balance={balance} onClose={() => setShowPay(false)} />
      )}
    </div>
  );
}
