import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

async function getItems()     { const r = await api.get('/inventory/products', { params: { pageSize: 100 } }); return r.data; }
async function getMovements() { const r = await api.get('/inventory/movements', { params: { pageSize: 20 } }); return r.data; }

export default function InventoryDashboardPage() {
  const { data: itemsData } = useQuery({ queryKey: ['inv-all-items'], queryFn: getItems });
  const { data: movData }   = useQuery({ queryKey: ['inv-movements-dash'], queryFn: getMovements });

  const items: any[]     = Array.isArray(itemsData) ? itemsData : Array.isArray(itemsData?.data) ? itemsData.data : [];
  const movements: any[] = Array.isArray(movData) ? movData : Array.isArray(movData?.data) ? movData.data : [];

  const getStock = (i: any) => (i.stockLevels ?? []).reduce((s: number, sl: any) => s + Number(sl.quantity), 0);
  const activeItems  = items.filter(i => i.isActive !== false);
  const lowStock     = items.filter(i => {
    const stock = getStock(i);
    const reorder = i.stockLevels?.[0]?.reorderPoint ?? 0;
    return stock <= reorder && i.isActive !== false && !i.isService;
  });
  const totalValue   = items.reduce((s, i) => s + (getStock(i) * Number(i.costPrice ?? 0)), 0);

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">לוח בקרה מלאי</h1>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">{lowStock.length} פריטים מתחת למלאי מינימלי!</p>
            <p className="text-xs text-red-600">{lowStock.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <Package className="w-5 h-5 text-orange-600" />, label: 'פריטים פעילים', val: String(activeItems.length), color: 'bg-orange-50' },
          { icon: <AlertTriangle className="w-5 h-5 text-red-600" />, label: 'מלאי נמוך', val: String(lowStock.length), color: 'bg-red-50' },
          { icon: <DollarSign className="w-5 h-5 text-green-600" />, label: 'שווי מלאי', val: fmtCurrency(totalValue), color: 'bg-green-50' },
          { icon: <TrendingUp className="w-5 h-5 text-blue-600" />, label: 'תנועות (עמוד ראשון)', val: String(movements.length), color: 'bg-blue-50' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-3">
            <div className={`p-2 rounded-lg ${c.color}`}>{c.icon}</div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
              <p className="text-xl font-bold text-gray-900">{c.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Items with low stock */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col items-center justify-center h-40 text-gray-400 gap-3">
          <Package className="w-8 h-8" />
          <p>אין פריטים במלאי</p>
          <Link to="/inventory/items/new" className="text-orange-600 hover:text-orange-800 text-sm font-medium">+ הוסף פריט ראשון</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">פריטים — סקירה מהירה</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">שם</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">קטגוריה</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מלאי</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מינ'</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מחיר מכירה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.slice(0, 10).map((item: any) => {
                const stock = getStock(item);
                const reorder = item.stockLevels?.[0]?.reorderPoint ?? 0;
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link to={`/inventory/items/${item.id}`} className="font-medium text-orange-700 hover:underline">{item.name}</Link>
                      <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{item.category?.name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-medium ${stock <= reorder ? 'text-red-600' : 'text-gray-900'}`}>
                        {stock}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{reorder}</td>
                    <td className="px-4 py-2.5">{fmtCurrency(Number(item.sellingPrice))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
