import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../lib/api';

async function adjustStock(id: string, body: Record<string, unknown>) {
  const r = await api.post(`/inventory/items/${id}/adjust`, body);
  return r.data;
}

interface Props {
  item: { id: string; name: string; currentStock: number };
  onClose: () => void;
}

export default function StockAdjustModal({ item, onClose }: Props) {
  const [type, setType]     = useState<'add' | 'remove'>('add');
  const [qty, setQty]       = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes]   = useState('');
  const [error, setError]   = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adjustStock(item.id, {
      quantity: type === 'add' ? Number(qty) : -Number(qty),
      reason, notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-item'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
      qc.invalidateQueries({ queryKey: ['inv-all-items'] });
      onClose();
    },
    onError: (err: any) => setError(err?.response?.data?.error || 'שגיאה'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">תיקון מלאי — {item.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
            מלאי נוכחי: <span className="font-semibold text-gray-900">{item.currentStock}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוג תיקון</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setType('add')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${type === 'add' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                + הוספה
              </button>
              <button type="button" onClick={() => setType('remove')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${type === 'remove' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                - הפחתה
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כמות <span className="text-red-500">*</span></label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיבה <span className="text-red-500">*</span></label>
            <select value={reason} onChange={e => setReason(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white">
              <option value="">בחר סיבה...</option>
              <option value="קליטת סחורה">קליטת סחורה</option>
              <option value="ספירת מלאי">ספירת מלאי</option>
              <option value="גניבה">גניבה</option>
              <option value="נזק">נזק</option>
              <option value="החזרה">החזרה</option>
              <option value="אחר">אחר</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !qty || !reason}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-medium py-2.5 rounded-lg transition">
              {mutation.isPending ? 'מעדכן...' : 'עדכן מלאי'}
            </button>
            <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}
