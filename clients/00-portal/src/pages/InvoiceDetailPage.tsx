import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Printer, Send, CreditCard, XCircle, Plus, Hash, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import SendDocumentModal from '../components/SendDocumentModal';

const fmt = (n: number | string | null | undefined) => {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};
const fmtCur = (n: number | string | null | undefined) => {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(num);
};
const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'טיוטה',   cls: 'bg-gray-100 text-gray-600' },
  SENT:      { label: 'נשלחה',   cls: 'bg-blue-100 text-blue-700' },
  PAID:      { label: 'שולם',    cls: 'bg-green-100 text-green-700' },
  OVERDUE:   { label: 'באיחור',  cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'מבוטלת', cls: 'bg-gray-100 text-gray-500' },
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן', BANK_TRANSFER: 'העברה בנקאית',
  CREDIT_CARD: 'כרטיס אשראי', CHECK: "צ'ק", OTHER: 'אחר',
};

async function getInvoice(id: string) {
  const r = await api.get(`/invoices/${id}`);
  return r.data?.data ?? r.data;
}
async function getCompany() {
  const r = await api.get('/settings/company');
  return r.data?.data ?? r.data;
}

// ─── Professional Print View ─────────────────────────────────────────────────

function PrintView({ invoice, company }: { invoice: any; company: any }) {
  const addr = (company?.address ?? {}) as Record<string, string>;
  const invSettings = (company?.settings as any)?.invoiceSettings ?? {};
  const lines = (invoice.lines ?? []) as any[];
  const payments = (invoice.payments ?? []) as any[];
  const paidAmount = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const balance = Number(invoice.total) - paidAmount;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', direction: 'rtl', color: '#1a1a1a' }}>
      {/* ── Header row: company left, invoice box right ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
        <div>
          {company?.logoUrl
            ? <img src={company.logoUrl} alt="" style={{ maxHeight: 68, maxWidth: 180, objectFit: 'contain', marginBottom: 6 }} />
            : <div style={{ width: 60, height: 60, background: '#e5e7eb', borderRadius: 8, marginBottom: 6 }} />
          }
          <div style={{ fontWeight: 700, fontSize: 15 }}>{company?.name ?? ''}</div>
          {addr.street && <div style={{ fontSize: 11, color: '#555' }}>{addr.street}{addr.city ? `, ${addr.city}` : ''}{addr.zip ? ` ${addr.zip}` : ''}</div>}
          {company?.phone && <div style={{ fontSize: 11, color: '#555' }}>טל: {company.phone}</div>}
          {company?.email && <div style={{ fontSize: 11, color: '#555' }}>דוא"ל: {company.email}</div>}
          {company?.businessNumber && <div style={{ fontSize: 11, color: '#555' }}>ח.פ./ע.מ.: {company.businessNumber}</div>}
          {company?.vatNumber && <div style={{ fontSize: 11, color: '#555' }}>מע"מ: {company.vatNumber}</div>}
        </div>

        <div style={{ minWidth: 210, textAlign: 'left' }}>
          <div style={{ background: '#1d4ed8', color: 'white', padding: '10px 18px', borderRadius: 8, textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>חשבונית מס</div>
            <div style={{ fontSize: 12 }}>TAX INVOICE</div>
          </div>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['מספר:', invoice.number],
                ['תאריך:', fmtDate(invoice.date)],
                ['לתשלום עד:', fmtDate(invoice.dueDate)],
                invoice.reference ? ['אסמכתא:', invoice.reference] : null,
                invoice.paymentTerms ? ['תנאי תשלום:', invoice.paymentTerms] : null,
                invoice.allocationNumber ? ['מספר הקצאה:', invoice.allocationNumber] : null,
              ].filter(Boolean).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? '#f9fafb' : 'white' }}>
                  <td style={{ color: '#666', padding: '3px 6px' }}>{(row as string[])[0]}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'left', fontWeight: i === 0 ? 700 : 400 }}>{(row as string[])[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bill To ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>לכבוד</div>
        <div style={{ background: '#f0f7ff', borderRight: '3px solid #1d4ed8', padding: '10px 14px', borderRadius: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{invoice.customer?.name}</div>
          {invoice.customer?.email && <div style={{ fontSize: 11, color: '#555' }}>{invoice.customer.email}</div>}
          {invoice.customer?.phone && <div style={{ fontSize: 11, color: '#555' }}>טל: {invoice.customer.phone}</div>}
          {invoice.customer?.businessNumber && <div style={{ fontSize: 11, color: '#555' }}>ח.פ.: {invoice.customer.businessNumber}</div>}
        </div>
      </div>

      {/* ── Line items ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#1d4ed8', color: 'white' }}>
            <th style={{ padding: '7px 8px', textAlign: 'right', width: 28 }}>#</th>
            {invSettings.showItemCodes && <th style={{ padding: '7px 8px', textAlign: 'right', width: 70 }}>מק"ט</th>}
            <th style={{ padding: '7px 8px', textAlign: 'right' }}>תיאור</th>
            <th style={{ padding: '7px 8px', textAlign: 'center', width: 50 }}>יחידה</th>
            <th style={{ padding: '7px 8px', textAlign: 'center', width: 55 }}>כמות</th>
            <th style={{ padding: '7px 8px', textAlign: 'left', width: 90 }}>מחיר יחידה</th>
            <th style={{ padding: '7px 8px', textAlign: 'center', width: 55 }}>הנחה</th>
            <th style={{ padding: '7px 8px', textAlign: 'center', width: 50 }}>מע"מ</th>
            <th style={{ padding: '7px 8px', textAlign: 'left', width: 90 }}>סה"כ</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line: any, idx: number) => (
            <tr key={line.id} style={{ background: idx % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '6px 8px', color: '#999', textAlign: 'right' }}>{idx + 1}</td>
              {invSettings.showItemCodes && <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#666' }}>{line.sku ?? ''}</td>}
              <td style={{ padding: '6px 8px' }}>
                <div>{line.description}</div>
                {line.notes && <div style={{ fontSize: 10, color: '#999' }}>{line.notes}</div>}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'center', color: '#666' }}>{line.unit ?? ''}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{Number(line.quantity)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'left' }}>{fmt(line.unitPrice)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{Number(line.discountPercent) > 0 ? `${Number(line.discountPercent)}%` : '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{Math.round(Number(line.vatRate) * 100)}%</td>
              <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>{fmt(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals + notes ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {invoice.notes && (
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>הערות:</div>
              <div style={{ fontSize: 11, background: '#f9fafb', padding: '8px 10px', borderRadius: 4 }}>{invoice.notes}</div>
            </div>
          )}
        </div>
        <div style={{ minWidth: 230 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '4px 8px', color: '#555' }}>סכום לפני מע"מ:</td>
                <td style={{ padding: '4px 8px', textAlign: 'left' }}>{fmt(invoice.subtotal)} ₪</td>
              </tr>
              {Number(invoice.discountAmount) > 0 && (
                <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>
                  <td style={{ padding: '4px 8px' }}>הנחה ({Number(invoice.discountPercent)}%):</td>
                  <td style={{ padding: '4px 8px', textAlign: 'left' }}>-{fmt(invoice.discountAmount)} ₪</td>
                </tr>
              )}
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '4px 8px', color: '#555' }}>מע"מ:</td>
                <td style={{ padding: '4px 8px', textAlign: 'left' }}>{fmt(invoice.vatAmount)} ₪</td>
              </tr>
              <tr style={{ background: '#1d4ed8', color: 'white' }}>
                <td style={{ padding: '8px', fontWeight: 700, fontSize: 13 }}>סה"כ לתשלום:</td>
                <td style={{ padding: '8px', textAlign: 'left', fontWeight: 700, fontSize: 13 }}>{fmt(invoice.total)} ₪</td>
              </tr>
              {paidAmount > 0 && (
                <>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '4px 8px', color: '#16a34a' }}>שולם:</td>
                    <td style={{ padding: '4px 8px', textAlign: 'left', color: '#16a34a' }}>{fmt(paidAmount)} ₪</td>
                  </tr>
                  <tr style={{ background: balance > 0 ? '#fef2f2' : '#f0fdf4' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>יתרה לתשלום:</td>
                    <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a' }}>
                      {fmt(balance)} ₪
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {invSettings.bankDetails && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #e5e7eb', fontSize: 10, color: '#555' }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>פרטי תשלום:</div>
          <div style={{ whiteSpace: 'pre-line' }}>{invSettings.bankDetails}</div>
        </div>
      )}
      {invSettings.invoiceFooter && (
        <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px dashed #d1d5db', fontSize: 9, color: '#aaa', textAlign: 'center' }}>
          {invSettings.invoiceFooter}
        </div>
      )}
      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 9, color: '#ccc' }}>
        הופק ממערכת ERP — {new Date().toLocaleDateString('he-IL')}
      </div>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({ invoice, onClose, onSuccess }: { invoice: any; onClose: () => void; onSuccess: () => void }) {
  const paidSoFar = (invoice.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const balance   = Number(invoice.total) - paidSoFar;
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [ref,    setRef]    = useState('');
  const [error,  setError]  = useState('');
  const [loading, setLoad]  = useState(false);

  const save = async () => {
    if (!amount || Number(amount) <= 0) { setError('סכום לא תקין'); return; }
    setLoad(true);
    try {
      await api.post(`/invoices/${invoice.id}/pay`, { amount: Number(amount), method, date, reference: ref || undefined });
      onSuccess();
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'שגיאה'); }
    finally { setLoad(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
        <h3 className="font-bold text-gray-900 text-lg mb-1">רישום תשלום</h3>
        <p className="text-sm text-gray-500 mb-4">יתרה: <span className="font-bold text-blue-700">{fmtCur(balance)}</span></p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">סכום</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">אמצעי תשלום</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none">
              <option value="BANK_TRANSFER">העברה בנקאית</option>
              <option value="CASH">מזומן</option>
              <option value="CREDIT_CARD">כרטיס אשראי</option>
              <option value="CHECK">צ'ק</option>
              <option value="OTHER">אחר</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">תאריך</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">אסמכתא</label>
            <input type="text" value={ref} onChange={e => setRef(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2 rounded-lg text-sm font-medium">
              {loading ? 'שומר...' : 'רשום תשלום'}
            </button>
            <button onClick={onClose} className="px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const printRef   = useRef<HTMLDivElement>(null);
  const [showPay,  setShowPay]  = useState(false);
  const [view,     setView]     = useState<'print' | 'payments'>('print');
  const [showSendModal, setShowSendModal] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id], queryFn: () => getInvoice(id!), enabled: !!id,
  });
  const { data: company } = useQuery({ queryKey: ['company-settings'], queryFn: getCompany });

  const sendMut = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/send`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });
  const cancelMut = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/cancel`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const allocMut = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/allocation-number`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
    onError:    (e: any) => alert(`שגיאה בבקשת מספר הקצאה: ${e.response?.data?.error ?? e.message}`),
  });

  const simulateMut = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/allocation-number?simulate=true`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">` +
      `<title>חשבונית ${invoice?.number ?? ''}</title>` +
      `<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;` +
      `direction:rtl;color:#1a1a1a;padding:24px;max-width:900px;margin:auto;}` +
      `@media print{button{display:none!important;}}</style></head><body>${html}</body></html>`
    );
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>;
  if (!invoice)  return <div className="text-red-600 p-6">חשבונית לא נמצאה</div>;

  const status  = STATUS_META[invoice.status] ?? STATUS_META.DRAFT;
  const paidAmt = (invoice.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const balance = Number(invoice.total) - paidAmt;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/invoices')} className="text-gray-400 hover:text-gray-600">
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">חשבונית {invoice.number}</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>{status.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === 'DRAFT' && (
            <button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-3 py-2 rounded-lg">
              <Send className="w-4 h-4" /> שלח ללקוח
            </button>
          )}
          {(invoice.status === 'SENT' || invoice.status === 'OVERDUE') && balance > 0 && (
            <button onClick={() => setShowPay(true)}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg">
              <CreditCard className="w-4 h-4" /> רשום תשלום
            </button>
          )}
          {(invoice.status === 'DRAFT' || invoice.status === 'SENT') && (
            <button onClick={() => { if (window.confirm('לבטל חשבונית?')) cancelMut.mutate(); }}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200">
              <XCircle className="w-4 h-4" /> בטל
            </button>
          )}
          {/* Allocation Number Button — shown when ≥25,000 NIS and not yet obtained */}
          {Number(invoice.total) >= 25000 && !invoice.allocationNumber && (
            <button
              onClick={() => {
                const hasToken = window.confirm(
                  'לבקש מספר הקצאה מרשות המיסים?\n\nלחץ אישור להגשה לרשות המיסים, בטל לסימולציה (לבדיקה).'
                );
                if (hasToken) allocMut.mutate();
                else simulateMut.mutate();
              }}
              disabled={allocMut.isPending || simulateMut.isPending}
              className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm px-3 py-2 rounded-lg border border-orange-200 disabled:opacity-50"
              title="בקש מספר הקצאה מרשות המיסים (נדרש לחשבוניות מעל 25,000 ₪)"
            >
              {(allocMut.isPending || simulateMut.isPending)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Hash className="w-4 h-4" />}
              מספר הקצאה
            </button>
          )}
          {invoice.allocationNumber && (
            <div className="flex items-center gap-1.5 bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg border border-green-200">
              <CheckCircle2 className="w-4 h-4" />
              הקצאה: <strong>{invoice.allocationNumber}</strong>
            </div>
          )}
          <button onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm px-3 py-2 rounded-lg border border-blue-200">
            <Send className="w-4 h-4" /> שלח מסמך
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" /> הדפס / PDF
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'לפני מע"מ',     value: fmtCur(invoice.subtotal), cls: 'bg-gray-50 border-gray-200' },
          { label: 'מע"מ',          value: fmtCur(invoice.vatAmount), cls: 'bg-blue-50 border-blue-100' },
          { label: 'סה"כ חשבונית',  value: fmtCur(invoice.total),    cls: 'bg-white   border-gray-200' },
          { label: 'יתרה לתשלום',   value: fmtCur(balance),
            cls: balance > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100' },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl p-3 border ${c.cls}`}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-base font-bold ${i === 3 && balance > 0 ? 'text-red-700' : i === 3 ? 'text-green-700' : 'text-gray-800'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit text-sm">
        <button onClick={() => setView('print')}
          className={`px-4 py-2 ${view === 'print' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          מסמך לדפוס
        </button>
        <button onClick={() => setView('payments')}
          className={`px-4 py-2 ${view === 'payments' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          תשלומים ({(invoice.payments ?? []).length})
        </button>
      </div>

      {view === 'print' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div ref={printRef}>
            <PrintView invoice={invoice} company={company} />
          </div>
        </div>
      )}

      {view === 'payments' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {(invoice.payments ?? []).length === 0
            ? <div className="p-8 text-center text-gray-400">אין תשלומים רשומים</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['תאריך', 'סכום', 'אמצעי תשלום', 'אסמכתא'].map(h => (
                      <th key={h} className="px-4 py-3 text-right font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.payments.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5 font-medium text-green-700">{fmtCur(p.amount)}</td>
                      <td className="px-4 py-2.5">{METHOD_LABELS[p.method] ?? p.method}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{p.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t font-bold">
                  <tr>
                    <td className="px-4 py-2.5">סה"כ שולם</td>
                    <td className="px-4 py-2.5 text-green-700">{fmtCur(paidAmt)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )
          }
          {(invoice.status === 'SENT' || invoice.status === 'OVERDUE') && balance > 0 && (
            <div className="p-4 border-t">
              <button onClick={() => setShowPay(true)}
                className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium">
                <Plus className="w-4 h-4" /> הוסף תשלום
              </button>
            </div>
          )}
        </div>
      )}

      {showPay && (
        <PaymentModal
          invoice={invoice}
          onClose={() => setShowPay(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['invoice', id] })}
        />
      )}
      {showSendModal && (
        <SendDocumentModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          documentType="invoice"
          documentId={invoice.id}
          documentNumber={invoice.number}
          recipientName={invoice.customer?.name ?? ''}
          recipientPhone={invoice.customer?.phone}
          recipientEmail={invoice.customer?.email}
          amount={Number(invoice.total)}
        />
      )}
    </div>
  );
}
