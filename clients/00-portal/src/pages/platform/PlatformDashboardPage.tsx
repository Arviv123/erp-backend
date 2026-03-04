import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import platformApi from '../../lib/platformApi';
import PlatformLayout from '../../components/PlatformLayout';

interface Stats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalEmployees: number;
  recentTenants: number;
  byPlan: Record<string, number>;
}

interface Activity {
  recentTenants: Array<{
    id: string; name: string; plan: string; isActive: boolean;
    suspendedAt?: string; createdAt: string;
    _count: { users: number; employees: number };
  }>;
  newTenantsByDay: Record<string, number>;
  recentPayrollRuns: number;
  recentInvoices: number;
}

// Mini bar chart using CSS
function BarChart({ data, color = '#7c3aed' }: { data: Record<string, number>; color?: string }) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  // Show only last 14 days to keep it readable
  const visible = entries.slice(-14);

  return (
    <div className="flex items-end gap-0.5 h-16 w-full">
      {visible.map(([date, val]) => {
        const h = Math.max((val / max) * 100, val > 0 ? 8 : 2);
        const day = new Date(date).getDate();
        return (
          <div key={date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full rounded-t-sm transition-all duration-200 group-hover:opacity-80"
              style={{ height: `${h}%`, background: color, minHeight: val > 0 ? '3px' : '2px', opacity: val > 0 ? 1 : 0.2 }}
            />
            {day % 7 === 0 && (
              <span className="text-[8px] text-slate-600 absolute -bottom-4">{day}</span>
            )}
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 bg-slate-700 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {date.slice(5)}: {val} עסקים
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Donut-like plan distribution using CSS
function PlanDistribution({ byPlan, total }: { byPlan: Record<string, number>; total: number }) {
  const plans = [
    { key: 'enterprise', label: 'Enterprise', color: '#7c3aed' },
    { key: 'pro',        label: 'Pro',        color: '#2563eb' },
    { key: 'basic',      label: 'Basic',      color: '#475569' },
  ];

  return (
    <div className="space-y-3">
      {plans.map(({ key, label, color }) => {
        const n = byPlan[key] ?? 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        return (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">{label}</span>
              <span className="text-white font-medium">{n} <span className="text-slate-500">({pct}%)</span></span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-slate-700/60 text-slate-300',
  pro: 'bg-blue-900/40 text-blue-300',
  enterprise: 'bg-violet-900/40 text-violet-300',
};

export default function PlatformDashboardPage() {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ['platform-stats'],
    queryFn: async () => (await platformApi.get('/stats')).data,
    refetchInterval: 60_000,
  });

  const { data: activity, isLoading: actLoading } = useQuery<Activity>({
    queryKey: ['platform-activity'],
    queryFn: async () => (await platformApi.get('/activity')).data,
    refetchInterval: 120_000,
  });

  const isLoading = statsLoading || actLoading;

  return (
    <PlatformLayout>
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">לוח בקרה</h1>
            <p className="text-slate-400 text-sm mt-0.5">סקירה כוללת של הפלטפורמה</p>
          </div>
          <button
            onClick={() => navigate('/platform/tenants?new=1')}
            className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="text-base leading-none">+</span> עסק חדש
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="bg-slate-800/40 rounded-2xl h-28 animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Top KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'סה״כ עסקים', value: stats?.totalTenants ?? 0, sub: `${stats?.recentTenants ?? 0} חדשים החודש`, color: 'text-white', icon: '🏢', trend: '+' },
                { label: 'עסקים פעילים', value: stats?.activeTenants ?? 0, sub: `${stats?.suspendedTenants ?? 0} מושהים`, color: 'text-emerald-400', icon: '✅', trend: '' },
                { label: 'משתמשים',      value: stats?.totalUsers ?? 0,    sub: 'בכל הטנאנטים',                             color: 'text-blue-400',   icon: '👤', trend: '' },
                { label: 'עובדים',       value: stats?.totalEmployees ?? 0, sub: 'בכל הטנאנטים',                             color: 'text-violet-400', icon: '👥', trend: '' },
              ].map(({ label, value, sub, color, icon }) => (
                <div key={label} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg">{icon}</span>
                  </div>
                  <p className={`text-3xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  <p className="text-slate-400 text-xs mt-1">{label}</p>
                  {sub && <p className="text-slate-600 text-[11px] mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Activity week row */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
                <p className="text-slate-400 text-xs font-medium mb-1">ריצות שכר — 7 ימים אחרונים</p>
                <p className="text-3xl font-bold text-amber-400">{activity?.recentPayrollRuns ?? 0}</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
                <p className="text-slate-400 text-xs font-medium mb-1">חשבוניות שנוצרו — 7 ימים אחרונים</p>
                <p className="text-3xl font-bold text-sky-400">{activity?.recentInvoices ?? 0}</p>
              </div>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Growth chart */}
              <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-white font-semibold text-sm">גידול עסקים — 14 ימים אחרונים</p>
                  <span className="text-slate-500 text-xs">עסקים חדשים / יום</span>
                </div>
                {activity?.newTenantsByDay && (
                  <BarChart data={activity.newTenantsByDay} color="#7c3aed" />
                )}
              </div>

              {/* Plan distribution */}
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-4">התפלגות תוכניות</p>
                {stats && <PlanDistribution byPlan={stats.byPlan} total={stats.totalTenants} />}
              </div>
            </div>

            {/* Recent tenants */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
                <p className="text-white font-semibold text-sm">עסקים חדשים (30 יום אחרונים)</p>
                <button
                  onClick={() => navigate('/platform/tenants')}
                  className="text-violet-400 hover:text-violet-300 text-xs transition"
                >
                  כל העסקים ←
                </button>
              </div>
              {activity?.recentTenants?.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">אין עסקים חדשים ב-30 הימים האחרונים</p>
              ) : (
                <div className="divide-y divide-slate-800/40">
                  {activity?.recentTenants?.slice(0, 8).map(t => (
                    <div
                      key={t.id}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-slate-800/30 transition cursor-pointer"
                      onClick={() => navigate(`/platform/tenants/${t.id}`)}
                    >
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-sm font-bold">{t.name[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{t.name}</p>
                        <p className="text-slate-500 text-xs">{t._count.users} משתמשים · {t._count.employees} עובדים</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${PLAN_COLORS[t.plan] ?? PLAN_COLORS.basic}`}>
                        {t.plan}
                      </span>
                      {t.suspendedAt ? (
                        <span className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-2 py-1 rounded-full">מושהה</span>
                      ) : (
                        <span className="text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-2 py-1 rounded-full">פעיל</span>
                      )}
                      <span className="text-slate-600 text-xs flex-shrink-0">
                        {new Date(t.createdAt).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PlatformLayout>
  );
}
