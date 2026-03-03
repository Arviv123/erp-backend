import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ChevronLeft } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const PAY_LABEL: Record<string, string> = {
  CASH: 'מזומן',
  CREDIT_CARD: 'אשראי',
  TRANSFER: 'העברה',
};

async function getSales(params: Record<string, string>) {
  const r = await api.get('/pos/transactions', { params });
  return r.data;
}

export default function SalesHistoryPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payMethod, setPayMethod] = useState('');

  const params: Record<string, string> = {};
  if (dateFrom) params.from = dateFrom;
  if (dateTo) params.to = dateTo;
  if (payMethod) params.paymentMethod = payMethod;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pos-sales', params],
    queryFn: () => getSales(params),
  });

  const sales: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white';

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">היסטוריית מכירות</h1>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" />רענן
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs text-gray-500 mb-1">מתאריך</p>
          <input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">עד תאריך</p>
          <input type="date" className={inputCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">אמצעי תשלום</p>
          <select className={inputCls} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
            <option value="">הכל</option>
            {Object.entries(PAY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { setDateFrom(''); setDateTo(''); setPayMethod(''); }}
          className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg"
        >
          נקה
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
        ) : sales.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין מכירות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מס' מכירה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פריטים</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תשלום</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סה"כ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(s.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.receiptNumber ?? s.saleNumber ?? s.id?.slice(-8)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {Array.isArray(s.lines)
                      ? s.lines.map((l: any) => `${l.description} ×${l.quantity}`).join(', ')
                      : Array.isArray(s.items)
                        ? s.items.map((i: any) => `${i.description ?? i.itemId} ×${i.quantity}`).join(', ')
                        : `${s.itemCount ?? '—'} פריטים`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.paymentMethod === 'CASH' ? 'bg-green-100 text-green-700'
                      : s.paymentMethod === 'CREDIT_CARD' ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                    }`}>
                      {PAY_LABEL[s.paymentMethod] ?? s.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(s.total ?? s.totalAmount ?? 0)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/pos/sales/${s.id}`)} className="text-indigo-600 hover:text-indigo-800">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
