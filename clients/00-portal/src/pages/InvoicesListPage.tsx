import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Plus, RefreshCw, Search, Eye, Send, CreditCard, Loader2 } from 'lucide-react';
import SendDocumentModal from '../components/SendDocumentModal';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_LABELS: Record<string, string> = {
  '': 'הכל', DRAFT: 'טיוטה', SENT: 'נשלח', PAID: 'שולם', OVERDUE: 'פג תוקף', CANCELLED: 'בוטל',
};
const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700', OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-400',
};
const STATUSES = ['', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'] as const;

export default function InvoicesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sendModal, setSendModal] = useState<{id:string, number:string, name:string, phone?:string, email?:string, amount?:number} | null>(null);

  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', params],
    queryFn: () => api.get('/invoices', { params }),
  });

  const overdueMutation = useMutation({
    mutationFn: () => api.post('/invoices/update-overdue'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const invoices: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const filtered = search
    ? invoices.filter((inv: any) => (inv.customer?.name || '').includes(search) || (inv.invoiceNumber || '').includes(search))
    : invoices;

  const open = invoices.filter((i: any) => ['DRAFT', 'SENT', 'OVERDUE'].includes(i.status)).length;
  const overdue = invoices.filter((i: any) => i.status === 'OVERDUE').length;
  const paidSum = invoices.filter((i: any) => i.status === 'PAID').reduce((s: number, i: any) => s + (i.totalAmount ?? i.total ?? 0), 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label={'סה"כ חשבוניות'} value={invoices.length} />
        <KPI label="פתוחות" value={open} />
        <KPI label="פגות תוקף" value={overdue} color="text-red-600" />
        <KPI label="שולם" value={fmtCurrency(paidSum)} color="text-green-600" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  status === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="חיפוש לקוח / מספר..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => navigate('/invoices/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1.5">
            <Plus size={16} /> חשבונית חדשה
          </button>
          {user?.role === 'ADMIN' && (
            <button onClick={() => overdueMutation.mutate()} disabled={overdueMutation.isPending}
              className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={16} className={overdueMutation.isPending ? 'animate-spin' : ''} />
              עדכן פגי תוקף
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="animate-spin ml-2" size={20} /> טוען חשבוניות...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">לא נמצאו חשבוניות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3 text-right font-medium">מספר</th>
                <th className="px-4 py-3 text-right font-medium">תאריך</th>
                <th className="px-4 py-3 text-right font-medium">לקוח</th>
                <th className="px-4 py-3 text-right font-medium">לפני מע"מ</th>
                <th className="px-4 py-3 text-right font-medium">מע"מ</th>
                <th className="px-4 py-3 text-right font-medium">סה"כ</th>
                <th className="px-4 py-3 text-right font-medium">סטאטוס</th>
                <th className="px-4 py-3 text-right font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((inv: any) => {
                const totalAmount = inv.totalAmount ?? inv.total ?? 0;
                const vatAmount = inv.vatAmount ?? 0;
                const subtotal = inv.subtotalAmount ?? (totalAmount - vatAmount);
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">{fmtDate(inv.date)}</td>
                    <td className="px-4 py-3 font-medium">{inv.customer?.name || '—'}</td>
                    <td className="px-4 py-3">{fmtCurrency(subtotal)}</td>
                    <td className="px-4 py-3">{fmtCurrency(vatAmount)}</td>
                    <td className="px-4 py-3 font-bold">{fmtCurrency(totalAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/invoices/${inv.id}`)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="צפה">
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setSendModal({ id: inv.id, number: inv.invoiceNumber, name: inv.customer?.name ?? '', phone: inv.customer?.phone, email: inv.customer?.email, amount: Number(inv.totalAmount ?? inv.total ?? 0) })}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="שלח ללקוח"
                        >
                          <Send size={15} />
                        </button>
                        {['SENT', 'OVERDUE'].includes(inv.status) && (
                          <button onClick={() => navigate(`/invoices/${inv.id}`)}
                            className="p-1.5 rounded hover:bg-green-50 text-green-600" title="רשום תשלום">
                            <CreditCard size={15} />
                          </button>
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

      {sendModal && (
        <SendDocumentModal
          isOpen={!!sendModal}
          onClose={() => setSendModal(null)}
          documentType="invoice"
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

function KPI({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
