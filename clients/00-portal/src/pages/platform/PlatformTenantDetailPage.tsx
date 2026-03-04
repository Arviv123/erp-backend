import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import platformApi from '../../lib/platformApi';
import PlatformLayout from '../../components/PlatformLayout';

interface TenantDetail {
  id: string; name: string; businessNumber: string; vatNumber?: string;
  email?: string; phone?: string; contactName?: string;
  plan: string; maxUsers: number; maxEmployees: number;
  modules: Record<string, boolean>; notes?: string;
  isActive: boolean; suspendedAt?: string; suspendedReason?: string;
  createdAt: string;
  _count: { users: number; employees: number; invoices: number; payrollRuns: number; transactions: number };
}

const MODULE_LABELS: Record<string, { label: string; icon: string }> = {
  payroll:     { label: 'שכר',            icon: '💰' },
  accounting:  { label: 'הנהח"ש',         icon: '📒' },
  hr:          { label: 'משאבי אנוש',     icon: '👥' },
  crm:         { label: 'CRM',            icon: '🤝' },
  inventory:   { label: 'מלאי',           icon: '📦' },
  pos:         { label: 'קופה',           icon: '🖥️' },
  attendance:  { label: 'נוכחות',         icon: '⏰' },
  purchasing:  { label: 'רכש',            icon: '🛒' },
  assets:      { label: 'רכוש קבוע',     icon: '🏗️' },
  budget:      { label: 'תקציב',          icon: '📊' },
  documents:   { label: 'מסמכים',         icon: '📄' },
};

const PLAN_OPTIONS = ['basic', 'pro', 'enterprise'];

type Tab = 'overview' | 'modules' | 'users' | 'notes';

