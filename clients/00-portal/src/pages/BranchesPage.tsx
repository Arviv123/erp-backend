import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, PowerOff, MapPin, Phone, Mail, Users,
  Building2, X, BarChart2, FileText,
} from 'lucide-react';
import api from '../lib/api';

// ── helpers ─────────────────────────────────────────────────────────────────

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(n);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── types ────────────────────────────────────────────────────────────────────

interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  managerId?: string;
  manager?: { name: string };
  isActive: boolean;
  employeeCount?: number;
  warehouseCount?: number;
}

interface BranchSummary {
  branchId: string;
  branchName: string;
  employeeCount: number;
  invoiceCount: number;
  invoiceTotal: number;
  pendingLeave: number;
}

interface ConsolidatedRow {
  branchId: string;
  branchName: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  employeeCount: number;
}

type Tab = 'branches' | 'summary' | 'report';

const EMPTY_FORM = {
  name: '',
  code: '',
  address: '',
  phone: '',
  email: '',
};

// ── BranchModal ──────────────────────────────────────────────────────────────

function BranchModal({
  initial,
  onClose,
}: {
  initial?: Branch;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          code: initial.code,
          address: initial.address ?? '',
          phone: initial.phone ?? '',
          email: initial.email ?? '',
        }
      : { ...EMPTY_FORM }
  );

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      initial
        ? api.patch(`/branches/${initial.id}`, form)
        : api.post('/branches', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      qc.invalidateQueries({ queryKey: ['branches-summary'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {initial ? 'עריכת ענף' : 'ענף חדש'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הענף</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="למשל: ענף תל אביב"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קוד ענף</label>
              <input
                type="text"
                value={form.code}
                onChange={e => set('code', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="למשל: TLV"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כתובת</label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="רחוב, עיר"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="03-1234567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="branch@company.co.il"
              />
            </div>
          </div>
        </div>

        {save.isError && (
          <p className="text-red-500 text-xs mt-3">
            שגיאה בשמירה. נסה שוב.
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save.mutate()}
            disabled={!form.name || !form.code || save.isPending}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40"
          >
            {save.isPending ? 'שומר...' : initial ? 'שמור שינויים' : 'צור ענף'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BranchCard ───────────────────────────────────────────────────────────────

function BranchCard({
  branch,
  onEdit,
  onDeactivate,
}: {
  branch: Branch;
  onEdit: (b: Branch) => void;
  onDeactivate: (b: Branch) => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{branch.name}</h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
              {branch.code}
            </span>
          </div>
          {branch.manager && (
            <p className="text-xs text-gray-500 mt-0.5">מנהל: {branch.manager.name}</p>
          )}
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            branch.isActive ? 'text-green-600' : 'text-red-500'
          }`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              branch.isActive ? 'bg-green-500' : 'bg-red-400'
            }`}
          />
          {branch.isActive ? 'פעיל' : 'לא פעיל'}
        </span>
      </div>

      {/* Info */}
      <div className="space-y-1.5 text-sm text-gray-600 mb-4">
        {branch.address && (
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
            <span className="text-xs">{branch.address}</span>
          </div>
        )}
        {branch.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-xs">{branch.phone}</span>
          </div>
        )}
        {branch.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-xs truncate">{branch.email}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Users className="w-3.5 h-3.5" />
          <span>{branch.employeeCount ?? 0} עובדים</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(branch)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <Pencil className="w-3.5 h-3.5" />
            ערוך
          </button>
          {branch.isActive && (
            <button
              onClick={() => onDeactivate(branch)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <PowerOff className="w-3.5 h-3.5" />
              השבת
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SummaryTab ───────────────────────────────────────────────────────────────

function SummaryTab() {
  const { data, isLoading } = useQuery<BranchSummary[]>({
    queryKey: ['branches-summary'],
    queryFn: async () => {
      const r = await api.get('/branches/summary');
      return Array.isArray(r.data) ? r.data : r.data?.data ?? [];
    },
  });

  const rows = data ?? [];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        טוען נתונים...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-right px-4 py-3 font-medium text-gray-600">ענף</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">עובדים</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">חשבוניות</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">הכנסות</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">ממתינות לאישור</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                אין נתונים להצגה
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr key={row.branchId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{row.branchName}</td>
                <td className="px-4 py-3 text-gray-600">{row.employeeCount}</td>
                <td className="px-4 py-3 text-gray-600">{row.invoiceCount}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{fmtILS(Number(row.invoiceTotal))}</td>
                <td className="px-4 py-3">
                  {row.pendingLeave > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      {row.pendingLeave} בקשות
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">אין</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── ConsolidatedReportTab ────────────────────────────────────────────────────

function ConsolidatedReportTab() {
  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [queryParams, setQueryParams] = useState<{ from: string; to: string } | null>(null);

  const { data, isLoading, isFetching } = useQuery<ConsolidatedRow[]>({
    queryKey: ['branches-consolidated', queryParams],
    queryFn: async () => {
      const r = await api.get('/branches/consolidated-report', {
        params: queryParams!,
      });
      return Array.isArray(r.data) ? r.data : r.data?.data ?? [];
    },
    enabled: !!queryParams,
  });

  const rows = data ?? [];

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + Number(r.revenue),
      expenses: acc.expenses + Number(r.expenses),
      netProfit: acc.netProfit + Number(r.netProfit),
      employeeCount: acc.employeeCount + Number(r.employeeCount),
    }),
    { revenue: 0, expenses: 0, netProfit: 0, employeeCount: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מתאריך</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">עד תאריך</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setQueryParams({ from, to })}
            disabled={!from || !to || isFetching}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            {isFetching ? 'מפיק...' : 'הפק דוח'}
          </button>
        </div>
      </div>

      {/* Table */}
      {(isLoading || isFetching) && queryParams ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          מפיק דוח...
        </div>
      ) : !queryParams ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">בחר טווח תאריכים ולחץ "הפק דוח"</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ענף</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הכנסות</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הוצאות</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">רווח נטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובדים</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    אין נתונים לתקופה זו
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map(row => (
                    <tr key={row.branchId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.branchName}</td>
                      <td className="px-4 py-3 text-green-700 font-medium">
                        {fmtILS(Number(row.revenue))}
                      </td>
                      <td className="px-4 py-3 text-red-600 font-medium">
                        {fmtILS(Number(row.expenses))}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        <span className={Number(row.netProfit) >= 0 ? 'text-green-700' : 'text-red-600'}>
                          {fmtILS(Number(row.netProfit))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{row.employeeCount}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-4 py-3 text-gray-900">סה"כ</td>
                    <td className="px-4 py-3 text-green-700">{fmtILS(totals.revenue)}</td>
                    <td className="px-4 py-3 text-red-600">{fmtILS(totals.expenses)}</td>
                    <td className="px-4 py-3">
                      <span className={totals.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}>
                        {fmtILS(totals.netProfit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{totals.employeeCount}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function BranchesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('branches');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);

  const { data: branchesRaw, isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      const r = await api.get('/branches');
      return Array.isArray(r.data) ? r.data : r.data?.data ?? [];
    },
  });

  const branches: Branch[] = branchesRaw ?? [];

  const activeBranches = branches.filter(b => b.isActive);
  const totalEmployees = branches.reduce((s, b) => s + (b.employeeCount ?? 0), 0);

  const { data: summaryRaw } = useQuery<BranchSummary[]>({
    queryKey: ['branches-summary'],
    queryFn: async () => {
      const r = await api.get('/branches/summary');
      return Array.isArray(r.data) ? r.data : r.data?.data ?? [];
    },
  });

  const totalRevenue = (summaryRaw ?? []).reduce(
    (s, row) => s + Number(row.invoiceTotal),
    0
  );

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'branches', label: 'ענפים', icon: <Building2 className="w-4 h-4" /> },
    { key: 'summary', label: 'סיכום ענפים', icon: <Users className="w-4 h-4" /> },
    { key: 'report', label: 'דוח מאוחד', icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {(showModal || editTarget) && (
        <BranchModal
          initial={editTarget ?? undefined}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-blue-600" />
          ניהול ענפים
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          ענף חדש
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-xs text-gray-500 mb-1">סה"כ ענפים</div>
          <div className="text-2xl font-bold text-gray-900">{branches.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">{activeBranches.length} פעילים</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-xs text-gray-500 mb-1">עובדים פעילים</div>
          <div className="text-2xl font-bold text-gray-900">{totalEmployees}</div>
          <div className="text-xs text-gray-400 mt-0.5">בכל הענפים</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-xs text-gray-500 mb-1">הכנסות חודש נוכחי</div>
          <div className="text-xl font-bold text-green-700">{fmtILS(totalRevenue)}</div>
          <div className="text-xs text-gray-400 mt-0.5">מכלל הענפים</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'branches' && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">טוען ענפים...</div>
          ) : branches.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400 text-sm">אין ענפים. לחץ "ענף חדש" כדי להתחיל.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map(branch => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  onEdit={b => setEditTarget(b)}
                  onDeactivate={b => {
                    if (window.confirm(`להשבית את הענף "${b.name}"?`))
                      deactivate.mutate(b.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'summary' && <SummaryTab />}

      {activeTab === 'report' && <ConsolidatedReportTab />}
    </div>
  );
}
