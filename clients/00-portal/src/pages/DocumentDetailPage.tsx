import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Printer, Send, Check, X, RefreshCw } from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number | string | null | undefined) => {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};
const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

const TYPE_LABELS: Record<string, string> = {
  QUOTE: 'הצעת מחיר', DELIVERY_NOTE: 'תעודת משלוח',
  RECEIPT: 'קבלה', PROFORMA: 'חשבון עסקה', CREDIT_NOTE: 'הודעת זיכוי',
};
const TYPE_LABELS_EN: Record<string, string> = {
  QUOTE: 'PRICE QUOTE', DELIVERY_NOTE: 'DELIVERY NOTE',
  RECEIPT: 'RECEIPT', PROFORMA: 'PRO FORMA INVOICE', CREDIT_NOTE: 'CREDIT NOTE',
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'טיוטה',         cls: 'bg-gray-100 text-gray-600' },
  SENT:      { label: 'נשלח',          cls: 'bg-blue-100 text-blue-700' },
  ACCEPTED:  { label: 'אושרה',         cls: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'נדחתה',         cls: 'bg-red-100 text-red-700' },
  CONVERTED: { label: 'הומר לחשבונית', cls: 'bg-teal-100 text-teal-700' },
  CANCELLED: { label: 'מבוטל',         cls: 'bg-gray-100 text-gray-400' },
};

async function getDoc(id: string) {
  const r = await api.get(`/documents/${id}`);
  return r.data?.data ?? r.data;
}
async function getCompany() {
  const r = await api.get('/settings/company');
  return r.data?.data ?? r.data;
}

// ─── Print layout ─────────────────────────────────────────────────────────────

