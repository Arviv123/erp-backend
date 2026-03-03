import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', POSTED: 'מאושר', PARTIALLY_PAID: 'שולם חלקית',
  PAID: 'שולם', OVERDUE: 'פג תוקף',
};
const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', POSTED: 'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700',
  PAID: 'bg-green-100 text-green-700', OVERDUE: 'bg-red-100 text-red-700',
};

async function getBills(status: string) {
  const q = status ? `?status=${status}` : '';
  const r = await api.get(`/purchasing/bills${q}`);
  return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
}

export default function BillsListPage() {
  const [status, setStatus] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['bills', status],
    queryFn: () => getBills(status),
  });

  const today = new Date();

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">חשבוניות ספקים</h1>
        <Link to="/purchasing/bills/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> חשבונית חדשה
        </Link>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${status === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s === '' ? 'הכל' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {(data as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Receipt className="w-8 h-8" />
              <p className="text-sm">אין חשבוניות ספקים. <Link to="/purchasing/bills/new" className="text-blue-600 hover:underline">הוסף חשבונית</Link></p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">מספר</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">ספק</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">תאריך</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">לתשלום עד</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">לפני מע&quot;מ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">מע&quot;מ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">סה&quot;כ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">סטאטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data as any[]).map((b: any) => {
                  const dueDate = new Date(b.dueDate);
                  const overdue = dueDate < today && b.status !== 'PAID';
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.number}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{b.vendor?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(b.date).toLocaleDateString('he-IL')}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                        {dueDate.toLocaleDateString('he-IL')} {overdue ? '⚠️' : ''}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmtCurrency(Number(b.subtotal))}</td>
                      <td className="px-4 py-3 text-teal-700">{fmtCurrency(Number(b.vatAmount))}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(Number(b.total))}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
