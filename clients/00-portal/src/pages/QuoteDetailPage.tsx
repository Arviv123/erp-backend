import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Send, FileDown, Trash2, CheckCircle, XCircle, FileText, Loader2 } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number | string | null | undefined) => {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(num);
};
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'טיוטה',           cls: 'bg-gray-100 text-gray-600' },
  SENT:      { label: 'נשלח',            cls: 'bg-blue-100 text-blue-700' },
  ACCEPTED:  { label: 'אושר',            cls: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'נדחה',            cls: 'bg-red-100 text-red-700' },
  EXPIRED:   { label: 'פג תוקף',         cls: 'bg-orange-100 text-orange-700' },
  CONVERTED: { label: 'הומר לחשבונית',   cls: 'bg-purple-100 text-purple-700' },
};

async function getQuote(id: string) {
  const res = await api.get(`/quotes/${id}`);
  return res.data?.data ?? res.data;
}

// ─── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onClose,
  loading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-full mx-4">
        <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-5">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 ${
              confirmClass ?? 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : confirmLabel}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [confirmAction, setConfirmAction] = useState<
    | 'send'
    | 'convert'
    | 'accept'
    | 'reject'
    | 'delete'
    | null
  >(null);
  const [actionError, setActionError] = useState('');

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => getQuote(id!),
    enabled: !!id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['quote', id] });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/send`),
    onSuccess: () => { invalidate(); setConfirmAction(null); },
    onError: (e: any) => setActionError(e.response?.data?.error || 'שגיאה'),
  });

  const patchMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/quotes/${id}`, { status }),
    onSuccess: () => { invalidate(); setConfirmAction(null); },
    onError: (e: any) => setActionError(e.response?.data?.error || 'שגיאה'),
  });

  const convertMutation = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/convert-to-invoice`),
    onSuccess: (res) => {
      const invoiceId = res.data?.invoiceId ?? res.data?.data?.invoiceId;
      setConfirmAction(null);
      qc.invalidateQueries({ queryKey: ['quotes'] });
      if (invoiceId) navigate(`/invoices/${invoiceId}`);
      else navigate('/invoices');
    },
    onError: (e: any) => setActionError(e.response?.data?.error || 'שגיאה'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/quotes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      navigate('/quotes');
    },
    onError: (e: any) => setActionError(e.response?.data?.error || 'שגיאה'),
  });

  const handleDownloadPdf = async () => {
    try {
      const res = await api.get(`/quotes/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote-${quote?.quoteNumber ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('שגיאה בהורדת PDF');
    }
  };

  const isPending =
    sendMutation.isPending ||
    patchMutation.isPending ||
    convertMutation.isPending ||
    deleteMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400" dir="rtl">
        <Loader2 className="animate-spin ml-2" size={20} /> טוען...
      </div>
    );
  }
  if (!quote) {
    return <div className="text-red-600 p-6" dir="rtl">הצעת מחיר לא נמצאה</div>;
  }

  const statusMeta = STATUS_META[quote.status] ?? STATUS_META.DRAFT;
  const lines: any[] = quote.lines ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const isExpiredDate =
    quote.expiryDate &&
    quote.expiryDate.slice(0, 10) <= today &&
    !['ACCEPTED', 'CONVERTED'].includes(quote.status);

  // ─── Confirm dialog config ────────────────────────────────────────────────
  const confirmDialogProps: Record<
    string,
    { title: string; message: string; confirmLabel: string; confirmClass?: string; onConfirm: () => void }
  > = {
    send: {
      title: 'שליחת הצעת מחיר',
      message: 'הצעה זו תסומן כנשלחה. להמשיך?',
      confirmLabel: 'שלח',
      confirmClass: 'bg-blue-600 hover:bg-blue-700',
      onConfirm: () => sendMutation.mutate(),
    },
    convert: {
      title: 'המרה לחשבונית',
      message: 'פעולה זו תיצור חשבונית מס מהצעה זו. להמשיך?',
      confirmLabel: 'המר לחשבונית',
      confirmClass: 'bg-purple-600 hover:bg-purple-700',
      onConfirm: () => convertMutation.mutate(),
    },
    accept: {
      title: 'אישור הצעת מחיר',
      message: 'לאשר הצעה זו ידנית?',
      confirmLabel: 'אשר',
      confirmClass: 'bg-green-600 hover:bg-green-700',
      onConfirm: () => patchMutation.mutate('ACCEPTED'),
    },
    reject: {
      title: 'דחיית הצעת מחיר',
      message: 'לדחות הצעה זו?',
      confirmLabel: 'דחה',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: () => patchMutation.mutate('REJECTED'),
    },
    delete: {
      title: 'מחיקת הצעת מחיר',
      message: 'האם אתה בטוח שברצונך למחוק הצעה זו? פעולה זו אינה ניתנת לביטול.',
      confirmLabel: 'מחק',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: () => deleteMutation.mutate(),
    },
  };

  const activeDialog = confirmAction ? confirmDialogProps[confirmAction] : null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/quotes')}
            className="text-gray-400 hover:text-gray-600 transition"
            title="חזרה לרשימה"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">
            הצעת מחיר #{quote.quoteNumber}
          </h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
        </div>

        {/* Action buttons — context-dependent */}
        <div className="flex items-center gap-2 flex-wrap">
          {quote.status === 'DRAFT' && (
            <>
              <button
                onClick={() => { setActionError(''); setConfirmAction('send'); }}
                disabled={isPending}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
              >
                <Send className="w-4 h-4" /> שלח ללקוח
              </button>
              <button
                onClick={() => navigate(`/quotes/${id}/edit`)}
                disabled={isPending}
                className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm px-3 py-2 rounded-lg"
              >
                ערוך
              </button>
              <button
                onClick={() => { setActionError(''); setConfirmAction('delete'); }}
                disabled={isPending}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200"
              >
                <Trash2 className="w-4 h-4" /> מחק
              </button>
            </>
          )}

          {quote.status === 'SENT' && (
            <>
              <button
                onClick={() => { setActionError(''); setConfirmAction('convert'); }}
                disabled={isPending}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
              >
                <FileText className="w-4 h-4" /> המר לחשבונית
              </button>
              <button
                onClick={() => { setActionError(''); setConfirmAction('accept'); }}
                disabled={isPending}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
              >
                <CheckCircle className="w-4 h-4" /> אשר ידנית
              </button>
              <button
                onClick={() => { setActionError(''); setConfirmAction('reject'); }}
                disabled={isPending}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200"
              >
                <XCircle className="w-4 h-4" /> דחה
              </button>
            </>
          )}

          {quote.status === 'ACCEPTED' && (
            <button
              onClick={() => { setActionError(''); setConfirmAction('convert'); }}
              disabled={isPending}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
            >
              <FileText className="w-4 h-4" /> המר לחשבונית
            </button>
          )}

          {/* PDF download — always visible */}
          <button
            onClick={handleDownloadPdf}
            disabled={isPending}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg"
          >
            <FileDown className="w-4 h-4" /> הורד PDF
          </button>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
          {actionError}
        </div>
      )}

      {/* Info card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Customer */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">לקוח</p>
            {quote.customer ? (
              <div>
                <p className="font-semibold text-gray-900">{quote.customer.name}</p>
                {quote.customer.email && (
                  <p className="text-sm text-gray-500 mt-0.5">{quote.customer.email}</p>
                )}
                {quote.customer.phone && (
                  <p className="text-sm text-gray-500">{quote.customer.phone}</p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">—</p>
            )}
          </div>

          {/* Dates */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                תאריך הנפקה
              </p>
              <p className="text-sm text-gray-800">{fmtDate(quote.issueDate)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                תאריך פקיעת תוקף
              </p>
              <p className={`text-sm ${isExpiredDate ? 'text-red-600 font-medium' : 'text-gray-800'}`}>
                {fmtDate(quote.expiryDate)}
                {isExpiredDate && (
                  <span className="mr-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">פג תוקף</span>
                )}
              </p>
            </div>
          </div>

          {/* Notes + Terms */}
          <div className="space-y-3">
            {quote.notes && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">הערות</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">תנאים</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{quote.terms}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-medium text-gray-700">פריטים / שירותים</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3 text-right font-medium w-8">#</th>
                <th className="px-4 py-3 text-right font-medium">תיאור</th>
                <th className="px-4 py-3 text-right font-medium w-28">מקט</th>
                <th className="px-4 py-3 text-right font-medium w-20">כמות</th>
                <th className="px-4 py-3 text-right font-medium w-32">מחיר יחידה</th>
                <th className="px-4 py-3 text-right font-medium w-20">הנחה %</th>
                <th className="px-4 py-3 text-right font-medium w-20">מע"מ</th>
                <th className="px-4 py-3 text-left font-medium w-32">סה"כ שורה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    אין פריטים
                  </td>
                </tr>
              ) : (
                lines.map((line: any, idx: number) => (
                  <tr key={line.id ?? idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-center">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{line.description}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{line.sku || '—'}</td>
                    <td className="px-4 py-3 text-center">{Number(line.quantity)}</td>
                    <td className="px-4 py-3">{fmtCurrency(line.unitPrice)}</td>
                    <td className="px-4 py-3 text-center">
                      {Number(line.discount) > 0 ? `${Number(line.discount)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {Math.round(Number(line.vatRate) * 100)}%
                    </td>
                    <td className="px-4 py-3 text-left font-semibold text-gray-800">
                      {fmtCurrency(line.lineTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals section */}
        <div className="border-t border-gray-200 p-5 bg-gray-50">
          <div className="flex justify-end">
            <div className="text-sm space-y-1.5 min-w-[260px]">
              <div className="flex justify-between">
                <span className="text-gray-500">סכום ביניים:</span>
                <span className="font-medium">{fmtCurrency(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">מע"מ:</span>
                <span className="font-medium">{fmtCurrency(quote.vatAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-bold text-gray-800">סה"כ לתשלום:</span>
                <span className="font-bold text-lg text-blue-700">{fmtCurrency(quote.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm dialogs */}
      {confirmAction && activeDialog && (
        <ConfirmDialog
          title={activeDialog.title}
          message={activeDialog.message}
          confirmLabel={activeDialog.confirmLabel}
          confirmClass={activeDialog.confirmClass}
          onConfirm={activeDialog.onConfirm}
          onClose={() => setConfirmAction(null)}
          loading={isPending}
        />
      )}
    </div>
  );
}
