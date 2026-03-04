import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import platformApi from '../../lib/platformApi';

interface TenantDetail {
  id: string; name: string; businessNumber: string; vatNumber?: string;
  email?: string; phone?: string; contactName?: string; logoUrl?: string;
  plan: string; maxUsers: number; maxEmployees: number;
  modules: Record<string, boolean>; notes?: string;
  isActive: boolean; suspendedAt?: string; suspendedReason?: string;
  createdAt: string; taxSettings: Record<string, unknown>;
  _count: { users: number; employees: number; invoices: number; payrollRuns: number; transactions: number };
}

const MODULE_LABELS: Record<string, string> = {
  payroll: 'שכר',
  accounting: 'הנהח"ש',
  hr: 'משאבי אנוש',
  crm: 'CRM לקוחות',
  inventory: 'מלאי',
  pos: 'קופה (POS)',
  attendance: 'נוכחות',
  purchasing: 'רכש',
  assets: 'רכוש קבוע',
  budget: 'תקציב',
  documents: 'מסמכים',
};

export default function PlatformTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<TenantDetail>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: tenant, isLoading } = useQuery<TenantDetail>({
    queryKey: ['platform-tenant', id],
    queryFn: async () => {
      const r = await platformApi.get(`/tenants/${id}`);
      return r.data;
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<TenantDetail>) => platformApi.patch(`/tenants/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-tenant', id] });
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: () => platformApi.post(`/tenants/${id}/impersonate`),
    onSuccess: (res) => {
      const { token, user } = res.data;
      localStorage.setItem('erp_token', token);
      localStorage.setItem('erp_user', JSON.stringify({ ...user, firstName: 'מנהל', lastName: 'פלטפורמה' }));
      window.open('/dashboard', '_blank');
    },
  });

  const toggleModule = (modKey: string) => {
    const current = editing ? (editForm.modules ?? tenant?.modules ?? {}) : (tenant?.modules ?? {});
    setEditForm(f => ({ ...f, modules: { ...current, [modKey]: !current[modKey] } }));
  };

  const startEdit = () => {
    if (!tenant) return;
    setEditForm({
      name: tenant.name, email: tenant.email, phone: tenant.phone,
      contactName: tenant.contactName, plan: tenant.plan,
      maxUsers: tenant.maxUsers, maxEmployees: tenant.maxEmployees,
      modules: { ...tenant.modules }, notes: tenant.notes,
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(editForm);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">טוען...</div>
    </div>
  );
  if (!tenant) return null;

  const currentModules = editing ? (editForm.modules ?? tenant.modules) : tenant.modules;

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => navigate('/platform/dashboard')} className="text-slate-500 hover:text-white transition">לוח בקרה</button>
          <span className="text-slate-700">/</span>
          <button onClick={() => navigate('/platform/tenants')} className="text-slate-500 hover:text-white transition">עסקים</button>
          <span className="text-slate-700">/</span>
          <span className="text-white font-medium">{tenant.name}</span>
        </div>
        <div className="flex gap-3">
          {saveSuccess && <span className="text-emerald-400 text-sm">✓ נשמר בהצלחה</span>}
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-white text-sm px-4 py-2 rounded-xl border border-slate-700 transition">ביטול</button>
              <button onClick={handleSave} disabled={updateMutation.isPending} className="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-xl transition font-medium">
                {updateMutation.isPending ? 'שומר...' : '💾 שמור שינויים'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => impersonateMutation.mutate()}
                disabled={!tenant.isActive || !!tenant.suspendedAt}
                className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl transition"
              >
                🔑 כניסה כמנהל
              </button>
              <button onClick={startEdit} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-xl transition">✏️ ערוך</button>
            </>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Status banner */}
        {tenant.suspendedAt && (
          <div className="bg-red-900/30 border border-red-800/50 rounded-2xl px-6 py-4 flex items-start gap-3">
            <span className="text-red-400 text-lg">⏸</span>
            <div>
              <p className="text-red-300 font-semibold">עסק מושהה</p>
              <p className="text-red-400 text-sm">סיבה: {tenant.suspendedReason}</p>
              <p className="text-red-500 text-xs mt-1">מושהה מ: {new Date(tenant.suspendedAt).toLocaleDateString('he-IL')}</p>
            </div>
            <button
              onClick={() => platformApi.post(`/tenants/${id}/activate`).then(() => qc.invalidateQueries({ queryKey: ['platform-tenant', id] }))}
              className="mr-auto bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-xl transition"
            >
              הפעל מחדש
            </button>
          </div>
        )}

        {/* Header card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              {editing ? (
                <input
                  value={editForm.name ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="text-2xl font-bold bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              ) : (
                <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
              )}
              <p className="text-slate-400 text-sm mt-1 font-mono">{tenant.businessNumber}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                { basic: 'bg-slate-700 text-slate-300', pro: 'bg-blue-900/60 text-blue-300', enterprise: 'bg-violet-900/60 text-violet-300' }[tenant.plan] ?? 'bg-slate-700 text-slate-300'
              }`}>
                {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
              </span>
              {tenant.isActive && !tenant.suspendedAt
                ? <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/40 px-3 py-1 rounded-full">פעיל</span>
                : <span className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-3 py-1 rounded-full">לא פעיל</span>
              }
            </div>
          </div>

          {/* Usage counters */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'משתמשים', value: `${tenant._count.users} / ${tenant.maxUsers}` },
              { label: 'עובדים', value: `${tenant._count.employees} / ${tenant.maxEmployees}` },
              { label: 'חשבוניות', value: tenant._count.invoices },
              { label: 'ריצות שכר', value: tenant._count.payrollRuns },
              { label: 'תנועות', value: tenant._count.transactions },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-800/60 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{value}</p>
                <p className="text-slate-500 text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Details + Plan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact details */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">פרטי קשר</h2>
            <div className="space-y-3">
              {[
                { label: 'אימייל', key: 'email', type: 'email' },
                { label: 'טלפון', key: 'phone' },
                { label: 'איש קשר', key: 'contactName' },
              ].map(({ label, key, type }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-slate-500 text-xs w-20">{label}</span>
                  {editing ? (
                    <input
                      type={type ?? 'text'}
                      value={(editForm as any)[key] ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      dir={type === 'email' ? 'ltr' : 'rtl'}
                    />
                  ) : (
                    <span className="text-white text-sm">{(tenant as any)[key] ?? '—'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Plan settings */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">תוכנית ומגבלות</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-20">תוכנית</span>
                {editing ? (
                  <select
                    value={editForm.plan ?? 'basic'}
                    onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                ) : (
                  <span className="text-white text-sm capitalize">{tenant.plan}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-20">מקס' משתמשים</span>
                {editing ? (
                  <input type="number" value={editForm.maxUsers ?? 10}
                    onChange={e => setEditForm(f => ({ ...f, maxUsers: Number(e.target.value) }))}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                ) : <span className="text-white text-sm">{tenant.maxUsers}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-20">מקס' עובדים</span>
                {editing ? (
                  <input type="number" value={editForm.maxEmployees ?? 50}
                    onChange={e => setEditForm(f => ({ ...f, maxEmployees: Number(e.target.value) }))}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                ) : <span className="text-white text-sm">{tenant.maxEmployees}</span>}
              </div>
              <div className="flex items-start gap-3">
                <span className="text-slate-500 text-xs w-20 mt-1">הערות</span>
                {editing ? (
                  <textarea
                    value={editForm.notes ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                ) : <span className="text-white text-sm">{tenant.notes || '—'}</span>}
              </div>
              <div className="text-slate-500 text-xs mt-2">נרשם: {new Date(tenant.createdAt).toLocaleDateString('he-IL')}</div>
            </div>
          </div>
        </div>

        {/* Modules toggle */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">מודולים מופעלים</h2>
            {!editing && <button onClick={startEdit} className="text-violet-400 hover:text-violet-300 text-xs transition">✏️ ערוך</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(MODULE_LABELS).map(([key, label]) => {
              const active = currentModules[key] ?? false;
              return (
                <button
                  key={key}
                  onClick={() => editing && toggleModule(key)}
                  disabled={!editing}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    active
                      ? 'bg-violet-900/40 border-violet-700/50 text-violet-300'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                  } ${editing ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'cursor-default'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${active ? 'bg-violet-400' : 'bg-slate-600'}`} />
                  {label}
                </button>
              );
            })}
          </div>
          {editing && (
            <p className="text-slate-500 text-xs mt-3">לחץ על מודול כדי להפעיל/לכבות אותו</p>
          )}
        </div>
      </div>
    </div>
  );
}
