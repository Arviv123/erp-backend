import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  grossSalary: number;
}

interface Props {
  employee: Employee;
  onClose: () => void;
  onSuccess: () => void;
}

async function updateSalary(id: string, body: { grossSalary: number; reason?: string }) {
  const res = await api.patch(`/employees/${id}/salary`, body);
  return res.data;
}

export default function SalaryUpdateModal({ employee, onClose, onSuccess }: Props) {
  const [newSalary, setNewSalary] = useState(String(employee.grossSalary));
  const [reason, setReason]       = useState('');
  const [error, setError]         = useState('');

  const mutation = useMutation({
    mutationFn: () => updateSalary(employee.id, {
      grossSalary: Number(newSalary),
      reason: reason || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || 'שגיאה בעדכון שכר');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            עדכון שכר — {employee.firstName} {employee.lastName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
            שכר נוכחי: <span className="font-semibold text-gray-900">{fmtCurrency(employee.grossSalary)}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              שכר חדש (₪) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={newSalary}
              onChange={(e) => setNewSalary(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              min="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיבה לשינוי</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="לדוגמה: העלאה שנתית, קידום..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !newSalary}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition"
            >
              {mutation.isPending ? 'מעדכן...' : 'עדכן שכר'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
