import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Clock, FileText, Calendar, ChevronLeft,
  TrendingUp, CheckCircle, AlertCircle,
} from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('he-IL');

const curMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

async function getMyProfile()   { const r = await api.get('/employees/me');              return r.data; }
async function getMyPayslips()  { const r = await api.get('/payroll/my-payslips');        return r.data; }
async function getMyAttend()    { const r = await api.get(`/attendance/my-summary?month=${curMonth}`); return r.data; }
async function getMyLeave()     { const r = await api.get('/hr/my-leave-balance');        return r.data; }

function QuickCard({ label, value, sub, icon: Icon, color, to }: any) {
  const inner = (
    <div className={`bg-white rounded-xl border p-5 flex items-start gap-4 hover:shadow-md transition ${to ? 'cursor-pointer' : ''}`}>
      <div className={`p-2.5 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {to && <ChevronLeft className="w-4 h-4 text-gray-300 mt-1" />}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function EmployeePortalPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(curMonth);

  const { data: profile }   = useQuery({ queryKey: ['my-profile'],        queryFn: getMyProfile });
  const { data: payslips }  = useQuery({ queryKey: ['my-payslips'],        queryFn: getMyPayslips });
  const { data: attend }    = useQuery({ queryKey: ['my-attend', month],   queryFn: getMyAttend });
  const { data: leaveData } = useQuery({ queryKey: ['my-leave'],           queryFn: getMyLeave });

  const emp          = profile ?? {};
  const allPayslips  = Array.isArray(payslips) ? payslips : [];
  const latestSlip   = allPayslips[0];
  const leaveList    = Array.isArray(leaveData) ? leaveData : [];
  const vacBalance   = leaveList.find((l: any) => l.leaveType?.code === 'VACATION');
  const att          = attend ?? {};

  return (
    <div dir="rtl">
      {/* Welcome Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          שלום, {emp.firstName ?? user?.name ?? 'עובד'} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {emp.jobTitle ?? ''} {emp.department ? `· ${emp.department}` : ''}
          · {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <QuickCard label="שכר נטו — אחרון" value={latestSlip ? fmtCurrency(Number(latestSlip.netSalary)) : '—'}
          sub={latestSlip?.period} icon={TrendingUp} color="bg-green-50 text-green-600" to="/employee/payslips" />
        <QuickCard label="ימי עבודה החודש" value={att.daysWorked ?? 0}
          sub={`${att.totalHours ?? 0} שעות`} icon={Clock} color="bg-blue-50 text-blue-600" />
        <QuickCard label="ימי חופשה נותרים" value={vacBalance ? vacBalance.totalDays - vacBalance.usedDays : '—'}
          sub="מתוך שנת 2026" icon={Calendar} color="bg-teal-50 text-teal-600" to="/employee/leave" />
        <QuickCard label="טופס 101" value={emp.creditPointsDetails?.signedAt ? '✅ חתום' : '⚠️ חסר'}
          sub={emp.creditPointsDetails?.signedAt ? fmtDate(emp.creditPointsDetails.signedAt) : 'נדרש חתימה'}
          icon={FileText} color="bg-orange-50 text-orange-600" to="/employee/form101" />
      </div>

      {/* Attendance Month Selector */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-800">נוכחות חודשית</h2>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Attendance Log */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">שעות נוכחות</h3>
            <span className="text-xs text-gray-500">{att.daysWorked ?? 0} ימים · {att.totalHours ?? 0} שעות</span>
          </div>
          {(att.logs ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-xs">אין רשומות</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {(att.logs ?? []).map((log: any) => {
                const worked = log.clockOut
                  ? Math.round((new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime()) / 60_000 - log.breakMinutes)
                  : null;
                return (
                  <div key={log.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                    <span className="text-xs text-gray-600 font-medium">{fmtDate(log.date)}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      {log.clockOut ? ` — ${new Date(log.clockOut).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ' (פתוח)'}
                    </span>
                    {worked !== null
                      ? <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{Math.floor(worked/60)}:{String(worked%60).padStart(2,'0')} ש'</span>
                      : <span className="text-xs text-orange-500">⏳ פעיל</span>
                    }
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payslips list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">תלושי שכר אחרונים</h3>
            <Link to="/employee/payslips" className="text-xs text-blue-600 hover:underline">הכל ←</Link>
          </div>
          {allPayslips.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-xs">אין תלושים</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {allPayslips.slice(0, 5).map((slip: any) => (
                <Link key={slip.id} to={`/payroll/payslips/${slip.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{slip.period}</p>
                    <p className="text-xs text-gray-500">ברוטו: {fmtCurrency(Number(slip.grossSalary))}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-green-700">{fmtCurrency(Number(slip.netSalary))}</p>
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      {slip.payrollRun?.status === 'PAID'
                        ? <><CheckCircle className="w-3 h-3 text-green-500" /><span className="text-xs text-green-600">שולם</span></>
                        : <><AlertCircle className="w-3 h-3 text-orange-500" /><span className="text-xs text-orange-600">{slip.payrollRun?.status}</span></>
                      }
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '📋 טופס 101', sub: 'הצהרת מס שנתית', to: '/employee/form101' },
          { label: '📄 תלושי שכר', sub: 'כל התלושים', to: '/employee/payslips' },
          { label: '🌴 בקשת חופשה', sub: 'הגש בקשה', to: '/hr/leave-requests' },
          { label: '⏰ שעון נוכחות', sub: 'כניסה / יציאה', to: '/attendance' },
        ].map(a => (
          <Link key={a.to} to={a.to}
            className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:bg-gray-50 hover:border-gray-300 transition shadow-sm">
            <p className="font-medium text-gray-800 text-sm">{a.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{a.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
