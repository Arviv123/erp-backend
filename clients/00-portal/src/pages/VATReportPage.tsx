import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const MONTHS_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

async function getVAT(period: string) {
  const r = await api.get(`/accounting/reports/vat?period=${period}`);
  return r.data;
}

export default function VATReportPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data, isLoading } = useQuery({
    queryKey: ['acc-vat', period],
    queryFn: () => getVAT(period),
    enabled: !!period,
  });

  const vat = data ?? {};
  const [year, month] = period.split('-').map(Number);
  const salesTransactions: any[] = Array.isArray(vat.salesTransactions) ? vat.salesTransactions : [];
  const purchaseTransactions: any[] = Array.isArray(vat.purchaseTransactions) ? vat.purchaseTransactions : [];

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">דוח מע&quot;מ</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">תקופה:</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <h2 className="text-center text-lg font-bold text-gray-900 mb-1">דוח מע&quot;מ</h2>
          <p className="text-center text-sm text-gray-500 mb-6">{MONTHS_HE[month]} {year}</p>

          {/* Sales */}
          <section className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b border-gray-200">עסקאות חייבות (מכירות)</h3>
            {salesTransactions.length === 0 ? (
              <p className="text-sm text-gray-400 px-2">אין עסקאות</p>
            ) : salesTransactions.map((tx: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1.5 px-2 hover:bg-gray-50 rounded">
                <span className="text-gray-700">{tx.reference ?? tx.description}</span>
                <span className="text-gray-600">{fmtCurrency(tx.amount ?? 0)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold pt-2 mt-2 border-t border-gray-100 px-2">
              <span>סה&quot;כ עסקאות</span>
              <span>{fmtCurrency(vat.totalSales ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold px-2 mt-1">
              <span className="text-teal-700">מע&quot;מ עסקאות (18%)</span>
              <span className="text-teal-700">{fmtCurrency(vat.outputVat ?? (vat.totalSales ?? 0) * 0.18)}</span>
            </div>
          </section>

          {/* Purchases */}
          <section className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b border-gray-200">תשומות (קניות)</h3>
            {purchaseTransactions.length === 0 ? (
              <p className="text-sm text-gray-400 px-2">אין תשומות</p>
            ) : purchaseTransactions.map((tx: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1.5 px-2 hover:bg-gray-50 rounded">
                <span className="text-gray-700">{tx.reference ?? tx.description}</span>
                <span>{fmtCurrency(tx.amount ?? 0)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold px-2 mt-2">
              <span>מע&quot;מ תשומות</span>
              <span>{fmtCurrency(vat.inputVat ?? 0)}</span>
            </div>
          </section>

          {/* Net VAT */}
          <div className="flex justify-between text-base font-bold py-3 px-4 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-800">
            <span>מע&quot;מ לתשלום</span>
            <span>{fmtCurrency((vat.outputVat ?? 0) - (vat.inputVat ?? 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
