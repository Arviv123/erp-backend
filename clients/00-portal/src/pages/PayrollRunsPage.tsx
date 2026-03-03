import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Play, Eye, CheckCircle, Banknote } from 'lucide-react';
import api from '../lib/api';
import RunPayrollModal from '../components/RunPayrollModal';

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
  DRAFT:    'bg-gray-100 text-gray-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID:     'bg-green-100 text-green-700',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', APPROVED: 'מאושר', PAID: 'שולם',
};

interface PayrollRun {
  id: string;
  period: string;
  status: string;
  totalGross: number;
  totalNet: number;
  _count?: { payslips: number };
}

async function getPayrollRuns() {
  const res = await api.get('/payroll/runs');
  return res.data;
}

async function approveRun(id: string) {
  const res = await api.post(`/payroll/runs/${id}/approve`);
  return res.data;
}

async function markPaid(id: string) {
  const res = await api.post(`/payroll/runs/${id}/paid`);
  return res.data;
}

export default function PayrollRunsPage() {
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: getPayrollRuns,
  });

  const runs: PayrollRun[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const approveMut = useMutation({
    mutationFn: approveRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });

  const paidMut = useMutation({
    mutationFn: markPaid,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ריצות שכר</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          <Play className="w-4 h-4" />
          הפעל שכר חדש
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-red-500">שגיאה בטעינת נתונים</div>
        ) : runs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין ריצות שכר</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תקופה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובדים</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ברוטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטאטוס</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtPeriod(run.period)}</td>
                  <td className="px-4 py-3 text-gray-600">{run._count?.payslips ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{fmtCurrency(run.totalGross)}</td>
                  <td className="px-4 py-3 font-medium text-green-700">{fmtCurrency(run.totalNet)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/payroll/runs/${run.id}`}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                        <Eye className="w-3.5 h-3.5" />
                        צפה
                      </Link>
                      {run.status === 'DRAFT' && (
                        <button
                          onClick={() => approveMut.mutate(run.id)}
                          disabled={approveMut.isPending}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          אשר
                        </button>
                      )}
                      {run.status === 'APPROVED' && (
                        <button
                          onClick={() => paidMut.mutate(run.id)}
                          disabled={paidMut.isPending}
                          className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium">
                          <Banknote className="w-3.5 h-3.5" />
                          שולם
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <RunPayrollModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
