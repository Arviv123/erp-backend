import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const fmt = (n: number) =>
  n > 0 ? n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

const fmtTotal = (n: number) =>
  n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'נכסים', LIABILITY: 'התחייבויות', EQUITY: 'הון עצמי',
  REVENUE: 'הכנסות', EXPENSE: 'הוצאות',
};
const TYPE_COLORS: Record<string, string> = {
  ASSET: 'text-blue-700 bg-blue-50', LIABILITY: 'text-orange-700 bg-orange-50',
  EQUITY: 'text-purple-700 bg-purple-50', REVENUE: 'text-green-700 bg-green-50',
  EXPENSE: 'text-red-700 bg-red-50',
};

interface PeriodRow {
  id: string; code: string; name: string; type: string;
  openingDebit: number; openingCredit: number;
  periodDebit:  number; periodCredit:  number;
  closingDebit: number; closingCredit: number;
}

interface SimpleRow { id: string; code: string; name: string; type: string; totalDebits: number; totalCredits: number; }

export default function TrialBalancePage() {
  const navigate = useNavigate();
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const today = now.toISOString().slice(0, 10);

  const [mode, setMode]     = useState<'period' | 'simple'>('period');
  const [from, setFrom]     = useState(yearStart);
  const [to, setTo]         = useState(today);
  const [asOf, setAsOf]     = useState(today);
  const [search, setSearch] = useState('');

  const { data: periodData, isLoading: periodLoading } = useQuery({
    queryKey: ['acc-trial-balance-period', from, to],
    queryFn:  () => api.get('/accounting/trial-balance', { params: { from, to } })
      .then(r => r.data.data as { rows: PeriodRow[]; totals: any; isBalanced: boolean }),
    enabled: mode === 'period',
  });

  const { data: simpleData, isLoading: simpleLoading } = useQuery({
    queryKey: ['acc-trial-balance-simple', asOf],
    queryFn:  () => api.get('/accounting/trial-balance', { params: { asOf } })
      .then(r => {
        const d = r.data.data;
        const rows: SimpleRow[] = Array.isArray(d?.rows) ? d.rows : Array.isArray(d) ? d : [];
        const totalDebits  = rows.reduce((s, r) => s + (r.totalDebits  ?? 0), 0);
        const totalCredits = rows.reduce((s, r) => s + (r.totalCredits ?? 0), 0);
        return { rows, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 };
      }),
    enabled: mode === 'simple',
  });

  const filterRows = <T extends { code: string; name: string }>(rows: T[]) => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(r => r.code.toLowerCase().includes(s) || r.name.toLowerCase().includes(s));
  };

  const openLedger = (accountId: string) => {
    const f = mode === 'period' ? from : yearStart;
    const t = mode === 'period' ? to   : asOf;
    navigate(`/accounting/ledger?accountId=${accountId}&from=${f}&to=${t}`);
  };

  const isLoading = mode === 'period' ? periodLoading : simpleLoading;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מאזן בוחן</h1>
          {mode === 'period' && periodData?.isBalanced && (
            <p className="text-xs text-green-600 mt-1 font-medium">✅ המאזן מאוזן</p>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button onClick={() => setMode('period')}
            className={`px-3 py-1.5 ${mode === 'period' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            6 עמודות (תקופה)
          </button>
          <button onClick={() => setMode('simple')}
            className={`px-3 py-1.5 ${mode === 'simple' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            צבור עד לתאריך
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4 flex flex-wrap gap-3 items-end">
        {mode === 'period' ? (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs text-gray-500 mb-1">ליום</label>
            <input type="date" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={asOf} onChange={e => setAsOf(e.target.value)} />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">חיפוש</label>
          <input className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44" placeholder="קוד / שם חשבון" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <p className="text-xs text-blue-500 self-center pb-1">לחץ על חשבון לפתיחת כרטסת</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : mode === 'period' && periodData ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-14" rowSpan={2}>קוד</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-600" rowSpan={2}>שם חשבון</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-12" rowSpan={2}>סוג</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium text-gray-500 border-r border-l border-gray-200 bg-gray-100">יתרת פתיחה</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium text-gray-500 border-r border-gray-200 bg-blue-50">תנועות תקופה</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium text-gray-500 bg-gray-100">יתרת סגירה</th>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="px-2 py-1 text-center text-blue-600 border-r border-gray-100 bg-gray-100">חובה</th>
                <th className="px-2 py-1 text-center text-orange-600 border-r border-gray-200 bg-gray-100">זכות</th>
                <th className="px-2 py-1 text-center text-blue-600 border-r border-gray-100 bg-blue-50">חובה</th>
                <th className="px-2 py-1 text-center text-orange-600 border-r border-gray-200 bg-blue-50">זכות</th>
                <th className="px-2 py-1 text-center text-blue-600 border-r border-gray-100 bg-gray-100">חובה</th>
                <th className="px-2 py-1 text-center text-orange-600 bg-gray-100">זכות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filterRows(periodData.rows).map((row) => (
                <tr key={row.id} onClick={() => openLedger(row.id)} className="hover:bg-blue-50 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-gray-600">{row.code}</td>
                  <td className="px-3 py-2 text-gray-900 font-medium">{row.name}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1 py-0.5 rounded ${TYPE_COLORS[row.type] ?? ''}`}>
                      {TYPE_LABELS[row.type]?.slice(0, 3) ?? row.type}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-left text-blue-700 border-r border-gray-100">{fmt(row.openingDebit)}</td>
                  <td className="px-2 py-2 text-left text-orange-600 border-r border-gray-200">{fmt(row.openingCredit)}</td>
                  <td className="px-2 py-2 text-left text-blue-700 border-r border-gray-100 bg-blue-50/30">{fmt(row.periodDebit)}</td>
                  <td className="px-2 py-2 text-left text-orange-600 border-r border-gray-200 bg-blue-50/30">{fmt(row.periodCredit)}</td>
                  <td className="px-2 py-2 text-left text-blue-700 font-semibold border-r border-gray-100">{fmt(row.closingDebit)}</td>
                  <td className="px-2 py-2 text-left text-orange-600 font-semibold">{fmt(row.closingCredit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-100 font-bold text-xs">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-gray-700">סה"כ</td>
                <td className="px-2 py-2.5 text-left text-blue-700 border-r border-gray-200">{fmtTotal(periodData.totals.openingDebit)}</td>
                <td className="px-2 py-2.5 text-left text-orange-600 border-r border-gray-300">{fmtTotal(periodData.totals.openingCredit)}</td>
                <td className="px-2 py-2.5 text-left text-blue-700 border-r border-gray-200">{fmtTotal(periodData.totals.periodDebit)}</td>
                <td className="px-2 py-2.5 text-left text-orange-600 border-r border-gray-300">{fmtTotal(periodData.totals.periodCredit)}</td>
                <td className="px-2 py-2.5 text-left text-blue-700 border-r border-gray-200">{fmtTotal(periodData.totals.closingDebit)}</td>
                <td className={`px-2 py-2.5 text-left ${periodData.isBalanced ? 'text-orange-600' : 'text-red-600'}`}>
                  {fmtTotal(periodData.totals.closingCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : mode === 'simple' && simpleData ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">קוד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם חשבון</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סוג</th>
                <th className="text-left px-4 py-3 font-medium text-blue-600">חובה</th>
                <th className="text-left px-4 py-3 font-medium text-orange-600">זכות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filterRows(simpleData.rows).map((acc) => (
                <tr key={acc.id ?? acc.code} onClick={() => acc.id && openLedger(acc.id)} className="hover:bg-blue-50 cursor-pointer">
                  <td className="px-4 py-2.5 font-mono text-sm text-gray-600">{acc.code}</td>
                  <td className="px-4 py-2.5 text-gray-900">{acc.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[acc.type] ?? ''}`}>
                      {TYPE_LABELS[acc.type] ?? acc.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-blue-700">{acc.totalDebits > 0 ? fmtTotal(acc.totalDebits) : ''}</td>
                  <td className="px-4 py-2.5 font-medium text-orange-600">{acc.totalCredits > 0 ? fmtTotal(acc.totalCredits) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-gray-700">סה"כ</td>
                <td className="px-4 py-3 text-blue-700">{fmtTotal(simpleData.totalDebits)}</td>
                <td className={`px-4 py-3 ${simpleData.isBalanced ? 'text-orange-600' : 'text-red-600'}`}>
                  {fmtTotal(simpleData.totalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
