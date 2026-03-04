import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import platformApi from '../../lib/platformApi';
import PlatformLayout from '../../components/PlatformLayout';

const PLAN_DEFAULTS: Record<string, { maxUsers: number; maxEmployees: number; modules: string[] }> = {
  basic: {
    maxUsers: 10,
    maxEmployees: 50,
    modules: ['accounting', 'invoices', 'employees'],
  },
  pro: {
    maxUsers: 50,
    maxEmployees: 200,
    modules: ['accounting', 'invoices', 'employees', 'payroll', 'hr', 'crm', 'inventory', 'attendance'],
  },
  enterprise: {
    maxUsers: 500,
    maxEmployees: 5000,
    modules: ['accounting', 'invoices', 'employees', 'payroll', 'hr', 'crm', 'inventory', 'pos', 'attendance', 'purchasing', 'assets', 'budget', 'documents'],
  },
};

const MODULE_LABELS: Record<string, string> = {
  payroll: 'שכר', accounting: 'הנהח"ש', hr: 'משאבי אנוש', crm: 'CRM',
  inventory: 'מלאי', pos: 'קופה', attendance: 'נוכחות', purchasing: 'רכש',
  assets: 'רכוש קבוע', budget: 'תקציב', documents: 'מסמכים',
};

interface Stats {
  totalTenants: number; activeTenants: number; suspendedTenants: number;
  totalUsers: number; totalEmployees: number; recentTenants: number;
  byPlan: Record<string, number>;
}

