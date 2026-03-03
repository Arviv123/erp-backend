import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Clock, CalendarDays, Check, X } from 'lucide-react';
import api from '../lib/api';
import NewLeaveRequestModal from '../components/NewLeaveRequestModal';
import RejectModal from '../components/RejectModal';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

async function getLeaveRequests() { const r = await api.get('/hr/leave-requests', { params: { status: 'PENDING' } }); return r.data; }
async function getEmployees()     { const r = await api.get('/employees', { params: { isActive: true, pageSize: 100 } }); return r.data; }
async function getHolidays()      { const r = await api.get('/hr/holidays', { params: { year: new Date().getFullYear() } }); return r.data; }
async function approveRequest(id: string) { const r = await api.patch(`/hr/leave-requests/${id}/approve`); return r.data; }

export default function HRDashboardPage() {
  const [showNew, setShowNew]       = useState(false);
  const [rejectId, setRejectId]     = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: reqData }  = useQuery({ queryKey: ['hr-pending'], queryFn: getLeaveRequests });
  const { data: empData }  = useQuery({ queryKey: ['hr-employees'], queryFn: getEmployees });
  const { data: holData }  = useQuery({ queryKey: ['hr-holidays'], queryFn: getHolidays });

  const pending:   any[] = Array.isArray(reqData) ? reqData : Array.isArray(reqData?.data) ? reqData.data : [];
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];
  const holidays:  any[] = Array.isArray(holData) ? holData : Array.isArray(holData?.data) ? holData.data : [];

  const approveMut = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-pending'] }); qc.invalidateQueries({ queryKey: ['leave-requests'] }); },
  });

  // Next holiday
  const now = new Date();
  const nextHoliday = holidays.find((h: any) => new Date(h.date) >= now);

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">לוח בקרה HR</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-rose-600" />
            <span className="text-xs text-gray-500">עובדים פעילים</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-xs text-gray-500">ממתינות לאישור</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-gray-500">החג הבא</span>
          </div>
          <p className="text-base font-bold text-gray-900">{nextHoliday?.name ?? '—'}</p>
          {nextHoliday && <p className="text-xs text-gray-400">{fmtDate(nextHoliday.date)}</p>}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-green-600" />
            <span className="text-xs text-gray-500">סה"כ חגים {new Date().getFullYear()}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{holidays.length}</p>
        </div>
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">בקשות ממתינות לאישור</h2>
            <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{req.employee?.firstName} {req.employee?.lastName}</p>
                  <p className="text-xs text-gray-500">{req.leaveType?.name} — {fmtDate(req.startDate)} עד {fmtDate(req.endDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => approveMut.mutate(req.id)} disabled={approveMut.isPending}
                    className="flex items-center gap-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2.5 py-1.5 rounded-lg font-medium transition">
                    <Check className="w-3.5 h-3.5" />אשר
                  </button>
                  <button onClick={() => setRejectId(req.id)}
                    className="flex items-center gap-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2.5 py-1.5 rounded-lg font-medium transition">
                    <X className="w-3.5 h-3.5" />דחה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employees list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">עובדים</h2>
          <button onClick={() => setShowNew(true)}
            className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-medium transition">
            + בקשת חופשה
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {employees.map((emp: any) => (
            <div key={emp.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{emp.firstName} {emp.lastName}</p>
                <p className="text-xs text-gray-500">{emp.jobTitle} • {emp.department}</p>
              </div>
              <span className="text-xs text-green-600">● פעיל</span>
            </div>
          ))}
        </div>
      </div>

      {showNew && <NewLeaveRequestModal onClose={() => setShowNew(false)} />}
      {rejectId && <RejectModal requestId={rejectId} onClose={() => setRejectId(null)} />}
    </div>
  );
}
