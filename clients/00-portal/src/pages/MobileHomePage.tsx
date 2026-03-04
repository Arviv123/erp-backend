/**
 * MobileHomePage — דשבורד עובד מובייל
 *
 * Tabs: 🏠 בית | 💰 תלושים | 📋 טופס 101 | ⚙️ הגדרות
 * Full-screen mobile app experience, RTL Hebrew, iOS/Android feel
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Home, FileText, Settings, LogOut, ChevronLeft, CheckCircle, Info, Download } from 'lucide-react';
import api from '../lib/api';
import { useMobileAuth, getMobileHeaders } from '../contexts/MobileAuthContext';

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function fmtPeriod(period: string) {
  const [y, m] = period.split('-');
  return `${MONTHS_HE[Number(m)]} ${y}`;
}

// ─── Mobile API helper ─────────────────────────────────────────────
function mobileApi() {
  return {
    get: (url: string) => api.get(url, { headers: getMobileHeaders() }),
    patch: (url: string, data: any) => api.patch(url, data, { headers: getMobileHeaders() }),
  };
}

// ─── TAB IDs ──────────────────────────────────────────────────────
type Tab = 'home' | 'payslips' | 'form101' | 'settings';

// ─── Home Tab ─────────────────────────────────────────────────────
function HomeTab({ emp }: { emp: any }) {
  const payslips: any[] = emp?.payslips ?? [];
  const latest = payslips[0];

  return (
    <div className="space-y-4 pb-4">
      {/* Greeting card */}
      <div className="bg-gradient-to-l from-blue-600 to-blue-500 rounded-2xl p-5 text-white">
        <p className="text-blue-200 text-sm">שלום,</p>
        <h2 className="text-2xl font-bold">{emp?.firstName} {emp?.lastName}</h2>
        <p className="text-blue-200 text-sm mt-1">{emp?.jobTitle} · {emp?.department}</p>
      </div>

      {/* Latest payslip card */}
      {latest && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700">תלוש אחרון</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              latest.payrollRun?.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {latest.payrollRun?.status === 'PAID' ? 'שולם' : 'בעיבוד'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{latest.payrollRun?.period ? fmtPeriod(latest.run.period) : '—'}</p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">ברוטו</p>
              <p className="text-base font-bold text-gray-900">{fmtILS(Number(latest.grossSalary ?? 0))}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">נטו</p>
              <p className="text-base font-bold text-green-700">{fmtILS(Number(latest.netSalary ?? 0))}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">פרטי עבודה</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">שכר בסיס</span>
            <span className="font-semibold">{fmtILS(Number(emp?.grossSalary ?? 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">סוג העסקה</span>
            <span className="font-semibold">
              {{ FULL_TIME: 'משרה מלאה', PART_TIME: 'משרה חלקית', HOURLY: 'שעתי', CONTRACTOR: 'קבלן' }[emp?.employmentType as string] ?? '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">תחילת העסקה</span>
            <span className="font-semibold">
              {emp?.startDate ? new Date(emp.startDate).toLocaleDateString('he-IL') : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">נקודות זיכוי</span>
            <span className="font-semibold">{Number(emp?.taxCredits ?? 0)} נק'</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payslips Tab ─────────────────────────────────────────────────
function PayslipsTab({ emp }: { emp: any }) {
  const payslips: any[] = emp?.payslips ?? [];

  if (payslips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-gray-400">
        <FileText className="w-12 h-12 mb-3 opacity-30" />
        <p>אין תלושים להצגה</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      <h3 className="text-sm font-bold text-gray-500 px-1">תלושי שכר</h3>
      {payslips.map((ps: any) => (
        <div key={ps.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-gray-900">
                {ps.payrollRun?.period ? fmtPeriod(ps.run.period) : '—'}
              </p>
              <p className="text-xs text-gray-400">
                {ps.payrollRun?.paidAt ? `שולם: ${new Date(ps.run.paidAt).toLocaleDateString('he-IL')}` :
                 ps.payrollRun?.status === 'APPROVED' ? 'מאושר — ממתין לתשלום' : 'טיוטה'}
              </p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              ps.payrollRun?.status === 'PAID' ? 'bg-green-100 text-green-700' :
              ps.payrollRun?.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {ps.payrollRun?.status === 'PAID' ? '✓ שולם' :
               ps.payrollRun?.status === 'APPROVED' ? 'מאושר' : 'טיוטה'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center">
              <p className="text-xs text-gray-500">ברוטו</p>
              <p className="text-sm font-bold text-gray-900">{fmtILS(Number(ps.grossSalary ?? 0))}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">ניכויים</p>
              <p className="text-sm font-bold text-red-600">
                {fmtILS(Number(ps.grossSalary ?? 0) - Number(ps.netSalary ?? 0))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">נטו</p>
              <p className="text-sm font-bold text-green-700">{fmtILS(Number(ps.netSalary ?? 0))}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Form 101 Tab ─────────────────────────────────────────────────
function Form101Tab({ emp, onSaved }: { emp: any; onSaved: () => void }) {
  const details = emp?.creditPointsDetails ?? {};
  const signedAt = details.signedAt;

  const [maritalStatus, setMarital] = useState(details.maritalStatus ?? 'SINGLE');
  const [resident,      setResident]     = useState(details.resident !== false);
  const [newImmigrant,  setNewImmigrant] = useState(!!details.newImmigrant);
  const [veteran,       setVeteran]      = useState(!!details.veteran);
  const [singleParent,  setSingleParent] = useState(!!details.singleParent);
  const [spouseWorking, setSpouseWorking]= useState(!!details.spouseWorking);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const MARITAL = { SINGLE: 'רווק/ה', MARRIED: 'נשוי/אה', DIVORCED: 'גרוש/ה', WIDOWED: 'אלמן/ה' };

  const save = async () => {
    setError('');
    try {
      await mobileApi().patch(`/employees/${emp.id}/form101`, {
        maritalStatus, resident, newImmigrant, veteran, singleParent, spouseWorking,
        signedAt: new Date().toISOString(),
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'שגיאה בשמירה');
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {signedAt && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-800">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>נחתם לאחרונה: {new Date(signedAt).toLocaleDateString('he-IL')}</span>
        </div>
      )}

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-xs text-blue-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>הצהרה זו קובעת את נקודות הזיכוי לחישוב מס הכנסה שלך.</span>
      </div>

      {/* Marital status */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">מצב משפחתי</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MARITAL).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMarital(k)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                maritalStatus === k
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Credit point checkboxes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">נקודות זיכוי</h3>
        <div className="space-y-3">
          {[
            { label: 'תושב ישראל',         note: '1 נקודה',    checked: resident,      set: setResident      },
            { label: 'עולה חדש',           note: '¾/½/¼ נקודה', checked: newImmigrant,  set: setNewImmigrant  },
            { label: 'שירות צבאי/לאומי',   note: '0.5 נקודה',  checked: veteran,       set: setVeteran       },
            { label: 'הורה יחידני',         note: '1 נקודה',    checked: singleParent,  set: setSingleParent  },
            { label: 'בן/בת זוג עובד/ת',   note: '0.5 נקודה',  checked: spouseWorking, set: setSpouseWorking },
          ].map(item => (
            <label key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 cursor-pointer active:bg-gray-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                    item.checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}
                  onClick={() => item.set(!item.checked)}
                >
                  {item.checked && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                </div>
              </div>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{item.note}</span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4" /> הטופס נחתם ונשמר!
        </div>
      )}

      <button
        onClick={save}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-98"
      >
        ✍️ {signedAt ? 'עדכן וחתום מחדש' : 'חתום ושמור טופס 101'}
      </button>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────
function SettingsTab({ emp }: { emp: any }) {
  const { logout } = useMobileAuth();
  const navigate   = useNavigate();

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">פרטים אישיים</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">שם</span>
            <span className="font-semibold">{emp?.firstName} {emp?.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ת.ז.</span>
            <span className="font-semibold font-mono">{emp?.idNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">טלפון</span>
            <span className="font-semibold">{emp?.phone ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">אימייל</span>
            <span className="font-semibold text-xs">{emp?.personalEmail ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => { logout(); navigate('/m/login', { replace: true }); }}
          className="w-full flex items-center gap-3 px-5 py-4 text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-semibold">התנתק</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
export default function MobileHomePage() {
  const { token, employee: authEmployee, logout } = useMobileAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('home');

  // Redirect if not logged in
  useEffect(() => {
    if (!token) navigate('/m/login', { replace: true });
  }, [token, navigate]);

  const { data: empData, refetch } = useQuery({
    queryKey: ['mobile-me'],
    queryFn:  () => mobileApi().get('/employees/mobile/me').then(r => r.data?.data ?? r.data),
    enabled:  !!token,
    staleTime: 5 * 60 * 1000,
  });

  const emp = empData ?? authEmployee;

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'home',     icon: <Home className="w-5 h-5" />,     label: 'בית'     },
    { id: 'payslips', icon: <Download className="w-5 h-5" />, label: 'תלושים'  },
    { id: 'form101',  icon: <FileText className="w-5 h-5" />, label: 'טופס 101'},
    { id: 'settings', icon: <Settings className="w-5 h-5" />, label: 'הגדרות'  },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* Status bar area */}
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-blue-200">פורטל עובד</p>
          <p className="text-sm font-bold">{emp?.firstName} {emp?.lastName}</p>
        </div>
        <div className="text-xs text-blue-200 text-left">
          <p>{emp?.jobTitle}</p>
          <p>{emp?.department}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {activeTab === 'home'     && <HomeTab     emp={emp} />}
        {activeTab === 'payslips' && <PayslipsTab emp={emp} />}
        {activeTab === 'form101'  && <Form101Tab  emp={emp} onSaved={() => refetch()} />}
        {activeTab === 'settings' && <SettingsTab emp={emp} />}
      </div>

      {/* Bottom tab bar */}
      <div className="bg-white border-t border-gray-200 flex">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className={activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