export default function PlatformSettingsPage() {
  const [activeSection, setActiveSection] = useState<'plans' | 'security' | 'about'>('plans');

  const { data: stats } = useQuery<Stats>({
    queryKey: ['platform-stats'],
    queryFn: async () => (await platformApi.get('/stats')).data,
  });

  return (
    <PlatformLayout>
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">הגדרות פלטפורמה</h1>
          <p className="text-slate-400 text-sm mt-0.5">הגדרות מערכת, תוכניות ומדיניות</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900/40 border border-slate-800/60 rounded-xl p-1 mb-6 w-fit">
          {[
            { key: 'plans' as const, label: 'תוכניות' },
            { key: 'security' as const, label: 'אבטחה' },
            { key: 'about' as const, label: 'אודות' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveSection(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === t.key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Section: Plans */}
        {activeSection === 'plans' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {(['basic', 'pro', 'enterprise'] as const).map(plan => {
                const defaults = PLAN_DEFAULTS[plan];
                const activeCount = stats?.byPlan[plan] ?? 0;
                const planColors = {
                  basic: { border: 'border-slate-700/60', badge: 'bg-slate-700/60 text-slate-300', header: 'text-slate-300' },
                  pro: { border: 'border-blue-800/40', badge: 'bg-blue-900/40 text-blue-300', header: 'text-blue-300' },
                  enterprise: { border: 'border-violet-800/40', badge: 'bg-violet-900/40 text-violet-300', header: 'text-violet-300' },
                }[plan];

                return (
                  <div key={plan} className={`bg-slate-900/50 border ${planColors.border} rounded-2xl p-5`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${planColors.badge}`}>
                          {plan.charAt(0).toUpperCase() + plan.slice(1)}
                        </span>
                        <p className="text-slate-500 text-xs mt-1">{activeCount} עסקים פעילים</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">מקס' משתמשים</span>
                        <span className="text-white font-medium">{defaults.maxUsers.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">מקס' עובדים</span>
                        <span className="text-white font-medium">{defaults.maxEmployees.toLocaleString()}</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-slate-500 text-xs mb-2">מודולים כלולים</p>
                      <div className="flex flex-wrap gap-1.5">
                        {defaults.modules.map(m => (
                          <span key={m} className={`text-[10px] px-1.5 py-0.5 rounded-md ${planColors.badge}`}>
                            {MODULE_LABELS[m] ?? m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl px-5 py-4">
              <p className="text-slate-500 text-sm">
                💡 הגדרות התוכניות כאן הן עזר ויזואלי בלבד. בפועל, המגבלות מוגדרות בכרטיס העסק ונשמרות במסד הנתונים.
                ניתן לשנות מגבלות לכל עסק בנפרד דרך <button onClick={() => window.location.href = '/platform/tenants'} className="text-violet-400 hover:underline">עמוד ניהול העסקים</button>.
              </p>
            </div>
          </div>
        )}

        {/* Section: Security */}
        {activeSection === 'security' && (
          <div className="space-y-5">
            <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-5">מדיניות אבטחה</h2>
              <div className="space-y-5 divide-y divide-slate-800/40">
                {[
                  { title: 'JWT Session', desc: 'JWT token תוקף 12 שעות לטוקן פלטפורמה. לא ניתן לשינוי דרך הממשק.', icon: '🔐', status: 'active' },
                  { title: 'Rate Limiting', desc: 'כניסה לפלטפורמה — 10 ניסיונות כל 15 דקות. API כללי — 300 בקשות / דקה.', icon: '⏱', status: 'active' },
                  { title: 'Tenant Isolation', desc: 'כל בקשה API מאמתת tenantId ומונעת גישה בין-טנאנטים.', icon: '🔒', status: 'active' },
                  { title: 'Impersonation Log', desc: 'גישת בעל פלטפורמה לטנאנטים מוגבלת ל-2 שעות ומציינת "impersonatedBy: platform" ב-JWT.', icon: '🕵️', status: 'active' },
                  { title: 'Password Hashing', desc: 'bcrypt עם cost factor 12 לכל סיסמאות משתמשים ומנהלי פלטפורמה.', icon: '🔑', status: 'active' },
                ].map(({ title, desc, icon, status }) => (
                  <div key={title} className="flex items-start gap-4 pt-5 first:pt-0">
                    <span className="text-2xl flex-shrink-0">{icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium text-sm">{title}</p>
                        {status === 'active' && (
                          <span className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-1.5 py-0.5 rounded-full">פעיל</span>
                        )}
                      </div>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-900/10 border border-amber-800/30 rounded-2xl p-5">
              <p className="text-amber-400 font-medium text-sm mb-2">⚠ המלצות אבטחה</p>
              <ul className="text-amber-400/70 text-xs space-y-1.5 list-disc list-inside">
                <li>שנה את סיסמת ה-admin הראשוני מיד לאחר ההגדרה</li>
                <li>הוסף מנהל פלטפורמה נוסף כגיבוי, ושמור פרטיו במקום מאובטח</li>
                <li>הגדר ALLOWED_ORIGINS ב-.env לכתובות ספציפיות בסביבת ייצור</li>
                <li>בדוק יומן פעילות באופן קבוע</li>
              </ul>
            </div>
          </div>
        )}

        {/* Section: About */}
        {activeSection === 'about' && (
          <div className="space-y-5">
            <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-xl font-bold">ERP SaaS Platform</p>
                  <p className="text-slate-400 text-sm">מערכת ניהול עסקי ישראלי בענן</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'גרסה', value: '2.0.0' },
                  { label: 'סביבה', value: 'Production' },
                  { label: 'מסד נתונים', value: 'Neon.tech (PostgreSQL)' },
                  { label: 'Backend', value: 'Node.js + Express + Prisma' },
                  { label: 'Frontend', value: 'React + TypeScript + Tailwind' },
                  { label: 'Deploy', value: 'Render (auto-deploy on push)' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-slate-500 text-xs mb-0.5">{label}</p>
                    <p className="text-white text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Live stats */}
            {stats && (
              <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6">
                <h2 className="text-white font-semibold text-sm mb-4">נתוני פלטפורמה חיים</h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'עסקים', value: stats.totalTenants },
                    { label: 'משתמשים', value: stats.totalUsers },
                    { label: 'עובדים', value: stats.totalEmployees },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-3xl font-bold text-violet-400">{value.toLocaleString()}</p>
                      <p className="text-slate-500 text-xs mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PlatformLayout>
  );
}
