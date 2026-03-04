import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, FileText, Clock, AlertTriangle, TrendingUp,
  Plus, Play, UserPlus, ArrowLeft, CheckCircle, Banknote,
  ShoppingCart, Package,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const fmtC = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'טיוטה',    cls: 'bg-gray-100 text-gray-600' },
  SENT:     { label: 'נשלח',     cls: 'bg-blue-100 text-blue-700' },
  PAID:     { label: 'שולם',     cls: 'bg-green-100 text-green-700' },
  OVERDUE:  { label: 'פגת תוקף', cls: 'bg-red-100 text-red-700' },
  CANCELLED:{ label: 'בוטל',     cls: 'bg-gray-100 text-gray-400' },
};

const PAYROLL_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT:    { label: 'טיוטה',  cls: 'bg-gray-100 text-gray-600' },
  APPROVED: { label: 'מאושר', cls: 'bg-blue-100 text-blue-700' },
  PAID:     { label: 'שולם',   cls: 'bg-green-100 text-green-700' },
};

async function getDashboardData() {
  const [emps, invs, runs, leave, bills] = await Promise.all([
    api.get('/employees', { params: { pageSize: 200 } }).then(r => r.data),
    api.get('/invoices',  { params: { pageSize: 10 } }).then(r => r.data),
    api.get('/payroll/runs').then(r => r.data),
    api.get('/hr/leave-requests', { params: { status: 'PENDING', pageSize: 20 } }).then(r => r.data),
    api.get('/purchasing/bills', { params: { pageSize: 10 } }).then(r => r.data).catch(() => ({ data: [] })),
  ]);
  return { emps, invs, runs, leave, bills };
}

