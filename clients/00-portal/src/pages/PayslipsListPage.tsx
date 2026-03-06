import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Printer, Eye, FileText, ChevronRight, Send } from 'lucide-react';
import api from '../lib/api';
import SendDocumentModal from '../components/SendDocumentModal';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const HEBREW_MONTHS = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];
function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

const STATUS_CLS: Record<string, string> = {
  DRAFT:    'bg-gray-100 text-gray-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID:     'bg-green-100 text-green-700',
};
const STATUS_LBL: Record<string, string> = {
  DRAFT: 'טיוטה', APPROVED: 'מאושר', PAID: 'שולם',
};

/* ─── Page ─────────────────────────────────────────────────────────────────  */

export default function PayslipsListPage() {
  const [urlParams] = useSearchParams();
  const runIdParam    = urlParams.get('runId')    ?? '';
  const periodParam   = urlParams.get('period')   ?? '';

  const [search,        setSearch]        = useState('');
  const [periodFilter,  setPeriodFilter]  = useState(periodParam);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [sendModal, setSendModal] = useState<{id:string, number:string, name:string, phone?:string, email?:string, amount?:number} | null>(null);

  // Load all payslips (backend filters by runId if provided for efficiency)
  const { data, isLoading } = useQuery({
    queryKey: ['payslips-all', runIdParam],
    queryFn: () => {
      const params = runIdParam ? `?runId=${runIdParam}` : '';
      return api.get(`/payroll/payslips${params}`).then(r => r.data?.data ?? r.data ?? []);
    },
  });

  const payslips: any[] = Array.isArray(data) ? data : [];

  // Available periods from data
  const periods = useMemo(() => {
    const set = new Set<string>(payslips.map((p: any) => p.period));
    return [...set].sort().reverse();
  }, [payslips]);

  // Client-side filter
  const filtered = useMemo(() => {
    return payslips.filter((p: any) => {
      const name = `${p.employee?.firstName ?? ''} ${p.employee?.lastName ?? ''} ${p.employee?.idNumber ?? ''}`.toLowerCase();
      if (search       && !name.includes(search.toLowerCase())) return false;
      if (periodFilter && p.period !== periodFilter)            return false;
      if (statusFilter && p.payrollRun?.status !== statusFilter) return false;
      return true;
    });
  }, [payslips, search, periodFilter, statusFilter]);

  // Open all filtered payslips in separate tabs (bulk print)
  function handlePrintAll() {
    filtered.forEach((p: any, i: number) => {
      setTimeout(() => window.open(`/payroll/payslips/${p.id}`, '_blank'), i * 120);
    });
  }

  return (
    <div dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-6">
        <Link to="/payroll" className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">כלל התלושים</h1>
          <p className="text-sm text-gray-500 mt-0.5">צפייה, הפקה והדפסה של תלושי שכר</p>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם / ת.ז."
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Period filter */}
        <select
          value={periodFilter}
          onChange={e => setPeriodFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          <option value="">כל התקופות</option>
          {periods.map(p => (
            <option key={p} value={p}>{fmtPeriod(p)}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          <option value="">כל הסטטוסים</option>
          <option value="DRAFT">טיוטה</option>
          <option value="APPROVED">מאושר</option>
          <option value="PAID">שולם</option>
        </select>

        {/* Count badge */}
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {filtered.length} תלושים
        </span>

        {/* Bulk print */}
        <button
          onClick={handlePrintAll}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition mr-auto">
          <Printer className="w-4 h-4" />
          הפק הכל ({filtered.length})
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">טוען תלושים...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <FileText className="w-8 h-8 opacity-30" />
            <p className="text-sm">אין תלושים התואמים לסינון</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ת.ז.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תקופה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ברוטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נטו</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((ps: any) => {
                const runStatus = ps.payrollRun?.status ?? 'DRAFT';
                return (
                  <tr key={ps.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {ps.employee?.firstName} {ps.employee?.lastName}
                      {ps.employee?.jobTitle && (
                        <span className="block text-xs text-gray-400 font-normal">{ps.employee.jobTitle}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {ps.employee?.idNumber ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {fmtPeriod(ps.period)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[runStatus] ?? ''}`}>
                        {STATUS_LBL[runStatus] ?? runStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {fmtCurrency(Number(ps.grossSalary))}
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">
                      {fmtCurrency(Number(ps.netSalary))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* View payslip */}
                        <Link
                          to={`/payroll/payslips/${ps.id}`}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                          <Eye className="w-3.5 h-3.5" />צפה
                        </Link>
                        {/* Print in new tab */}
                        <a
                          href={`/payroll/payslips/${ps.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium">
                          <Printer className="w-3.5 h-3.5" />הדפס
                        </a>
                        {/* Send payslip */}
                        <button
                          onClick={() => setSendModal({
                            id: ps.id,
                            number: ps.period,
                            name: `${ps.employee?.firstName ?? ''} ${ps.employee?.lastName ?? ''}`.trim(),
                            phone: ps.employee?.phone,
                            email: ps.employee?.personalEmail ?? ps.employee?.email,
                            amount: Number(ps.netSalary),
                          })}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          title="שלח לעובד"
                        >
                          <Send className="w-3.5 h-3.5" />שלח
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Summary footer ── */}
      {filtered.length > 0 && (
        <div className="mt-3 flex gap-6 text-sm text-gray-500 px-1">
          <span>
            סה"כ ברוטו:{' '}
            <strong className="text-gray-800">
              {fmtCurrency(filtered.reduce((s: number, p: any) => s + Number(p.grossSalary), 0))}
            </strong>
          </span>
          <span>
            סה"כ נטו:{' '}
            <strong className="text-green-700">
              {fmtCurrency(filtered.reduce((s: number, p: any) => s + Number(p.netSalary), 0))}
            </strong>
          </span>
        </div>
      )}

      {sendModal && (
        <SendDocumentModal
          isOpen={!!sendModal}
          onClose={() => setSendModal(null)}
          documentType="payslip"
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
