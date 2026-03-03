import { useQuery } from '@tanstack/react-query';
import { AlertCircle, TrendingDown } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

async function getAPAging() {
  const r = await api.get('/purchasing/ap-aging');
  return r.data;
}

const COLS = [
  { key: 'current', label: 'שוטף (לא פג)', colorBg: 'bg-green-50',  colorBorder: 'border-green-200',  colorText: 'text-green-700'  },
  { key: 'days30',  label: '1–30 ימים',     colorBg: 'bg-yellow-50', colorBorder: 'border-yellow-200', colorText: 'text-yellow-700' },
  { key: 'days60',  label: '31–60 ימים',    colorBg: 'bg-orange-50', colorBorder: 'border-orange-200', colorText: 'text-orange-700' },
  { key: 'days90',  label: '61–90 ימים',    colorBg: 'bg-red-50',    colorBorder: 'border-red-200',    colorText: 'text-red-700'    },
  { key: 'over90',  label: '+90 ימים',      colorBg: 'bg-purple-50', colorBorder: 'border-purple-200', colorText: 'text-purple-700' },
];

export default function APAgingPage() {
  const { data, isLoading } = useQuery({ queryKey: ['ap-aging'], queryFn: getAPAging });

  const buckets   = data?.buckets   ?? {};
  const grandTotal = data?.grandTotal ?? 0;
  const asOf       = data?.asOf       ? new Date(data.asOf).toLocaleDateString('he-IL') : '';

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">גיל חוב — ספקים</h1>
          <p className="text-sm text-gray-500 mt-1">AP Aging — חשבוניות פתוחות לפי גיל{asOf && ` · נכון ל-${asOf}`}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm text-left">
          <p className="text-xs text-gray-500">סה&quot;כ חובות לספקים</p>
          <p className="text-2xl font-bold text-red-600">{fmtCurrency(grandTotal)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : grandTotal === 0 ? (
        <div className="flex items-center justify-center h-32 bg-white rounded-xl border border-gray-200 text-gray-400 gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">אין חובות פתוחים לספקים</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3 mb-6">
            {COLS.map(col => {
              const bucket = buckets[col.key] ?? { total: 0, count: 0 };
              const pct = grandTotal > 0 ? Math.round(bucket.total / grandTotal * 100) : 0;
              return (
                <div key={col.key} className={`rounded-xl border p-4 ${col.colorBg} ${col.colorBorder}`}>
                  <p className={`text-xs font-semibold mb-2 ${col.colorText}`}>{col.label}</p>
                  <p className={`text-xl font-bold ${col.colorText}`}>{fmtCurrency(bucket.total)}</p>
                  <p className="text-xs text-gray-500 mt-1">{bucket.count} חשבוניות · {pct}%</p>
                  {grandTotal > 0 && (
                    <div className="mt-2 h-1.5 bg-black/10 rounded-full">
                      <div className={`h-1.5 rounded-full bg-current opacity-50 ${col.colorText}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-700">פירוט לפי תקופת איחור</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-right py-2 font-medium text-gray-500 text-xs">תקופה</th>
                  <th className="text-right py-2 font-medium text-gray-500 text-xs">חשבוניות</th>
                  <th className="text-left py-2 font-medium text-gray-500 text-xs">סכום</th>
                  <th className="text-left py-2 font-medium text-gray-500 text-xs">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {COLS.map(col => {
                  const bucket = buckets[col.key] ?? { total: 0, count: 0 };
                  const pct = grandTotal > 0 ? Math.round(bucket.total / grandTotal * 100) : 0;
                  return (
                    <tr key={col.key} className="hover:bg-gray-50">
                      <td className={`py-2.5 font-medium text-xs ${col.colorText}`}>{col.label}</td>
                      <td className="py-2.5 text-gray-600">{bucket.count}</td>
                      <td className={`py-2.5 font-semibold text-left ${col.colorText}`}>{fmtCurrency(bucket.total)}</td>
                      <td className="py-2.5 text-gray-500 text-left">{pct}%</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200 font-bold">
                  <td className="py-2.5">סה&quot;כ</td>
                  <td className="py-2.5">{COLS.reduce((s, c) => s + (buckets[c.key]?.count ?? 0), 0)}</td>
                  <td className="py-2.5 text-left text-red-600">{fmtCurrency(grandTotal)}</td>
                  <td className="py-2.5 text-left">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
