import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package, Settings } from 'lucide-react';
import api from '../lib/api';
import StockAdjustModal from '../components/StockAdjustModal';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const UNIT_LABEL: Record<string, string> = { UNIT: 'יחידה', KG: 'ק"ג', LITER: 'ליטר', METER: 'מטר', BOX: 'קרטון' };

async function getItem(id: string) { const r = await api.get(`/inventory/products/${id}`); return r.data; }
async function getMovements(id: string) { const r = await api.get('/inventory/movements', { params: { productId: id, pageSize: 50 } }); return r.data; }

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showAdjust, setShowAdjust] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inv-item', id],
    queryFn: () => getItem(id!),
    enabled: !!id,
  });
  const { data: movData } = useQuery({
    queryKey: ['inv-item-movements', id],
    queryFn: () => getMovements(id!),
    enabled: !!id,
  });

  const item = data?.data ?? data;
  const movements: any[] = Array.isArray(movData) ? movData : Array.isArray(movData?.data) ? movData.data : [];

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען...</div>;
  if (error || !item) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה</div>;

  const currentStock = (item.stockLevels ?? []).reduce((s: number, sl: any) => s + Number(sl.quantity), 0);
  const reorderPoint = item.stockLevels?.[0]?.reorderPoint ?? 0;
  const warehouseId  = item.stockLevels?.[0]?.warehouseId ?? '';
  const isLow = currentStock <= reorderPoint && !item.isService;

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/inventory/items')} className="text-gray-400 hover:text-gray-600"><ChevronRight className="w-5 h-5" /></button>
        <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {isLow ? 'מלאי נמוך' : 'מלאי תקין'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Stock card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-gray-700">מלאי</span>
          </div>
          <p className={`text-4xl font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{currentStock}</p>
          <p className="text-xs text-gray-400 mt-1">{item.unitOfMeasure ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-2">נק' הזמנה: {reorderPoint}</p>
          <p className="text-xs text-gray-500">ערך מלאי: {fmtCurrency(currentStock * Number(item.costPrice))}</p>
          <button onClick={() => setShowAdjust(true)}
            className="mt-3 flex items-center gap-1 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-medium transition">
            <Settings className="w-3 h-3" />תיקון מלאי
          </button>
        </div>

        {/* Details */}
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">פרטי פריט</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ['מק"ט', item.sku],
              ['קטגוריה', item.category?.name ?? '—'],
              ['יחידה', item.unitOfMeasure ?? '—'],
              ['מע"מ', `${(item.vatRate * 100).toFixed(0)}%`],
              ['מחיר קנייה', fmtCurrency(Number(item.costPrice))],
              ['מחיר מכירה', fmtCurrency(Number(item.sellingPrice))],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-gray-400 text-xs">{k}</p>
                <p className="font-medium text-gray-900">{v}</p>
              </div>
            ))}
          </div>
          {item.description && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-gray-400 text-xs mb-1">תיאור</p>
              <p className="text-sm text-gray-700">{item.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Movements */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">היסטוריית תנועות</h2>
        </div>
        {movements.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">אין תנועות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">תאריך</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סוג</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">כמות</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מלאי אחרי</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סיבה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m: any) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">{fmtDate(m.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type ?? (m.quantity > 0 ? 'תיקון +' : 'תיקון -')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <span className={m.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{m.stockAfter ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{m.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdjust && (
        <StockAdjustModal
          item={{ id: item.id, name: item.name, currentStock, warehouseId }}
          onClose={() => { setShowAdjust(false); refetch(); }}
        />
      )}
    </div>
  );
}
