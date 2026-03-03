import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Download } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('he-IL');

const MONTHS_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

async function getVAT(period: string) {
  const r = await api.get(`/accounting/reports/vat?period=${period}`);
  return r.data;
}

function BreakdownTable({ rows, type }: { rows: any[]; type: 'sales' | 'purchases' }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400 px-2 py-3">אין {type === 'sales' ? 'עסקאות' : 'תשומות'}</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-500 border-b border-gray-100">
          <th className="text-right py-1.5 px-2 font-medium">תאריך</th>
          <th className="text-right py-1.5 px-2 font-medium">מספר</th>
          <th className="text-right py-1.5 px-2 font-medium">{type === 'sales' ? 'לקוח' : 'ספק'}</th>
          <th className="text-left  py-1.5 px-2 font-medium">בסיס</th>
          <th className="text-left  py-1.5 px-2 font-medium">מע&quot;מ</th>
          <th className="text-left  py-1.5 px-2 font-medium">סה&quot;כ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-gray-50">
            <td className="py-1.5 px-2 text-gray-500">{fmtDate(row.date)}</td>
            <td className="py-1.5 px-2 font-mono text-gray-600">{row.number}</td>
            <td className="py-1.5 px-2 text-gray-800">{row.customer ?? row.vendor}</td>
            <td className="py-1.5 px-2 text-left text-gray-700">{fmtCurrency(row.subtotal)}</td>
            <td className="py-1.5 px-2 text-left text-teal-700">{fmtCurrency(row.vat)}</td>
            <td className="py-1.5 px-2 text-left font-medium text-gray-900">{fmtCurrency(row.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function VATReportPage() {
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  const { data, isLoading } = useQuery({
    queryKey: ['acc-vat', period],
    queryFn:  () => getVAT(period),
    enabled:  !!period,
  });

  const [year, month] = period.split('-').map(Number);
  const vat       = data ?? {};
  const sales     = vat.sales     ?? { count: 0, subtotal: 0, vatCollected: 0, total: 0, breakdown: [] };
  const purchases = vat.purchases ?? { count: 0, subtotal: 0, vatPaid: 0,      total: 0, breakdown: [] };
  const summary   = vat.summary   ?? { vatCollected: 0, vatPaid: 0, vatDue: 0, isRefund: false };

  const handleExportCSV = () => {
    const BOM = '\uFEFF';
    const header = 'סוג,תאריך,מספר,שם,בסיס,מעמ,סהכ\n';
    const salesRows = sales.breakdown.map((r: any) =>
      `עסקה,${fmtDate(r.date)},${r.number},${r.customer},${r.subtotal},${r.vat},${r.total}`).join('\n');
    const purchaseRows = purchases.breakdown.map((r: any) =>
      `תשומה,${fmtDate(r.date)},${r.number},${r.vendor},${r.subtotal},${r.vat},${r.total}`).join('\n');
    const blob = new Blob([BOM + header + salesRows + '\n' + purchaseRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vat-report-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">דוח מע&quot;מ — טופס 83</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">תקופה:</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
          </div>
          {!isLoading && data && (
            <>
              <button onClick={handleExportCSV}
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                <Printer className="w-3.5 h-3.5" /> הדפס
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 text-center">
            <p className="text-xs text-gray-500">דוח מע&quot;מ — טופס 83</p>
            <h2 className="text-lg font-bold text-gray-900">
              {MONTHS_HE[month]} {year}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              הופק: {new Date().toLocaleDateString('he-IL')}
            </p>
          </div>

          {/* עסקאות (Output VAT) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 rounded-t-xl flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-blue-800">עסקאות חייבות — מע&quot;מ עסקאות</h3>
                <p className="text-xs text-blue-600 mt-0.5">{sales.count} חשבוניות</p>
              </div>
              <div className="text-left">
                <p className="text-xs text-blue-600">בסיס: {fmtCurrency(sales.subtotal)}</p>
                <p className="text-sm font-bold text-blue-800">מע&quot;מ: {fmtCurrency(sales.vatCollected)}</p>
              </div>
            </div>
            <div className="px-2 py-1">
              <BreakdownTable rows={sales.breakdown ?? []} type="sales" />
            </div>
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 rounded-b-xl flex justify-between text-sm">
              <span className="font-semibold text-gray-700">סה&quot;כ עסקאות</span>
              <div className="flex gap-6 text-left">
                <span className="text-gray-600">{fmtCurrency(sales.subtotal)}</span>
                <span className="font-bold text-blue-800">{fmtCurrency(sales.vatCollected)}</span>
                <span className="text-gray-700">{fmtCurrency(sales.total)}</span>
              </div>
            </div>
          </div>

          {/* תשומות (Input VAT) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 bg-green-50 border-b border-green-100 rounded-t-xl flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-green-800">תשומות — מע&quot;מ קניות</h3>
                <p className="text-xs text-green-600 mt-0.5">{purchases.count} חשבוניות ספקים</p>
              </div>
              <div className="text-left">
                <p className="text-xs text-green-600">בסיס: {fmtCurrency(purchases.subtotal)}</p>
                <p className="text-sm font-bold text-green-800">מע&quot;מ: {fmtCurrency(purchases.vatPaid)}</p>
              </div>
            </div>
            <div className="px-2 py-1">
              <BreakdownTable rows={purchases.breakdown ?? []} type="purchases" />
            </div>
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 rounded-b-xl flex justify-between text-sm">
              <span className="font-semibold text-gray-700">סה&quot;כ תשומות</span>
              <div className="flex gap-6 text-left">
                <span className="text-gray-600">{fmtCurrency(purchases.subtotal)}</span>
                <span className="font-bold text-green-800">{fmtCurrency(purchases.vatPaid)}</span>
                <span className="text-gray-700">{fmtCurrency(purchases.total)}</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className={`rounded-xl border-2 p-5 ${summary.isRefund ? 'bg-green-50 border-green-300' : 'bg-teal-50 border-teal-300'}`}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">סיכום — מע&quot;מ לדיווח</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">מע&quot;מ עסקאות (חייב):</span>
                <span className="font-semibold text-blue-700">{fmtCurrency(summary.vatCollected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">מע&quot;מ תשומות (ניכוי):</span>
                <span className="font-semibold text-green-700">({fmtCurrency(summary.vatPaid)})</span>
              </div>
              <div className={`flex justify-between text-lg font-bold pt-2 border-t-2 ${summary.isRefund ? 'border-green-300 text-green-800' : 'border-teal-300 text-teal-800'}`}>
                <span>{summary.isRefund ? 'מע&quot;מ להחזר' : 'מע&quot;מ לתשלום לרשות המסים'}</span>
                <span>{fmtCurrency(Math.abs(summary.vatDue))}</span>
              </div>
            </div>
            {summary.isRefund && (
              <p className="text-xs text-green-700 mt-2 bg-green-100 rounded-lg px-3 py-1.5">
                ✅ התשומות עולות על העסקאות — קיים זיכוי מע&quot;מ להחזר
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
