import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Printer } from 'lucide-react';
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

async function getPayslip(id: string) {
  const res = await api.get(`/payroll/payslips/${id}`);
  return res.data;
}

export default function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['payslip', id],
    queryFn: () => getPayslip(id!),
    enabled: !!id,
  });

  const ps = data?.data ?? data;

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען תלוש...</div>;
  if (error || !ps) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה בטעינת תלוש</div>;

  const emp = ps.employee ?? {};

  return (
    <div dir="rtl">
      {/* Actions - no print */}
      <div className="no-print flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">תלוש שכר</h1>
        <button
          onClick={() => window.print()}
          className="mr-auto flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          <Printer className="w-4 h-4" />
          הדפס
        </button>
      </div>

      {/* Payslip */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-lg mx-auto p-8 print:shadow-none print:border-none">
        {/* Header */}
        <div className="text-center border-b-2 border-gray-200 pb-4 mb-6">
          <h2 className="text-lg font-bold text-gray-900">תלוש שכר</h2>
          <p className="text-gray-600 mt-1">
            {ps.payrollRun?.period ? fmtPeriod(ps.payrollRun.period) : ''}
          </p>
        </div>

        {/* Employee info */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-6 bg-gray-50 rounded-lg p-4">
          <div>
            <span className="text-gray-500">שם העובד: </span>
            <span className="font-medium">{emp.firstName} {emp.lastName}</span>
          </div>
          <div>
            <span className="text-gray-500">מספר ת.ז.: </span>
            <span className="font-medium font-mono">{emp.idNumber ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">תפקיד: </span>
            <span className="font-medium">{emp.jobTitle ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">מחלקה: </span>
            <span className="font-medium">{emp.department ?? '—'}</span>
          </div>
        </div>

        {/* Earnings */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">הכנסות</h3>
          <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
            <span className="text-gray-700">שכר ברוטו</span>
            <span className="font-semibold">{fmtCurrency(ps.grossSalary)}</span>
          </div>
        </div>

        {/* Deductions */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">ניכויים</h3>
          {[
            { label: 'מס הכנסה', value: ps.incomeTax },
            { label: 'ביטוח לאומי עובד', value: ps.nationalInsuranceEmployee ?? ps.nationalInsurance },
            { label: `פנסיה עובד ${ps.pensionEmployeeRate ? ps.pensionEmployeeRate + '%' : ''}`, value: ps.pensionEmployee ?? ps.pension },
          ].filter(d => d.value).map(d => (
            <div key={d.label} className="flex justify-between text-sm py-1.5 border-b border-gray-100">
              <span className="text-gray-700">{d.label}</span>
              <span className="text-red-600">({fmtCurrency(d.value)})</span>
            </div>
          ))}
        </div>

        {/* Net */}
        <div className="flex justify-between text-base font-bold border-t-2 border-gray-200 pt-3 mb-6">
          <span>שכר נטו לתשלום</span>
          <span className="text-green-700">{fmtCurrency(ps.netSalary)}</span>
        </div>

        {/* Employer */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-blue-600 uppercase mb-2">עלויות מעסיק</h3>
          {[
            { label: `פנסיה מעסיק ${ps.pensionEmployerRate ? ps.pensionEmployerRate + '%' : ''}`, value: ps.pensionEmployer },
            { label: 'ביטוח לאומי מעסיק', value: ps.nationalInsuranceEmployer },
            { label: 'פיצויים', value: ps.severancePay },
          ].filter(d => d.value).map(d => (
            <div key={d.label} className="flex justify-between text-sm py-1">
              <span className="text-blue-700">{d.label}</span>
              <span className="font-medium text-blue-900">{fmtCurrency(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
