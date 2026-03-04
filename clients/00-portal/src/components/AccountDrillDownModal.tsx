import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface Props {
  accountId: string;
  accountName: string;
  from?: string;
  to?: string;
  asOf?: string;     // for balance sheet — use as 'to' filter
  onClose: () => void;
}

interface TxLine {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description?: string;
  debitAccount:  { code: string; name: string };
  creditAccount: { code: string; name: string };
}

interface Tx {
  id: string;
  date: string;
  reference?: string;
  description?: string;
  sourceType?: string;
  totalAmount: number;
  lines: TxLine[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

const SOURCE_LABELS: Record<string, string> = {
  INVOICE:    'חשבונית',
  BILL:       'חשבונית ספק',
  PAYROLL:    'שכר',
  EXPENSE:    'הוצאה',
  MANUAL:     'ידני',
  ASSET_DEP:  'פחת',
  ASSET_DISP: 'מכירת נכס',
};

export default function AccountDrillDownModal({ accountId, accountName, from, to, asOf, onClose }: Props) {
  const toFilter = to ?? asOf;
  const fromFilter = from ?? (asOf ? `${asOf.slice(0, 4)}-01-01` : undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['account-drill', accountId, fromFilter, toFilter],
    queryFn: () => api.get('/accounting/transactions', {
      params: {
        accountId,
        from:     fromFilter,
        to:       toFilter,
        status:   'POSTED',
        pageSize: 200,
      },
    }).then(r => r.data.data as Tx[]),
  });

  const transactions = data ?? [];

  // For each transaction, compute the net effect on this account
  const enriched = transactions.map(tx => {
    const relevantLines = tx.lines.filter(l => l.debitAccountId === accountId || l.creditAccountId === accountId);
    const net = relevantLines.reduce((s, l) => {
      // For the P&L/BS perspective: if this account is debited, it's a debit; if credited, it's a credit
      const amount = Number(l.amount);
      return s + (l.debitAccountId === accountId ? amount : -amount);
    }, 0);
    return { ...tx, netEffect: net };
  });

  const totalNet = enriched.reduce((s, t) => s + t.netEffect, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">פירוט עסקאות — {accountName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {fromFilter && toFilter ? `${fmtDate(fromFilter)} — ${fmtDate(toFilter)}` : 'כל התקופות'}
              {' | '}{transactions.length} עסקאות
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">טוען...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-400">אין עסקאות לחשבון זה בתקופה זו</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-3 text-right font-medium text-gray-600">תאריך</th>
                  <th className="p-3 text-right font-medium text-gray-600">אסמכתא</th>
                  <th className="p-3 text-right font-medium text-gray-600">תיאור</th>
                  <th className="p-3 text-right font-medium text-gray-600">סוג</th>
                  <th className="p-3 text-left font-medium text-gray-600">חובה</th>
                  <th className="p-3 text-left font-medium text-gray-600">זכות</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(tx => {
                  const isDebit = tx.netEffect > 0;
                  return (
                    <tr key={tx.id} className="border-b border-gray-50 hover:bg-blue-50 cursor-default">
                      <td className="p-3 text-gray-600 whitespace-nowrap">{fmtDate(tx.date)}</td>
                      <td className="p-3 text-gray-500 font-mono text-xs">{tx.reference ?? '—'}</td>
                      <td className="p-3 text-gray-700 max-w-xs">
                        <div className="truncate">{tx.description ?? '—'}</div>
                      </td>
                      <td className="p-3">
                        {tx.sourceType && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {SOURCE_LABELS[tx.sourceType] ?? tx.sourceType}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-left font-medium text-blue-700">
                        {isDebit ? fmt(tx.netEffect) : ''}
                      </td>
                      <td className="p-3 text-left font-medium text-orange-600">
                        {!isDebit ? fmt(Math.abs(tx.netEffect)) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer totals */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-gray-500">{transactions.length} עסקאות</span>
          <div className="flex items-center gap-6 text-sm font-semibold">
            <span className="text-blue-700">
              חובה: {fmt(enriched.filter(t => t.netEffect > 0).reduce((s, t) => s + t.netEffect, 0))}
            </span>
            <span className="text-orange-600">
              זכות: {fmt(Math.abs(enriched.filter(t => t.netEffect < 0).reduce((s, t) => s + t.netEffect, 0)))}
            </span>
            <span className={`${totalNet >= 0 ? 'text-blue-800' : 'text-orange-700'}`}>
              יתרה: {totalNet >= 0 ? '' : '('}{fmt(Math.abs(totalNet))}{totalNet < 0 ? ')' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
