import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ShoppingBag, CreditCard, Banknote, RefreshCw, ReceiptText, ArrowDownCircle, Calendar, CalendarDays } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const MONTHS_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const PAY_LABELS: Record<string, string> = { CASH: 'מזומן', CREDIT_CARD: 'אשראי', TRANSFER: 'העברה', CHECK: "צ'ק" };
const PAY_COLORS: Record<string, string> = { CASH: 'bg-emerald-500', CREDIT_CARD: 'bg-blue-500', TRANSFER: 'bg-purple-500', CHECK: 'bg-amber-500' };

async function getDailySummary(date: string) {
  const r = await api.get('/pos/reports/daily', { params: { date } });
  return r.data;
}
async function getMonthlySummary(year: number, month: number) {
  const r = await api.get('/pos/reports/monthly', { params: { year, month } });
  return r.data;
}

type Mode = 'daily' | 'monthly';

export default function SalesSummaryPage() {
  const now   = new Date();
  const [mode, setMode]   = useState<Mode>('daily');
  const [date, setDate]   = useState(now.toISOString().split('T')[0]);
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const dailyQ = useQuery({
    queryKey: ['pos-daily', date],
    queryFn:  () => getDailySummary(date),
    enabled:  mode === 'daily',
  });
  const monthlyQ = useQuery({
    queryKey: ['pos-monthly', year, month],
    queryFn:  () => getMonthlySummary(year, month),
    enabled:  mode === 'monthly',
  });

  const isLoading = mode === 'daily' ? dailyQ.isLoading : monthlyQ.isLoading;
  const refetch   = mode === 'daily' ? dailyQ.refetch   : monthlyQ.refetch;
  const raw       = mode === 'daily' ? (dailyQ.data ?? {}) : (monthlyQ.data ?? {});

  const totalSales    = raw.totalSales   ?? 0;
  const salesCount    = raw.salesCount   ?? 0;
  const totalReturns  = raw.totalReturns ?? 0;
  const returnsCount  = raw.returnsCount ?? 0;
  const vatCollected  = raw.vatCollected ?? 0;
  const netRevenue    = totalSales - vatCollected;
  const avgSale       = raw.averageSale  ?? (salesCount ? totalSales / salesCount : 0);
  const byPayment     = (raw.byPaymentMethod ?? {}) as Record<string, number>;
  const byDay         = (raw.byDay ?? {}) as Record<string, number>;
  const topItems      = Array.isArray(raw.topItems) ? raw.topItems : [];

  const title = mode === 'daily'
    ? `סיכום יומי — ${new Date(date).toLocaleDateString('he-IL')}`
    : `סיכום חודשי — ${MONTHS_HE[month]} ${year}`;

  // Daily chart (monthly mode): max bar
  const dayEntries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  const maxDayVal  = Math.max(...dayEntries.map(([, v]) => v), 1);

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setMode('daily')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition ${mode === 'daily' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> יומי
            </button>
            <button
              onClick={() => setMode('monthly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition ${mode === 'monthly' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <Calendar className="w-3.5 h-3.5" /> חודשי
            </button>
          </div>

          {/* Period pickers */}
          {mode === 'daily' ? (
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          ) : (
            <div className="flex gap-2">
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                {MONTHS_HE.slice(1).map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          <button onClick={() => refetch()} className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : totalSales === 0 && salesCount === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <ShoppingBag className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">אין נתוני מכירות לתקופה זו</p>
        </div>
      ) : (
        <>
          {/* KPI cards — row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmtCurrency(totalSales)}</p>
              <p className="text-xs text-gray-400 mt-1">סה"כ מכירות (כולל מע"מ)</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center mb-3">
                <ShoppingBag className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{salesCount}</p>
              <p className="text-xs text-gray-400 mt-1">עסקאות</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmtCurrency(avgSale)}</p>
              <p className="text-xs text-gray-400 mt-1">ממוצע לעסקה</p>
            </div>
            {returnsCount > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5">
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                  <ArrowDownCircle className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-red-600">-{fmtCurrency(totalReturns)}</p>
                <p className="text-xs text-gray-400 mt-1">{returnsCount} החזרות</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center mb-3">
                  <Banknote className="w-4 h-4 text-yellow-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmtCurrency(byPayment['CASH'] ?? 0)}</p>
                <p className="text-xs text-gray-400 mt-1">מזומן</p>
              </div>
            )}
          </div>

          {/* VAT breakdown */}
          <div className="bg-gradient-to-l from-indigo-50 to-white border border-indigo-100 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <ReceiptText className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-700">פירוט מע"מ</h2>
            </div>
            <div className="grid grid-cols-3 divide-x divide-x-reverse divide-indigo-100 text-center">
              <div className="px-4">
                <p className="text-xs text-gray-500 mb-1">הכנסה ברוטו (כולל מע"מ)</p>
                <p className="text-xl font-bold text-gray-900">{fmtCurrency(totalSales)}</p>
              </div>
              <div className="px-4">
                <p className="text-xs text-gray-500 mb-1">מע"מ שנגבה (18%)</p>
                <p className="text-xl font-bold text-indigo-600">{fmtCurrency(vatCollected)}</p>
              </div>
              <div className="px-4">
                <p className="text-xs text-gray-500 mb-1">הכנסה נטו (לפני מע"מ)</p>
                <p className="text-xl font-bold text-emerald-700">{fmtCurrency(netRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Payment method breakdown */}
            {Object.keys(byPayment).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">פירוט אמצעי תשלום</h2>
                <div className="space-y-3">
                  {Object.entries(byPayment).map(([method, amount]) => {
                    const pct = totalSales ? Math.round((amount / totalSales) * 100) : 0;
                    const color = PAY_COLORS[method] ?? 'bg-gray-400';
                    return (
                      <div key={method}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{PAY_LABELS[method] ?? method}</span>
                          <span className="font-medium text-gray-900">{fmtCurrency(amount)} <span className="text-gray-400 text-xs">({pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top items */}
            {topItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">פריטים נמכרים ביותר</h2>
                <div className="space-y-2.5">
                  {topItems.slice(0, 7).map((item: any, i: number) => {
                    const rev = item.revenue ?? item.total ?? 0;
                    const maxRev = topItems[0]?.revenue ?? topItems[0]?.total ?? 1;
                    const pct = Math.round((rev / maxRev) * 100);
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-800 font-medium truncate max-w-[55%]">{item.name ?? item.itemId}</span>
                          <span className="text-gray-500">{item.quantity ?? item.totalQuantity} יח' · {fmtCurrency(rev)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Daily chart (monthly mode only) */}
          {mode === 'monthly' && dayEntries.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">מכירות יומיות — {MONTHS_HE[month]} {year}</h2>
              <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                {dayEntries.map(([day, val]) => {
                  const pct = (val / maxDayVal) * 100;
                  const d   = new Date(day).getDate();
                  return (
                    <div key={day} className="flex flex-col items-center gap-1 flex-1 min-w-[20px]" title={`${day}: ${fmtCurrency(val)}`}>
                      <div
                        className="w-full bg-indigo-500 rounded-t hover:bg-indigo-600 transition cursor-pointer"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                      <span className="text-[10px] text-gray-400">{d}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
