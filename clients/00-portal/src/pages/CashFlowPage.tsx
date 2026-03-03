import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

async function getCashFlow(from: string, to: string) {
  const r = await api.get(`/accounting/reports/cash-flow?from=${from}&to=${to}`);
  return r.data;
}

function FlowSection({ title, flows, net }: { title: string; flows: any[]; net: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className={`text-sm font-bold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {net >= 0 ? '+' : ''}{fmtCurrency(net)}
        </span>
      </div>
      {flows.length === 0 ? (
        <div className="flex items-center justify-center h-14 text-gray-400 text-xs">אין תנועות בתקופה</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {flows.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
              <div className="flex items-center gap-2.5 min-w-0">
                {f.amount >= 0
                  ? <ArrowDownLeft className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  : <ArrowUpRight  className="w-3.5 h-3.5 text-red-400   flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{f.description}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(f.date).toLocaleDateString('he-IL')} · {f.reference}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-medium whitespace-nowrap mr-4 ${f.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {f.amount >= 0 ? '+' : ''}{fmtCurrency(f.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CashFlowPage() {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to,   setTo]   = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);

  const { data, isLoading } = useQuery({
    queryKey: ['cash-flow', from, to],
    queryFn:  () => getCashFlow(from, to),
    enabled:  !!from && !!to,
  });

  const cf = data ?? {
    openingCash: 0, netCashChange: 0, closingCash: 0,
    operating: { flows: [], net: 0 },
    investing:  { flows: [], net: 0 },
    financing:  { flows: [], net: 0 },
  };

  const summaryCards = [
    { label: 'יתרת פתיחה',    value: cf.openingCash,        color: 'bg-gray-50 border-gray-200 text-gray-800'  },
    { label: 'תזרים תפעולי',  value: cf.operating?.net ?? 0, color: cf.operating?.net >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800' },
    { label: 'שינוי נטו',      value: cf.netCashChange,       color: cf.netCashChange >= 0 ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-orange-50 border-orange-200 text-orange-800' },
    { label: 'יתרת סגירה',    value: cf.closingCash,         color: 'bg-blue-50 border-blue-200 text-blue-800' },
  ];

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">תזרים מזומנים</h1>
          <p className="text-sm text-gray-500 mt-1">IAS 7 — שיטה ישירה (Direct Method)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">מ:</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">עד:</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {summaryCards.map(card => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
            <p className="text-xs font-medium mb-1 opacity-75">{card.label}</p>
            <p className="text-xl font-bold">{fmtCurrency(card.value)}</p>
          </div>
        ))}
      </div>

      {/* Net indicator */}
      {!isLoading && (
        <div className={`flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${cf.netCashChange >= 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {cf.netCashChange >= 0
            ? <TrendingUp  className="w-4 h-4" />
            : <TrendingDown className="w-4 h-4" />}
          {cf.netCashChange >= 0 ? 'עלייה' : 'ירידה'} ביתרת מזומנים של {fmtCurrency(Math.abs(cf.netCashChange))} בתקופה
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="space-y-4">
          <FlowSection title="💼 פעילות שוטפת (Operating)" flows={cf.operating?.flows ?? []} net={cf.operating?.net ?? 0} />
          <FlowSection title="🏗️ פעילות השקעה (Investing)"  flows={cf.investing?.flows  ?? []} net={cf.investing?.net  ?? 0} />
          <FlowSection title="💰 פעילות מימון (Financing)"  flows={cf.financing?.flows  ?? []} net={cf.financing?.net  ?? 0} />
        </div>
      )}
    </div>
  );
}
