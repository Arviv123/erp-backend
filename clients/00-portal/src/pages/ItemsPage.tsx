import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Eye } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const UNIT_LABEL: Record<string, string> = { UNIT: 'יח', KG: 'ק"ג', LITER: 'ליטר', METER: 'מ', BOX: 'קרטון' };

async function getItems(params: Record<string, string>) {
  const r = await api.get('/inventory/products', { params: { ...params, pageSize: 100 } });
  return r.data;
}

export default function ItemsPage() {
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(false);

  const params: Record<string, string> = {};
  if (category) params.category = category;
  if (lowStock) params.lowStock = 'true';

  const { data, isLoading } = useQuery({ queryKey: ['inv-items', params], queryFn: () => getItems(params) });
  const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const filtered = search ? items.filter(i => i.name?.includes(search) || i.sku?.includes(search)) : items;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">פריטים</h1>
        <Link to="/inventory/items/new"
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          + פריט חדש
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder='חיפוש לפי שם / מק"ט' value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white">
          <option value="">כל הקטגוריות</option>
          <option value="אלקטרוניקה">אלקטרוניקה</option>
          <option value="מזון">מזון</option>
          <option value="משרד">משרד</option>
          <option value="ציוד">ציוד</option>
          <option value="תוכנה">תוכנה</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} className="w-4 h-4" />
          מלאי נמוך בלבד
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין פריטים</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מק"ט</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">קטגוריה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">יחידה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מלאי</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מינ'</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מחיר קנייה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מחיר מכירה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item: any) => {
                const stock = (item.stockLevels ?? []).reduce((s: number, sl: any) => s + Number(sl.quantity), 0);
                const reorder = item.stockLevels?.[0]?.reorderPoint ?? 0;
                const isLow = stock <= reorder && !item.isService;
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.sku}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{item.category?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{item.unitOfMeasure ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-medium ${isLow ? 'text-red-600' : 'text-green-700'}`}>
                        {item.isService ? 'שירות' : stock}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{item.isService ? '—' : reorder}</td>
                    <td className="px-4 py-2.5">{fmtCurrency(Number(item.costPrice))}</td>
                    <td className="px-4 py-2.5 font-medium">{fmtCurrency(Number(item.sellingPrice))}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/inventory/items/${item.id}`} className="flex items-center gap-1 text-orange-600 hover:text-orange-800 text-xs font-medium">
                        <Eye className="w-3.5 h-3.5" />צפה
                      </Link>
                    </td>
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
