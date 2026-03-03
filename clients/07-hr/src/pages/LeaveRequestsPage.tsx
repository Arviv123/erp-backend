import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Plus } from 'lucide-react';
import api from '../lib/api';
import NewLeaveRequestModal from '../components/NewLeaveRequestModal';
import RejectModal from '../components/RejectModal';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ממתין', APPROVED: 'אושר', REJECTED: 'נדחה',
};

async function getLeaveRequests(params: Record<string, string>) {
  const res = await api.get('/hr/leave-requests', { params });
  return res.data;
}

async function approveRequest(id: string) {
  const res = await api.patch(`/hr/leave-requests/${id}/approve`);
  return res.data;
}

export default function LeaveRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['leave-requests', statusFilter],
    queryFn: () => getLeaveRequests(statusFilter ? { status: statusFilter } : {}),
  });

  const requests: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const approveMut = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">בקשות חופשה</h1>
        <button onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          <Plus className="w-4 h-4" />
          בקשת חופשה חדשה
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none bg-white">
          <option value="">כל הסטאטוסים</option>
          <option value="PENDING">ממתין</option>
          <option value="APPROVED">אושר</option>
          <option value="REJECTED">נדחה</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
        ) : requests.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין בקשות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סוג חופשה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מתאריך</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עד תאריך</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ימים</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטאטוס</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((req: any) => (
                <tr key={req.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium">{req.employee?.firstName} {req.employee?.lastName}</td>
                  <td className="px-4 py-3 text-gray-600">{req.leaveType?.name ?? '—'}</td>
                  <td className="px-4 py-3">{fmtDate(req.startDate)}</td>
                  <td className="px-4 py-3">{fmtDate(req.endDate)}</td>
                  <td className="px-4 py-3 text-center">{req.businessDays ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[req.status] ?? ''}`}>
                      {STATUS_LABEL[req.status] ?? req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => approveMut.mutate(req.id)} disabled={approveMut.isPending}
                          className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />אשר
                        </button>
                        <button onClick={() => setRejectTarget(req.id)}
                          className="flex items-center gap-1 text-red-600 hover:text-red-800 text-xs font-medium">
                          <X className="w-3.5 h-3.5" />דחה
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewModal && <NewLeaveRequestModal onClose={() => setShowNewModal(false)} />}
      {rejectTarget && <RejectModal requestId={rejectTarget} onClose={() => setRejectTarget(null)} />}
    </div>
  );
}
