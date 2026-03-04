import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Budget {
  id: string;
  name: string;
  year: number;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  totalBudget: number;
  notes?: string;
  _count?: { lines: number };
  createdAt: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BudgetVsActualRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
  notes?: string;
}

interface BudgetVsActual {
  budget: { id: string; name: string; year: number; status: string };
  rows: BudgetVsActualRow[];
  totals: { totalBudget: number; totalActual: number; totalVariance: number };
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT:  { label: 'טיוטה', color: 'bg-gray-100 text-gray-700' },
  ACTIVE: { label: 'פעיל',  color: 'bg-green-100 text-green-700' },
  CLOSED: { label: 'סגור',  color: 'bg-red-100 text-red-700' },
};

// ─── New Budget Modal ─────────────────────────────────────────────────────────

interface BudgetLine { accountId: string; amount: string; notes: string }

function NewBudgetModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName]   = useState('');
  const [year, setYear]   = useState(new Date().getFullYear());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<BudgetLine[]>([{ accountId: '', amount: '', notes: '' }]);
  const [error, setError] = useState('');

  const { data: accounts } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () => api.get('/accounting/accounts', { params: { pageSize: 500 } }).then(r => r.data.data as Account[]),
  });

  const mutation = useMutation({
    mutationFn: (body: any) => api.post('/budget', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה'),
  });

  const addLine = () => setLines(l => [...l, { accountId: '', amount: '', notes: '' }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof BudgetLine, val: string) =>
    setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const submit = () => {
    if (!name.trim()) { setError('נא להזין שם תקציב'); return; }
    const linesData = lines
      .filter(l => l.accountId && parseFloat(l.amount) > 0)
      .map(l => ({ accountId: l.accountId, amount: parseFloat(l.amount), notes: l.notes || undefined }));
    if (linesData.length === 0) { setError('נא להוסיף לפחות שורה אחת עם חשבון וסכום'); return; }
    mutation.mutate({ name, year, notes: notes || undefined, lines: linesData });
  };

  const accList = accounts ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">תקציב חדש</h2>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם התקציב</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="תקציב 2026" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שנה</label>
              <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))} min={2020} max={2100} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">שורות תקציב</span>
              <button onClick={addLine} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100">+ הוסף חשבון</button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg">
                  <div className="col-span-7">
                    <select
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
                      value={line.accountId}
                      onChange={e => updateLine(i, 'accountId', e.target.value)}
                    >
                      <option value="">בחר חשבון...</option>
                      {accList.map(a => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input type="number" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" placeholder="סכום ₪" value={line.amount} onChange={e => updateLine(i, 'amount', e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    <input className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" placeholder="הערה" value={line.notes} onChange={e => updateLine(i, 'notes', e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-lg">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-left mt-2 text-sm font-semibold text-gray-700">סה"כ תקציב: {fmt(total)}</div>
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">ביטול</button>
          <button onClick={submit} disabled={mutation.isPending} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'שומר...' : '💾 צור תקציב'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Budget vs Actual View ────────────────────────────────────────────────────

function BudgetVsActualView({ budgetId, onBack }: { budgetId: string; onBack: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['budget-vs-actual', budgetId],
    queryFn: () => api.get(`/budget/${budgetId}/vs-actual`).then(r => r.data.data as BudgetVsActual),
    refetchInterval: false,
  });

  const { data: budgetData } = useQuery({
    queryKey: ['budget-detail', budgetId],
    queryFn: () => api.get(`/budget/${budgetId}`).then(r => r.data.data as Budget),
  });

  const activate = useMutation({
    mutationFn: () => api.post(`/budget/${budgetId}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget-detail', budgetId] });
    },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });

  const clone = useMutation({
    mutationFn: () => {
      const nextYear = (budgetData?.year ?? new Date().getFullYear()) + 1;
      return api.post(`/budget/${budgetId}/clone`, { newYear: nextYear, newName: `תקציב ${nextYear}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); onBack(); },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-400">טוען נתוני תקציב...</div>;
  if (!data) return <div className="p-8 text-center text-red-400">שגיאה בטעינת נתונים</div>;

  const { rows, totals } = data;
  const totalVariancePct = totals.totalBudget > 0 ? (totals.totalVariance / totals.totalBudget) * 100 : 0;
  const isOverBudget = totals.totalActual > totals.totalBudget;
  const budgetStatus = budgetData?.status ?? data.budget.status;

  return (
    <div>
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{data.budget.name}</h2>
            <p className="text-sm text-gray-500">תקציב {data.budget.year} — תקציב מול ביצוע בפועל</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[budgetStatus]?.color ?? ''}`}>
            {STATUS_CONFIG[budgetStatus]?.label ?? budgetStatus}
          </span>
        </div>
        <div className="flex gap-2">
          {budgetStatus === 'DRAFT' && (
            <button onClick={() => activate.mutate()} disabled={activate.isPending} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {activate.isPending ? '...' : '✓ הפעל תקציב'}
            </button>
          )}
          <button onClick={() => clone.mutate()} disabled={clone.isPending} className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50">
            {clone.isPending ? '...' : `📋 שכפל ל-${(budgetData?.year ?? 0) + 1}`}
          </button>
        </div>
      </div>

      {/* KPI totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 mb-1">תקציב שנתי</p>
          <p className="text-xl font-bold text-blue-700">{fmt(totals.totalBudget)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-xs text-gray-600 mb-1">בפועל עד כה</p>
          <p className="text-xl font-bold text-gray-700">{fmt(totals.totalActual)}</p>
        </div>
        <div className={`rounded-xl p-4 border ${isOverBudget ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <p className={`text-xs mb-1 ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>סטייה</p>
          <p className={`text-xl font-bold ${isOverBudget ? 'text-red-700' : 'text-green-700'}`}>
            {isOverBudget ? '▲' : '▼'} {fmt(Math.abs(totals.totalVariance))}
            <span className="text-sm font-normal ml-1">({Math.abs(totalVariancePct).toFixed(1)}%)</span>
          </p>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-3 text-right font-medium text-gray-600">קוד</th>
              <th className="p-3 text-right font-medium text-gray-600">חשבון</th>
              <th className="p-3 text-right font-medium text-gray-600">סוג</th>
              <th className="p-3 text-left font-medium text-gray-600">תקציב</th>
              <th className="p-3 text-left font-medium text-gray-600">בפועל</th>
              <th className="p-3 text-left font-medium text-gray-600">סטייה</th>
              <th className="p-3 text-right font-medium text-gray-600">% ניצול</th>
              <th className="p-3 text-right font-medium text-gray-600" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const utilPct = row.budget > 0 ? (row.actual / row.budget) * 100 : 0;
              const over = row.actual > row.budget;
              return (
                <tr key={row.accountId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs text-gray-500">{row.accountCode}</td>
                  <td className="p-3 font-medium text-gray-800">{row.accountName}</td>
                  <td className="p-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{row.accountType}</span>
                  </td>
                  <td className="p-3 text-left">{fmt(row.budget)}</td>
                  <td className="p-3 text-left font-medium">{fmt(row.actual)}</td>
                  <td className={`p-3 text-left font-semibold ${over ? 'text-red-600' : 'text-green-600'}`}>
                    {over ? '+' : ''}{fmt(Math.abs(row.variance))}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-20">
                        <div
                          className={`h-1.5 rounded-full ${utilPct > 100 ? 'bg-red-500' : utilPct > 80 ? 'bg-orange-400' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(utilPct, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${over ? 'text-red-600' : 'text-gray-600'}`}>{utilPct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-gray-400">{row.notes ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
              <td colSpan={3} className="p-3 text-right">סה"כ</td>
              <td className="p-3 text-left text-blue-700">{fmt(totals.totalBudget)}</td>
              <td className="p-3 text-left text-gray-700">{fmt(totals.totalActual)}</td>
              <td className={`p-3 text-left ${isOverBudget ? 'text-red-700' : 'text-green-700'}`}>
                {fmt(Math.abs(totals.totalVariance))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [yearFilter, setYearFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['budgets', yearFilter],
    queryFn: () => api.get('/budget', { params: { year: yearFilter || undefined } }).then(r => r.data.data as Budget[]),
  });

  const budgets = data ?? [];

  const years = [...new Set(budgets.map(b => b.year))].sort((a, b) => b - a);

  if (selectedId) {
    return (
      <div className="p-6 max-w-6xl mx-auto" dir="rtl">
        <BudgetVsActualView budgetId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  const totalActive = budgets.filter(b => b.status === 'ACTIVE').reduce((s, b) => s + Number(b.totalBudget), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">תקציב וביצוע</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול תקציבים ומעקב אחר ביצוע בפועל</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">
          + תקציב חדש
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">תקציבים פעילים</p>
          <p className="text-2xl font-bold text-green-600">{budgets.filter(b => b.status === 'ACTIVE').length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">סה"כ תקציב פעיל</p>
          <p className="text-xl font-bold text-blue-600">{fmt(totalActive)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">טיוטות</p>
          <p className="text-2xl font-bold text-gray-600">{budgets.filter(b => b.status === 'DRAFT').length}</p>
        </div>
      </div>

      {/* Year filter */}
      {years.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex gap-2">
          <button onClick={() => setYearFilter('')} className={`px-3 py-1.5 text-xs rounded-lg font-medium ${yearFilter === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>הכל</button>
          {years.map(y => (
            <button key={y} onClick={() => setYearFilter(y.toString())} className={`px-3 py-1.5 text-xs rounded-lg font-medium ${yearFilter === y.toString() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{y}</button>
          ))}
        </div>
      )}

      {/* Budgets list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-3 text-right font-medium text-gray-600">שם התקציב</th>
              <th className="p-3 text-right font-medium text-gray-600">שנה</th>
              <th className="p-3 text-right font-medium text-gray-600">חשבונות</th>
              <th className="p-3 text-left font-medium text-gray-600">סה"כ תקציב</th>
              <th className="p-3 text-right font-medium text-gray-600">סטטוס</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">טוען...</td></tr>
            ) : budgets.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">אין תקציבים — לחץ "+ תקציב חדש" ליצירה</td></tr>
            ) : budgets.map(b => {
              const st = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.DRAFT;
              return (
                <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-800">{b.name}</td>
                  <td className="p-3 text-gray-500">{b.year}</td>
                  <td className="p-3 text-gray-500 text-center">{b._count?.lines ?? '—'}</td>
                  <td className="p-3 text-left font-semibold text-gray-800">{fmt(Number(b.totalBudget))}</td>
                  <td className="p-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="p-3">
                    <button onClick={() => setSelectedId(b.id)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                      📊 תקציב מול ביצוע
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && <NewBudgetModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
