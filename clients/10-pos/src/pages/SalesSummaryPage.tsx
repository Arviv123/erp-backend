import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ShoppingBag, CreditCard, Banknote, RefreshCw } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const MONTHS_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

async function getSummary(period: string) {
  const r = await api.get(`/pos/summary?period=${period}`);
  return r.data;
}

export default function SalesSummaryPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pos-summary', period],
    queryFn: () => getSummary(period),
  });

  const summary = data ?? {};
  const [year, month] = period.split('-').map(Number);

  const KPI = [
    { label: 'סה"כ מכירות', value: fmtCurrency(summary.totalRevenue ?? summary.total ?? 0), icon: TrendingUp, color: 'indigo' },
    { label: 'מספר עסקאות', value: summary.transactionCount ?? summary.count ?? 0, icon: ShoppingBag, color: 'green' },
    { label: 'ממוצע לעסקה', value: fmtCurrency(summary.averageTransaction ?? summary.avg ?? 0), icon: CreditCard, color: 'blue' },
    { label: 'מזומן', value: fmtCurrency(summary.cashTotal ?? 0), icon: Banknote, color: 'yellow' },
  ];

  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          סיכום מכירות — {MONTHS_HE[month]} {year}
        </h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button onClick={() => refetch()} className="text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {KPI.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${colorMap[color]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Payment breakdown */}
          {summary.byPaymentMethod && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">פירוט לפי אמצעי תשלום</h2>
              <div className="space-y-3">
                {Object.entries(summary.byPaymentMethod as Record<string, number>).map(([method, amount]) => {
                  const labels: Record<string, string> = { CASH: 'מזומן', CREDIT_CARD: 'אשראי', TRANSFER: 'העברה' };
                  const pct = summary.totalRevenue ? Math.round((amount / summary.totalRevenue) * 100) : 0;
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{labels[method] ?? method}</span>
                        <span className="font-medium">{fmtCurrency(amount)} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top items */}
          {Array.isArray(summary.topItems) && summary.topItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">פריטים נמכרים ביותר</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-right pb-2 font-medium text-gray-500">פריט</th>
                    <th className="text-right pb-2 font-medium text-gray-500">כמות</th>
                    <th className="text-right pb-2 font-medium text-gray-500">הכנסה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.topItems.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2 text-gray-800">{item.name ?? item.itemId}</td>
                      <td className="py-2 text-gray-600">{item.quantity ?? item.totalQuantity}</td>
                      <td className="py-2 font-medium">{fmtCurrency(item.revenue ?? item.total ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!summary.totalRevenue && !summary.total && (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">אין נתונים לתקופה זו</div>
          )}
        </>
      )}
    </div>
  );
}