export default function PlatformTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<TenantDetail & { modules: Record<string, boolean> }>>({});
  const [saved, setSaved] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspend, setShowSuspend] = useState(false);

  const { data: tenant, isLoading } = useQuery<TenantDetail>({
    queryKey: ['platform-tenant', id],
    queryFn: async () => (await platformApi.get(`/tenants/${id}`)).data,
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<TenantDetail>) => platformApi.patch(`/tenants/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-tenant', id] });
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () => platformApi.post(`/tenants/${id}/suspend`, { reason: suspendReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-tenant', id] }); setShowSuspend(false); },
  });

  const activateMutation = useMutation({
    mutationFn: () => platformApi.post(`/tenants/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-tenant', id] }),
  });

  const impersonateMutation = useMutation({
    mutationFn: () => platformApi.post(`/tenants/${id}/impersonate`),
    onSuccess: (res) => {
      const { token, user } = res.data;
      localStorage.setItem('erp_token', token);
      localStorage.setItem('erp_user', JSON.stringify({ ...user, firstName: '[פלטפורמה]', lastName: '' }));
      window.open('/dashboard', '_blank');
    },
  });

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

  const toggleModule = (key: string) => {
    setEditForm(f => ({
      ...f,
      modules: { ...(f.modules ?? tenant?.modules ?? {}), [key]: !(f.modules ?? tenant?.modules ?? {})[key] },
    }));
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'פרטים' },
    { key: 'modules',  label: 'מודולים' },
    { key: 'notes',    label: 'הערות' },
  ];

  if (isLoading) return (
    <PlatformLayout>
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm animate-pulse">טוען...</div>
      </div>
    </PlatformLayout>
  );
  if (!tenant) return null;

  const currentModules = editing ? (editForm.modules ?? tenant.modules) : tenant.modules;
  const isSuspended = !!tenant.suspendedAt;

  return (
    <PlatformLayout>
      <div className="px-6 py-8 max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <button onClick={() => navigate('/platform/tenants')} className="hover:text-slate-300 transition">עסקים</button>
          <span>/</span>
          <span className="text-white">{tenant.name}</span>
        </div>

        {/* Top section */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xl font-bold">{tenant.name[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  { basic: 'bg-slate-700 text-slate-300', pro: 'bg-blue-900/50 text-blue-300', enterprise: 'bg-violet-900/50 text-violet-300' }[tenant.plan] ?? 'bg-slate-700 text-slate-300'
                }`}>{tenant.plan}</span>
                {isSuspended ? (
                  <span className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-2.5 py-1 rounded-full">מושהה</span>
                ) : tenant.isActive ? (
                  <span className="text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-2.5 py-1 rounded-full">פעיל</span>
                ) : null}
              </div>
              <p className="text-slate-400 text-sm mt-1 font-mono">{tenant.businessNumber}</p>
              <p className="text-slate-500 text-xs mt-0.5">נרשם {new Date(tenant.createdAt).toLocaleDateString('he-IL')}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {saved && <span className="text-emerald-400 text-sm">✓ נשמר</span>}
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-3 py-2 text-slate-400 hover:text-white border border-slate-700 rounded-xl text-sm transition">ביטול</button>
                <button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}
                  className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
                  {updateMutation.isPending ? 'שומר...' : '💾 שמור'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => impersonateMutation.mutate()} disabled={isSuspended}
                  className="bg-blue-700/80 hover:bg-blue-600 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-sm transition flex items-center gap-1.5">
                  🔑 כניסה כמנהל
                </button>
                <button onClick={startEdit} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-sm transition">✏️ ערוך</button>
                {isSuspended ? (
                  <button onClick={() => activateMutation.mutate()} className="bg-emerald-700/80 hover:bg-emerald-600 text-white px-3 py-2 rounded-xl text-sm transition">▶ הפעל</button>
                ) : (
                  <button onClick={() => setShowSuspend(true)} className="bg-red-900/60 hover:bg-red-800 text-red-300 px-3 py-2 rounded-xl text-sm transition">⏸ השהה</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Suspension banner */}
        {isSuspended && (
          <div className="mb-6 bg-red-900/20 border border-red-800/40 rounded-2xl px-5 py-4">
            <p className="text-red-300 font-semibold text-sm">⏸ עסק מושהה</p>
            <p className="text-red-400 text-sm mt-0.5">סיבה: {tenant.suspendedReason}</p>
            <p className="text-red-600 text-xs mt-1">מושהה מ: {new Date(tenant.suspendedAt!).toLocaleDateString('he-IL')}</p>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'משתמשים', value: `${tenant._count.users}/${tenant.maxUsers}`, ok: tenant._count.users < tenant.maxUsers },
            { label: 'עובדים', value: `${tenant._count.employees}/${tenant.maxEmployees}`, ok: tenant._count.employees < tenant.maxEmployees },
            { label: 'חשבוניות', value: tenant._count.invoices, ok: true },
            { label: 'ריצות שכר', value: tenant._count.payrollRuns, ok: true },
            { label: 'תנועות', value: tenant._count.transactions, ok: true },
          ].map(({ label, value, ok }) => (
            <div key={label} className="bg-slate-900/50 border border-slate-800/40 rounded-xl p-3 text-center">
              <p className={`text-lg font-bold ${ok ? 'text-white' : 'text-amber-400'}`}>{value}</p>
              <p className="text-slate-500 text-[11px] mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900/40 border border-slate-800/60 rounded-xl p-1 mb-5 w-fit">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === t.key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Contact */}
            <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">פרטי קשר</h2>
              <div className="space-y-3">
                {[
                  { label: 'אימייל', key: 'email', type: 'email' },
                  { label: 'טלפון', key: 'phone' },
                  { label: 'איש קשר', key: 'contactName' },
                ].map(({ label, key, type }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs w-24 flex-shrink-0">{label}</span>
                    {editing ? (
                      <input type={type ?? 'text'} value={(editForm as any)[key] ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                        dir={type === 'email' ? 'ltr' : 'rtl'}
                        className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    ) : (
                      <span className="text-white text-sm">{(tenant as any)[key] || <span className="text-slate-600">—</span>}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Plan */}
            <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">תוכנית ומגבלות</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 text-xs w-24 flex-shrink-0">תוכנית</span>
                  {editing ? (
                    <div className="flex gap-2">
                      {PLAN_OPTIONS.map(p => (
                        <button key={p} type="button" onClick={() => setEditForm(f => ({ ...f, plan: p }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${editForm.plan === p ? 'bg-violet-600/20 border-violet-600/50 text-violet-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  ) : <span className="text-white text-sm capitalize">{tenant.plan}</span>}
                </div>
                {[
                  { label: 'מקס\' משתמשים', key: 'maxUsers' },
                  { label: 'מקס\' עובדים', key: 'maxEmployees' },
                ].map(({ label, key }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs w-24 flex-shrink-0">{label}</span>
                    {editing ? (
                      <input type="number" value={(editForm as any)[key] ?? (tenant as any)[key]}
                        onChange={e => setEditForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                        className="w-24 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    ) : <span className="text-white text-sm">{(tenant as any)[key]}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Modules */}
        {activeTab === 'modules' && (
          <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">מודולים</h2>
              {!editing && (
                <button onClick={startEdit} className="text-violet-400 hover:text-violet-300 text-xs transition">✏️ ערוך</button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(MODULE_LABELS).map(([key, { label, icon }]) => {
                const active = currentModules[key] ?? false;
                return (
                  <button key={key} onClick={() => editing && toggleModule(key)} disabled={!editing}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-right ${
                      active ? 'bg-violet-900/30 border-violet-700/40 text-violet-300' : 'bg-slate-800/30 border-slate-700/40 text-slate-500'
                    } ${editing ? 'cursor-pointer hover:opacity-75 active:scale-95' : 'cursor-default'}`}>
                    <span className="text-base">{icon}</span>
                    <span className="flex-1">{label}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-violet-400' : 'bg-slate-600'}`} />
                  </button>
                );
              })}
            </div>
            {editing && <p className="text-slate-500 text-xs mt-4">לחץ על מודול כדי להפעיל/לכבות</p>}
          </div>
        )}

        {/* Tab: Notes */}
        {activeTab === 'notes' && (
          <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">הערות פנימיות</h2>
              {!editing && <button onClick={startEdit} className="text-violet-400 hover:text-violet-300 text-xs transition">✏️ ערוך</button>}
            </div>
            {editing ? (
              <>
                <textarea value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={8} placeholder="הוסף הערות פנימיות על העסק (לא מוצג ללקוח)..."
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <div className="flex justify-end gap-3 mt-3">
                  <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-white text-sm transition px-3 py-2">ביטול</button>
                  <button onClick={() => updateMutation.mutate({ notes: editForm.notes })} disabled={updateMutation.isPending}
                    className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm transition">שמור</button>
                </div>
              </>
            ) : (
              <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed min-h-[80px]">
                {tenant.notes || <span className="text-slate-600 italic">אין הערות</span>}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Suspend modal */}
      {showSuspend && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl" dir="rtl">
            <h3 className="text-base font-bold text-white mb-3">השהיית עסק</h3>
            <p className="text-slate-400 text-sm mb-4">העסק <strong className="text-white">{tenant.name}</strong> יושהה ולא יוכל להתחבר.</p>
            <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder="סיבת ההשהיה..." rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSuspend(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl text-sm transition">ביטול</button>
              <button onClick={() => suspendMutation.mutate()} disabled={!suspendReason.trim() || suspendMutation.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                השהה עסק
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformLayout>
  );
}
