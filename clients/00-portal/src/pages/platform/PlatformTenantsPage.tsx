import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import platformApi from '../../lib/platformApi';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';

interface Tenant {
  id: string; name: string; businessNumber: string; email?: string; phone?: string;
  contactName?: string; plan: string; isActive: boolean;
  suspendedAt?: string; suspendedReason?: string; createdAt: string;
  maxUsers: number; maxEmployees: number; modules: Record<string, boolean>;
  _count: { users: number; employees: number };
}

const PLAN_LABELS: Record<string, string> = { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-slate-700 text-slate-300',
  pro: 'bg-blue-900/60 text-blue-300',
  enterprise: 'bg-violet-900/60 text-violet-300',
};

function NewTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', businessNumber: '', vatNumber: '', email: '', phone: '',
    contactName: '', plan: 'basic', maxUsers: '10', maxEmployees: '50',
    adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">הוספת עסק חדש</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6" dir="rtl">
          {/* Business details */}
          <div>
            <p className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">פרטי העסק</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'שם העסק *', key: 'name', required: true },
                { label: 'ח.פ. / ע.מ. *', key: 'businessNumber', required: true },
                { label: 'מספר מע"מ', key: 'vatNumber' },
                { label: 'אימייל עסק', key: 'email' },
                { label: 'טלפון', key: 'phone' },
                { label: 'איש קשר', key: 'contactName' },
              ].map(({ label, key, required }) => (
                <div key={key}>
                  <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                  <input
                    value={(form as any)[key]}
                    onChange={set(key)}
                    required={required}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Plan */}
          <div>
            <p className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">תוכנית ומגבלות</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">תוכנית</label>
                <select value={form.plan} onChange={set('plan')} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">מקס' משתמשים</label>
                <input type="number" value={form.maxUsers} onChange={set('maxUsers')} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">מקס' עובדים</label>
                <input type="number" value={form.maxEmployees} onChange={set('maxEmployees')} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
          </div>

          {/* Admin user */}
          <div>
            <p className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">משתמש מנהל ראשוני</p>
            <div className="grid grid-cols-2 gap-4">
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
                    dir={type === 'email' || type === 'password' ? 'ltr' : 'rtl'}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-medium transition">ביטול</button>
            <button type="submit" disabled={loading} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition">
              {loading ? 'יוצר...' : 'צור עסק'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlatformTenantsPage() {
  const { logout } = usePlatformAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1');
  const [suspendModal, setSuspendModal] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['platform-tenants', search],
    queryFn: async () => {
      const r = await platformApi.get('/tenants', { params: search ? { search } : {} });
      return r.data ?? [];
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      platformApi.post(`/tenants/${id}/suspend`, { reason }),
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
      localStorage.setItem('erp_user', JSON.stringify({ ...user, firstName: 'מנהל', lastName: 'פלטפורמה' }));
      window.open('/dashboard', '_blank');
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/platform/dashboard')} className="text-slate-400 hover:text-white transition text-sm">← לוח בקרה</button>
          <span className="text-slate-700">/</span>
          <span className="font-semibold text-white">ניהול עסקים</span>
        </div>
        <button onClick={() => { logout(); navigate('/platform/login'); }} className="text-slate-400 hover:text-red-400 text-sm transition">יציאה</button>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header + actions */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">עסקים ({tenants.length})</h1>
            <p className="text-slate-400 text-sm mt-0.5">ניהול כל העסקים בפלטפורמה</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <span>➕</span> עסק חדש
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש לפי שם, ח.פ., אימייל, איש קשר..."
            className="w-full max-w-md bg-slate-800/60 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="bg-slate-800/40 rounded-xl h-16 animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs">
                  <th className="text-right px-4 py-3 font-medium">עסק</th>
                  <th className="text-right px-4 py-3 font-medium">ח.פ.</th>
                  <th className="text-right px-4 py-3 font-medium">איש קשר</th>
                  <th className="text-center px-4 py-3 font-medium">תוכנית</th>
                  <th className="text-center px-4 py-3 font-medium">משתמשים</th>
                  <th className="text-center px-4 py-3 font-medium">עובדים</th>
                  <th className="text-center px-4 py-3 font-medium">סטטוס</th>
                  <th className="text-center px-4 py-3 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/platform/tenants/${t.id}`)}
                        className="font-semibold text-white hover:text-violet-300 transition text-right"
                      >
                        {t.name}
                      </button>
                      {t.email && <p className="text-slate-500 text-xs">{t.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{t.businessNumber}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{t.contactName ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${PLAN_COLORS[t.plan] ?? PLAN_COLORS.basic}`}>
                        {PLAN_LABELS[t.plan] ?? t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-300">
                      {t._count.users} / {t.maxUsers}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-300">
                      {t._count.employees} / {t.maxEmployees}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.suspendedAt ? (
                        <span className="text-xs bg-red-900/50 text-red-300 border border-red-800/50 px-2 py-1 rounded-full">מושהה</span>
                      ) : t.isActive ? (
                        <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/40 px-2 py-1 rounded-full">פעיל</span>
                      ) : (
                        <span className="text-xs bg-slate-700 text-slate-400 px-2 py-1 rounded-full">לא פעיל</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => navigate(`/platform/tenants/${t.id}`)}
                          className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition"
                          title="הגדרות"
                        >
                          ⚙️
                        </button>
                        <button
                          onClick={() => impersonateMutation.mutate(t.id)}
                          disabled={!t.isActive || !!t.suspendedAt}
                          className="text-slate-400 hover:text-blue-400 text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition disabled:opacity-30"
                          title="כניסה כמנהל"
                        >
                          🔑
                        </button>
                        {t.suspendedAt ? (
                          <button
                            onClick={() => activateMutation.mutate(t.id)}
                            className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition"
                            title="הפעל מחדש"
                          >
                            ✅
                          </button>
                        ) : (
                          <button
                            onClick={() => setSuspendModal({ id: t.id, name: t.name })}
                            className="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition"
                            title="השהה"
                          >
                            ⏸️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      {search ? 'לא נמצאו עסקים לחיפוש זה' : 'אין עסקים עדיין'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New tenant modal */}
      {showNew && (
        <NewTenantModal
          onClose={() => setShowNew(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['platform-tenants'] })}
        />
      )}

      {/* Suspend modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl">
            <h3 className="text-lg font-bold text-white mb-2">השהיית עסק</h3>
            <p className="text-slate-400 text-sm mb-4">הושהה: <strong className="text-white">{suspendModal.name}</strong></p>
            <textarea
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              placeholder="סיבת ההשהיה (תוצג בכרטיס העסק)..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setSuspendModal(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl text-sm transition">ביטול</button>
              <button
                onClick={() => suspendMutation.mutate({ id: suspendModal.id, reason: suspendReason })}
                disabled={!suspendReason.trim() || suspendMutation.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition"
              >
                השהה עסק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
