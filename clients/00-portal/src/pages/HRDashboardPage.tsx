import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, Clock, CalendarDays, Check, X, Umbrella,
  TrendingUp, Building2, ChevronDown, ChevronUp, Plus
} from 'lucide-react';
import api from '../lib/api';
import NewLeaveRequestModal from '../components/NewLeaveRequestModal';
import RejectModal from '../components/RejectModal';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

async function getLeaveRequests(status?: string) {
  const r = await api.get('/hr/leave-requests', { params: { pageSize: 100, ...(status ? { status } : {}) } });
  return r.data;
}
async function getEmployees()  { const r = await api.get('/employees', { params: { isActive: true, pageSize: 200 } }); return r.data; }
async function getHolidays()   {
  const r = await api.get('/calendar/holidays', { params: { year: new Date().getFullYear(), jewish: true, gregorian: true } });
  // API returns { data: { year, count, holidays: [...] } }
  const arr = r.data?.data?.holidays ?? r.data?.holidays ?? r.data?.data ?? r.data;
  return Array.isArray(arr) ? arr : [];
}
async function getLeaveTypes() { const r = await api.get('/hr/leave-types'); return r.data; }
async function approveRequest(id: string) { const r = await api.patch(`/hr/leave-requests/${id}/approve`); return r.data; }

const COLORS = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500'];

