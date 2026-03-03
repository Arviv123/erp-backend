import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../lib/api';

async function rejectRequest(id: string, reason: string) { const r = await api.patch(`/hr/leave-requests/${id}/reject`, { reason }); return r.data; }

interface Props { requestId: string; onClose: () => void; }

export default function RejectModal({ requestId, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError]   = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => rejectRequest(requestId, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); qc.invalidateQueries({ queryKey: ['hr-pending'] }); onClose(); },
    onError: (err: any) => setError(err?.response?.data?.error || 'שגיאה'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">דחיית בקשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיבת הדחייה <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="הסבר מדוע הבקשה נדחית..." />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="flex gap-3">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !reason}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2.5 rounded-lg transition">
              {mutation.isPending ? 'דוחה...' : 'דחה בקשה'}
            </button>
            <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}
