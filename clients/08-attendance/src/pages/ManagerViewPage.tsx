import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import api from '../lib/api';

async function getEmployees() { const r = await api.get('/employees', { params: { isActive: true, pageSize: 100 } }); return r.data; }
async function getAttendance(params: Record<string, string>) { const r = await api.get('/attendance', { params: { ...params, pageSize: 200 } }); return r.data; }

export default function ManagerViewPage() {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultTo   = now.toISOString().split('T')[0];

  const [selectedId, setSelectedId] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo]     = useState(defaultTo);

  const { data: empData } = useQuery({ queryKey: ['mgr-employees'], queryFn: getEmployees });
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];

  const params: Record<string, string> = { from, to };
  if (selectedId) params.employeeId = selectedId;

  const { data: attData, isLoading } = useQuery({
    queryKey: ['mgr-attendance', params],
    queryFn: () => getAttendance(params),
  });

  const logs: any[] = Array.isArray(attData) ? attData : Array.isArray(attData?.data) ? attData.data : [];

  const downloadCSV = () => {
    const header = 'עובד,תאריך,כניסה,יציאה,הפסקה (דקות),שעות עבודה';
    const rows = logs.map(l => {
      const emp = employees.find(e => e.id === l.employeeId);
      const name = emp ? `${emp.firstName} ${emp.lastName}` : l.employeeId;
      const inT  = l.clockIn  ? new Date(l.clockIn).toLocaleString('he-IL') : '';
      const outT = l.clockOut ? new Date(l.clockOut).toLocaleString('he-IL') : '';
      const mins = l.workMinutes ?? '';
      const hrs  = mins ? (Math.floor(mins/60) + ':' + String(mins%60).padStart(2,'0')) : '';
      return `${name},${new Date(l.clockIn).toLocaleDateString('he-IL')},${inT},${outT},${l.breakMinutes ?? 0},${hrs}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'attendance.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">דוח נוכחות — מנהל</h1>
        <button onClick={downloadCSV}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          <Download className="w-4 h-4" />
          ייצא CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
          <option value="">כל העובדים</option>
          {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין רשומות לתקופה</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">כניסה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">יציאה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הפסקה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שעות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log: any) => {
                const emp = employees.find(e => e.id === log.employeeId);
                const inT  = log.clockIn  ? new Date(log.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
                const outT = log.clockOut ? new Date(log.clockOut).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
                const mins = log.workMinutes;
                const hrs  = mins ? `${Math.floor(mins/60)}:${String(mins%60).padStart(2,'0')}` : '—';
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{emp ? `${emp.firstName} ${emp.lastName}` : '—'}</td>
                    <td className="px-4 py-2.5">{new Date(log.clockIn).toLocaleDateString('he-IL')}</td>
                    <td className="px-4 py-2.5">{inT}</td>
                    <td className="px-4 py-2.5">{outT}</td>
                    <td className="px-4 py-2.5">{log.breakMinutes ? `${log.breakMinutes} דק` : '—'}</td>
                    <td className="px-4 py-2.5 font-medium">{hrs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