function Initials({ name, index }: { name: string; index: number }) {
  const parts = name.trim().split(' ');
  const ini   = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${COLORS[index % COLORS.length]}`}>
      {ini}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const STATUS_HE: Record<string, string> = {
  PENDING: 'ממתין', APPROVED: 'אושר', REJECTED: 'נדחה',
};

export default function HRDashboardPage() {
  const [showNew, setShowNew]       = useState(false);
  const [rejectId, setRejectId]     = useState<string | null>(null);
  const [showAllEmp, setShowAllEmp] = useState(false);
  const qc = useQueryClient();

  const { data: pendingData } = useQuery({ queryKey: ['hr-pending'], queryFn: () => getLeaveRequests('PENDING') });
  const { data: allLeaveData } = useQuery({ queryKey: ['hr-all-leave'], queryFn: () => getLeaveRequests() });
  const { data: empData }     = useQuery({ queryKey: ['hr-employees'], queryFn: getEmployees });
  const { data: holData }     = useQuery({ queryKey: ['hr-holidays'],  queryFn: getHolidays });
  const { data: typeData }    = useQuery({ queryKey: ['hr-leave-types'], queryFn: getLeaveTypes });

  const pending:   any[] = Array.isArray(pendingData) ? pendingData : Array.isArray(pendingData?.data) ? pendingData.data : [];
  const allLeave:  any[] = Array.isArray(allLeaveData) ? allLeaveData : Array.isArray(allLeaveData?.data) ? allLeaveData.data : [];
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];
  const holidays:  any[] = Array.isArray(holData) ? holData : Array.isArray(holData?.data) ? holData.data : [];
  const leaveTypes: any[] = Array.isArray(typeData) ? typeData : Array.isArray(typeData?.data) ? typeData.data : [];

  const approveMut = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-pending'] });
      qc.invalidateQueries({ queryKey: ['hr-all-leave'] });
    },
  });

  // ─── Derived stats ─────────────────────────────────────────────
  const now = new Date();
  const nextHoliday = holidays.find((h: any) => new Date(h.date) >= now);

  // Department breakdown
  const deptMap: Record<string, number> = {};
  for (const emp of employees) {
    const dept = emp.department || 'ללא מחלקה';
    deptMap[dept] = (deptMap[dept] ?? 0) + 1;
  }
  const depts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);

  // Leave type stats (approved this year)
  const thisYear = now.getFullYear();
  const approvedThisYear = allLeave.filter((r: any) =>
    r.status === 'APPROVED' && new Date(r.startDate).getFullYear() === thisYear
  );
  const leaveTypeStats: Record<string, { name: string; days: number; count: number }> = {};
  for (const req of approvedThisYear) {
    const key = req.leaveType?.name ?? 'אחר';
    if (!leaveTypeStats[key]) leaveTypeStats[key] = { name: key, days: 0, count: 0 };
    leaveTypeStats[key].days  += Number(req.totalDays ?? 0);
    leaveTypeStats[key].count += 1;
  }
  const typeStats = Object.values(leaveTypeStats).sort((a, b) => b.days - a.days);
  const totalApprovedDays = typeStats.reduce((s, t) => s + t.days, 0);

  // Upcoming leaves (approved, starting in next 30 days)
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcoming = allLeave.filter((r: any) => {
    const start = new Date(r.startDate);
    return r.status === 'APPROVED' && start >= now && start <= in30;
  }).sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const displayEmp = showAllEmp ? employees : employees.slice(0, 8);

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">לוח בקרה HR</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
            <Plus className="w-4 h-4" /> בקשת חופשה
          </button>
          <Link to="/hr/leave-requests"
            className="flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition">
            <Umbrella className="w-4 h-4" /> כל הבקשות
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-rose-600" />
            <span className="text-xs text-gray-500">עובדים פעילים</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
          <p className="text-xs text-gray-400 mt-1">{depts.length} מחלקות</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-xs text-gray-500">ממתינות לאישור</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{pending.length}</p>
          {pending.length > 0 && <p className="text-xs text-yellow-600 mt-1">דורש טיפול</p>}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs text-gray-500">ימי חופשה {thisYear}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalApprovedDays}</p>
          <p className="text-xs text-gray-400 mt-1">{approvedThisYear.length} בקשות אושרו</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-gray-500">החג הבא</span>
          </div>
          <p className="text-sm font-bold text-gray-900 leading-tight">{nextHoliday?.name ?? '—'}</p>
          {nextHoliday && <p className="text-xs text-gray-400 mt-1">{fmtDate(nextHoliday.date)}</p>}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-gray-500">חגים {thisYear}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{holidays.length}</p>
          <p className="text-xs text-gray-400 mt-1">ימי שישי/שבת אינם נספרים</p>
        </div>
      </div>

      {/* Alert: pending requests */}
      {pending.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-800 font-medium">
            {pending.length} בקש{pending.length === 1 ? 'ה' : 'ות'} חופשה ממתינות לאישור שלך
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Department breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">פילוח מחלקות</h2>
          </div>
          {depts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">אין נתונים</p>
          ) : (
            <div className="space-y-2.5">
              {depts.map(([dept, count], i) => {
                const pct = employees.length ? Math.round((count / employees.length) * 100) : 0;
                return (
                  <div key={dept}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{dept}</span>
                      <span className="text-gray-500">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${COLORS[i % COLORS.length]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Leave type stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Umbrella className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">סוגי חופשה — {thisYear}</h2>
          </div>
          {typeStats.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">אין חופשות מאושרות השנה</p>
          ) : (
            <div className="space-y-2.5">
              {typeStats.map((ts, i) => {
                const pct = totalApprovedDays ? Math.round((ts.days / totalApprovedDays) * 100) : 0;
                return (
                  <div key={ts.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{ts.name}</span>
                      <span className="text-gray-500">{ts.days} ימים ({ts.count} בקשות)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${COLORS[i % COLORS.length]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming leaves */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">חופשות קרובות (30 יום)</h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">אין חופשות מתוכננות</p>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 6).map((req: any) => (
                <div key={req.id} className="flex items-center gap-2.5 py-1.5">
                  <Initials name={`${req.employee?.firstName ?? ''} ${req.employee?.lastName ?? ''}`} index={0} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {req.employee?.firstName} {req.employee?.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {req.leaveType?.name} · {fmtDate(req.startDate)}
                      {req.totalDays > 1 && ` (${req.totalDays} ימים)`}
                    </p>
                  </div>
                </div>
              ))}
              {upcoming.length > 6 && (
                <p className="text-xs text-gray-400 pt-1">+{upcoming.length - 6} נוספות</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">בקשות ממתינות לאישור</h2>
            <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Initials name={`${req.employee?.firstName ?? ''} ${req.employee?.lastName ?? ''}`} index={0} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.employee?.firstName} {req.employee?.lastName}</p>
                    <p className="text-xs text-gray-500">
                      {req.leaveType?.name} · {fmtDate(req.startDate)} – {fmtDate(req.endDate)}
                      {req.totalDays && ` (${req.totalDays} ימים)`}
                    </p>
                    {req.notes && <p className="text-xs text-gray-400 mt-0.5 italic">"{req.notes}"</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => approveMut.mutate(req.id)} disabled={approveMut.isPending}
                    className="flex items-center gap-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2.5 py-1.5 rounded-lg font-medium transition">
                    <Check className="w-3.5 h-3.5" /> אשר
                  </button>
                  <button onClick={() => setRejectId(req.id)}
                    className="flex items-center gap-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2.5 py-1.5 rounded-lg font-medium transition">
                    <X className="w-3.5 h-3.5" /> דחה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employees grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">עובדים ({employees.length})</h2>
          <Link to="/employees/new"
            className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-medium transition">
            + עובד חדש
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-100">
          {displayEmp.map((emp: any, i: number) => (
            <Link key={emp.id} to={`/employees/${emp.id}`}
              className="bg-white p-3.5 hover:bg-gray-50 transition flex items-center gap-3">
              <Initials name={`${emp.firstName ?? ''} ${emp.lastName ?? ''}`} index={i} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{emp.firstName} {emp.lastName}</p>
                <p className="text-xs text-gray-400 truncate">{emp.jobTitle || emp.department || '—'}</p>
              </div>
            </Link>
          ))}
        </div>
        {employees.length > 8 && (
          <div className="border-t border-gray-100 px-4 py-2.5 flex justify-center">
            <button onClick={() => setShowAllEmp(p => !p)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium">
              {showAllEmp
                ? <><ChevronUp className="w-3.5 h-3.5" /> הצג פחות</>
                : <><ChevronDown className="w-3.5 h-3.5" /> הצג את כל {employees.length} העובדים</>}
            </button>
          </div>
        )}
      </div>

      {showNew && <NewLeaveRequestModal onClose={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ['hr-pending'] }); }} />}
      {rejectId && <RejectModal requestId={rejectId} onClose={() => { setRejectId(null); qc.invalidateQueries({ queryKey: ['hr-pending'] }); qc.invalidateQueries({ queryKey: ['hr-all-leave'] }); }} />}
    </div>
  );
}
