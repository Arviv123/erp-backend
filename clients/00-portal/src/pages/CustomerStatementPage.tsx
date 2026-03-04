import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Printer, FileDown } from 'lucide-react';
import api from '../lib/api';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');
const fmtCur  = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  DRAFT:'טיוטה', SENT:'נשלח', PAID:'שולם', OVERDUE:'פג תוקף', CANCELLED:'בוטל', PARTIAL:'חלקי',
};

async function getCustomer(id: string) {
  const r = await api.get(`/crm/customers/${id}`);
  return r.data?.data ?? r.data;
}
async function getInvoices(customerId: string, from?: string, to?: string) {
  const params: any = { customerId, pageSize: 500 };
  if (from) params.from = from;
  if (to)   params.to   = to;
  const r = await api.get('/invoices', { params });
  return (Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : []) as any[];
}

interface StatementLine {
  date:    string;
  docNo:   string;
  desc:    string;
  debit:   number;
  credit:  number;
  balance: number;
  type:    'invoice' | 'payment';
  status?: string;
  id?:     string;
}

export default function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const today  = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(firstOfYear);
  const [to,   setTo]   = useState(today);

  const { data: customer, isLoading: loadingCust } = useQuery({
    queryKey: ['customer', id],
    queryFn:  () => getCustomer(id!),
    enabled:  !!id,
  });

  const { data: invoices = [], isLoading: loadingInv } = useQuery({
    queryKey: ['customer-invoices-statement', id, from, to],
    queryFn:  () => getInvoices(id!, from, to),
    enabled:  !!id,
  });

  const isLoading = loadingCust || loadingInv;

  // Build statement lines from invoices + payments
  const lines: StatementLine[] = [];
  let runningBalance = 0;

  // Sort all invoices by date
  const sorted = [...invoices].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const inv of sorted) {
    if (inv.status === 'CANCELLED') continue;

    // Invoice line
    const amount = Number(inv.totalAmount ?? inv.total ?? 0);
    runningBalance += amount;
    lines.push({
      date:    inv.date,
      docNo:   inv.invoiceNumber ?? inv.number ?? inv.id,
      desc:    `חשבונית${inv.reference ? ` — ${inv.reference}` : ''}`,
      debit:   amount,
      credit:  0,
      balance: runningBalance,
      type:    'invoice',
      status:  inv.status,
      id:      inv.id,
    });

    // Payment lines
    const payments: any[] = Array.isArray(inv.payments) ? inv.payments : [];
    for (const pmt of payments.sort((a:any, b:any) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
      const pmtAmt = Number(pmt.amount ?? 0);
      runningBalance -= pmtAmt;
      lines.push({
        date:   pmt.date ?? inv.date,
        docNo:  pmt.reference ?? 'RCP',
        desc:   `תשלום — ${pmt.method === 'BANK_TRANSFER' ? 'העברה בנקאית' : pmt.method === 'CASH' ? 'מזומן' : pmt.method === 'CREDIT_CARD' ? 'כרטיס אשראי' : pmt.method === 'CHECK' ? 'צ׳ק' : pmt.method ?? ''}`,
        debit:  0,
        credit: pmtAmt,
        balance: runningBalance,
        type:   'payment',
      });
    }
  }

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const balance     = totalDebit - totalCredit;

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<title>דף חשבון — ${customer?.name ?? ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; direction: rtl; padding: 20px; }
  h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #555; margin-bottom: 16px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1d4ed8; padding-bottom: 14px; }
  .customer-block { background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .customer-block .name { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1d4ed8; color: white; padding: 6px 8px; text-align: right; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
  .debit { color: #b91c1c; }
  .credit { color: #059669; }
  .balance-neg { color: #b91c1c; font-weight: bold; }
  .balance-pos { color: #059669; font-weight: bold; }
  tfoot td { border-top: 2px solid #1d4ed8; font-weight: bold; background: #f9fafb; padding: 8px; }
  .summary { margin-top: 16px; display: flex; gap: 24px; justify-content: flex-end; }
  .sum-box { text-align: center; padding: 10px 16px; border: 1px solid #e5e7eb; border-radius: 6px; }
  .sum-box .val { font-size: 15px; font-weight: bold; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${content}
</body>
</html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-60 text-gray-400">טוען...</div>
  );

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">דף חשבון — {customer?.name}</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-800 text-white text-sm px-4 py-2 rounded-lg">
            <Printer size={15} /> הדפס
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'סה"כ חיוב',    value: fmtCur(totalDebit),  color: 'text-red-700' },
          { label: 'סה"כ תשלומים', value: fmtCur(totalCredit), color: 'text-green-700' },
          { label: 'יתרה לגביה',   value: fmtCur(balance),     color: balance > 0 ? 'text-orange-700' : 'text-green-700' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Printable statement */}
      <div ref={printRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Print header (visible in print) */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black text-gray-900">דף חשבון לקוח</h2>
              <p className="text-sm text-gray-500 mt-1">תקופה: {fmtDate(from)} — {fmtDate(to)}</p>
              <p className="text-xs text-gray-400">הופק: {fmtDate(today)}</p>
            </div>
            <div className="text-left">
              <div className="font-bold text-gray-900 text-lg">{customer?.name}</div>
              {customer?.businessNumber && (
                <div className="text-sm text-gray-500">ח.פ. / ע.מ.: {customer.businessNumber}</div>
              )}
              {customer?.email && <div className="text-sm text-gray-500">{customer.email}</div>}
              {customer?.phone && <div className="text-sm text-gray-500">{customer.phone}</div>}
            </div>
          </div>
        </div>

        {/* Statement table */}
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            אין תנועות בתקופה זו
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-white text-xs">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">תאריך</th>
                  <th className="px-4 py-3 text-right font-medium">מסמך</th>
                  <th className="px-4 py-3 text-right font-medium">תיאור</th>
                  <th className="px-4 py-3 text-right font-medium">חיוב</th>
                  <th className="px-4 py-3 text-right font-medium">זיכוי</th>
                  <th className="px-4 py-3 text-right font-medium">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${
                    line.type === 'payment' ? 'bg-green-50/30' : 'hover:bg-gray-50'
                  }`}>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(line.date)}</td>
                    <td className="px-4 py-3">
                      {line.type === 'invoice' && line.id ? (
                        <button
                          onClick={() => navigate(`/invoices/${line.id}`)}
                          className="font-mono text-blue-600 hover:underline text-xs">
                          {line.docNo}
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-gray-500">{line.docNo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {line.desc}
                      {line.status && (
                        <span className="mr-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                          {STATUS_LABEL[line.status] ?? line.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-red-600 font-medium">
                      {line.debit > 0 ? fmtCur(line.debit) : ''}
                    </td>
                    <td className="px-4 py-3 text-green-700 font-medium">
                      {line.credit > 0 ? fmtCur(line.credit) : ''}
                    </td>
                    <td className={`px-4 py-3 font-bold ${line.balance > 0 ? 'text-orange-700' : line.balance < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                      {fmtCur(line.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold text-sm">
                  <td colSpan={3} className="px-4 py-3 text-gray-700">סה"כ תקופה</td>
                  <td className="px-4 py-3 text-red-700 font-bold">{fmtCur(totalDebit)}</td>
                  <td className="px-4 py-3 text-green-700 font-bold">{fmtCur(totalCredit)}</td>
                  <td className={`px-4 py-3 font-bold text-base ${balance > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                    {fmtCur(balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Balance summary box at bottom */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">סה"כ חיוב</p>
              <p className="font-bold text-red-700">{fmtCur(totalDebit)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">סה"כ תשלומים</p>
              <p className="font-bold text-green-700">{fmtCur(totalCredit)}</p>
            </div>
            <div className="text-center border-r border-gray-300 pr-6">
              <p className="text-xs text-gray-500 mb-0.5">יתרה לגביה</p>
              <p className={`font-black text-xl ${balance > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {fmtCur(balance)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
