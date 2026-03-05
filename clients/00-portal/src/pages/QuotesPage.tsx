import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Eye, Trash2, FileDown, Loader2 } from 'lucide-react';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');

const STATUSES = ['', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] as const;

const STATUS_LABELS: Record<string, string> = {
  '': 'הכל',
  DRAFT: 'טיוטה',
  SENT: 'נשלח',
  ACCEPTED: 'אושר',
  REJECTED: 'נדחה',
  EXPIRED: 'פג תוקף',
  CONVERTED: 'הומר לחשבונית',
};

const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
};

function KPI({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

export default function QuotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params: Record<string, string> = { page: '1', limit: '100' };
  if (status) params.status = status;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', params],
    queryFn: () => api.get('/quotes', { params }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/quotes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setDeleteId(null);
    },
  });

  const quotes: any[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.data?.data)
    ? data.data.data
    : Array.isArray(data)
    ? data
    : [];

  const today = new Date().toISOString().slice(0, 10);

  const isExpired = (q: any) => {
    if (!q.expiryDate) return false;
    if (['ACCEPTED', 'CONVERTED'].includes(q.status)) return false;
    return q.expiryDate.slice(0, 10) <= today;
  };

  const totalCount = quotes.length;
  const pendingCount = quotes.filter((q) => q.status === 'SENT').length;
  const acceptedCount = quotes.filter((q) => q.status === 'ACCEPTED').length;
  const acceptedValue = quotes
    .filter((q) => q.status === 'ACCEPTED')
    .reduce((s: number, q: any) => s + (q.total ?? 0), 0);

  const handleDownloadPdf = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await api.get(`/quotes/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('שגיאה בהורדת PDF');
    }
  };

  const clearFilters = () => {
    setStatus('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">הצעות מחיר</h1>
        <button
          onClick={() => navigate('/quotes/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5"
        >
          <Plus size={16} /> הצעה חדשה
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label='סה"כ הצעות' value={totalCount} />
        <KPI label="ממתינות (נשלח)" value={pendingCount} color="text-blue-600" />
        <KPI label="אושרו" value={acceptedCount} color="text-green-600" />
        <KPI label="שווי מאושרות" value={fmtCurrency(acceptedValue)} color="text-green-600" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  status === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            title="מתאריך"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            title="עד תאריך"
          />
          {(status || from || to) && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              נקה
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="animate-spin ml-2" size={20} /> טוען הצעות מחיר...
          </div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">לא נמצאו הצעות מחיר</p>
            <button
              onClick={() => navigate('/quotes/new')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Plus size={16} /> צור הצעת מחיר ראשונה
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3 text-right font-medium">מספר</th>
                <th className="px-4 py-3 text-right font-medium">לקוח</th>
                <th className="px-4 py-3 text-right font-medium">תאריך הנפקה</th>
                <th className="px-4 py-3 text-right font-medium">תאריך פקיעה</th>
                <th className="px-4 py-3 text-right font-medium">סכום</th>
                <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                <th className="px-4 py-3 text-right font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotes.map((q: any) => (
                <tr
                  key={q.id}
                  className="hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => navigate(`/quotes/${q.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs">{q.quoteNumber}</td>
                  <td className="px-4 py-3 font-medium">{q.customer?.name || '—'}</td>
                  <td className="px-4 py-3">{fmtDate(q.issueDate)}</td>
                  <td
                    className={`px-4 py-3 ${
                      isExpired(q) ? 'text-red-600 font-medium' : ''
                    }`}
                  >
                    {fmtDate(q.expiryDate)}
                  </td>
                  <td className="px-4 py-3 font-bold">{fmtCurrency(q.total ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        STATUS_CLS[q.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {STATUS_LABELS[q.status] ?? q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/quotes/${q.id}`)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        title="צפה"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={(e) => handleDownloadPdf(e, q.id)}
                        className="p-1.5 rounded hover:bg-blue-50 text-blue-500"
                        title="הורד PDF"
                      >
                        <FileDown size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteId(q.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400"
                        title="מחק"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="font-bold text-gray-900 text-lg mb-2">מחיקת הצעת מחיר</h3>
            <p className="text-sm text-gray-600 mb-4">האם אתה בטוח שברצונך למחוק הצעה זו? פעולה זו אינה ניתנת לביטול.</p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-2 rounded-lg text-sm font-medium"
              >
                {deleteMutation.isPending ? 'מוחק...' : 'מחק'}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
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
