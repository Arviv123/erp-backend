import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import api from '../lib/api';

const fmtDate = (d: string) => d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const TYPE_LABEL: Record<string, string> = {
  IN: 'כניסה',
  OUT: 'יציאה',
  ADJUST: 'תיקון',
  PURCHASE: 'רכישה',
  SALE: 'מכירה',
  RETURN: 'החזרה',
};

async function getMovements(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  const r = await api.get(`/inventory/movements${q ? '?' + q : ''}`);
  return r.data;
}

async function getItems() {
  const r = await api.get('/inventory/items?pageSize=500');
  return r.data;
}

export default function MovementsPage() {
  const [itemId, setItemId] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const params: Record<string, string> = {};
  if (itemId) params.itemId = itemId;
  if (type) params.type = type;
  if (dateFrom) params.from = dateFrom;
  if (dateTo) params.to = dateTo;

  const { data: movData, isLoading, refetch } = useQuery({
    queryKey: ['inv-movements', params],
    queryFn: () => getMovements(params),
  });

  const { data: itemsData } = useQuery({
    queryKey: ['inv-items-list'],
    queryFn: getItems,
  });

  const movements: any[] = Array.isArray(movData) ? movData : Array.isArray(movData?.data) ? movData.data : [];
  const items: any[] = Array.isArray(itemsData) ? itemsData : Array.isArray(itemsData?.data) ? itemsData.data : [];

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white';

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">היסטוריית תנועות מלאי</h1>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" />רענן
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs text-gray-500 mb-1">פריט</p>
          <select className={inputCls} value={itemId} onChange={e => setItemId(e.target.value)}>
            <option value="">כל הפריטים</option>
            {items.map((it: any) => (
              <option key={it.id} value={it.id}>{it.name}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">סוג תנועה</p>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
            <option value="">הכל</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">מתאריך</p>
          <input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">עד תאריך</p>
          <input type="date" className={inputCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button
          onClick={() => { setItemId(''); setType(''); setDateFrom(''); setDateTo(''); }}
          className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg"
        >
          נקה
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
        ) : movements.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין תנועות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פריט</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סוג</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">כמות</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מלאי לאחר</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סיבה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הערות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m: any) => {
                const isPositive = m.quantity > 0;
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(m.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.item?.name ?? m.itemId ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                        ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {TYPE_LABEL[m.type] ?? m.type ?? '—'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{m.quantity}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.stockAfter ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{m.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{m.notes ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
