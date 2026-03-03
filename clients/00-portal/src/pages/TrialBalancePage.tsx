import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

async function getTrialBalance(asOf: string) {
  const r = await api.get(`/accounting/trial-balance${asOf ? '?asOf=' + asOf : ''}`);
  return r.data;
}

export default function TrialBalancePage() {
  const today = new Date().toISOString().split('T')[0];
  const [asOf, setAsOf] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['acc-trial-balance', asOf],
    queryFn: () => getTrialBalance(asOf),
  });

  const accounts: any[] = Array.isArray(data) ? data : Array.isArray(data?.accounts) ? data.accounts : [];
  const totalDebit = accounts.reduce((s, a) => s + (a.debit ?? 0), 0);
  const totalCredit = accounts.reduce((s, a) => s + (a.credit ?? 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מאזן בוחן</h1>
          {isBalanced && accounts.length > 0 && (
            <p className="text-xs text-green-600 mt-1 font-medium">✅ המאזן מאוזן</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">ליום:</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
        ) : accounts.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">אין נתונים</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">קוד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם חשבון</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">חיוב</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">זיכוי</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc: any) => (
                <tr key={acc.id ?? acc.code} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm text-gray-600">{acc.code}</td>
                  <td className="px-4 py-3 text-gray-900">{acc.name}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{acc.debit ? fmtCurrency(acc.debit) : ''}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{acc.credit ? fmtCurrency(acc.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-gray-700">סה&quot;כ</td>
                <td className="px-4 py-3 text-gray-900">{fmtCurrency(totalDebit)}</td>
                <td className={`px-4 py-3 ${isBalanced ? 'text-green-700' : 'text-red-600'}`}>{fmtCurrency(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
