import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ShoppingBag,
  Receipt,
  RefreshCw,
  BarChart2,
  Users,
  CreditCard,
  Banknote,
} from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtNumber = (n: number) =>
  new Intl.NumberFormat('he-IL').format(n);

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'מזומן',
  CREDIT: 'אשראי',
  CREDIT_CARD: 'אשראי',
  CHECK: 'שיק',
  TRANSFER: 'העברה',
  GIFT_CARD: 'כרטיס מתנה',
};

const PAYMENT_COLORS: Record<string, string> = {
  CASH: 'bg-green-500',
  CREDIT: 'bg-blue-500',
  CREDIT_CARD: 'bg-blue-500',
  CHECK: 'bg-purple-500',
  TRANSFER: 'bg-cyan-500',
  GIFT_CARD: 'bg-pink-500',
};

const PAYMENT_BG: Record<string, string> = {
  CASH: 'bg-green-50 text-green-700 border-green-200',
  CREDIT: 'bg-blue-50 text-blue-700 border-blue-200',
  CREDIT_CARD: 'bg-blue-50 text-blue-700 border-blue-200',
  CHECK: 'bg-purple-50 text-purple-700 border-purple-200',
  TRANSFER: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  GIFT_CARD: 'bg-pink-50 text-pink-700 border-pink-200',
};

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toISO(from), to: toISO(to) };
}

interface SummaryData {
  salesTotal: number;
  transactionCount: number;
  avgTicket: number;
  refundTotal: number;
  netTotal: number;
  grossProfit?: number;
}

interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface HourlyData {
  hour: number;
  amount: number;
  count: number;
}

interface PaymentMix {
  method: string;
  amount: number;
  count: number;
  pct: number;
}

interface CashierPerf {
  cashierName: string;
  salesTotal: number;
  transactionCount: number;
  avgTicket: number;
}

