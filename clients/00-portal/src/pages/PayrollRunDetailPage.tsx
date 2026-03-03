import { useState, Fragment } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, CheckCircle2, Trash2, Download, ChevronDown, ChevronUp,
  Pencil, FileText, AlertTriangle, Printer,
} from 'lucide-react';
import api from '../lib/api';
import EditPayslipModal from '../components/EditPayslipModal';
import BankPaymentModal from '../components/BankPaymentModal';

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

const STEPS = ['DRAFT', 'APPROVED', 'PAID'] as const;
const STEP_LABEL: Record<string, string> = { DRAFT: 'טיוטה', APPROVED: 'מאושר', PAID: 'שולם' };

async function getRunDetail(id: string) {
  const res = await api.get(`/payroll/runs/${id}/payslips`);
  return res.data;
}

/* ─── Progress Bar ─────────────────────────────────────────────────────────── */

function ProgressBar({ status }: { status: string }) {
  const current = STEPS.indexOf(status as any);
  return (
    <div className="flex items-center gap-0 mt-3">
      {STEPS.map((step, idx) => {
        const done    = idx < current;
        const active  = idx === current;
        const pending = idx > current;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className={`flex items-center gap-1.5 ${pending ? 'opacity-40' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${active  ? 'bg-blue-600 border-blue-600 text-white'
                : done    ? 'bg-green-500 border-green-500 text-white'
                           : 'bg-white border-gray-300 text-gray-400'}`}>
                {done ? '✓' : idx + 1}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-blue-700' : done ? 'text-green-700' : 'text-gray-400'}`}>
                {STEP_LABEL[step]}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${idx < current ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Breakdown row ────────────────────────────────────────────────────────── */

function BreakdownRow({ ps }: { ps: any }) {
  const bd = ps.breakdown ?? {};
  const adj = bd.adjustments ?? {};
  const snap = bd.employeeSnapshot ?? {};

  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'שכר יסוד', value: fmtCurrency(snap.grossSalary ?? ps.grossSalary ?? 0) },
    ...(adj.ot125Hours > 0 ? [{ label: `שע"נ 125% (${adj.ot125Hours} ש')`, value: fmtCurrency(bd.ot125Pay ?? 0) }] : []),
    ...(adj.ot150Hours > 0 ? [{ label: `שע"נ 150% (${adj.ot150Hours} ש')`, value: fmtCurrency(bd.ot150Pay ?? 0) }] : []),
    ...(bd.travelAllowance > 0 ? [{ label: `נסיעות (${adj.travelDays ?? 0} ימים)`, value: fmtCurrency(bd.travelAllowance ?? 0) }] : []),
    ...(bd.recupPay > 0 ? [{ label: 'הבראה', value: fmtCurrency(bd.recupPay ?? 0) }] : []),
    ...(adj.bonus > 0 ? [{ label: 'בונוס', value: fmtCurrency(adj.bonus ?? 0) }] : []),
    { label: 'ברוטו חייב', value: fmtCurrency(ps.grossSalary ?? 0) },
    { label: 'מס הכנסה', value: `(${fmtCurrency(ps.incomeTax ?? 0)})`, color: 'text-red-600' },
    { label: 'ביטוח לאומי עובד', value: `(${fmtCurrency(ps.nationalInsuranceEmployee ?? ps.nationalInsurance ?? 0)})`, color: 'text-red-600' },
    { label: 'ביטוח בריאות', value: `(${fmtCurrency(ps.healthInsurance ?? 0)})`, color: 'text-red-600' },
    ...(ps.pensionEmployee > 0 ? [{ label: `פנסיה עובד (${snap.pensionEmployee ?? 6}%)`, value: `(${fmtCurrency(ps.pensionEmployee ?? ps.pension ?? 0)})`, color: 'text-red-600' }] : []),
    ...(adj.manualDeduction > 0 ? [{ label: 'ניכוי ידני', value: `(${fmtCurrency(adj.manualDeduction)})`, color: 'text-red-600' }] : []),
  ];

  return (
    <tr>
      <td colSpan={8} className="px-4 pb-4 pt-0">
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between text-xs">
                <span className="text-gray-500">{r.label}:</span>
                <span className={`font-medium ${r.color ?? 'text-gray-800'}`}>{r.value}</span>
              </div>
            ))}
          </div>
          {snap.pensionEmployer > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 flex gap-6 text-xs text-gray-500">
              <span>מעסיק — פנסיה: {fmtCurrency(ps.pensionEmployer ?? 0)}</span>
              <span>פיצויים: {fmtCurrency(ps.severancePay ?? 0)}</span>
              <span>ב.ל. מעסיק: {fmtCurrency(ps.nationalInsuranceEmployer ?? 0)}</span>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Main Page ────────────────────────────────────────────────────────────── */

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editingPayslip, setEditingPayslip] = useState<any>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => getRunDetail(id!),
    enabled: !!id,
  });

  const run = data?.data ?? data;
  const payslips: any[] = Array.isArray(run?.payslips) ? run.payslips : [];

  const approveMut = useMutation({
    mutationFn: () => api.post(`/payroll/runs/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      refetch();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/payroll/runs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      navigate('/payroll');
    },
  });

  function toggleRow(psId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(psId) ? next.delete(psId) : next.add(psId);
      return next;
    });
  }

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען...</div>;
  if (error || !run) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה בטעינת ריצת השכר</div>;

  const totalDeductions = (run.totalGross ?? 0) - (run.totalNet ?? 0);
  const status: string = run.status ?? 'DRAFT';

  return (
    <div dir="rtl">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/payroll')} className="text-gray-400 hover:text-gray-600">
            <ChevronRight className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">שכר — {fmtPeriod(run.period)}</h1>
        </div>
        <div className="mr-7">
          <ProgressBar status={status} />
        </div>
      </div>

      {/* ── Action buttons by status ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        {status === 'DRAFT' && (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-600 text-sm font-medium px-4 py-2 rounded-lg transition">
              <Trash2 className="w-4 h-4" />מחק ריצה
            </button>
            <button
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              <CheckCircle2 className="w-4 h-4" />
              {approveMut.isPending ? 'מאשר...' : 'אשר ריצה'}
            </button>
          </>
        )}
        {(status === 'APPROVED' || status === 'PAID') && (
          <>
            <button
              onClick={() => setShowBankModal(true)}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
              <Download className="w-4 h-4" />ייצוא לבנק
            </button>
            <Link
              to={`/payroll/payslips?runId=${id}&period=${run.period}`}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              <Printer className="w-4 h-4" />הפק תלושים ({payslips.length})
            </Link>
          </>
        )}
        {status === 'PAID' && (
          <Link to={`/payroll/report102?period=${run.period}`}
            className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition">
            <FileText className="w-4 h-4" />דוח 102
          </Link>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'עובדים', value: String(payslips.length) },
          { label: 'ברוטו סה"כ', value: fmtCurrency(run.totalGross ?? 0) },
          { label: 'ניכויים', value: fmtCurrency(totalDeductions) },
          { label: 'נטו סה"כ', value: fmtCurrency(run.totalNet ?? 0) },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Payslips table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">תלושי שכר</h2>
        </div>

        {payslips.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400">אין תלושים</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-6 px-3 py-3" />
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ברוטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מס הכנסה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ב.ל. + בריאות</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פנסיה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נטו</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payslips.map((ps: any) => {
                const expanded = expandedRows.has(ps.id);
                const niTotal = (ps.nationalInsuranceEmployee ?? ps.nationalInsurance ?? 0) + (ps.healthInsurance ?? 0);
                return (
                  <Fragment key={ps.id}>
                    <tr
                      className="hover:bg-gray-50 transition cursor-pointer"
                      onClick={() => toggleRow(ps.id)}>
                      <td className="px-3 py-3 text-gray-400">
                        {expanded
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {ps.employee?.firstName} {ps.employee?.lastName}
                      </td>
                      <td className="px-4 py-3">{fmtCurrency(ps.grossSalary)}</td>
                      <td className="px-4 py-3 text-red-600">({fmtCurrency(ps.incomeTax)})</td>
                      <td className="px-4 py-3 text-red-600">({fmtCurrency(niTotal)})</td>
                      <td className="px-4 py-3 text-red-600">({fmtCurrency(ps.pensionEmployee ?? ps.pension ?? 0)})</td>
                      <td className="px-4 py-3 font-bold text-green-700">{fmtCurrency(ps.netSalary)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {status === 'DRAFT' && (
                            <button
                              onClick={() => setEditingPayslip(ps)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                              <Pencil className="w-3.5 h-3.5" />ערוך
                            </button>
                          )}
                          <Link to={`/payroll/payslips/${ps.id}`}
                            className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                            צפה
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {expanded && <BreakdownRow ps={ps} />}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">סה"כ</td>
                <td className="px-4 py-3 font-semibold">{fmtCurrency(run.totalGross ?? 0)}</td>
                <td colSpan={3} />
                <td className="px-4 py-3 font-bold text-green-700">{fmtCurrency(run.totalNet ?? 0)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Delete confirm dialog ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">מחיקת ריצת שכר</h3>
                <p className="text-xs text-gray-500">פעולה זו אינה הפיכה</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-5">
              האם למחוק את ריצת השכר <strong>{fmtPeriod(run.period)}</strong> ואת כל {payslips.length} התלושים שלה?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { deleteMut.mutate(); setConfirmDelete(false); }}
                disabled={deleteMut.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2 rounded-lg text-sm transition">
                {deleteMut.isPending ? 'מוחק...' : 'מחק'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Payslip Modal ── */}
      {editingPayslip && (
        <EditPayslipModal
          payslip={editingPayslip}
          employee={editingPayslip.employee}
          runId={id!}
          onClose={() => { setEditingPayslip(null); refetch(); }}
        />
      )}

      {/* ── Bank Payment Modal ── */}
      {showBankModal && (
        <BankPaymentModal
          run={run}
          payslips={payslips}
          onClose={() => { setShowBankModal(false); refetch(); }}
        />
      )}
    </div>
  );
}