function KPI({ label, value, sub, icon: Icon, color, to }: {
  label: string; value: string; sub?: string; icon: any; color: string; to?: string;
}) {
  const content = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-4 hover:shadow-md transition">
      <div className={`p-2.5 rounded-xl ${color} flex-shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : <div>{content}</div>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-all'], queryFn: getDashboardData });

  const employees   = Array.isArray(data?.emps)   ? data!.emps  : Array.isArray(data?.emps?.data)  ? data!.emps.data  : [];
  const invoices    = Array.isArray(data?.invs)   ? data!.invs  : Array.isArray(data?.invs?.data)  ? data!.invs.data  : [];
  const payrollRuns = Array.isArray(data?.runs)   ? data!.runs  : Array.isArray(data?.runs?.data)  ? data!.runs.data  : [];
  const leaveReqs   = Array.isArray(data?.leave)  ? data!.leave : Array.isArray(data?.leave?.data) ? data!.leave.data : [];
  const bills       = Array.isArray(data?.bills)  ? data!.bills : Array.isArray(data?.bills?.data) ? data!.bills.data : [];

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // AR metrics
  const arInvoices = invoices.filter((i: any) => ['SENT', 'OVERDUE'].includes(i.status));
  const arTotal    = arInvoices.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
  const overdueInv = invoices.filter((i: any) => i.status === 'OVERDUE');
  const ytdRevenue = invoices
    .filter((i: any) => i.status === 'PAID' && i.date?.startsWith(String(now.getFullYear())))
    .reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);

  // AP metrics
  const apBills = bills.filter((b: any) => ['POSTED', 'PARTIALLY_PAID'].includes(b.status));
  const apTotal = apBills.reduce((s: number, b: any) => s + Number(b.total ?? 0), 0);

  // Payroll
  const currentRun  = payrollRuns.find((r: any) => r.period === currentPeriod);
  const pendingRun  = payrollRuns.find((r: any) => r.status === 'APPROVED');
  const lastPaidRun = payrollRuns.find((r: any) => r.status === 'PAID');

  // Smart alerts
  const alerts: { msg: string; color: string; icon: any; to?: string }[] = [];
  if (overdueInv.length > 0)
    alerts.push({ msg: `${overdueInv.length} חשבוניות פגת תוקף — ${fmtC(overdueInv.reduce((s: number, i: any) => s + Number(i.total), 0))} ממתין`, color: 'border-red-300 bg-red-50 text-red-800', icon: AlertTriangle, to: '/invoices' });
  if (!currentRun)
    alerts.push({ msg: `שכר ${HEBREW_MONTHS[now.getMonth() + 1]} טרם הופעל — יש להפעיל עד ה-9 לחודש הבא`, color: 'border-amber-300 bg-amber-50 text-amber-800', icon: AlertTriangle, to: '/payroll' });
  if (leaveReqs.length > 0)
    alerts.push({ msg: `${leaveReqs.length} בקשות חופשה ממתינות לאישורך`, color: 'border-blue-300 bg-blue-50 text-blue-800', icon: Clock, to: '/hr/leave-requests' });
  if (pendingRun)
    alerts.push({ msg: `שכר ${fmtPeriod(pendingRun.period)} מאושר — ממתין לתשלום (${fmtC(pendingRun.totalNet ?? 0)})`, color: 'border-green-300 bg-green-50 text-green-800', icon: CheckCircle, to: `/payroll/runs/${pendingRun.id}` });

  const quickActions = [
    { label: 'חשבונית חדשה', icon: Plus,        color: 'bg-purple-600 hover:bg-purple-700', to: '/invoices/new' },
    { label: 'הפעל שכר',     icon: Play,        color: 'bg-green-600 hover:bg-green-700',   to: '/payroll/worksheet' },
    { label: 'עובד חדש',     icon: UserPlus,    color: 'bg-blue-600 hover:bg-blue-700',     to: '/employees/new' },
    { label: 'רשום נוכחות',  icon: Clock,       color: 'bg-indigo-600 hover:bg-indigo-700', to: '/attendance' },
    { label: 'קופה רושמת',   icon: ShoppingCart, color: 'bg-orange-600 hover:bg-orange-700', to: '/pos' },
    { label: 'חשבונית ספק',  icon: Package,     color: 'bg-teal-600 hover:bg-teal-700',     to: '/purchasing/bills/new' },
  ];

  if (isLoading) {
    return (
      <div dir="rtl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">שלום, {user?.firstName}</h1>
        <div className="flex items-center justify-center h-40 text-gray-400">טוען נתונים...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">שלום, {user?.firstName}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {now.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) =>
            a.to ? (
              <Link key={i} to={a.to}
                className={`flex items-center gap-2.5 border rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-80 ${a.color}`}>
                <a.icon className="w-4 h-4 flex-shrink-0" />
                {a.msg}
                <ArrowLeft className="w-3.5 h-3.5 mr-auto" />
              </Link>
            ) : (
              <div key={i} className={`flex items-center gap-2.5 border rounded-xl px-4 py-2.5 text-sm font-medium ${a.color}`}>
                <a.icon className="w-4 h-4 flex-shrink-0" />
                {a.msg}
              </div>
            )
          )}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="עובדים פעילים"    value={String(employees.length)}                    sub="עובדים רשומים"              icon={Users}      color="bg-blue-50 text-blue-600"    to="/employees" />
        <KPI label="חייבים לגבייה"    value={fmtC(arTotal)}                               sub={`${arInvoices.length} חשבוניות פתוחות`} icon={FileText}   color="bg-purple-50 text-purple-600" to="/invoices/aging" />
        <KPI label="חוב לספקים"       value={fmtC(apTotal)}                               sub={`${apBills.length} חשבוניות ספק`}       icon={Banknote}   color="bg-orange-50 text-orange-600" to="/purchasing/ap-aging" />
        <KPI label={`הכנסות ${now.getFullYear()}`} value={fmtC(ytdRevenue)}              sub="חשבוניות שולמו"             icon={TrendingUp} color="bg-green-50 text-green-600"  to="/accounting" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">פעולות מהירות</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {quickActions.map(a => (
            <Link key={a.label} to={a.to}
              className={`flex flex-col items-center gap-1.5 ${a.color} text-white rounded-xl py-3 px-2 text-xs font-medium transition text-center`}>
              <a.icon className="w-5 h-5" />
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent invoices */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">חשבוניות אחרונות</h2>
            <Link to="/invoices" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              הכל <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-sm gap-2">
              <FileText className="w-6 h-6 text-gray-200" />
              אין חשבוניות —{' '}
              <Link to="/invoices/new" className="text-blue-600 hover:underline">צור חשבונית ראשונה</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">מספר</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">לקוח</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">תאריך</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">סכום</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">סטאטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.slice(0, 7).map((inv: any) => {
                  const st = INV_STATUS[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                        <Link to={`/invoices/${inv.id}`} className="hover:text-blue-600">{inv.number ?? inv.invoiceNumber}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-800 truncate max-w-[120px]">{inv.customer?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(inv.date)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{fmtC(Number(inv.total ?? 0))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st?.cls ?? ''}`}>{st?.label ?? inv.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Payroll status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">שכר</h2>
              <Link to="/payroll" className="text-xs text-blue-600 hover:underline">ניהול</Link>
            </div>
            <div className="px-4 py-3 space-y-2">
              {payrollRuns.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">
                  אין ריצות שכר —{' '}
                  <Link to="/payroll/worksheet" className="text-blue-600 hover:underline">הפעל שכר</Link>
                </p>
              ) : payrollRuns.slice(0, 3).map((run: any) => {
                const st = PAYROLL_STATUS[run.status];
                return (
                  <Link key={run.id} to={`/payroll/runs/${run.id}`}
                    className="flex items-center justify-between hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{fmtPeriod(run.period)}</p>
                      <p className="text-xs text-gray-400">{fmtC(Number(run.totalGross ?? 0))} · {run._count?.payslips ?? 0} עובדים</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${st?.cls ?? ''}`}>{st?.label ?? run.status}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Pending leave */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">חופשות ממתינות</h2>
              {leaveReqs.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">{leaveReqs.length}</span>
              )}
            </div>
            {leaveReqs.length === 0 ? (
              <div className="flex items-center justify-center h-14 text-gray-400 text-xs">אין בקשות ממתינות</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {leaveReqs.slice(0, 4).map((req: any) => (
                  <Link key={req.id} to="/hr/leave-requests"
                    className="flex items-start justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                    <div>
                      <p className="text-xs font-medium text-gray-900">{req.employee?.firstName} {req.employee?.lastName}</p>
                      <p className="text-xs text-gray-400">{req.leaveType?.name} · {fmtDate(req.startDate)}</p>
                    </div>
                    <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">{req.totalDays}י'</span>
                  </Link>
                ))}
                {leaveReqs.length > 4 && (
                  <Link to="/hr/leave-requests" className="block text-center text-xs text-blue-600 py-2 hover:underline">
                    + עוד {leaveReqs.length - 4}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Financial snapshot row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {lastPaidRun && (
          <Link to={`/payroll/runs/${lastPaidRun.id}`}
            className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 hover:shadow-md transition">
            <p className="text-xs font-semibold text-green-700 mb-1">שכר אחרון ששולם</p>
            <p className="text-xl font-bold text-green-900">{fmtC(Number(lastPaidRun.totalNet ?? 0))}</p>
            <p className="text-xs text-green-600 mt-0.5">{fmtPeriod(lastPaidRun.period)} · {lastPaidRun._count?.payslips ?? 0} עובדים</p>
          </Link>
        )}
        <Link to="/accounting" className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl p-4 hover:shadow-md transition">
          <p className="text-xs font-semibold text-purple-700 mb-1">הכנסות שנה נוכחית</p>
          <p className="text-xl font-bold text-purple-900">{fmtC(ytdRevenue)}</p>
          <p className="text-xs text-purple-600 mt-0.5">חשבוניות שולמו {now.getFullYear()}</p>
        </Link>
        <Link to="/invoices/aging" className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 hover:shadow-md transition">
          <p className="text-xs font-semibold text-orange-700 mb-1">חייבים פתוחים</p>
          <p className="text-xl font-bold text-orange-900">{fmtC(arTotal)}</p>
          <p className="text-xs text-orange-600 mt-0.5">
            {arInvoices.length} חשבוניות · {overdueInv.length > 0 ? `${overdueInv.length} פגת תוקף` : 'ללא פיגורים'}
          </p>
        </Link>
      </div>
    </div>
  );
}