function DocPrintView({ doc, company }: { doc: any; company: any }) {
  const addr = (company?.address ?? {}) as Record<string, string>;
  const invSettings = (company?.settings as any)?.invoiceSettings ?? {};
  const lines = (doc.lines ?? []) as any[];

  const headerBg = doc.type === 'QUOTE' ? '#7c3aed' :
                   doc.type === 'DELIVERY_NOTE' ? '#ea580c' :
                   doc.type === 'RECEIPT' ? '#16a34a' : '#1d4ed8';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', direction: 'rtl', color: '#1a1a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
        <div>
          {company?.logoUrl
            ? <img src={company.logoUrl} alt="" style={{ maxHeight: 68, maxWidth: 180, objectFit: 'contain', marginBottom: 6 }} />
            : <div style={{ width: 60, height: 60, background: '#e5e7eb', borderRadius: 8, marginBottom: 6 }} />}
          <div style={{ fontWeight: 700, fontSize: 15 }}>{company?.name ?? ''}</div>
          {addr.street && <div style={{ fontSize: 11, color: '#555' }}>{addr.street}{addr.city ? `, ${addr.city}` : ''}{addr.zip ? ` ${addr.zip}` : ''}</div>}
          {company?.phone && <div style={{ fontSize: 11, color: '#555' }}>טל: {company.phone}</div>}
          {company?.email && <div style={{ fontSize: 11, color: '#555' }}>דוא"ל: {company.email}</div>}
          {company?.businessNumber && <div style={{ fontSize: 11, color: '#555' }}>ח.פ./ע.מ.: {company.businessNumber}</div>}
        </div>
        <div style={{ minWidth: 210, textAlign: 'left' }}>
          <div style={{ background: headerBg, color: 'white', padding: '10px 18px', borderRadius: 8, textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{TYPE_LABELS[doc.type] ?? doc.type}</div>
            <div style={{ fontSize: 11 }}>{TYPE_LABELS_EN[doc.type] ?? ''}</div>
          </div>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['מספר:', doc.number],
                ['תאריך:', fmtDate(doc.date)],
                doc.validUntil ? ['תוקף עד:', fmtDate(doc.validUntil)] : null,
                doc.reference  ? ['אסמכתא:', doc.reference] : null,
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

      {/* Bill to */}
      {doc.customer && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>{doc.type === 'QUOTE' ? 'לכבוד' : 'נמען'}</div>
          <div style={{ background: '#f9f9ff', borderRight: `3px solid ${headerBg}`, padding: '10px 14px', borderRadius: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{doc.customer?.name}</div>
            {doc.customer?.email && <div style={{ fontSize: 11, color: '#555' }}>{doc.customer.email}</div>}
            {doc.customer?.phone && <div style={{ fontSize: 11, color: '#555' }}>טל: {doc.customer.phone}</div>}
          </div>
        </div>
      )}

      {/* Lines */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 11 }}>
        <thead>
          <tr style={{ background: headerBg, color: 'white' }}>
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

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ flex: 1 }}>
          {doc.notes && (
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>הערות:</div>
              <div style={{ fontSize: 11, background: '#f9fafb', padding: '8px 10px', borderRadius: 4 }}>{doc.notes}</div>
            </div>
          )}
        </div>
        <div style={{ minWidth: 220 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '4px 8px', color: '#555' }}>סכום לפני מע"מ:</td>
                <td style={{ padding: '4px 8px', textAlign: 'left' }}>{fmt(doc.subtotal)} ₪</td>
              </tr>
              {Number(doc.discountAmount) > 0 && (
                <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>
                  <td style={{ padding: '4px 8px' }}>הנחה ({Number(doc.discountPercent)}%):</td>
                  <td style={{ padding: '4px 8px', textAlign: 'left' }}>-{fmt(doc.discountAmount)} ₪</td>
                </tr>
              )}
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '4px 8px', color: '#555' }}>מע"מ:</td>
                <td style={{ padding: '4px 8px', textAlign: 'left' }}>{fmt(doc.vatAmount)} ₪</td>
              </tr>
              <tr style={{ background: headerBg, color: 'white' }}>
                <td style={{ padding: '8px', fontWeight: 700, fontSize: 13 }}>סה"כ:</td>
                <td style={{ padding: '8px', textAlign: 'left', fontWeight: 700, fontSize: 13 }}>{fmt(doc.total)} ₪</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {invSettings.bankDetails && doc.type !== 'QUOTE' && (
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

// ─── Convert to Invoice Modal ─────────────────────────────────────────────────

function ConvertModal({ doc, onClose, onSuccess }: { doc: any; onClose: () => void; onSuccess: (inv: any) => void }) {
  const [dueDate, setDueDate] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoad]    = useState(false);

  const save = async () => {
    setLoad(true);
    try {
      const r = await api.post(`/documents/${doc.id}/convert`, { dueDate: dueDate || undefined });
      onSuccess(r.data?.data ?? r.data);
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'שגיאה'); }
    finally { setLoad(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
        <h3 className="font-bold text-gray-900 text-lg mb-1">המרה לחשבונית מס</h3>
        <p className="text-sm text-gray-500 mb-4">ייצור חשבונית מס על בסיס הצעה {doc.number}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">תאריך לתשלום (אופציונלי)</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
            <p className="text-xs text-gray-400 mt-1">ברירת מחדל: שוטף + 30</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={loading}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white py-2 rounded-lg text-sm font-medium">
              {loading ? 'ממיר...' : 'המר לחשבונית'}
            </button>
            <button onClick={onClose} className="px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [showConvert, setShowConvert] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', id], queryFn: () => getDoc(id!), enabled: !!id,
  });
  const { data: company } = useQuery({ queryKey: ['company-settings'], queryFn: getCompany });

  const sendMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/send`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['document', id] }),
  });
  const acceptMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/accept`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['document', id] }),
  });
  const rejectMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/reject`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['document', id] }),
  });

  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">` +
      `<title>${doc?.number ?? 'מסמך'}</title>` +
      `<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;direction:rtl;color:#1a1a1a;padding:24px;max-width:900px;margin:auto;}@media print{button{display:none!important;}}</style>` +
      `</head><body>${html}</body></html>`
    );
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>;
  if (!doc)      return <div className="text-red-600 p-6">מסמך לא נמצא</div>;

  const status = STATUS_META[doc.status] ?? STATUS_META.DRAFT;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/documents')} className="text-gray-400 hover:text-gray-600">
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">{TYPE_LABELS[doc.type] ?? doc.type} — {doc.number}</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>{status.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {doc.status === 'DRAFT' && (
            <button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg">
              <Send className="w-4 h-4" /> שלח
            </button>
          )}
          {(doc.status === 'SENT') && doc.type === 'QUOTE' && (
            <>
              <button onClick={() => acceptMut.mutate()}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg">
                <Check className="w-4 h-4" /> אושר
              </button>
              <button onClick={() => rejectMut.mutate()}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200">
                <X className="w-4 h-4" /> נדחה
              </button>
            </>
          )}
          {(doc.status === 'ACCEPTED' || doc.status === 'SENT') && doc.type === 'QUOTE' && doc.customerId && (
            <button onClick={() => setShowConvert(true)}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-2 rounded-lg">
              <RefreshCw className="w-4 h-4" /> המר לחשבונית
            </button>
          )}
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" /> הדפס / PDF
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'לפני מע"מ',  value: `${fmt(doc.subtotal)} ₪`, cls: 'bg-gray-50 border-gray-200' },
          { label: 'מע"מ',       value: `${fmt(doc.vatAmount)} ₪`, cls: 'bg-blue-50 border-blue-100' },
          { label: 'סה"כ מסמך',  value: `${fmt(doc.total)} ₪`,    cls: 'bg-white border-gray-200' },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl p-3 border ${c.cls}`}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-base font-bold text-gray-800">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Print view */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div ref={printRef}>
          <DocPrintView doc={doc} company={company} />
        </div>
      </div>

      {showConvert && (
        <ConvertModal
          doc={doc}
          onClose={() => setShowConvert(false)}
          onSuccess={inv => {
            qc.invalidateQueries({ queryKey: ['document', id] });
            if (inv?.invoice?.id) navigate(`/invoices/${inv.invoice.id}`);
          }}
        />
      )}
    </div>
  );
}
