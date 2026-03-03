import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

async function getEmployees()      { const r = await api.get('/employees', { params: { isActive: true, pageSize: 100 } }); return r.data; }
async function getBalance(id: string, year: number) { const r = await api.get(`/hr/employees/${id}/leave-balance`, { params: { year } }); return r.data; }

export default function LeaveBalancePage() {
  const [selectedId, setSelectedId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: empData } = useQuery({ queryKey: ['employees-hr'], queryFn: getEmployees });
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];

  const { data: balData, isLoading } = useQuery({
    queryKey: ['leave-balance', selectedId, year],
    queryFn: () => getBalance(selectedId, year),
    enabled: !!selectedId,
  });

  const balance: any[] = Array.isArray(balData) ? balData : Array.isArray(balData?.data) ? balData.data : [];

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">יתרות חופשה</h1>
      <div className="flex gap-3 mb-6">
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none bg-white">
          <option value="">בחר עובד...</option>
          {employees.map((emp: any) => (
            <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
          ))}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none bg-white">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {!selectedId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center h-40 text-gray-400">
          בחר עובד לצפייה ביתרות
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
      ) : balance.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center h-40 text-gray-400">
          אין נתוני יתרה
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סוג חופשה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מקסימום/שנה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נוצל</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נותר</th>
                <th className="px-4 py-3 font-medium text-gray-600 min-w-32">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {balance.map((b: any) => {
                const max = b.maxDays ?? b.leaveType?.maxDaysPerYear ?? 0;
                const used = b.usedDays ?? 0;
                const remaining = Math.max(0, max - used);
                const pct = max > 0 ? Math.round((used / max) * 100) : 0;
                return (
                  <tr key={b.leaveTypeId ?? b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{b.leaveType?.name ?? b.name}</td>
                    <td className="px-4 py-3 text-gray-600">{max} ימים</td>
                    <td className="px-4 py-3 text-orange-600">{used}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{remaining}</td>
                    <td className="px-4 py-3">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{pct}%</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
