import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, DollarSign, Building2 } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const now = new Date();
const fromDate = `${now.getFullYear()}-01-01`;
const toDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

async function getPL() { const r = await api.get(`/accounting/reports/pl?from=${fromDate}&to=${toDate}`); return r.data; }
async function getBalanceSheet() { const r = await api.get('/accounting/reports/balance-sheet'); return r.data; }
async function getTransactions() { const r = await api.get('/accounting/transactions?pageSize=5'); return r.data; }

function KPICard({ label, value, sub, icon: Icon, color, negative }: {
  label: string; value: string; sub?: string; icon: any; color: string; negative?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className={`text-2xl font-bold ${negative ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { DRAFT: 'טיוטה', POSTED: 'מאושר', VOID: 'מבוטל' };
const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  POSTED: 'bg-green-100 text-green-700',
  VOID: 'bg-red-100 text-red-600',
};

export default function AccountingDashboardPage() {
  const { data: plData } = useQuery({ queryKey: ['acc-pl'], queryFn: getPL });
  const { data: bsData } = useQuery({ queryKey: ['acc-bs'], queryFn: getBalanceSheet });
  const { data: txData } = useQuery({ queryKey: ['acc-tx-recent'], queryFn: getTransactions });

  const pl = plData ?? {};
  const bs = bsData ?? {};
  const transactions: any[] = Array.isArray(txData) ? txData : Array.isArray(txData?.data) ? txData.data : [];

  const totalRevenue = pl.totalRevenue ?? 0;
  const totalExpenses = pl.totalExpenses ?? 0;
  const netProfit = pl.netProfit ?? (totalRevenue - totalExpenses);
  const totalAssets = bs.totalAssets ?? 0;

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">לוח בקרה — הנהלת חשבונות</h1>
        <p className="text-sm text-gray-500 mt-1">{new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="סה&quot;כ נכסים" value={fmtCurrency(totalAssets)} icon={Building2} color="bg-blue-50 text-blue-600" sub="מאזן" />
        <KPICard label="הכנסות" value={fmtCurrency(totalRevenue)} icon={TrendingUp} color="bg-green-50 text-green-600" sub={`${now.getFullYear()} מצטבר`} />
        <KPICard label="הוצאות" value={fmtCurrency(totalExpenses)} icon={TrendingDown} color="bg-red-50 text-red-600" sub={`${now.getFullYear()} מצטבר`} />
        <KPICard label="רווח נקי" value={fmtCurrency(netProfit)} icon={DollarSign}
          color={netProfit < 0 ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-600'}
          sub={`${now.getFullYear()} מצטבר`} negative={netProfit < 0} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">פעולות אחרונות</h2>
        </div>
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">אין פעולות</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">תאריך</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">אסמכתא</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">תיאור</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">סכום</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">סטאטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {tx.date ? new Date(tx.date).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{tx.reference ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-800">{tx.description ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {fmtCurrency(tx.lines?.reduce((s: number, l: any) => s + (l.amount ?? 0), 0) / 2 ?? 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[tx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[tx.status] ?? tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
