import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, CheckCircle, Banknote } from 'lucide-react';
import api from '../lib/api';

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

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', APPROVED: 'מאושר', PAID: 'שולם',
};

async function getRunDetail(id: string) {
  const res = await api.get(`/payroll/runs/${id}/payslips`);
  return res.data;
}

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => getRunDetail(id!),
    enabled: !!id,
  });

  const run = data?.data ?? data;
  const payslips: any[] = Array.isArray(run?.payslips) ? run.payslips : [];

  const approveMut = useMutation({
    mutationFn: () => api.post(`/payroll/runs/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-runs'] }); refetch(); },
  });

  const paidMut = useMutation({
    mutationFn: () => api.post(`/payroll/runs/${id}/paid`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-runs'] }); refetch(); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען...</div>;
  if (error || !run) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה</div>;

  const totalDeductions = (run.totalGross ?? 0) - (run.totalNet ?? 0);

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/payroll')} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{fmtPeriod(run.period)}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[run.status] ?? ''}`}>
          {STATUS_LABEL[run.status] ?? run.status}
        </span>
        <div className="flex items-center gap-2 mr-auto">
          {run.status === 'DRAFT' && (
            <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition">
              <CheckCircle className="w-4 h-4" />
              אשר ריצה
            </button>
          )}
          {run.status === 'APPROVED' && (
            <button onClick={() => paidMut.mutate()} disabled={paidMut.isPending}
              className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition">
              <Banknote className="w-4 h-4" />
              סמן כשולם
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'עובדים', value: String(payslips.length), sub: '' },
          { label: 'ברוטו סה"כ', value: fmtCurrency(run.totalGross ?? 0), sub: '' },
          { label: 'ניכויים', value: fmtCurrency(totalDeductions), sub: '' },
          { label: 'נטו סה"כ', value: fmtCurrency(run.totalNet ?? 0), sub: '' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Payslips table */}
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
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ת.ז.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ברוטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מס הכנסה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ביטוח לאומי</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פנסיה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payslips.map((ps: any) => (
                <tr key={ps.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium">
                    {ps.employee?.firstName} {ps.employee?.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{ps.employee?.idNumber ?? '—'}</td>
                  <td className="px-4 py-3">{fmtCurrency(ps.grossSalary)}</td>
                  <td className="px-4 py-3 text-red-600">({fmtCurrency(ps.incomeTax)})</td>
                  <td className="px-4 py-3 text-red-600">({fmtCurrency(ps.nationalInsuranceEmployee ?? ps.nationalInsurance ?? 0)})</td>
                  <td className="px-4 py-3 text-red-600">({fmtCurrency(ps.pensionEmployee ?? ps.pension ?? 0)})</td>
                  <td className="px-4 py-3 font-bold text-green-700">{fmtCurrency(ps.netSalary)}</td>
                  <td className="px-4 py-3">
                    <Link to={`/payroll/payslips/${ps.id}`}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                      צפה בתלוש
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
