import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../lib/api';

async function getEmployees() { const r = await api.get('/employees', { params: { isActive: true, pageSize: 100 } }); return r.data; }
async function getLeaveTypes() { const r = await api.get('/hr/leave-types'); return r.data; }
async function createRequest(body: Record<string, unknown>) { const r = await api.post('/hr/leave-requests', body); return r.data; }

interface Props { onClose: () => void; }

export default function NewLeaveRequestModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: empData } = useQuery({ queryKey: ['employees-modal'], queryFn: getEmployees });
  const { data: typData } = useQuery({ queryKey: ['leave-types-modal'], queryFn: getLeaveTypes });
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];
  const types: any[]     = Array.isArray(typData) ? typData : Array.isArray(typData?.data) ? typData.data : [];

  const mutation = useMutation({
    mutationFn: createRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['hr-pending'] });
      onClose();
    },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || 'שגיאה'),
  });

  const handleSubmit = () => {
    setError('');
    if (!employeeId || !leaveTypeId || !startDate || !endDate) { setError('נא למלא את כל השדות החובה'); return; }
    mutation.mutate({
      employeeId, leaveTypeId,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      notes: notes || undefined,
    });
  };

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none bg-white";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">בקשת חופשה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">עובד <span className="text-red-500">*</span></label>
            <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">בחר עובד...</option>
              {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוג חופשה <span className="text-red-500">*</span></label>
            <select className={inputCls} value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
              <option value="">בחר סוג...</option>
              {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מתאריך <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עד תאריך <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSubmit} disabled={mutation.isPending}
              className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-medium py-2.5 rounded-lg transition">
              {mutation.isPending ? 'שולח...' : 'שלח בקשה'}
            </button>
            <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}
