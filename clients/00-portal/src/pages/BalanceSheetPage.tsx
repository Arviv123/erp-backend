import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import AccountDrillDownModal from '../components/AccountDrillDownModal';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

async function getBS(asOf: string) {
  const r = await api.get(`/accounting/reports/balance-sheet${asOf ? '?asOf=' + asOf : ''}`);
  return r.data;
}

interface DrillDown { accountId: string; accountName: string }

function Section({ title, items, total, color, onDrillDown }: {
  title: string; items: any[]; total: number; color: string;
  onDrillDown: (item: any) => void;
}) {
  return (
    <section className="mb-6">
      <h3 className={`text-sm font-bold mb-3 pb-1 border-b ${color}`}>{title}</h3>
      {items.length === 0 ? <p className="text-sm text-gray-400 px-2">אין פריטים</p> : items.map((item: any, i: number) => (
        <div
          key={i}
          onClick={() => item.id && onDrillDown(item)}
          className={`flex justify-between text-sm py-1.5 px-2 rounded ${item.id ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50'}`}
        >
          <span className="text-gray-700 flex items-center gap-1.5">
            {item.code && <span className="text-xs text-gray-400 font-mono">{item.code}</span>}
            {item.name ?? item.accountName}
          </span>
          <span className="font-medium">{fmtCurrency(item.amount ?? item.balance ?? 0)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-gray-200 px-2">
        <span>סה&quot;כ {title}</span>
        <span>{fmtCurrency(total)}</span>
      </div>
    </section>
  );
}

export default function BalanceSheetPage() {
  const today = new Date().toISOString().split('T')[0];
  const [asOf, setAsOf] = useState(today);
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['acc-bs', asOf],
    queryFn: () => getBS(asOf),
  });

  const bs = data ?? {};
  const assets: any[] = Array.isArray(bs.assets) ? bs.assets : [];
  const liabilities: any[] = Array.isArray(bs.liabilities) ? bs.liabilities : [];
  const equity: any[] = Array.isArray(bs.equity) ? bs.equity : [];

  const totalAssets = bs.totalAssets ?? assets.reduce((s: number, a: any) => s + (a.amount ?? a.balance ?? 0), 0);
  const totalLiabilities = bs.totalLiabilities ?? liabilities.reduce((s: number, l: any) => s + (l.amount ?? l.balance ?? 0), 0);
  const totalEquity = bs.totalEquity ?? equity.reduce((s: number, e: any) => s + (e.amount ?? e.balance ?? 0), 0);
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מאזן</h1>
          {isBalanced && totalAssets > 0 && (
            <p className="text-xs text-green-600 mt-1">✅ נכסים = התחייבויות + הון</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">ליום:</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-center text-base font-bold text-gray-800 mb-1">נכסים</h2>
            <p className="text-center text-xs text-blue-500 mb-4">לחץ על חשבון לפירוט</p>
            <Section title="נכסים" items={assets} total={totalAssets} color="text-blue-700 border-blue-200" onDrillDown={item => setDrillDown({ accountId: item.id, accountName: item.name })} />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-center text-base font-bold text-gray-800 mb-1">התחייבויות והון</h2>
            <p className="text-center text-xs text-blue-500 mb-4">לחץ על חשבון לפירוט</p>
            <Section title="התחייבויות" items={liabilities} total={totalLiabilities} color="text-orange-700 border-orange-200" onDrillDown={item => setDrillDown({ accountId: item.id, accountName: item.name })} />
            <Section title="הון עצמי" items={equity} total={totalEquity} color="text-purple-700 border-purple-200" onDrillDown={item => setDrillDown({ accountId: item.id, accountName: item.name })} />
            <div className="flex justify-between text-sm font-bold pt-3 mt-3 border-t-2 border-gray-300 px-2">
              <span>סה&quot;כ התחייבויות + הון</span>
              <span className={isBalanced ? 'text-green-700' : 'text-red-600'}>{fmtCurrency(totalLiabilities + totalEquity)}</span>
            </div>
          </div>
        </div>
      )}

      {drillDown && (
        <AccountDrillDownModal
          accountId={drillDown.accountId}
          accountName={drillDown.accountName}
          asOf={asOf}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
