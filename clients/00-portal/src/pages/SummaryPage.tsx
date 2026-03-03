import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

async function getEmployees() { const r = await api.get('/employees', { params: { isActive: true, pageSize: 100 } }); return r.data; }
async function getSummary(id: string, month: string) { const r = await api.get(`/attendance/summary/${id}`, { params: { month } }); return r.data; }

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export default function SummaryPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedId, setSelectedId] = useState('');
  const [month, setMonth]           = useState(defaultMonth);

  const { data: empData } = useQuery({ queryKey: ['att-emp-list'], queryFn: getEmployees });
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];

  const { data: sumData, isLoading } = useQuery({
    queryKey: ['att-summary', selectedId, month],
    queryFn: () => getSummary(selectedId, month),
    enabled: !!selectedId,
  });

  const summary = sumData?.data ?? sumData;
  const logs: any[] = Array.isArray(summary?.logs) ? summary.logs : [];

  const [mYear, mMonth] = month.split('-');
  const periodLabel = `${HEBREW_MONTHS[Number(mMonth)]} ${mYear}`;

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">סיכום חודשי</h1>
      <div className="flex gap-3 mb-6">
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
          <option value="">בחר עובד...</option>
          {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
        </select>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>

      {!selectedId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center h-40 text-gray-400">בחר עובד</div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
      ) : !summary ? (
        <div className="flex items-center justify-center h-40 text-gray-400">אין נתונים</div>
      ) : (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">ימי עבודה</p>
              <p className="text-2xl font-bold text-gray-900">{summary.daysWorked ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">שעות סה"כ</p>
              <p className="text-2xl font-bold text-gray-900">{fmtHours((summary.totalMinutes ?? 0))}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">תקופה</p>
              <p className="text-base font-bold text-gray-900">{periodLabel}</p>
            </div>
          </div>

          {/* Logs */}
          {logs.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center h-32 text-gray-400">
              אין נוכחות לתקופה זו
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">כניסה</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">יציאה</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">הפסקה</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">שעות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log: any, i: number) => {
                    const inT  = log.clockIn  ? new Date(log.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
                    const outT = log.clockOut ? new Date(log.clockOut).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
                    const dateStr = log.date ?? (log.clockIn ? new Date(log.clockIn).toLocaleDateString('he-IL') : '—');
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">{dateStr}</td>
                        <td className="px-4 py-2.5">{inT}</td>
                        <td className="px-4 py-2.5">{outT}</td>
                        <td className="px-4 py-2.5">{log.breakMinutes ? `${log.breakMinutes} דק` : '—'}</td>
                        <td className="px-4 py-2.5 font-medium">{log.workMinutes ? fmtHours(log.workMinutes) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
