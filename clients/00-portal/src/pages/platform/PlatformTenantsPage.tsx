import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import platformApi from '../../lib/platformApi';
import PlatformLayout from '../../components/PlatformLayout';

interface Tenant {
  id: string; name: string; businessNumber: string; email?: string; phone?: string;
  contactName?: string; plan: string; isActive: boolean;
  suspendedAt?: string; suspendedReason?: string; createdAt: string;
  maxUsers: number; maxEmployees: number; modules: Record<string, boolean>;
  _count: { users: number; employees: number };
}

const PLAN_LABELS: Record<string, string> = { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-slate-700/80 text-slate-300',
  pro: 'bg-blue-900/50 text-blue-300',
  enterprise: 'bg-violet-900/50 text-violet-300',
};

function NewTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', businessNumber: '', vatNumber: '', email: '', phone: '',
    contactName: '', plan: 'basic', maxUsers: '10', maxEmployees: '50',
    adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'business' | 'admin'>('business');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await platformApi.post('/tenants', {
        ...form,
        maxUsers: Number(form.maxUsers),
        maxEmployees: Number(form.maxEmployees),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'שגיאה ביצירת עסק');
      setStep('business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">עסק חדש</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 transition text-xl leading-none">✕</button>
          </div>
          {/* Steps */}
          <div className="flex gap-2">
            {(['business', 'admin'] as const).map((s, i) => (
              <button key={s} onClick={() => setStep(s)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${step === s ? 'bg-violet-600/20 text-violet-300 border border-violet-600/40' : 'text-slate-500 hover:text-slate-300'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{i + 1}</span>
                {s === 'business' ? 'פרטי עסק' : 'משתמש מנהל'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {step === 'business' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'שם העסק *', key: 'name', required: true, colSpan: 2 },
                  { label: 'ח.פ. / ע.מ. *', key: 'businessNumber', required: true },
                  { label: 'מספר מע"מ', key: 'vatNumber' },
                  { label: 'אימייל עסק', key: 'email' },
                  { label: 'טלפון', key: 'phone' },
                  { label: 'איש קשר', key: 'contactName' },
                ].map(({ label, key, required, colSpan }) => (
                  <div key={key} className={colSpan === 2 ? 'col-span-2' : ''}>
                    <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                    <input
                      value={(form as any)[key]}
                      onChange={set(key)}
                      required={required}
                      className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-2 block">תוכנית</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['basic', 'pro', 'enterprise'] as const).map(p => (
                    <button key={p} type="button" onClick={() => setForm(f => ({ ...f, plan: p }))}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.plan === p ? 'bg-violet-600/20 border-violet-600/50 text-violet-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                      {PLAN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">מקס' משתמשים</label>
                  <input type="number" value={form.maxUsers} onChange={set('maxUsers')} className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">מקס' עובדים</label>
                  <input type="number" value={form.maxEmployees} onChange={set('maxEmployees')} className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl text-sm transition">ביטול</button>
                <button type="button" onClick={() => setStep('admin')} disabled={!form.name || !form.businessNumber}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition">
                  הבא → משתמש מנהל
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-3 text-sm text-slate-300">
                <span className="text-slate-500">עסק: </span>{form.name} <span className="text-xs text-slate-500 mr-2">({PLAN_LABELS[form.plan]})</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'שם פרטי *', key: 'adminFirstName', required: true },
                  { label: 'שם משפחה *', key: 'adminLastName', required: true },
                  { label: 'אימייל *', key: 'adminEmail', required: true, type: 'email' },
                  { label: 'סיסמה *', key: 'adminPassword', required: true, type: 'password' },
                ].map(({ label, key, required, type }) => (
                  <div key={key}>
                    <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                    <input
                      type={type ?? 'text'}
                      value={(form as any)[key]}
                      onChange={set(key)}
                      required={required}
                      dir={type ? 'ltr' : 'rtl'}
                      className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                ))}
              </div>
              {error && <div className="bg-red-900/30 border border-red-700/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep('business')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl text-sm transition">← חזרה</button>
                <button type="submit" disabled={loading || !form.adminEmail || !form.adminPassword || !form.adminFirstName || !form.adminLastName}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition">
                  {loading ? 'יוצר...' : '✓ צור עסק'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default function PlatformTenantsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1');
  const [suspendModal, setSuspendModal] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['platform-tenants', search],
    queryFn: async () => (await platformApi.get('/tenants', { params: search ? { search } : {} })).data ?? [],
  });

  const filtered = tenants.filter(t => {
    if (filterPlan !== 'all' && t.plan !== filterPlan) return false;
    if (filterStatus === 'active' && (t.suspendedAt || !t.isActive)) return false;
    if (filterStatus === 'suspended' && !t.suspendedAt) return false;
    return true;
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => platformApi.post(`/tenants/${id}/suspend`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-tenants'] }); setSuspendModal(null); setSuspendReason(''); },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => platformApi.post(`/tenants/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-tenants'] }),
  });

  const impersonateMutation = useMutation({
    mutationFn: (id: string) => platformApi.post(`/tenants/${id}/impersonate`),
    onSuccess: (res) => {
      const { token, user } = res.data;
      localStorage.setItem('erp_token', token);
      localStorage.setItem('erp_user', JSON.stringify({ ...user, firstName: '[פלטפורמה]', lastName: '' }));
      window.open('/dashboard', '_blank');
    },
  });

  return (
    <PlatformLayout>
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">עסקים</h1>
            <p className="text-slate-400 text-sm mt-0.5">{tenants.length} עסקים ברשומות</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="text-base leading-none">+</span> עסק חדש
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative">
            <svg className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חפש..."
              className="bg-slate-800/60 border border-slate-700 text-white placeholder-slate-500 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-56"
            />
          </div>
          <div className="flex gap-1 bg-slate-800/60 border border-slate-700 rounded-xl p-1">
            {[['all', 'הכל'], ['active', 'פעילים'], ['suspended', 'מושהים']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${filterStatus === v ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-800/60 border border-slate-700 rounded-xl p-1">
            {[['all', 'כל התוכניות'], ['basic', 'Basic'], ['pro', 'Pro'], ['enterprise', 'Enterprise']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterPlan(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${filterPlan === v ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <span className="text-slate-500 text-xs mr-auto">{filtered.length} תוצאות</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-800/30 rounded-xl h-14 animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-slate-500 text-xs">
                  <th className="text-right px-4 py-3 font-medium">עסק</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">ח.פ.</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">איש קשר</th>
                  <th className="text-center px-4 py-3 font-medium">תוכנית</th>
                  <th className="text-center px-4 py-3 font-medium hidden lg:table-cell">שימוש</th>
                  <th className="text-center px-4 py-3 font-medium">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">נרשם</th>
                  <th className="text-center px-4 py-3 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/platform/tenants/${t.id}`)} className="flex items-center gap-3 text-right group-hover:text-violet-300 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-300">
                          {t.name[0]}
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{t.name}</p>
                          {t.email && <p className="text-slate-500 text-[11px]">{t.email}</p>}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden sm:table-cell">{t.businessNumber}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{t.contactName ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${PLAN_COLORS[t.plan] ?? PLAN_COLORS.basic}`}>
                        {PLAN_LABELS[t.plan] ?? t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <div className="text-xs text-slate-400">
                        <span className="text-white font-medium">{t._count.users}</span>/{t.maxUsers} משתמשים
                        <br />
                        <span className="text-white font-medium">{t._count.employees}</span>/{t.maxEmployees} עובדים
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.suspendedAt ? (
                        <span className="text-[11px] bg-red-900/40 text-red-300 border border-red-800/40 px-2 py-1 rounded-full">מושהה</span>
                      ) : t.isActive ? (
                        <span className="text-[11px] bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-2 py-1 rounded-full">פעיל</span>
                      ) : (
                        <span className="text-[11px] bg-slate-700/60 text-slate-400 px-2 py-1 rounded-full">לא פעיל</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                      {new Date(t.createdAt).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => navigate(`/platform/tenants/${t.id}`)} title="הגדרות"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition text-sm">
                          ⚙️
                        </button>
                        <button onClick={() => impersonateMutation.mutate(t.id)} title="כניסה כמנהל"
                          disabled={!t.isActive || !!t.suspendedAt}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-700 transition text-sm disabled:opacity-30">
                          🔑
                        </button>
                        {t.suspendedAt ? (
                          <button onClick={() => activateMutation.mutate(t.id)} title="הפעל מחדש"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-slate-700 transition text-sm">
                            ▶️
                          </button>
                        ) : (
                          <button onClick={() => setSuspendModal({ id: t.id, name: t.name })} title="השהה"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700 transition text-sm">
                            ⏸️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-500 text-sm">
                      {search ? 'לא נמצאו עסקים מתאימים לחיפוש' : 'אין עסקים עדיין — הוסף עסק חדש'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <NewTenantModal onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['platform-tenants'] })} />}

      {suspendModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl" dir="rtl">
            <h3 className="text-base font-bold text-white mb-1">השהיית עסק</h3>
            <p className="text-slate-400 text-sm mb-4"><strong className="text-white">{suspendModal.name}</strong></p>
            <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder="סיבת ההשהיה..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setSuspendModal(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl text-sm transition">ביטול</button>
              <button onClick={() => suspendMutation.mutate({ id: suspendModal.id, reason: suspendReason })}
                disabled={!suspendReason.trim() || suspendMutation.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                השהה
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformLayout>
  );
}
