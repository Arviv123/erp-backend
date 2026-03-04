/**
 * MobileHomePage — דשבורד עובד מובייל (ESS)
 * Premium mobile-first UI, RTL Hebrew, iOS feel
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '../lib/mobileApi';
import { useMobileAuth } from '../contexts/MobileAuthContext';

// ─── Helpers ──────────────────────────────────────────────────────
const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const fmtPeriod = (p: string) => { const [y,m]=p.split('-'); return `${MONTHS_HE[+m]} ${y}`; };

const EMP_TYPE: Record<string,string> = { FULL_TIME:'משרה מלאה', PART_TIME:'משרה חלקית', HOURLY:'שעתי', CONTRACTOR:'קבלן' };
const STATUS_COLOR: Record<string,[string,string]> = {
  PAID:     ['bg-emerald-100 text-emerald-700','✓ שולם'],
  APPROVED: ['bg-blue-100 text-blue-700','מאושר'],
  DRAFT:    ['bg-gray-100 text-gray-500','טיוטה'],
};

type Tab = 'home'|'payslips'|'form101'|'settings';

// ─── Avatar ────────────────────────────────────────────────────────
function Avatar({ name, size=48 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2);
  return (
    <div
      className="rounded-2xl flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size*0.38, background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.35)' }}
    >
      {initials}
    </div>
  );
}

// ─── Deduction Ring ────────────────────────────────────────────────
function DeductionBar({ gross, net }: { gross: number; net: number }) {
  const pct = gross > 0 ? Math.round(((gross - net) / gross) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" style={{ width: `${100-pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 shrink-0">{pct}% ניכויים</span>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────
function HomeTab({ emp }: { emp: any }) {
  const payslips: any[] = emp?.payslips ?? [];
  const latest = payslips[0];
  const prev   = payslips[1];
  const trend  = latest && prev
    ? Number(latest.netSalary) - Number(prev.netSalary)
    : null;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';

  return (
    <div className="space-y-4 pb-24">

      {/* Hero salary card */}
      <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background:'linear-gradient(135deg,#1e40af 0%,#2563eb 50%,#3b82f6 100%)' }}>
        <div className="p-5">
          <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-4">
            {latest?.payrollRun?.period ? fmtPeriod(latest.payrollRun.period) : 'תלוש אחרון'}
          </p>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-blue-300 text-xs mb-1">שכר נטו לתשלום</p>
              <p className="text-white text-4xl font-black tracking-tight">
                {latest ? fmtILS(Number(latest.netSalary??0)) : '—'}
              </p>
              {trend !== null && (
                <p className={`text-xs mt-1 font-semibold ${trend>=0?'text-emerald-300':'text-red-300'}`}>
                  {trend>=0?'▲':'▼'} {fmtILS(Math.abs(trend))} מהחודש הקודם
                </p>
              )}
            </div>
            {latest?.payrollRun?.status && (
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                latest.payrollRun.status==='PAID' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200'
              }`}>
                {STATUS_COLOR[latest.payrollRun.status]?.[1] ?? latest.payrollRun.status}
              </span>
            )}
          </div>

          {/* Gross / Deductions row */}
          {latest && (
            <>
              <div className="flex gap-3 mb-3">
                <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-blue-300 text-xs mb-0.5">ברוטו</p>
                  <p className="text-white font-bold text-base">{fmtILS(Number(latest.grossSalary??0))}</p>
                </div>
                <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-blue-300 text-xs mb-0.5">ניכויים</p>
                  <p className="text-red-300 font-bold text-base">
                    {fmtILS(Number(latest.grossSalary??0)-Number(latest.netSalary??0))}
                  </p>
                </div>
                <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-blue-300 text-xs mb-0.5">מס הכנסה</p>
                  <p className="text-white font-bold text-base">{fmtILS(Number(latest.incomeTax??0))}</p>
                </div>
              </div>
              <DeductionBar gross={Number(latest.grossSalary??0)} net={Number(latest.netSalary??0)} />
            </>
          )}
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">שכר בסיס</p>
          <p className="text-lg font-black text-gray-900">{fmtILS(Number(emp?.grossSalary??0))}</p>
          <p className="text-xs text-gray-400 mt-1">{EMP_TYPE[emp?.employmentType]??'—'}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">ותק</p>
          <p className="text-lg font-black text-gray-900">
            {emp?.startDate
              ? `${Math.floor((Date.now()-new Date(emp.startDate).getTime())/1000/60/60/24/30)} חודשים`
              : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {emp?.startDate ? `מ-${new Date(emp.startDate).toLocaleDateString('he-IL')}` : ''}
          </p>
        </div>
      </div>

      {/* Job info card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">פרטי עבודה</p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            ['תפקיד', emp?.jobTitle ?? '—'],
            ['מחלקה', emp?.department ?? '—'],
            ['נקודות זיכוי', `${Number(emp?.taxCredits??0)} נק׳`],
            ['קרן פנסיה', emp?.pensionFund ?? '—'],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-semibold text-gray-900">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {!latest && (
        <div className="text-center py-12 text-gray-300">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">אין תלושים להצגה עדיין</p>
        </div>
      )}
    </div>
  );
}

// ─── Payslips Tab ─────────────────────────────────────────────────
function PayslipsTab({ emp }: { emp: any }) {
  const payslips: any[] = emp?.payslips ?? [];
  const [expanded, setExpanded] = useState<string|null>(null);

  if (!payslips.length) return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-300 pb-24">
      <p className="text-5xl mb-3">💰</p>
      <p className="text-sm font-medium">אין תלושים להצגה</p>
    </div>
  );

  return (
    <div className="space-y-3 pb-24">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-1">6 תלושים אחרונים</p>
      {payslips.map((ps: any) => {
        const [cls, label] = STATUS_COLOR[ps.payrollRun?.status] ?? ['bg-gray-100 text-gray-500','—'];
        const isOpen = expanded === ps.id;
        const gross = Number(ps.grossSalary??0);
        const net   = Number(ps.netSalary??0);
        const ded   = gross - net;
        return (
          <div key={ps.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-right"
              onClick={() => setExpanded(isOpen ? null : ps.id)}
            >
              <div className="text-right">
                <p className="font-bold text-gray-900">
                  {ps.payrollRun?.period ? fmtPeriod(ps.payrollRun.period) : '—'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ps.payrollRun?.paidAt
                    ? `שולם ${new Date(ps.payrollRun.paidAt).toLocaleDateString('he-IL')}`
                    : ps.payrollRun?.status === 'APPROVED' ? 'ממתין לתשלום' : 'בהכנה'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="text-lg font-black text-emerald-600">{fmtILS(net)}</p>
                  <p className="text-xs text-gray-400">נטו</p>
                </div>
                <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</div>
                <span className="text-gray-300 text-lg">{isOpen?'▲':'▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-50 px-5 py-4 space-y-2 bg-gray-50/50">
                {[
                  ['ברוטו', fmtILS(gross), 'text-gray-900'],
                  ['מס הכנסה', fmtILS(Number(ps.incomeTax??0)), 'text-red-600'],
                  ['ביטוח לאומי', fmtILS(Number(ps.nationalInsurance??0)), 'text-red-600'],
                  ['ביטוח בריאות', fmtILS(Number(ps.healthInsurance??0)), 'text-red-600'],
                  ['פנסיה עובד', fmtILS(Number(ps.pensionEmployee??0)), 'text-orange-600'],
                  ['סה"כ ניכויים', fmtILS(ded), 'text-red-700 font-bold'],
                  ['נטו לתשלום', fmtILS(net), 'text-emerald-600 font-bold text-base'],
                ].map(([label,val,cls])=>(
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className={`text-sm ${cls}`}>{val}</span>
                  </div>
                ))}
                <DeductionBar gross={gross} net={net} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Form 101 Tab ─────────────────────────────────────────────────
const MARITAL: Record<string,string> = { SINGLE:'רווק/ה', MARRIED:'נשוי/אה', DIVORCED:'גרוש/ה', WIDOWED:'אלמן/ה' };

function Form101Tab({ emp, onSaved }: { emp: any; onSaved: () => void }) {
  const d = emp?.creditPointsDetails ?? {};
  const [marital,       setMarital]       = useState(d.maritalStatus ?? 'SINGLE');
  const [resident,      setResident]      = useState(d.resident !== false);
  const [newImmigrant,  setNewImmigrant]  = useState(!!d.newImmigrant);
  const [veteran,       setVeteran]       = useState(!!d.veteran);
  const [singleParent,  setSingleParent]  = useState(!!d.singleParent);
  const [spouseWorking, setSpouseWorking] = useState(!!d.spouseWorking);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const save = async () => {
    setError(''); setSaving(true);
    try {
      await mobileApi.patch(`/employees/${emp.id}/form101`, {
        maritalStatus: marital, resident, newImmigrant, veteran, singleParent, spouseWorking,
        signedAt: new Date().toISOString(),
      });
      setSaved(true); onSaved();
      setTimeout(()=>setSaved(false), 4000);
    } catch(e:any) { setError(e.response?.data?.error ?? 'שגיאה בשמירה'); }
    finally { setSaving(false); }
  };

  const CheckRow = ({ label, note, checked, set }: any) => (
    <button
      type="button"
      onClick={() => set(!checked)}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-right ${
        checked ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all border-2 shrink-0 ${
          checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
        }`}>
          {checked && <span className="text-white text-sm font-black">✓</span>}
        </div>
        <span className={`text-sm font-semibold ${checked ? 'text-blue-800' : 'text-gray-700'}`}>{label}</span>
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${checked ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
        {note}
      </span>
    </button>
  );

  return (
    <div className="space-y-4 pb-24">
      {/* Signed banner */}
      {d.signedAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-bold text-emerald-800">הטופס חתום ובתוקף</p>
            <p className="text-xs text-emerald-600">עודכן לאחרונה: {new Date(d.signedAt).toLocaleDateString('he-IL')}</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3">
        <p className="text-xs text-blue-700">טופס 101 קובע את נקודות הזיכוי לחישוב מס ההכנסה שלך. עדכן בכל שינוי נסיבות.</p>
      </div>

      {/* Marital status */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">מצב משפחתי</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MARITAL).map(([k,v])=>(
            <button
              key={k}
              onClick={() => setMarital(k)}
              className={`py-3.5 rounded-2xl text-sm font-bold border-2 transition-all ${
                marital===k ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' : 'bg-white text-gray-700 border-gray-100'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Credit points */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">נקודות זיכוי</p>
        <div className="space-y-2">
          <CheckRow label="תושב ישראל"       note="1 נק׳"      checked={resident}      set={setResident} />
          <CheckRow label="עולה חדש"          note="¾/½/¼ נק׳"  checked={newImmigrant}  set={setNewImmigrant} />
          <CheckRow label="שירות צבאי/לאומי"  note="0.5 נק׳"   checked={veteran}       set={setVeteran} />
          <CheckRow label="הורה יחידני"        note="1 נק׳"     checked={singleParent}  set={setSingleParent} />
          <CheckRow label="בן/בת זוג עובד/ת"  note="0.5 נק׳"   checked={spouseWorking} set={setSpouseWorking} />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-5 py-3 text-center">{error}</div>}
      {saved  && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-2xl px-5 py-3 text-center font-bold">✅ הטופס נחתם ונשמר בהצלחה!</div>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full text-white font-black py-4 rounded-2xl text-base transition-all active:scale-[0.98] shadow-lg shadow-blue-200"
        style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)' }}
      >
        {saving ? '⏳ שומר...' : d.signedAt ? '✍️ עדכן וחתום מחדש' : '✍️ חתום ושמור טופס 101'}
      </button>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────
function SettingsTab({ emp }: { emp: any }) {
  const { logout } = useMobileAuth();
  const navigate   = useNavigate();
  const fullName   = `${emp?.firstName??''} ${emp?.lastName??''}`.trim();

  return (
    <div className="space-y-4 pb-24">
      {/* Profile header */}
      <div className="rounded-3xl p-6 text-white text-center" style={{ background:'linear-gradient(135deg,#1e40af,#2563eb)' }}>
        <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-3xl font-black border-2 border-white/30">
          {fullName.split(' ').map(w=>w[0]).join('').slice(0,2)}
        </div>
        <p className="text-xl font-black">{fullName}</p>
        <p className="text-blue-200 text-sm mt-0.5">{emp?.jobTitle} · {emp?.department}</p>
      </div>

      {/* Details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">פרטים אישיים</p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            ['ת.ז.', emp?.idNumber ?? '—'],
            ['טלפון', emp?.phone ?? '—'],
            ['אימייל', emp?.personalEmail ?? '—'],
            ['כתובת', emp?.address ? `${emp.address.street}, ${emp.address.city}` : '—'],
          ].map(([l,v])=>(
            <div key={l} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-400">{l}</span>
              <span className="text-sm font-semibold text-gray-900 text-left max-w-[60%] break-all">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => { logout(); navigate('/m/login', { replace: true }); }}
        className="w-full bg-red-50 border border-red-100 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span>⬅️</span> התנתק
      </button>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────
const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id:'home',     emoji:'🏠', label:'בית'      },
  { id:'payslips', emoji:'💰', label:'תלושים'   },
  { id:'form101',  emoji:'📋', label:'טופס 101' },
  { id:'settings', emoji:'⚙️', label:'הגדרות'   },
];

// ─── Main ─────────────────────────────────────────────────────────
export default function MobileHomePage() {
  const { token, employee: authEmployee } = useMobileAuth();
  const navigate    = useNavigate();
  const [tab, setTab] = useState<Tab>('home');

  useEffect(() => { if (!token) navigate('/m/login', { replace: true }); }, [token, navigate]);

  const { data: empData, refetch } = useQuery({
    queryKey: ['mobile-me'],
    queryFn:  () => mobileApi.get('/employees/mobile/me').then(r => r.data),
    enabled:  !!token,
    staleTime: 5 * 60 * 1000,
  });

  const emp = empData ?? authEmployee;

  if (!token) return null;

  return (
    <div dir="rtl" className="h-screen flex flex-col bg-gray-50 max-w-md mx-auto overflow-hidden">

      {/* Top header */}
      <div className="shrink-0 px-5 pt-10 pb-5 flex items-center justify-between"
           style={{ background:'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#2563eb 100%)' }}>
        <div>
          <p className="text-blue-300 text-xs font-semibold">
            {tab==='home'     ? 'ראשי' :
             tab==='payslips' ? 'תלושי שכר' :
             tab==='form101'  ? 'הצהרת עובד 101' : 'הגדרות'}
          </p>
          <p className="text-white text-xl font-black leading-tight">
            {tab==='home' ? `שלום, ${emp?.firstName ?? ''}` :
             tab==='payslips' ? '6 תלושים אחרונים' :
             tab==='form101'  ? 'טופס 101' : emp ? `${emp.firstName} ${emp.lastName}` : ''}
          </p>
        </div>
        {emp && <Avatar name={`${emp.firstName??''} ${emp.lastName??''}`} size={44} />}
      </div>

      {/* Content scroll area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tab==='home'     && <HomeTab     emp={emp} />}
        {tab==='payslips' && <PayslipsTab emp={emp} />}
        {tab==='form101'  && <Form101Tab  emp={emp} onSaved={() => refetch()} />}
        {tab==='settings' && <SettingsTab emp={emp} />}
      </div>

      {/* Bottom tab bar — iOS style */}
      <div className="shrink-0 bg-white border-t border-gray-100 flex pb-safe shadow-[0_-1px_20px_rgba(0,0,0,0.06)]">
        {TABS.map(t=>(
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-all"
          >
            <span className={`text-2xl leading-none transition-transform ${tab===t.id ? 'scale-110' : 'opacity-50'}`}>
              {t.emoji}
            </span>
            <span className={`text-[10px] font-bold transition-colors ${tab===t.id ? 'text-blue-600' : 'text-gray-400'}`}>
              {t.label}
            </span>
            {tab===t.id && <div className="absolute top-0 w-8 h-0.5 bg-blue-600 rounded-full" />}
          </button>
        ))}
      </div>
    </div>
  );
}
