import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account { id: string; code: string; name: string; type: string }

interface BankStatement {
  id: string;
  accountId: string;
  period: string;
  openingBalance: number;
  closingBalance: number;
  status: 'OPEN' | 'RECONCILED';
  notes?: string;
  createdAt: string;
  reconciledAt?: string;
  account: { code: string; name: string };
  lineCount?: number;
  clearedCount?: number;
}

interface GLLine {
  id: string;
  date: string;
  reference?: string;
  description?: string;
  sourceType?: string;
  amount: number;     // positive = debit (money in), negative = credit (money out)
  cleared: boolean;
  clearedAt?: string;
  bankStatementId?: string;
  transactionId: string;
}

interface ReconDetail {
  statement: BankStatement;
  glLines: GLLine[];
  summary: {
    openingBalance: number;
    closingBalance: number;
    clearedCount: number;
    clearedSum: number;
    computedBalance: number;
    difference: number;
    isReconciled: boolean;
  };
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

// ─── New Statement Modal ──────────────────────────────────────────────────────

function NewStatementModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [accountId, setAccountId]           = useState('');
  const [period, setPeriod]                 = useState(currentPeriod);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes]                   = useState('');
  const [error, setError]                   = useState('');

  // Load bank-type accounts
  const { data: accounts } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () => api.get('/accounting/accounts', { params: { pageSize: 500 } }).then(r => r.data.data as Account[]),
  });

  const bankAccounts = (accounts ?? []).filter(a => a.type === 'ASSET' || a.code.startsWith('1'));

  const mutation = useMutation({
    mutationFn: (body: any) => api.post('/bank-recon', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-statements'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה'),
  });

  const submit = () => {
    if (!accountId) { setError('נא לבחור חשבון בנק'); return; }
    if (!closingBalance) { setError('נא להזין יתרת סגירה לפי דפי בנק'); return; }
    mutation.mutate({
      accountId,
      period,
      openingBalance: parseFloat(openingBalance) || 0,
      closingBalance: parseFloat(closingBalance),
      notes: notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">התאמת בנק חדשה</h2>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">חשבון בנק</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">בחר חשבון...</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תקופה</label>
            <input type="month" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">יתרת פתיחה ₪</label>
              <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">יתרת סגירה לפי בנק ₪</label>
              <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="לפי דפי החשבון" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">ביטול</button>
          <button onClick={submit} disabled={mutation.isPending} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'יוצר...' : '✓ צור התאמה'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reconciliation Detail View ───────────────────────────────────────────────

function ReconDetailView({ statementId, onBack }: { statementId: string; onBack: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bank-recon-detail', statementId],
    queryFn:  () => api.get(`/bank-recon/${statementId}`).then(r => r.data.data as ReconDetail),
    refetchInterval: false,
  });

  const toggleCleared = useMutation({
    mutationFn: ({ lineId, cleared }: { lineId: string; cleared: boolean }) =>
      api.patch(`/bank-recon/lines/${lineId}/clear`, { cleared, bankStatementId: statementId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-recon-detail', statementId] }),
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });

  const reconcile = useMutation({
    mutationFn: () => api.post(`/bank-recon/${statementId}/reconcile`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-recon-detail', statementId] }); qc.invalidateQueries({ queryKey: ['bank-statements'] }); },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-400">טוען נתוני התאמה...</div>;
  if (!data) return <div className="p-8 text-center text-red-400">שגיאה בטעינת נתונים</div>;

  const { statement, glLines, summary } = data;
  const isReconciled = statement.status === 'RECONCILED';
  const diffColor = summary.isReconciled ? 'text-green-600' : Math.abs(summary.difference) < 100 ? 'text-orange-500' : 'text-red-600';

  return (
    <div>
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              התאמת בנק — {statement.account.code} {statement.account.name}
            </h2>
            <p className="text-sm text-gray-500">תקופה: {statement.period}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isReconciled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {isReconciled ? '✓ מאוזן' : 'פתוח'}
          </span>
        </div>
        {!isReconciled && summary.isReconciled && (
          <button onClick={() => reconcile.mutate()} disabled={reconcile.isPending} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {reconcile.isPending ? '...' : '✓ סגור התאמה'}
          </button>
        )}
      </div>

      {/* Reconciliation Summary Panel */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p className="text-xs text-blue-600 mb-1">יתרת פתיחה</p>
          <p className="text-base font-bold text-blue-700">{fmt(summary.openingBalance)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <p className="text-xs text-green-600 mb-1">סה"כ ותקות מאושרות</p>
          <p className="text-base font-bold text-green-700">{fmt(summary.clearedSum)}</p>
          <p className="text-xs text-green-500 mt-0.5">{summary.clearedCount} עסקאות</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">יתרה מחושבת</p>
          <p className="text-base font-bold text-gray-700">{fmt(summary.computedBalance)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
          <p className="text-xs text-purple-600 mb-1">יתרה לפי בנק</p>
          <p className="text-base font-bold text-purple-700">{fmt(summary.closingBalance)}</p>
        </div>
        <div className={`rounded-xl p-3 border ${summary.isReconciled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-xs mb-1 ${summary.isReconciled ? 'text-green-600' : 'text-red-600'}`}>הפרש</p>
          <p className={`text-base font-bold ${diffColor}`}>
            {summary.isReconciled ? '✓ אפס' : fmt(summary.difference)}
          </p>
        </div>
      </div>

      {/* GL Lines table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            עסקאות — {statement.account.name} ({glLines.length} עסקאות)
          </span>
          <span className="text-xs text-gray-400">לחץ על ✓ לסימון עסקה כמאושרת</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-3 w-10 text-center">אושר</th>
              <th className="p-3 text-right font-medium text-gray-600">תאריך</th>
              <th className="p-3 text-right font-medium text-gray-600">אסמכתא</th>
              <th className="p-3 text-right font-medium text-gray-600">תיאור</th>
              <th className="p-3 text-right font-medium text-gray-600">סוג</th>
              <th className="p-3 text-left font-medium text-gray-600">סכום</th>
            </tr>
          </thead>
          <tbody>
            {glLines.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">אין עסקאות לחשבון זה בתקופה זו</td></tr>
            ) : glLines.map(line => {
              const isMine = line.bankStatementId === statementId;
              const cleared = line.cleared && isMine;
              return (
                <tr key={line.id} className={`border-b border-gray-50 ${cleared ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => !isReconciled && toggleCleared.mutate({ lineId: line.id, cleared: !cleared })}
                      disabled={isReconciled || toggleCleared.isPending}
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold transition-all
                        ${cleared
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-green-400'}
                        ${isReconciled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                    >
                      {cleared ? '✓' : ''}
                    </button>
                  </td>
                  <td className="p-3 text-gray-600">{fmtDate(line.date)}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">{line.reference ?? '—'}</td>
                  <td className="p-3 text-gray-700 max-w-xs truncate">{line.description ?? '—'}</td>
                  <td className="p-3">
                    {line.sourceType && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{line.sourceType}</span>
                    )}
                  </td>
                  <td className={`p-3 text-left font-semibold ${line.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {line.amount >= 0 ? '+' : ''}{fmt(line.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded inline-block" /> עסקה מאושרת (מוסמנת)</span>
        <span className="flex items-center gap-1"><span className="inline-block text-green-600 font-bold">+</span> כניסה לחשבון</span>
        <span className="flex items-center gap-1"><span className="inline-block text-red-600 font-bold">−</span> יציאה מחשבון</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BankReconciliationPage() {
  const [showNew, setShowNew]       = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bank-statements'],
    queryFn:  () => api.get('/bank-recon').then(r => r.data.data as BankStatement[]),
  });

  const statements = data ?? [];

  if (selectedId) {
    return (
      <div className="p-6 max-w-6xl mx-auto" dir="rtl">
        <ReconDetailView statementId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  const open       = statements.filter(s => s.status === 'OPEN').length;
  const reconciled = statements.filter(s => s.status === 'RECONCILED').length;

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">התאמת בנק</h1>
          <p className="text-sm text-gray-500 mt-0.5">השוואת יתרות הנה"ח לדפי הבנק</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">
          + התאמה חדשה
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">פתוחות</p>
          <p className="text-2xl font-bold text-orange-500">{open}</p>
          <p className="text-xs text-gray-400 mt-0.5">ממתינות להשלמה</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">מאוזנות</p>
          <p className="text-2xl font-bold text-green-600">{reconciled}</p>
          <p className="text-xs text-gray-400 mt-0.5">התאמות סגורות</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 mb-1">הוראה</p>
          <p className="text-xs text-blue-700">
            1. לחץ "+ התאמה חדשה" — בחר חשבון, הזן יתרת פתיחה וסגירה לפי דף הבנק<br/>
            2. לחץ על שורת ההתאמה לפתיחה<br/>
            3. סמן ✓ כל עסקה שמופיעה בדף הבנק<br/>
            4. כשהפרש = 0 — לחץ "סגור התאמה"
          </p>
        </div>
      </div>

      {/* Statements table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-3 text-right font-medium text-gray-600">חשבון</th>
              <th className="p-3 text-right font-medium text-gray-600">תקופה</th>
              <th className="p-3 text-left font-medium text-gray-600">יתרת פתיחה</th>
              <th className="p-3 text-left font-medium text-gray-600">יתרת סגירה (בנק)</th>
              <th className="p-3 text-right font-medium text-gray-600">עסקאות</th>
              <th className="p-3 text-right font-medium text-gray-600">מאושרות</th>
              <th className="p-3 text-right font-medium text-gray-600">סטטוס</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">טוען...</td></tr>
            ) : statements.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">אין התאמות — לחץ "+ התאמה חדשה"</td></tr>
            ) : statements.map(s => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(s.id)}>
                <td className="p-3 font-medium text-gray-800">{s.account.code} — {s.account.name}</td>
                <td className="p-3 text-gray-500">{s.period}</td>
                <td className="p-3 text-left">{fmt(Number(s.openingBalance))}</td>
                <td className="p-3 text-left font-medium text-purple-700">{fmt(Number(s.closingBalance))}</td>
                <td className="p-3 text-center text-gray-500">{s.lineCount ?? '—'}</td>
                <td className="p-3 text-center text-green-600 font-medium">{s.clearedCount ?? '—'}</td>
                <td className="p-3">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'RECONCILED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {s.status === 'RECONCILED' ? '✓ מאוזן' : 'פתוח'}
                  </span>
                </td>
                <td className="p-3">
                  <button className="text-xs text-blue-600 hover:underline">פתח</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NewStatementModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
