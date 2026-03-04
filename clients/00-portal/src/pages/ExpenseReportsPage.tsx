import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseLine {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  vatAmount: number;
  receiptUrl?: string;
  notes?: string;
}

interface ExpenseReport {
  id: string;
  title: string;
  period: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
  totalAmount: number;
  notes?: string;
  employee: { firstName: string; lastName: string };
  _count?: { expenses: number };
  expenses?: ExpenseLine[];
  createdAt: string;
}

const CATEGORIES = ['נסיעות', 'ארוחות', 'ציוד משרדי', 'אירוח', 'הכשרה', 'אחר'];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: 'טיוטה',    color: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { label: 'הוגש',     color: 'bg-blue-100 text-blue-700' },
  APPROVED:  { label: 'אושר',     color: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'נדחה',     color: 'bg-red-100 text-red-700' },
  PAID:      { label: 'שולם',     color: 'bg-purple-100 text-purple-700' },
};

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

// ─── New Expense Report Modal ─────────────────────────────────────────────────

interface NewLine {
  date: string; category: string; description: string; amount: string; vatAmount: string; notes: string;
}

function NewReportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [title, setTitle]   = useState('');
  const [period, setPeriod] = useState(currentPeriod);
  const [notes, setNotes]   = useState('');
  const [lines, setLines]   = useState<NewLine[]>([
    { date: today, category: 'נסיעות', description: '', amount: '', vatAmount: '0', notes: '' },
  ]);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (body: any) => api.post('/expenses', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה'),
  });

  const addLine = () => setLines(l => [...l, { date: today, category: 'נסיעות', description: '', amount: '', vatAmount: '0', notes: '' }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof NewLine, val: string) =>
    setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const submit = () => {
    if (!title.trim()) { setError('נא להזין כותרת'); return; }
    const expenses = lines.map(l => ({
      date:        new Date(l.date).toISOString(),
      category:    l.category,
      description: l.description,
      amount:      parseFloat(l.amount) || 0,
      vatAmount:   parseFloat(l.vatAmount) || 0,
      notes:       l.notes || undefined,
    }));
    if (expenses.some(e => !e.description || e.amount <= 0)) { setError('נא למלא תיאור וסכום לכל שורה'); return; }
    mutation.mutate({ title, period, notes: notes || undefined, expenses });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">דוח הוצאות חדש</h2>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">כותרת הדוח</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="הוצאות ינואר 2026" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תקופה</label>
              <input type="month" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={period} onChange={e => setPeriod(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">שורות הוצאה</span>
              <button onClick={addLine} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100">+ הוסף שורה</button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg">
                  <div className="col-span-2">
                    <input type="date" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={line.date} onChange={e => updateLine(i, 'date', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <select className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={line.category} onChange={e => updateLine(i, 'category', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="תיאור" value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="סכום ₪" value={line.amount} onChange={e => updateLine(i, 'amount', e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="מע״מ" value={line.vatAmount} onChange={e => updateLine(i, 'vatAmount', e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-lg">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-left mt-2 text-sm font-semibold text-gray-700">סה"כ: {fmt(total)}</div>
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">ביטול</button>
          <button onClick={submit} disabled={mutation.isPending} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'שומר...' : '💾 שמור טיוטה'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ReportDetailModal({ report, onClose, isPrivileged }: { report: ExpenseReport; onClose: () => void; isPrivileged: boolean }) {
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const { data } = useQuery({
    queryKey: ['expense', report.id],
    queryFn: () => api.get(`/expenses/${report.id}`).then(r => r.data.data as ExpenseReport),
  });
  const full = data ?? report;

  const submit = useMutation({
    mutationFn: () => api.post(`/expenses/${report.id}/submit`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense', report.id] }); },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });
  const approve = useMutation({
    mutationFn: () => api.post(`/expenses/${report.id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense', report.id] }); },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/expenses/${report.id}/reject`, { reason: rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense', report.id] }); setShowReject(false); },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });
  const pay = useMutation({
    mutationFn: () => api.post(`/expenses/${report.id}/pay`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense', report.id] }); },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה'),
  });

  const st = STATUS_CONFIG[full.status] ?? STATUS_CONFIG.DRAFT;
  const expenses = full.expenses ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{full.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500">{full.employee.firstName} {full.employee.lastName}</span>
              <span className="text-sm text-gray-400">|</span>
              <span className="text-sm text-gray-500">{full.period}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="p-6">
          {/* Expense lines table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">קטגוריה</th>
                <th className="p-2 text-right">תיאור</th>
                <th className="p-2 text-left">סכום</th>
                <th className="p-2 text-left">מע"מ</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="p-2 text-gray-600">{fmtDate(e.date)}</td>
                  <td className="p-2">
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{e.category}</span>
                  </td>
                  <td className="p-2 text-gray-700">{e.description}</td>
                  <td className="p-2 text-left font-medium">{fmt(e.amount)}</td>
                  <td className="p-2 text-left text-gray-500">{fmt(e.vatAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={3} className="p-2 text-right">סה"כ</td>
                <td className="p-2 text-left text-blue-700">{fmt(full.totalAmount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          {full.notes && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
              <span className="font-medium">הערות: </span>{full.notes}
            </div>
          )}

          {/* Reject reason input */}
          {showReject && (
            <div className="mt-4 space-y-2">
              <textarea
                className="w-full border border-red-300 rounded-lg p-2 text-sm"
                placeholder="סיבת הדחייה..."
                rows={2}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReject(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg">ביטול</button>
                <button onClick={() => reject.mutate()} disabled={!rejectReason.trim() || reject.isPending} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {reject.isPending ? 'שולח...' : 'דחה'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">סגור</button>
          {full.status === 'DRAFT' && (
            <button onClick={() => submit.mutate()} disabled={submit.isPending} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {submit.isPending ? '...' : '📤 הגש לאישור'}
            </button>
          )}
          {full.status === 'SUBMITTED' && isPrivileged && (
            <>
              <button onClick={() => setShowReject(true)} className="px-4 py-2 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
                ✗ דחה
              </button>
              <button onClick={() => approve.mutate()} disabled={approve.isPending} className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {approve.isPending ? '...' : '✓ אשר'}
              </button>
            </>
          )}
          {full.status === 'APPROVED' && isPrivileged && (
            <button onClick={() => pay.mutate()} disabled={pay.isPending} className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {pay.isPending ? '...' : '💳 שלם והפרס בהנה"ח'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpenseReportsPage() {
  const { user } = useAuth();
  const isPrivileged = ['ADMIN', 'HR_MANAGER', 'ACCOUNTANT'].includes(user?.role ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<ExpenseReport | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', statusFilter],
    queryFn: () => api.get('/expenses', { params: { status: statusFilter || undefined, pageSize: 100 } }).then(r => r.data.data as ExpenseReport[]),
  });

  const reports = data ?? [];

  // KPI cards
  const pending  = reports.filter(r => r.status === 'SUBMITTED').length;
  const approved = reports.filter(r => r.status === 'APPROVED').length;
  const totalPaid = reports.filter(r => r.status === 'PAID').reduce((s, r) => s + Number(r.totalAmount), 0);
  const totalPending = reports.filter(r => ['SUBMITTED', 'APPROVED'].includes(r.status)).reduce((s, r) => s + Number(r.totalAmount), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">דוחות הוצאות</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול החזרי הוצאות לעובדים</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">
          + דוח הוצאות חדש
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">ממתינים לאישור</p>
          <p className="text-2xl font-bold text-blue-600">{pending}</p>
          <p className="text-xs text-gray-400 mt-0.5">דוחות שהוגשו</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">אושרו — ממתינים לתשלום</p>
          <p className="text-2xl font-bold text-green-600">{approved}</p>
          <p className="text-xs text-gray-400 mt-0.5">דוחות מאושרים</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">סה"כ בהמתנה</p>
          <p className="text-xl font-bold text-orange-600">{fmt(totalPending)}</p>
          <p className="text-xs text-gray-400 mt-0.5">לאישור + לתשלום</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">שולם (כל הזמן)</p>
          <p className="text-xl font-bold text-purple-600">{fmt(totalPaid)}</p>
          <p className="text-xs text-gray-400 mt-0.5">סה"כ החזרים</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex gap-2">
        {['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === '' ? 'הכל' : STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Reports table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-3 text-right font-medium text-gray-600">עובד</th>
              <th className="p-3 text-right font-medium text-gray-600">כותרת</th>
              <th className="p-3 text-right font-medium text-gray-600">תקופה</th>
              <th className="p-3 text-right font-medium text-gray-600">שורות</th>
              <th className="p-3 text-left font-medium text-gray-600">סה"כ</th>
              <th className="p-3 text-right font-medium text-gray-600">סטטוס</th>
              <th className="p-3 text-right font-medium text-gray-600">תאריך</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">טוען...</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">אין דוחות הוצאות</td></tr>
            ) : reports.map(r => {
              const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.DRAFT;
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="p-3 font-medium text-gray-800">{r.employee.firstName} {r.employee.lastName}</td>
                  <td className="p-3 text-gray-700">{r.title}</td>
                  <td className="p-3 text-gray-500">{r.period}</td>
                  <td className="p-3 text-gray-500 text-center">{r._count?.expenses ?? '—'}</td>
                  <td className="p-3 text-left font-semibold text-gray-800">{fmt(Number(r.totalAmount))}</td>
                  <td className="p-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="p-3 text-gray-400 text-xs">{fmtDate(r.createdAt)}</td>
                  <td className="p-3">
                    <button className="text-xs text-blue-600 hover:underline">פרטים</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && <NewReportModal onClose={() => setShowNew(false)} />}
      {selected && <ReportDetailModal report={selected} onClose={() => setSelected(null)} isPrivileged={isPrivileged} />}
    </div>
  );
}
