import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { PieChart, Loader2 } from 'lucide-react';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export default function AgingReportPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['aging'],
    queryFn: () => api.get('/invoices/aging'),
  });

  const report = data?.data ?? data;
  const rows: any[] = Array.isArray(report?.customers) ? report.customers
    : Array.isArray(report?.rows) ? report.rows
    : Array.isArray(report) ? report : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin ml-2" size={20} /> טוען דוח...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-red-500">
        שגיאה בטעינת הדוח. יש צורך בהרשאת ACCOUNTANT לפחות.
      </div>
    );
  }

  const totals = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0, total: 0 };

  const normalizedRows = rows.map((r: any) => {
    const row = {
      name: r.customerName || r.name || r.customer?.name || '—',
      '0_30': r['0_30'] || r.current || r['0-30'] || 0,
      '31_60': r['31_60'] || r['31-60'] || 0,
      '61_90': r['61_90'] || r['61-90'] || 0,
      '90_plus': r['90_plus'] || r['90+'] || r.over90 || 0,
      total: r.total || r.totalDebt || 0,
    };
    totals['0_30'] += row['0_30'];
    totals['31_60'] += row['31_60'];
    totals['61_90'] += row['61_90'];
    totals['90_plus'] += row['90_plus'];
    totals.total += row.total;
    return row;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <PieChart size={24} className="text-blue-600" />
        <h2 className="text-xl font-bold text-gray-800">דוח גיל חובות</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {normalizedRows.length === 0 ? (
          <div className="text-center py-20 text-gray-400">אין חובות פתוחים</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3 text-right font-medium">לקוח</th>
                <th className="px-4 py-3 text-right font-medium">0-30 יום</th>
                <th className="px-4 py-3 text-right font-medium">31-60 יום</th>
                <th className="px-4 py-3 text-right font-medium">61-90 יום</th>
                <th className="px-4 py-3 text-right font-medium">90+ יום</th>
                <th className="px-4 py-3 text-right font-medium">סה״כ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {normalizedRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row['0_30'] ? fmtCurrency(row['0_30']) : '—'}</td>
                  <td className="px-4 py-3">{row['31_60'] ? fmtCurrency(row['31_60']) : '—'}</td>
                  <td className="px-4 py-3">{row['61_90'] ? fmtCurrency(row['61_90']) : '—'}</td>
                  <td className="px-4 py-3">{row['90_plus'] ? fmtCurrency(row['90_plus']) : '—'}</td>
                  <td className="px-4 py-3 font-bold text-red-600">{fmtCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold text-sm border-t-2 border-gray-300">
                <td className="px-4 py-3">סה״כ</td>
                <td className="px-4 py-3">{totals['0_30'] ? fmtCurrency(totals['0_30']) : '—'}</td>
                <td className="px-4 py-3">{totals['31_60'] ? fmtCurrency(totals['31_60']) : '—'}</td>
                <td className="px-4 py-3">{totals['61_90'] ? fmtCurrency(totals['61_90']) : '—'}</td>
                <td className="px-4 py-3">{totals['90_plus'] ? fmtCurrency(totals['90_plus']) : '—'}</td>
                <td className="px-4 py-3 text-red-600">{fmtCurrency(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
