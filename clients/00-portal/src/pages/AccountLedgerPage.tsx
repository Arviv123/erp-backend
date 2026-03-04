import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account { id: string; code: string; name: string; type: string }

interface LedgerLine {
  id: string;
  transactionId: string;
  date: string;
  reference?: string;
  description?: string;
  sourceType?: string;
  debit: number | null;
  credit: number | null;
  balance: number;
}

interface LedgerData {
  account: { id: string; code: string; name: string; type: string };
  period: { from: string; to: string };
  openingBalance: number;
  lines: LedgerLine[];
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
}

const fmt = (n: number | null) =>
  n === null ? '' : Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtBalance = (n: number) => {
  const abs = Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

const SOURCE_LABELS: Record<string, string> = {
  INVOICE: 'חשבונית', BILL: 'חשבונית ספק', PAYROLL: 'שכר',
  EXPENSE: 'הוצאה', MANUAL: 'ידני', ASSET_DEP: 'פחת', ASSET_DISP: 'מכירת נכס',
};

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'נכסים', LIABILITY: 'התחייבויות', EQUITY: 'הון עצמי',
  REVENUE: 'הכנסות', EXPENSE: 'הוצאות',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const today     = now.toISOString().slice(0, 10);

  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '');
  const [from, setFrom]           = useState(searchParams.get('from') ?? yearStart);
  const [to, setTo]               = useState(searchParams.get('to')   ?? today);
  const [search, setSearch]       = useState('');

  // Accounts list
  const { data: accData } = useQuery({
    queryKey: ['accounts-list-ledger'],
    queryFn: () => api.get('/accounting/accounts').then(r => {
      const d = r.data;
      return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Account[];
    }),
  });
  const accounts = accData ?? [];

  // Ledger data
  const { data: ledgerData, isLoading, isFetching } = useQuery({
    queryKey: ['account-ledger', accountId, from, to],
    queryFn:  () => api.get(`/accounting/accounts/${accountId}/ledger`, {
      params: { from, to },
    }).then(r => r.data.data as LedgerData),
    enabled: !!accountId && !!from && !!to,
  });

  const filterLines = (lines: LedgerLine[]) => {
    if (!search.trim()) return lines;
    const s = search.toLowerCase();
    return lines.filter(l =>
      l.description?.toLowerCase().includes(s) ||
      l.reference?.toLowerCase().includes(s) ||
      (l.debit !== null && l.debit.toString().includes(s)) ||
      (l.credit !== null && l.credit.toString().includes(s))
    );
  };

  const visibleLines = filterLines(ledgerData?.lines ?? []);

  // CSV export
  const exportCSV = () => {
    if (!ledgerData) return;
    const rows = [
      ['תאריך', 'אסמכתא', 'תיאור', 'חובה', 'זכות', 'יתרה'],
      [`יתרת פתיחה`, '', '', '', '', fmtBalance(ledgerData.openingBalance)],
      ...ledgerData.lines.map(l => [
        fmtDate(l.date),
        l.reference ?? '',
        l.description ?? '',
        l.debit !== null ? l.debit.toFixed(2) : '',
        l.credit !== null ? l.credit.toFixed(2) : '',
        fmtBalance(l.balance),
      ]),
      [`יתרת סגירה`, '', '', ledgerData.periodDebits.toFixed(2), ledgerData.periodCredits.toFixed(2), fmtBalance(ledgerData.closingBalance)],
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `כרטסת-${ledgerData.account.code}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAccountChange = (id: string) => {
    setAccountId(id);
    if (id) setSearchParams({ accountId: id, from, to });
  };

  const selectedAccount = accounts.find(a => a.id === accountId);
  const loading = isLoading || isFetching;

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">כרטסת חשבון</h1>
          {selectedAccount && (
            <p className="text-sm text-gray-500 mt-0.5">
              {selectedAccount.code} — {selectedAccount.name}
              <span className="mr-2 text-xs text-gray-400">({TYPE_LABELS[selectedAccount.type] ?? selectedAccount.type})</span>
            </p>
          )}
        </div>
        {ledgerData && (
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-green-700">
            ⬇️ ייצוא CSV
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">חשבון</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-64"
            value={accountId}
            onChange={e => handleAccountChange(e.target.value)}
          >
            <option value="">בחר חשבון...</option>
            {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map(type => {
              const typeAccounts = accounts.filter(a => a.type === type);
              if (typeAccounts.length === 0) return null;
              return (
                <optgroup key={type} label={TYPE_LABELS[type] ?? type}>
                  {typeAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">חיפוש</label>
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
            placeholder="תיאור / אסמכתא / סכום"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2">✕</button>
        )}
      </div>

      {!accountId && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 text-center text-blue-600">
          בחר חשבון כדי להציג את הכרטסת
        </div>
      )}

      {accountId && loading && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400">טוען כרטסת...</div>
      )}

      {ledgerData && !loading && (
        <div ref={printRef}>
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">יתרת פתיחה</p>
              <p className={`text-base font-bold ${ledgerData.openingBalance < 0 ? 'text-orange-600' : 'text-gray-800'}`}>
                {fmtBalance(ledgerData.openingBalance)}
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-blue-600 mb-1">חובה בתקופה</p>
              <p className="text-base font-bold text-blue-700">{fmt(ledgerData.periodDebits)}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <p className="text-xs text-orange-600 mb-1">זכות בתקופה</p>
              <p className="text-base font-bold text-orange-700">{fmt(ledgerData.periodCredits)}</p>
            </div>
            <div className={`rounded-xl p-3 border ${ledgerData.closingBalance < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-xs mb-1 ${ledgerData.closingBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>יתרת סגירה</p>
              <p className={`text-base font-bold ${ledgerData.closingBalance < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {fmtBalance(ledgerData.closingBalance)}
              </p>
            </div>
          </div>

          {/* Ledger table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {search && (
              <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-700">
                מציג {visibleLines.length} תוצאות מתוך {ledgerData.lines.length} שורות
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-24">תאריך</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-28">אסמכתא</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">תיאור</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 w-20">סוג</th>
                  <th className="px-4 py-3 text-left font-medium text-blue-600 w-28">חובה</th>
                  <th className="px-4 py-3 text-left font-medium text-orange-600 w-28">זכות</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 w-28">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr className="bg-gray-50 border-b border-gray-200 font-semibold">
                  <td className="px-4 py-2 text-gray-500 text-xs" colSpan={4}>יתרת פתיחה — {fmtDate(from)}</td>
                  <td className="px-4 py-2 text-left text-blue-700"></td>
                  <td className="px-4 py-2 text-left text-orange-600"></td>
                  <td className={`px-4 py-2 text-left font-bold ${ledgerData.openingBalance < 0 ? 'text-orange-700' : 'text-gray-800'}`}>
                    {fmtBalance(ledgerData.openingBalance)}
                  </td>
                </tr>

                {/* Transaction lines */}
                {visibleLines.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">אין תנועות בתקופה זו</td></tr>
                ) : visibleLines.map((line, idx) => (
                  <tr
                    key={line.id}
                    className={`border-b border-gray-50 hover:bg-blue-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                  >
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(line.date)}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{line.reference ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                      <div className="truncate">{line.description ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {line.sourceType && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded whitespace-nowrap">
                          {SOURCE_LABELS[line.sourceType] ?? line.sourceType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-left font-medium text-blue-700">
                      {line.debit !== null ? fmt(line.debit) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-left font-medium text-orange-600">
                      {line.credit !== null ? fmt(line.credit) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-left font-semibold ${line.balance < 0 ? 'text-orange-700' : 'text-gray-800'}`}>
                      {fmtBalance(line.balance)}
                    </td>
                  </tr>
                ))}

                {/* Closing balance row */}
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                  <td className="px-4 py-3 text-gray-600 text-xs" colSpan={4}>יתרת סגירה — {fmtDate(to)}</td>
                  <td className="px-4 py-3 text-left text-blue-700">
                    {ledgerData.periodDebits > 0 ? fmt(ledgerData.periodDebits) : ''}
                  </td>
                  <td className="px-4 py-3 text-left text-orange-600">
                    {ledgerData.periodCredits > 0 ? fmt(ledgerData.periodCredits) : ''}
                  </td>
                  <td className={`px-4 py-3 text-left text-lg ${ledgerData.closingBalance < 0 ? 'text-orange-700' : 'text-gray-900'}`}>
                    {fmtBalance(ledgerData.closingBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-2 text-center">
            {ledgerData.account.code} — {ledgerData.account.name} | {fmtDate(from)} עד {fmtDate(to)} | {ledgerData.lines.length} תנועות
          </p>
        </div>
      )}
    </div>
  );
}
