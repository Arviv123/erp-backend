import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Plus, Pause, Play, X, Loader2, RefreshCw, Search,
  Calendar, Repeat, ChevronDown, Trash2, Zap,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'פעיל',
  PAUSED: 'מושהה',
  CANCELLED: 'בוטל',
  COMPLETED: 'הושלם',
};
const STATUS_CLS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
};

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: 'שבועי',
  MONTHLY: 'חודשי',
  QUARTERLY: 'רבעוני',
  YEARLY: 'שנתי',
};
const FREQ_CLS: Record<string, string> = {
  WEEKLY: 'bg-purple-100 text-purple-700',
  MONTHLY: 'bg-blue-100 text-blue-700',
  QUARTERLY: 'bg-indigo-100 text-indigo-700',
  YEARLY: 'bg-pink-100 text-pink-700',
};

const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
type Frequency = typeof FREQUENCIES[number];

// ─── types ────────────────────────────────────────────────────────────────────
interface RecurringInvoice {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  customerId: string;
  customer: { name: string };
  frequency: Frequency;
  nextDate?: string;
  lastGeneratedAt?: string;
  total: number;
  generatedCount: number;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 relative mx-4`} dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-800 text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Customer Search ───────────────────────────────────────────────────────────
function CustomerSearch({ value, onChange }: { value: string; onChange: (id: string, name: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');

  const { data } = useQuery({
    queryKey: ['cust-search', q],
    queryFn: () => api.get('/scan/customers', { params: { q } }),
    enabled: q.length > 1,
  });
  const results: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  const pick = (id: string, name: string) => {
    setSelected(name);
    setQ('');
    setOpen(false);
    onChange(id, name);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="border border-gray-300 rounded-lg pr-8 pl-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={selected || 'חפש לקוח...'}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((c: any) => (
            <button
              key={c.id}
              onClick={() => pick(c.id, c.name)}
              className="w-full text-right px-3 py-2 hover:bg-blue-50 text-sm text-gray-700"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New Recurring Invoice Modal ───────────────────────────────────────────────
function NewRecurringModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, vatRate: 17 },
  ]);
  const [error, setError] = useState('');

  const addLine = () => setLines((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, vatRate: 17 }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof LineItem, val: string | number) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/recurring-invoices', {
        name,
        customerId,
        frequency,
        startDate,
        ...(endDate ? { endDate } : {}),
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          vatRate: Number(l.vatRate ?? 17),
        })),
        ...(notes ? { notes } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'שגיאה'),
  });

  const total = lines.reduce((s, l) => {
    const net = Number(l.quantity) * Number(l.unitPrice);
    const vat = net * (Number(l.vatRate ?? 17) / 100);
    return s + net + vat;
  }, 0);

  return (
    <Modal title="חשבונית חוזרת חדשה" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">שם *</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="דמי ניהול חודשיים"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">לקוח *</label>
            <CustomerSearch value={customerId} onChange={(id) => setCustomerId(id)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">תדירות *</label>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{FREQ_LABEL[f]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">תאריך התחלה *</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">תאריך סיום (אופציונלי)</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">שורות</label>
            <button onClick={addLine} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus size={12} /> הוסף שורה
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="תיאור"
                  value={line.description}
                  onChange={(e) => updateLine(i, 'description', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="כמות"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="מחיר יחידה"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="מע״מ%"
                  value={line.vatRate ?? 17}
                  onChange={(e) => updateLine(i, 'vatRate', e.target.value)}
                />
                <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                  className="col-span-1 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="text-left mt-2 text-sm font-semibold text-gray-700">
            סה"כ: {fmtILS(total)}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">הערות</label>
          <textarea
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !customerId || !startDate || mutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            צור חשבונית חוזרת
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Recurring Invoice Card ────────────────────────────────────────────────────
function RecurringCard({ inv }: { inv: RecurringInvoice }) {
  const qc = useQueryClient();
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/recurring-invoices/${inv.id}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  });
  const resumeMutation = useMutation({
    mutationFn: () => api.post(`/recurring-invoices/${inv.id}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/recurring-invoices/${inv.id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] });
      setShowConfirmCancel(false);
    },
  });

  const canAct = inv.status === 'ACTIVE' || inv.status === 'PAUSED';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm truncate">{inv.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{inv.customer?.name ?? '—'}</p>
        </div>
        <span className={`mr-3 shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[inv.status]}`}>
          {STATUS_LABEL[inv.status]}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${FREQ_CLS[inv.frequency]}`}>
          <Repeat size={11} /> {FREQ_LABEL[inv.frequency]}
        </span>
        {inv.nextDate && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
            <Calendar size={11} /> הפקה הבאה: {fmtDate(inv.nextDate)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-gray-800">{fmtILS(inv.total)}</p>
          {inv.generatedCount > 0 && (
            <p className="text-xs text-gray-400">הופקו {inv.generatedCount} חשבוניות</p>
          )}
        </div>
        {canAct && (
          <div className="flex gap-1.5">
            {inv.status === 'ACTIVE' ? (
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-medium hover:bg-yellow-100 disabled:opacity-50"
                title="השהה"
              >
                {pauseMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                השהה
              </button>
            ) : (
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-medium hover:bg-green-100 disabled:opacity-50"
                title="הפעל מחדש"
              >
                {resumeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                הפעל
              </button>
            )}
            {!showConfirmCancel ? (
              <button
                onClick={() => setShowConfirmCancel(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100"
                title="בטל"
              >
                <Trash2 size={12} /> בטל
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="px-2 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'אשר'}
                </button>
                <button
                  onClick={() => setShowConfirmCancel(false)}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50"
                >
                  חזור
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function RecurringInvoicesPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [generateResult, setGenerateResult] = useState<number | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['recurring-invoices', params],
    queryFn: () => api.get('/recurring-invoices', { params: { ...params, limit: 50 } }),
  });
  const invoices: RecurringInvoice[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];

  const generateMutation = useMutation({
    mutationFn: () => api.post('/recurring-invoices/generate-due'),
    onSuccess: (res: any) => {
      const count = res?.data?.count ?? res?.count ?? 0;
      setGenerateResult(count);
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] });
    },
  });

  const active = invoices.filter((i) => i.status === 'ACTIVE').length;
  const paused = invoices.filter((i) => i.status === 'PAUSED').length;
  const totalGenerated = invoices.reduce((s, i) => s + (i.generatedCount ?? 0), 0);

  const STATUS_FILTERS = ['', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'] as const;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Repeat className="text-blue-600" size={26} />
          <h1 className="text-xl font-bold text-gray-800">חשבוניות חוזרות</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
          >
            {generateMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            הפק חשבוניות שהגיע זמנן
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5"
          >
            <Plus size={16} /> חשבונית חוזרת חדשה
          </button>
        </div>
      </div>

      {/* Generate result banner */}
      {generateResult !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-green-700 text-sm font-medium">
            {generateResult === 0 ? 'אין חשבוניות להפקה כרגע' : `הופקו ${generateResult} חשבוניות בהצלחה`}
          </p>
          <button onClick={() => setGenerateResult(null)} className="text-green-500 hover:text-green-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">פעיל</p>
          <p className="text-2xl font-bold text-green-600">{active}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">מושהה</p>
          <p className="text-2xl font-bold text-yellow-600">{paused}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">סה"כ שנוצר</p>
          <p className="text-2xl font-bold text-gray-800">{totalGenerated}</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s ? STATUS_LABEL[s] : 'הכל'}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin ml-2" size={22} /> טוען...
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Repeat size={36} className="mx-auto mb-3 text-gray-300" />
          <p>אין חשבוניות חוזרות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {invoices.map((inv) => (
            <RecurringCard key={inv.id} inv={inv} />
          ))}
        </div>
      )}

      {showNew && <NewRecurringModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
