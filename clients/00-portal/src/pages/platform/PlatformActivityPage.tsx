import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import platformApi from '../../lib/platformApi';
import PlatformLayout from '../../components/PlatformLayout';

interface ActivityData {
  recentTenants: Array<{
    id: string; name: string; plan: string; isActive: boolean;
    suspendedAt?: string; createdAt: string;
    _count: { users: number; employees: number };
  }>;
  suspendedTenants: Array<{
    id: string; name: string; suspendedAt: string; suspendedReason?: string;
  }>;
  newTenantsByDay: Record<string, number>;
  recentPayrollRuns: number;
  recentInvoices: number;
}

const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-slate-700/60 text-slate-300',
  pro: 'bg-blue-900/40 text-blue-300',
  enterprise: 'bg-violet-900/40 text-violet-300',
};

// Large bar chart component
function GrowthChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <div className="flex items-end gap-1 h-32 w-full mb-2">
        {entries.map(([date, val]) => {
          const h = Math.max((val / max) * 100, val > 0 ? 6 : 1);
          const d = new Date(date);
          const isWeekend = d.getDay() === 5 || d.getDay() === 6;
          return (
            <div key={date} className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative">
              <div
                className={`w-full rounded-t transition-all duration-500 group-hover:opacity-75 ${
                  isWeekend ? 'opacity-70' : 'opacity-100'
                }`}
                style={{ height: `${h}%`, background: val > 0 ? '#7c3aed' : '#1e293b', minHeight: '2px' }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 bg-slate-700 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 text-center">
                {date.slice(5).replace('-', '/')}: {val} עסקים
              </div>
            </div>
          );
        })}
      </div>
      {/* X-axis: show first + last dates */}
      <div className="flex justify-between text-slate-600 text-[10px] px-0.5">
        <span>{entries[0]?.[0].slice(5)}</span>
        <span className="text-slate-400 text-xs">{total} עסקים חדשים סה״כ</span>
        <span>{entries[entries.length - 1]?.[0].slice(5)}</span>
      </div>
    </div>
  );
}

export default function PlatformActivityPage() {
  const navigate = useNavigate();

  const { data: activity, isLoading } = useQuery<ActivityData>({
    queryKey: ['platform-activity-full'],
    queryFn: async () => (await platformApi.get('/activity')).data,
    refetchInterval: 60_000,
  });

  return (
    <PlatformLayout>
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">פעילות הפלטפורמה</h1>
          <p className="text-slate-400 text-sm mt-0.5">סקירת כלל הפעילות — 30 ימים אחרונים</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-800/30 rounded-2xl h-64 animate-pulse" />)}
          </div>
        ) : activity ? (
          <>
            {/* Top summary row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'עסקים חדשים (30 יום)', value: activity.recentTenants.length, color: 'text-violet-400', icon: '🏢' },
                { label: 'עסקים מושהים', value: activity.suspendedTenants.length, color: activity.suspendedTenants.length > 0 ? 'text-red-400' : 'text-slate-400', icon: '⏸' },
                { label: 'ריצות שכר (7 יום)', value: activity.recentPayrollRuns, color: 'text-amber-400', icon: '💰' },
                { label: 'חשבוניות (7 יום)', value: activity.recentInvoices, color: 'text-sky-400', icon: '📄' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">{icon}</span>
                  </div>
                  <p className={`text-3xl font-bold ${color}`}>{value}</p>
                  <p className="text-slate-500 text-xs mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Growth chart */}
            <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6 mb-6">
              <h2 className="text-white font-semibold text-sm mb-5">גידול עסקים — 30 יום</h2>
              <GrowthChart data={activity.newTenantsByDay} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent new tenants */}
              <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
                  <h2 className="text-white font-semibold text-sm">עסקים חדשים ({activity.recentTenants.length})</h2>
                  <button onClick={() => navigate('/platform/tenants')} className="text-violet-400 hover:text-violet-300 text-xs transition">כל העסקים ←</button>
                </div>
                {activity.recentTenants.length === 0 ? (
                  <p className="text-slate-600 text-sm text-center py-8">אין עסקים חדשים</p>
                ) : (
                  <div className="divide-y divide-slate-800/40 max-h-80 overflow-y-auto">
                    {activity.recentTenants.map(t => (
                      <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/20 transition cursor-pointer" onClick={() => navigate(`/platform/tenants/${t.id}`)}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-300">
                          {t.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{t.name}</p>
                          <p className="text-slate-500 text-xs">
                            {t._count.users} משתמשים · {t._count.employees} עובדים
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[t.plan] ?? PLAN_COLORS.basic}`}>
                            {t.plan}
                          </span>
                          <span className="text-slate-600 text-xs">
                            {new Date(t.createdAt).toLocaleDateString('he-IL')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Suspended tenants */}
              <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/60">
                  <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                    עסקים מושהים
                    {activity.suspendedTenants.length > 0 && (
                      <span className="bg-red-900/50 text-red-300 text-[10px] px-2 py-0.5 rounded-full">
                        {activity.suspendedTenants.length}
                      </span>
                    )}
                  </h2>
                </div>
                {activity.suspendedTenants.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <span className="text-2xl">✅</span>
                    <p className="text-slate-500 text-sm">אין עסקים מושהים</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/40 max-h-80 overflow-y-auto">
                    {activity.suspendedTenants.map(t => (
                      <div key={t.id} className="px-5 py-3 hover:bg-slate-800/20 transition cursor-pointer" onClick={() => navigate(`/platform/tenants/${t.id}`)}>
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-white text-sm font-medium">{t.name}</p>
                          <span className="text-slate-600 text-xs">{new Date(t.suspendedAt).toLocaleDateString('he-IL')}</span>
                        </div>
                        {t.suspendedReason && (
                          <p className="text-red-400/70 text-xs truncate">סיבה: {t.suspendedReason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </PlatformLayout>
  );
}
