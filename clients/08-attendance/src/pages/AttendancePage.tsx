import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut } from 'lucide-react';
import api from '../lib/api';

async function getEmployees()  { const r = await api.get('/employees', { params: { isActive: true, pageSize: 100 } }); return r.data; }
async function getAttendance() { const r = await api.get('/attendance', { params: { pageSize: 50 } }); return r.data; }
async function clockIn(body: Record<string, unknown>)  { const r = await api.post('/attendance/clock-in', body);  return r.data; }
async function clockOut(body: Record<string, unknown>) { const r = await api.post('/attendance/clock-out', body); return r.data; }

export default function AttendancePage() {
  const qc = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [selectedId, setSelectedId] = useState('');
  const [breakMins, setBreakMins] = useState('0');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: empData } = useQuery({ queryKey: ['att-employees'], queryFn: getEmployees });
  const { data: attData, refetch } = useQuery({ queryKey: ['att-logs'], queryFn: getAttendance });

  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];
  const logs: any[]      = Array.isArray(attData) ? attData  : Array.isArray(attData?.data) ? attData.data  : [];

  // Today logs
  const today = now.toLocaleDateString('he-IL');
  const todayLogs = logs.filter(l => new Date(l.clockIn).toLocaleDateString('he-IL') === today);

  const getGPS = (): Promise<{ lat: number; lng: number } | undefined> =>
    new Promise(resolve => {
      if (!navigator.geolocation) { resolve(undefined); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(undefined),
        { timeout: 3000 }
      );
    });

  const clockInMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('בחר עובד');
      const gps = await getGPS();
      return clockIn({ employeeId: selectedId, gpsLocation: gps, notes: notes || undefined });
    },
    onSuccess: () => { setMsg('✅ כניסה נרשמה'); setNotes(''); refetch(); qc.invalidateQueries({ queryKey: ['att-logs'] }); },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || 'שגיאה'),
  });

  const clockOutMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('בחר עובד');
      return clockOut({ employeeId: selectedId, breakMinutes: Number(breakMins) || undefined, notes: notes || undefined });
    },
    onSuccess: () => { setMsg('✅ יציאה נרשמה'); setNotes(''); refetch(); qc.invalidateQueries({ queryKey: ['att-logs'] }); },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || 'שגיאה'),
  });

  const weekDay = now.toLocaleDateString('he-IL', { weekday: 'long' });
  const dateStr  = now.toLocaleDateString('he-IL');
  const timeStr  = now.toLocaleTimeString('he-IL');

  return (
    <div dir="rtl" className="max-w-2xl mx-auto">
      {/* Clock */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-xl p-8 text-white text-center mb-6">
        <p className="text-indigo-200 text-sm mb-1">{weekDay}, {dateStr}</p>
        <p className="text-5xl font-bold font-mono tracking-wider">{timeStr}</p>
      </div>

      {/* Clock in/out card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">כניסה / יציאה לעבודה</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">בחר עובד <span className="text-red-500">*</span></label>
            <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setMsg(''); setError(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
              <option value="">בחר עובד...</option>
              {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הפסקה (דקות)</label>
              <input type="number" value={breakMins} onChange={e => setBreakMins(e.target.value)} min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">{msg}</div>}
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setMsg(''); setError(''); clockInMut.mutate(); }}
              disabled={clockInMut.isPending || !selectedId}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 rounded-xl transition">
              <LogIn className="w-5 h-5" />
              {clockInMut.isPending ? 'רושם...' : 'כניסה לעבודה'}
            </button>
            <button onClick={() => { setMsg(''); setError(''); clockOutMut.mutate(); }}
              disabled={clockOutMut.isPending || !selectedId}
              className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-3 rounded-xl transition">
              <LogOut className="w-5 h-5" />
              {clockOutMut.isPending ? 'רושם...' : 'יציאה מעבודה'}
            </button>
          </div>
        </div>
      </div>

      {/* Today status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">סטאטוס היום</h2>
        </div>
        {todayLogs.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">אין רשומות נוכחות להיום</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todayLogs.map((log: any) => {
              const emp = employees.find(e => e.id === log.employeeId);
              const inTime  = new Date(log.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
              const outTime = log.clockOut ? new Date(log.clockOut).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : null;
              return (
                <div key={log.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{emp ? `${emp.firstName} ${emp.lastName}` : log.employeeId}</p>
                    <p className="text-xs text-gray-500">כניסה: {inTime}{outTime ? ` | יציאה: ${outTime}` : ' — עדיין בפנים'}</p>
                  </div>
                  <span className={`text-xs font-medium ${outTime ? 'text-gray-500' : 'text-green-600'}`}>
                    {outTime ? 'יצא' : '● בפנים'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
