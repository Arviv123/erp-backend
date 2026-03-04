import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import AccountDrillDownModal from '../components/AccountDrillDownModal';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const now = new Date();
const defaultFrom = `${now.getFullYear()}-01-01`;
const defaultTo = now.toISOString().split('T')[0];

async function getPL(from: string, to: string) {
  const r = await api.get(`/accounting/reports/pl?from=${from}&to=${to}`);
  return r.data;
}

interface DrillDown { accountId: string; accountName: string }

export default function PLReportPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['acc-pl', from, to],
    queryFn: () => getPL(from, to),
    enabled: !!(from && to),
  });

  const pl = data ?? {};
  const revenues: any[] = Array.isArray(pl.revenues) ? pl.revenues : [];
  const expenses: any[] = Array.isArray(pl.expenses) ? pl.expenses : [];
  const totalRevenue = pl.totalRevenue ?? revenues.reduce((s: number, r: any) => s + (r.amount ?? r.balance ?? 0), 0);
  const totalExpenses = pl.totalExpenses ?? pl.totalExpense ?? expenses.reduce((s: number, e: any) => s + (e.amount ?? e.balance ?? 0), 0);
  const netProfit = pl.netProfit ?? (totalRevenue - totalExpenses);

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">דוח רווח והפסד</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">מ:</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
          <label className="text-sm text-gray-500">עד:</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <h2 className="text-center text-lg font-bold text-gray-900 mb-1">דוח רווח והפסד</h2>
          <p className="text-center text-sm text-gray-500 mb-1">
            {new Date(from).toLocaleDateString('he-IL')} — {new Date(to).toLocaleDateString('he-IL')}
          </p>
          <p className="text-center text-xs text-blue-500 mb-6">לחץ על חשבון לפירוט עסקאות</p>

          {/* Revenues */}
          <section className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b border-gray-200">הכנסות</h3>
            {revenues.length === 0 ? (
              <p className="text-sm text-gray-400 px-2">אין הכנסות</p>
            ) : revenues.map((r: any, i: number) => (
              <div
                key={i}
                onClick={() => r.id && setDrillDown({ accountId: r.id, accountName: r.name ?? r.accountName })}
                className={`flex justify-between text-sm py-1.5 px-2 rounded ${r.id ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50'}`}
              >
                <span className="text-gray-700 flex items-center gap-1.5">
                  {r.code && <span className="text-xs text-gray-400 font-mono">{r.code}</span>}
                  {r.name ?? r.accountName}
                </span>
                <span className="font-medium text-green-700">{fmtCurrency(r.amount ?? r.balance ?? 0)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-gray-200 px-2">
              <span>סה&quot;כ הכנסות</span>
              <span className="text-green-700">{fmtCurrency(totalRevenue)}</span>
            </div>
          </section>

          {/* Expenses */}
          <section className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b border-gray-200">הוצאות</h3>
            {expenses.length === 0 ? (
              <p className="text-sm text-gray-400 px-2">אין הוצאות</p>
            ) : expenses.map((e: any, i: number) => (
              <div
                key={i}
                onClick={() => e.id && setDrillDown({ accountId: e.id, accountName: e.name ?? e.accountName })}
                className={`flex justify-between text-sm py-1.5 px-2 rounded ${e.id ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50'}`}
              >
                <span className="text-gray-700 flex items-center gap-1.5">
                  {e.code && <span className="text-xs text-gray-400 font-mono">{e.code}</span>}
                  {e.name ?? e.accountName}
                </span>
                <span className="font-medium text-red-600">{fmtCurrency(e.amount ?? e.balance ?? 0)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-gray-200 px-2">
              <span>סה&quot;כ הוצאות</span>
              <span className="text-red-600">{fmtCurrency(totalExpenses)}</span>
            </div>
          </section>

          {/* Net profit */}
          <div className={`flex justify-between text-base font-bold py-3 px-4 rounded-xl border-2 ${
            netProfit >= 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            <span>{netProfit >= 0 ? 'רווח נקי' : 'הפסד נקי'}</span>
            <span>{netProfit < 0 ? `(${fmtCurrency(Math.abs(netProfit))})` : fmtCurrency(netProfit)}</span>
          </div>
        </div>
      )}

      {drillDown && (
        <AccountDrillDownModal
          accountId={drillDown.accountId}
          accountName={drillDown.accountName}
          from={from}
          to={to}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
