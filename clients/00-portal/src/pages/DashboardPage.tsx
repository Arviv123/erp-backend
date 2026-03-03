import { useQuery } from '@tanstack/react-query';
import { Users, FileText, DollarSign, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const INV_STATUS_STYLE: Record<string, string> = {
  DRAFT:    'bg-gray-100 text-gray-600',
  SENT:     'bg-blue-100 text-blue-700',
  PAID:     'bg-green-100 text-green-700',
  OVERDUE:  'bg-red-100 text-red-700',
  CANCELLED:'bg-gray-100 text-gray-400',
};
const INV_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלח', PAID: 'שולם', OVERDUE: 'פג תוקף', CANCELLED: 'בוטל',
};

const PAYROLL_STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};
const PAYROLL_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', APPROVED: 'מאושר', PAID: 'שולם',
};

const HEBREW_MONTHS = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

async function getEmployees()     { const r = await api.get('/employees', { params: { pageSize: 5 } }); return r.data; }
async function getInvoices()      { const r = await api.get('/invoices',  { params: { pageSize: 5 } }); return r.data; }
async function getPayrollRuns()   { const r = await api.get('/payroll/runs'); return r.data; }
async function getLeaveRequests() { const r = await api.get('/hr/leave-requests', { params: { status: 'PENDING' } }); return r.data; }

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}

function KPICard({ icon, label, value, sub, color }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: empData }     = useQuery({ queryKey: ['dash-employees'],     queryFn: getEmployees });
  const { data: invData }     = useQuery({ queryKey: ['dash-invoices'],      queryFn: getInvoices });
  const { data: payrollData } = useQuery({ queryKey: ['dash-payroll-runs'],  queryFn: getPayrollRuns });
  const { data: leaveData }   = useQuery({ queryKey: ['dash-leave'],         queryFn: getLeaveRequests });

  const employees    = Array.isArray(empData)    ? empData    : Array.isArray(empData?.data)    ? empData.data    : [];
  const invoices     = Array.isArray(invData)    ? invData    : Array.isArray(invData?.data)    ? invData.data    : [];
  const payrollRuns  = Array.isArray(payrollData)? payrollData: Array.isArray(payrollData?.data)? payrollData.data: [];
  const leaveReqs    = Array.isArray(leaveData)  ? leaveData  : Array.isArray(leaveData?.data)  ? leaveData.data  : [];

  const openInvoices    = invoices.filter((i: any) => ['SENT', 'OVERDUE'].includes(i.status));
  const totalInvoices   = invoices.reduce((s: number, i: any) => s + (i.total ?? 0), 0);
  const pendingPayroll  = payrollRuns.find((r: any) => r.status === 'APPROVED');

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">שלום, {user?.firstName} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">לוח בקרה ניהולי — {new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={<Users className="w-5 h-5 text-blue-600" />}
          label={'סה"כ עובדים'}
          value={String(employees.length)}
          sub="פעילים"
          color="bg-blue-50"
        />
        <KPICard
          icon={<FileText className="w-5 h-5 text-purple-600" />}
          label="הכנסות (חשבוניות)"
          value={fmtCurrency(totalInvoices)}
          sub="כל הזמנים"
          color="bg-purple-50"
        />
        <KPICard
          icon={<FileText className="w-5 h-5 text-orange-600" />}
          label="חשבוניות פתוחות"
          value={String(openInvoices.length)}
          sub="SENT + OVERDUE"
          color="bg-orange-50"
        />
        <KPICard
          icon={<DollarSign className="w-5 h-5 text-green-600" />}
          label="שכר ממתין"
          value={pendingPayroll ? fmtCurrency(pendingPayroll.totalGross) : '—'}
          sub={pendingPayroll ? 'לתשלום' : 'אין שכר ממתין'}
          color="bg-green-50"
        />
      </div>

      {/* Row 2: Invoices + Employees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Recent Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">חשבוניות אחרונות</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">אין חשבוניות</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">מספר</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">לקוח</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">סכום</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">סטאטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.slice(0, 5).map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2.5 text-gray-800">{inv.customer?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 font-medium">{fmtCurrency(inv.total)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INV_STATUS_STYLE[inv.status] ?? ''}`}>
                        {INV_STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Employees */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">עובדים</h2>
          </div>
          {employees.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">אין עובדים</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">שם</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">תפקיד</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">שכר ברוטו</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.slice(0, 5).map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{emp.firstName} {emp.lastName}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{emp.jobTitle}</td>
                    <td className="px-4 py-2.5 font-medium">{fmtCurrency(emp.grossSalary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 3: Payroll runs + Leave requests */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payroll runs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">ריצות שכר</h2>
          </div>
          {payrollRuns.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-gray-400 text-sm">אין ריצות שכר</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {payrollRuns.slice(0, 4).map((run: any) => (
                <div key={run.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fmtPeriod(run.period)}</p>
                    <p className="text-xs text-gray-500">{fmtCurrency(run.totalGross)} ברוטו</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYROLL_STATUS_STYLE[run.status] ?? ''}`}>
                    {PAYROLL_STATUS_LABEL[run.status] ?? run.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leave requests */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">בקשות חופשה ממתינות</h2>
            {leaveReqs.length > 0 && (
              <span className="bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {leaveReqs.length}
              </span>
            )}
          </div>
          {leaveReqs.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
              <Clock className="w-4 h-4 ml-1" />
              אין בקשות ממתינות
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {leaveReqs.slice(0, 4).map((req: any) => (
                <div key={req.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {req.employee?.firstName} {req.employee?.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmtDate(req.startDate)} — {fmtDate(req.endDate)}
                    </p>
                  </div>
                  <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full">
                    ממתין
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
