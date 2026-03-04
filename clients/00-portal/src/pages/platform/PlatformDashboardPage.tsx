import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import platformApi from '../../lib/platformApi';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6">
      <p className="text-slate-400 text-sm font-medium mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function PlatformDashboardPage() {
  const { admin, logout } = usePlatformAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: async () => {
      const r = await platformApi.get('/stats');
      return r.data as {
        totalTenants: number; activeTenants: number; suspendedTenants: number;
        totalUsers: number; totalEmployees: number; recentTenants: number;
        byPlan: Record<string, number>;
      };
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      {/* Top navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="font-semibold text-white">ניהול פלטפורמה</span>
          <span className="text-slate-600 text-xs px-2 py-0.5 rounded-full border border-slate-700">SUPER ADMIN</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/platform/tenants')}
            className="text-slate-300 hover:text-white text-sm transition"
          >
            ניהול עסקים
          </button>
          <div className="text-slate-500 text-xs">{admin?.email}</div>
          <button
            onClick={() => { logout(); navigate('/platform/login'); }}
            className="text-slate-400 hover:text-red-400 text-sm transition"
          >
            יציאה
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">לוח בקרה</h1>
          <p className="text-slate-400 text-sm mt-1">סקירה כוללת של כל עסקי הפלטפורמה</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-800/60 rounded-2xl h-28 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard label="סה״כ עסקים" value={stats.totalTenants} color="text-white" />
              <StatCard label="עסקים פעילים" value={stats.activeTenants} sub={`${stats.suspendedTenants} מושהים`} color="text-emerald-400" />
              <StatCard label="משתמשים סה״כ" value={stats.totalUsers} color="text-blue-400" />
              <StatCard label="עובדים סה״כ" value={stats.totalEmployees} color="text-violet-400" />
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6">
                <p className="text-slate-400 text-sm mb-4">עסקים חדשים (30 יום אחרונים)</p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-amber-400">{stats.recentTenants}</span>
                  <span className="text-slate-500 text-sm mb-1">עסקים</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 col-span-1 lg:col-span-2">
                <p className="text-slate-400 text-sm mb-4">התפלגות לפי תוכנית</p>
                <div className="flex gap-6">
                  {(['basic','pro','enterprise'] as const).map(plan => {
                    const n = stats.byPlan[plan] ?? 0;
                    const colors: Record<string, string> = { basic: 'text-slate-300', pro: 'text-blue-400', enterprise: 'text-violet-400' };
                    const labels: Record<string, string> = { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' };
                    return (
                      <div key={plan} className="flex-1 text-center">
                        <p className={`text-2xl font-bold ${colors[plan]}`}>{n}</p>
                        <p className="text-slate-500 text-xs mt-1">{labels[plan]}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6">
              <p className="text-slate-400 text-sm mb-4 font-medium">פעולות מהירות</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/platform/tenants')}
                  className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                >
                  ניהול עסקים
                </button>
                <button
                  onClick={() => navigate('/platform/tenants?new=1')}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                >
                  ➕ הוסף עסק חדש
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