// Small KPI card
function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium mb-0.5">{title}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function POSAnalyticsPage() {
  const [dateRange, setDateRange] = useState(defaultRange);
  const [todayDate, setTodayDate] = useState(toISO(new Date()));

  const qs = `from=${dateRange.from}&to=${dateRange.to}`;

  const { data: summary, isFetching: loadingSummary } = useQuery<SummaryData>({
    queryKey: ['pos-analytics-summary', dateRange.from, dateRange.to],
    queryFn: () =>
      api.get(`/pos/analytics/summary?${qs}`).then(r => r.data?.data ?? r.data),
    placeholderData: {
      salesTotal: 0,
      transactionCount: 0,
      avgTicket: 0,
      refundTotal: 0,
      netTotal: 0,
    },
  });

  const { data: topProducts = [] } = useQuery<TopProduct[]>({
    queryKey: ['pos-analytics-top-products', dateRange.from, dateRange.to],
    queryFn: () =>
      api.get(`/pos/analytics/top-products?${qs}&limit=10`).then(r =>
        Array.isArray(r.data) ? r.data : r.data?.data ?? []
      ),
  });

  const { data: hourlyData = [] } = useQuery<HourlyData[]>({
    queryKey: ['pos-analytics-hourly', todayDate],
    queryFn: () =>
      api.get(`/pos/analytics/hourly?date=${todayDate}`).then(r =>
        Array.isArray(r.data) ? r.data : r.data?.data ?? []
      ),
  });

  const { data: paymentMix = [] } = useQuery<PaymentMix[]>({
    queryKey: ['pos-analytics-payment-mix', dateRange.from, dateRange.to],
    queryFn: () =>
      api.get(`/pos/analytics/payment-mix?${qs}`).then(r =>
        Array.isArray(r.data) ? r.data : r.data?.data ?? []
      ),
  });

  const { data: cashierPerf = [] } = useQuery<CashierPerf[]>({
    queryKey: ['pos-analytics-cashiers', dateRange.from, dateRange.to],
    queryFn: () =>
      api.get(`/pos/analytics/cashier-performance?${qs}`).then(r =>
        Array.isArray(r.data) ? r.data : r.data?.data ?? []
      ),
  });

  // Hourly chart: hours 6–23
  const displayHours = Array.from({ length: 18 }, (_, i) => i + 6);
  const hourMap = new Map(hourlyData.map((h: HourlyData) => [h.hour, h]));
  const maxHourlyAmount = Math.max(...displayHours.map(h => hourMap.get(h)?.amount ?? 0), 1);

  const sum = summary ?? { salesTotal: 0, transactionCount: 0, avgTicket: 0, refundTotal: 0, netTotal: 0 };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">אנליטיקס קופה</h1>
        {loadingSummary && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            טוען...
          </div>
        )}
      </div>

      {/* Date range filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">מתאריך</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={dateRange.from}
              onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">עד תאריך</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={dateRange.to}
              onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            {[
              { label: 'היום', days: 0 },
              { label: '7 ימים', days: 7 },
              { label: '30 ימים', days: 30 },
              { label: 'חודש זה', days: -1 },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  const to = new Date();
                  const from = new Date();
                  if (preset.days === 0) {
                    setDateRange({ from: toISO(to), to: toISO(to) });
                  } else if (preset.days === -1) {
                    from.setDate(1);
                    setDateRange({ from: toISO(from), to: toISO(to) });
                  } else {
                    from.setDate(from.getDate() - preset.days);
                    setDateRange({ from: toISO(from), to: toISO(to) });
                  }
                }}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title='סה"כ מכירות'
          value={fmtCurrency(sum.salesTotal)}
          icon={TrendingUp}
          color="bg-blue-600"
        />
        <KpiCard
          title="מספר עסקאות"
          value={fmtNumber(sum.transactionCount)}
          icon={Receipt}
          color="bg-indigo-500"
        />
        <KpiCard
          title="ממוצע לעסקה"
          value={fmtCurrency(sum.avgTicket)}
          icon={ShoppingBag}
          color="bg-violet-500"
        />
        <KpiCard
          title="החזרות"
          value={fmtCurrency(sum.refundTotal)}
          icon={RefreshCw}
          color="bg-red-500"
        />
        <KpiCard
          title="נטו"
          value={fmtCurrency(sum.netTotal)}
          icon={BarChart2}
          color="bg-green-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top 10 products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-500" />
            מוצרים מובילים (Top 10)
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">אין נתונים</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-right pb-2 font-medium text-gray-500 w-8">#</th>
                    <th className="text-right pb-2 font-medium text-gray-500">מוצר</th>
                    <th className="text-right pb-2 font-medium text-gray-500">כמות</th>
                    <th className="text-right pb-2 font-medium text-gray-500">הכנסה</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p: TopProduct, idx: number) => (
                    <tr key={p.productId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="py-2 font-medium text-gray-800">{p.name}</td>
                      <td className="py-2 text-gray-600">{fmtNumber(p.quantity)}</td>
                      <td className="py-2 font-semibold text-blue-600">{fmtCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payment mix */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-500" />
            תמהיל תשלומים
          </h2>
          {paymentMix.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">אין נתונים</p>
          ) : (
            <div className="space-y-4">
              {/* Pill summary row */}
              <div className="flex flex-wrap gap-2">
                {paymentMix.map((pm: PaymentMix) => (
                  <span
                    key={pm.method}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${
                      PAYMENT_BG[pm.method] ?? 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {PAYMENT_LABELS[pm.method] ?? pm.method}
                    <span className="font-bold">{Math.round(pm.pct)}%</span>
                  </span>
                ))}
              </div>

              {/* Progress bars */}
              <div className="space-y-3">
                {paymentMix.map((pm: PaymentMix) => (
                  <div key={pm.method}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span className="font-medium">{PAYMENT_LABELS[pm.method] ?? pm.method}</span>
                      <span className="text-gray-400">
                        {fmtCurrency(pm.amount)} · {fmtNumber(pm.count)} עסקאות
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full ${PAYMENT_COLORS[pm.method] ?? 'bg-gray-400'}`}
                        style={{ width: `${Math.min(100, pm.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center mt-2">
                <span className="text-sm font-medium text-gray-600">סה"כ</span>
                <span className="text-sm font-bold text-gray-900">
                  {fmtCurrency(paymentMix.reduce((s: number, pm: PaymentMix) => s + pm.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hourly chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-violet-500" />
            מכירות לפי שעה
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">תאריך:</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              value={todayDate}
              onChange={e => setTodayDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
          {displayHours.map(hour => {
            const data = hourMap.get(hour);
            const amount = data?.amount ?? 0;
            const count = data?.count ?? 0;
            const heightPct = maxHourlyAmount > 0 ? (amount / maxHourlyAmount) * 100 : 0;
            return (
              <div key={hour} className="flex flex-col items-center gap-1 flex-1 min-w-[36px] group">
                <div className="relative w-full flex flex-col justify-end" style={{ height: '160px' }}>
                  {/* Tooltip */}
                  {amount > 0 && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                      {fmtCurrency(amount)}
                      {count > 0 && ` · ${count} עסקאות`}
                    </div>
                  )}
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      amount > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-100'
                    }`}
                    style={{ height: `${Math.max(heightPct, amount > 0 ? 4 : 2)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{String(hour).padStart(2, '0')}</span>
              </div>
            );
          })}
        </div>

        {/* Hourly summary below chart */}
        {hourlyData.length > 0 && (
          <div className="flex gap-4 mt-3 flex-wrap">
            <div className="text-xs text-gray-500">
              שעת שיא:{' '}
              <span className="font-semibold text-gray-800">
                {String(
                  hourlyData.reduce(
                    (best: HourlyData, h: HourlyData) => (h.amount > best.amount ? h : best),
                    hourlyData[0]
                  ).hour
                ).padStart(2, '0')}:00
              </span>
            </div>
            <div className="text-xs text-gray-500">
              סה"כ עסקאות:{' '}
              <span className="font-semibold text-gray-800">
                {fmtNumber(hourlyData.reduce((s: number, h: HourlyData) => s + h.count, 0))}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              סה"כ מכירות:{' '}
              <span className="font-semibold text-gray-800">
                {fmtCurrency(hourlyData.reduce((s: number, h: HourlyData) => s + h.amount, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cashier performance */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-green-500" />
          ביצועי קופאים
        </h2>
        {cashierPerf.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">אין נתונים</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-right pb-3 font-medium text-gray-500">קופאי</th>
                  <th className="text-right pb-3 font-medium text-gray-500">מכירות</th>
                  <th className="text-right pb-3 font-medium text-gray-500">עסקאות</th>
                  <th className="text-right pb-3 font-medium text-gray-500">ממוצע</th>
                  <th className="pb-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {cashierPerf
                  .slice()
                  .sort((a: CashierPerf, b: CashierPerf) => b.salesTotal - a.salesTotal)
                  .map((c: CashierPerf, idx: number) => {
                    const maxSales = cashierPerf[0]?.salesTotal ?? 1;
                    const barPct = maxSales > 0 ? (c.salesTotal / maxSales) * 100 : 0;
                    return (
                      <tr key={c.cashierName} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-medium text-gray-800">{c.cashierName}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-800 w-24">
                              {fmtCurrency(c.salesTotal)}
                            </span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full min-w-[60px] max-w-[120px]">
                              <div
                                className="h-2 bg-green-400 rounded-full"
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">{fmtNumber(c.transactionCount)}</td>
                        <td className="py-3 text-gray-600">{fmtCurrency(c.avgTicket)}</td>
                        <td className="py-3 pr-4">
                          <div className="flex gap-1 flex-wrap justify-end">
                            {c.salesTotal > (cashierPerf[0]?.salesTotal ?? 0) * 0.8 && idx === 0 && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                                מוביל
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="py-3 font-semibold text-gray-700 pr-0">סה"כ</td>
                  <td className="py-3 font-bold text-gray-900">
                    {fmtCurrency(cashierPerf.reduce((s: number, c: CashierPerf) => s + c.salesTotal, 0))}
                  </td>
                  <td className="py-3 font-semibold text-gray-700">
                    {fmtNumber(cashierPerf.reduce((s: number, c: CashierPerf) => s + c.transactionCount, 0))}
                  </td>
                  <td className="py-3 text-gray-500">—</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
