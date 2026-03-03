import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../lib/api';

async function runPayroll(period: string) {
  const res = await api.post('/payroll/run', { period });
  return res.data;
}

interface Props {
  onClose: () => void;
}

export default function RunPayrollModal({ onClose }: Props) {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [period, setPeriod] = useState(defaultPeriod);
  const [error, setError]   = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => runPayroll(period),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || 'שגיאה בהפעלת שכר');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">הפעלת שכר חדש</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תקופת שכר <span className="text-red-500">*</span>
            </label>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">פורמט: YYYY-MM (לדוגמה: 2026-03)</p>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !period}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-lg transition">
              {mutation.isPending ? 'מעבד...' : 'הפעל שכר'}
            </button>
            <button onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition">
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
