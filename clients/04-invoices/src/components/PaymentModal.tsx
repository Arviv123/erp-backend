import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { payInvoice } from '../lib/api';
import { fmtCurrency } from '../lib/format';
import { X, Loader2 } from 'lucide-react';

const METHODS = [
  { value: 'BANK_TRANSFER', label: 'העברה בנקאית' },
  { value: 'CREDIT_CARD', label: 'כרטיס אשראי' },
  { value: 'CASH', label: 'מזומן' },
  { value: 'CHECK', label: "צ'ק" },
  { value: 'OTHER', label: 'אחר' },
];

interface Props {
  invoiceId: string;
  balance: number;
  onClose: () => void;
}

export default function PaymentModal({ invoiceId, balance, onClose }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      payInvoice(invoiceId, {
        amount,
        method,
        date: new Date(date).toISOString(),
        reference: reference || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.message || 'שגיאה ברישום תשלום'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-800">רישום תשלום</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סכום לתשלום <span className="text-gray-400">(יתרה: {fmtCurrency(balance)})</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(+e.target.value)}
              min={0}
              max={balance}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אסמכתא</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="מספר העברה / צ'ק"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            ביטול
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={amount <= 0 || mutation.isPending}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            רשום תשלום
          </button>
        </div>
      </div>
    </div>
  );
}
