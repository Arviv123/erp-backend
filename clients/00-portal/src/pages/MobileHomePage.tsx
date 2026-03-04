/**
 * MobileHomePage — ESS Mobile App
 * 5 tabs: בית | שכר | חופשה | טופס 101 | אני
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '../lib/mobileApi';
import { useMobileAuth } from '../contexts/MobileAuthContext';

// ─── Helpers ──────────────────────────────────────────────────────
const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' });

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const fmtPeriod = (p: string) => { const [y,m]=p.split('-'); return `${MONTHS_HE[+m]} ${y}`; };

const EMP_TYPE: Record<string,string> = { FULL_TIME:'משרה מלאה',PART_TIME:'משרה חלקית',HOURLY:'שעתי',CONTRACTOR:'קבלן' };
const STATUS_MAP: Record<string,[string,string]> = {
  PAID:     ['bg-emerald-100 text-emerald-700','✓ שולם'],
  APPROVED: ['bg-blue-100 text-blue-700','מאושר'],
  DRAFT:    ['bg-gray-100 text-gray-500','טיוטה'],
  PENDING:  ['bg-amber-100 text-amber-700','ממתין'],
  REJECTED: ['bg-red-100 text-red-600','נדחה'],
  CANCELLED:['bg-gray-100 text-gray-400','בוטל'],
};

function calcChildPoints(birthDate: string, taxYear = new Date().getFullYear()): number {
  const age = taxYear - new Date(birthDate).getFullYear();
  if (age < 0 || age > 18) return 0;
  if (age <= 5)  return 2.5;
  if (age <= 12) return 2.0;
  if (age <= 17) return 1.0;
  return 0.5;
}

type Tab = 'home'|'payslips'|'leave'|'form101'|'me';
const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id:'home',     emoji:'🏠', label:'בית'    },
  { id:'payslips', emoji:'💰', label:'שכר'    },
  { id:'leave',    emoji:'🏖️',  label:'חופשה' },
  { id:'form101',  emoji:'📋', label:'טופס 101'},
  { id:'me',       emoji:'👤', label:'אני'    },
];

// ─── Mini components ──────────────────────────────────────────────
function Card({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">{children}</p>;
}
function Row({ label, value, valueClass='' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-sm font-semibold text-gray-900 text-left max-w-[60%] break-all ${valueClass}`}>{value}</span>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────
function HomeTab({ emp, refetchEmp }: { emp: any; refetchEmp: () => void }) {
  const payslips: any[] = emp?.payslips ?? [];
  const latest = payslips[0];
  const prev   = payslips[1];
  const trend  = latest && prev ? Number(latest.netSalary) - Number(prev.netSalary) : null;
  const [clockMsg, setClockMsg] = useState('');

  // Today's attendance
  const { data: attData, refetch: refetchAtt } = useQuery({
    queryKey: ['mobile-att-today'],
    queryFn:  () => mobileApi.get('/employees/mobile/attendance').then(r => r.data),
    enabled:  !!emp,
    staleTime: 30_000,
  });
  const todayLog = Array.isArray(attData) ? attData.find((l: any) => {
    const d = new Date(l.date); const t = new Date(); t.setHours(0,0,0,0);
    return d.getTime() === t.getTime();
  }) : null;
  const isClockedIn = todayLog && !todayLog.clockOut;

  const clockIn = async () => {
    try {
      await mobileApi.post('/employees/mobile/clock-in', {});
      setClockMsg('✓ כניסה נרשמה!');
      refetchAtt();
    } catch(e:any) { setClockMsg(e.response?.data?.error ?? 'שגיאה'); }
    setTimeout(()=>setClockMsg(''),3000);
  };
  const clockOut = async () => {
    try {
      await mobileApi.post('/employees/mobile/clock-out', { breakMinutes: 0 });
      setClockMsg('✓ יציאה נרשמה!');
      refetchAtt();
    } catch(e:any) { setClockMsg(e.response?.data?.error ?? 'שגיאה'); }
    setTimeout(()=>setClockMsg(''),3000);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Hero salary card */}
      <div className="rounded-3xl overflow-hidden shadow-xl"
           style={{background:'linear-gradient(135deg,#1e40af 0%,#2563eb 60%,#3b82f6 100%)'}}>
        <div className="p-5">
          <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-3">
            {latest?.payrollRun?.period ? fmtPeriod(latest.payrollRun.period) : 'תלוש אחרון'}
          </p>
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-blue-300 text-xs mb-1">שכר נטו</p>
              <p className="text-white text-4xl font-black">{latest ? fmtILS(Number(latest.netSalary??0)) : '—'}</p>
              {trend !== null && (
                <p className={`text-xs mt-1 font-semibold ${trend>=0?'text-emerald-300':'text-red-300'}`}>
                  {trend>=0?'▲':'▼'} {fmtILS(Math.abs(trend))} מהחודש הקודם
                </p>
              )}
            </div>
            {latest?.payrollRun?.status && (
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                latest.payrollRun.status==='PAID'?'bg-emerald-400/20 text-emerald-200':'bg-amber-400/20 text-amber-200'}`}>
                {STATUS_MAP[latest.payrollRun.status]?.[1] ?? latest.payrollRun.status}
              </span>
            )}
          </div>
          {latest && (
            <div className="grid grid-cols-3 gap-2">
              {[['ברוטו',fmtILS(Number(latest.grossSalary??0)),'text-white'],
                ['מס הכנסה',fmtILS(Number(latest.incomeTax??0)),'text-red-300'],
                ['נטו',fmtILS(Number(latest.netSalary??0)),'text-emerald-300']].map(([l,v,c])=>(
                <div key={l} className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-blue-300 text-[10px] mb-0.5">{l}</p>
                  <p className={`font-bold text-sm ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clock in/out */}
      <Card className="p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">נוכחות היום</p>
        {todayLog ? (
          <div className="flex items-center justify-between">
            <div className="text-sm space-y-1">
              <p className="text-gray-600">כניסה: <span className="font-bold text-gray-900">{fmtTime(todayLog.clockIn)}</span></p>
              {todayLog.clockOut && <p className="text-gray-600">יציאה: <span className="font-bold text-gray-900">{fmtTime(todayLog.clockOut)}</span></p>}
            </div>
            {isClockedIn ? (
              <button onClick={clockOut}
                className="bg-red-500 text-white font-bold px-5 py-3 rounded-2xl text-sm active:scale-95 transition-all shadow-lg shadow-red-200">
                🏁 יציאה
              </button>
            ) : (
              <span className="bg-emerald-100 text-emerald-700 font-bold px-4 py-2 rounded-xl text-sm">✓ יום הסתיים</span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">טרם נרשמה כניסה</p>
            <button onClick={clockIn}
              className="bg-emerald-500 text-white font-bold px-5 py-3 rounded-2xl text-sm active:scale-95 transition-all shadow-lg shadow-emerald-200">
              ⏱ כניסה
            </button>
          </div>
        )}
        {clockMsg && <p className="text-center text-sm font-bold text-blue-600 mt-2">{clockMsg}</p>}
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-400 mb-1">שכר בסיס</p>
          <p className="text-lg font-black text-gray-900">{fmtILS(Number(emp?.grossSalary??0))}</p>
          <p className="text-xs text-gray-400 mt-1">{EMP_TYPE[emp?.employmentType]??'—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-400 mb-1">ותק</p>
          <p className="text-lg font-black text-gray-900">
            {emp?.startDate ? `${Math.floor((Date.now()-new Date(emp.startDate).getTime())/1000/60/60/24/30)} חודש` : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{emp?.startDate ? `מ-${fmtDate(emp.startDate)}` : ''}</p>
        </Card>
      </div>
    </div>
  );
}

// ─── PAYSLIPS TAB ─────────────────────────────────────────────────
function PayslipsTab({ emp }: { emp: any }) {
  const payslips: any[] = emp?.payslips ?? [];
  const [expanded, setExpanded] = useState<string|null>(null);

  if (!payslips.length) return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-300 pb-24">
      <p className="text-5xl mb-3">💰</p>
      <p className="text-sm font-medium">אין תלושים עדיין</p>
    </div>
  );

  return (
    <div className="space-y-3 pb-24">
      <SectionTitle>6 תלושים אחרונים</SectionTitle>
      {payslips.map((ps: any) => {
        const [cls,label] = STATUS_MAP[ps.payrollRun?.status] ?? ['bg-gray-100 text-gray-500','—'];
        const gross=Number(ps.grossSalary??0), net=Number(ps.netSalary??0);
        const isOpen = expanded===ps.id;
        return (
          <Card key={ps.id} className="overflow-hidden">
            <button className="w-full flex items-center justify-between px-5 py-4" onClick={()=>setExpanded(isOpen?null:ps.id)}>
              <div className="text-right">
                <p className="font-bold text-gray-900">{ps.payrollRun?.period?fmtPeriod(ps.payrollRun.period):'—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ps.payrollRun?.paidAt ? `שולם ${fmtDate(ps.payrollRun.paidAt)}` :
                   ps.payrollRun?.status==='APPROVED' ? 'ממתין לתשלום' : 'בהכנה'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="text-lg font-black text-emerald-600">{fmtILS(net)}</p>
                  <p className="text-[10px] text-gray-400 text-left">נטו</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
                <span className="text-gray-300">{isOpen?'▲':'▼'}</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-gray-50 px-5 py-4 space-y-2.5 bg-gray-50/50">
                {[
                  ['ברוטו',fmtILS(gross),'text-gray-900'],
                  ['מס הכנסה',`${fmtILS(Number(ps.incomeTax??0))}`,'text-red-600'],
                  ['ביטוח לאומי',`${fmtILS(Number(ps.nationalInsurance??0))}`,'text-red-600'],
                  ['ביטוח בריאות',`${fmtILS(Number(ps.healthInsurance??0))}`,'text-red-600'],
                  ['פנסיה עובד',`${fmtILS(Number(ps.pensionEmployee??0))}`,'text-orange-600'],
                  ['סה"כ ניכויים',fmtILS(gross-net),'text-red-700 font-bold'],
                  ['נטו לתשלום',fmtILS(net),'text-emerald-600 font-black text-base'],
                ].map(([l,v,c])=>(
                  <div key={l} className="flex justify-between">
                    <span className="text-sm text-gray-500">{l}</span>
                    <span className={`text-sm ${c}`}>{v}</span>
                  </div>
                ))}
                {/* Deduction bar */}
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>נטו {gross>0?Math.round((net/gross)*100):0}%</span>
                    <span>ניכויים {gross>0?Math.round(((gross-net)/gross)*100):0}%</span>
                  </div>
                  <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{width:`${gross>0?(net/gross)*100:0}%`}}/>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── LEAVE TAB ────────────────────────────────────────────────────
function LeaveTab({ emp }: { emp: any }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [ltId, setLtId]       = useState('');
  const [startDate, setStart] = useState('');
  const [endDate,   setEnd]   = useState('');
  const [notes,     setNotes] = useState('');
  const [msg, setMsg]         = useState('');

  const { data: balance } = useQuery({
    queryKey: ['mobile-leave-balance'],
    queryFn: () => mobileApi.get('/employees/mobile/leave-balance').then(r => r.data),
    enabled: !!emp,
  });
  const { data: requests } = useQuery({
    queryKey: ['mobile-leave-requests'],
    queryFn: () => mobileApi.get('/employees/mobile/leave-requests').then(r => r.data),
    enabled: !!emp,
  });
  const { data: leaveTypes } = useQuery({
    queryKey: ['mobile-leave-types'],
    queryFn: () => mobileApi.get('/employees/mobile/leave-types').then(r => r.data),
    enabled: !!emp,
  });

  const submit = async () => {
    if (!ltId || !startDate || !endDate) { setMsg('יש למלא את כל השדות'); return; }
    try {
      await mobileApi.post('/employees/mobile/leave-requests', {
        leaveTypeId: ltId,
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate).toISOString(),
        notes,
      });
      setMsg('✓ הבקשה נשלחה בהצלחה!');
      setShowForm(false); setLtId(''); setStart(''); setEnd(''); setNotes('');
      qc.invalidateQueries({ queryKey: ['mobile-leave-requests'] });
      qc.invalidateQueries({ queryKey: ['mobile-leave-balance'] });
    } catch(e:any) { setMsg(e.response?.data?.error ?? 'שגיאה בשליחת הבקשה'); }
    setTimeout(()=>setMsg(''),4000);
  };

  const balances: any[] = Array.isArray(balance?.balances) ? balance.balances : [];
  const reqs: any[] = Array.isArray(requests) ? requests : [];

  return (
    <div className="space-y-4 pb-24">
      {/* Balance cards */}
      {balances.length > 0 && (
        <div>
          <SectionTitle>יתרת חופשה {balance?.year}</SectionTitle>
          <div className="space-y-2">
            {balances.map((b: any) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{background: b.colorHex??'#3B82F6'}}/>
                    <span className="text-sm font-bold text-gray-800">{b.leaveType}</span>
                    {!b.isPaid && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">ללא תשלום</span>}
                  </div>
                  <span className="text-sm font-black text-blue-600">
                    {b.remainingDays ?? '∞'} / {b.maxDays ?? '∞'} ימים
                  </span>
                </div>
                {b.maxDays && (
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{width:`${Math.min(100,((b.maxDays-b.usedDays)/b.maxDays)*100)}%`, background: b.colorHex??'#3B82F6'}}/>
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">{b.usedDays} ימים נוצלו</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Request button / form */}
      {msg && <div className={`text-center text-sm font-bold px-4 py-3 rounded-2xl ${msg.startsWith('✓')?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-50 text-red-600 border border-red-200'}`}>{msg}</div>}

      {!showForm ? (
        <button onClick={()=>setShowForm(true)}
          className="w-full text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-blue-200 active:scale-[0.98] transition-all"
          style={{background:'linear-gradient(135deg,#1d4ed8,#2563eb)'}}>
          + בקש חופשה
        </button>
      ) : (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-gray-900">בקשת חופשה חדשה</p>
            <button onClick={()=>setShowForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
          </div>
          {/* Leave type */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">סוג חופשה</label>
            <select value={ltId} onChange={e=>setLtId(e.target.value)}
              className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 text-sm outline-none text-right">
              <option value="">-- בחר סוג חופשה --</option>
              {Array.isArray(leaveTypes) && leaveTypes.map((lt:any)=>(
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">מתאריך</label>
              <input type="date" value={startDate} onChange={e=>setStart(e.target.value)}
                className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-3 py-3 text-sm outline-none" dir="ltr"/>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">עד תאריך</label>
              <input type="date" value={endDate} onChange={e=>setEnd(e.target.value)} min={startDate}
                className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-3 py-3 text-sm outline-none" dir="ltr"/>
            </div>
          </div>
          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">הערות (אופציונלי)</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
              className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 text-sm outline-none resize-none text-right"
              placeholder="סיבת הבקשה..."/>
          </div>
          <button onClick={submit}
            className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-sm active:scale-[0.98] transition-all">
            שלח בקשה
          </button>
        </Card>
      )}

      {/* Request history */}
      {reqs.length > 0 && (
        <div>
          <SectionTitle>היסטוריית בקשות</SectionTitle>
          <div className="space-y-2">
            {reqs.map((r:any)=>{
              const [cls,label] = STATUS_MAP[r.status] ?? ['bg-gray-100 text-gray-500',r.status];
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:r.leaveType?.colorHex??'#3B82F6'}}/>
                        <p className="text-sm font-bold text-gray-900">{r.leaveType?.name ?? '—'}</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        {fmtDate(r.startDate)} — {fmtDate(r.endDate)} · {r.totalDays} ימים
                      </p>
                      {r.notes && <p className="text-xs text-gray-400 mt-0.5 italic">"{r.notes}"</p>}
                      {r.rejectedReason && <p className="text-xs text-red-500 mt-0.5">סיבת דחייה: {r.rejectedReason}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cls}`}>{label}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FORM 101 TAB ─────────────────────────────────────────────────
const MARITAL: Record<string,string> = {SINGLE:'רווק/ה',MARRIED:'נשוי/אה',DIVORCED:'גרוש/ה',WIDOWED:'אלמן/ה'};
const BANKS = ['בנק לאומי','בנק הפועלים','בנק מזרחי-טפחות','בנק דיסקונט','בנק הבינלאומי','בנק ירושלים','בנק מרכנתיל','אחר'];

function Form101Tab({ emp, onSaved }: { emp: any; onSaved: () => void }) {
  const d: any = emp?.creditPointsDetails ?? {};
  const [step, setStep] = useState(0);

  // Section A — Personal (read-only)
  // Section B — Marital + Children
  const [marital,       setMarital]       = useState<string>(d.maritalStatus ?? 'SINGLE');
  const [spouseWorking, setSpouseWorking] = useState<boolean>(!!d.spouseWorking);
  const [children,      setChildren]      = useState<any[]>(d.children ?? []);

  // Section C — Credit points
  const [resident,      setResident]      = useState<boolean>(d.resident !== false);
  const [newImmigrant,  setNewImmigrant]  = useState<boolean>(!!d.newImmigrant);
  const [newImmDate,    setNewImmDate]    = useState<string>(d.newImmigrantDate ?? '');
  const [veteran,       setVeteran]       = useState<boolean>(!!d.veteran);
  const [singleParent,  setSingleParent]  = useState<boolean>(!!d.singleParent);
  const [disabledChild, setDisabledChild] = useState<boolean>(!!d.disabledChild);
  const [caregiver,     setCaregiver]     = useState<boolean>(!!d.caregiver);
  const [caregiverRel,  setCaregiverRel]  = useState<string>(d.caregiverRelation ?? '');

  // Section D — Additional employer
  const [addlEmployer,  setAddlEmployer]  = useState<boolean>(!!d.additionalEmployer);
  const [addlEmpName,   setAddlEmpName]   = useState<string>(d.additionalEmployerName ?? '');

  // Section E — Bank
  const [bank, setBank]     = useState<string>(d.bankForRefund?.bank ?? '');
  const [branch, setBranch] = useState<string>(d.bankForRefund?.branch ?? '');
  const [account, setAcc]   = useState<string>(d.bankForRefund?.account ?? '');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  const totalPoints = (() => {
    let p = 0;
    if (resident) p += 2.25;
    if (emp?.gender === 'F' || d.gender === 'F') p += 0.5;
    if (marital === 'MARRIED' && spouseWorking) p += 0.5;
    if (singleParent) p += 1.0;
    if (newImmigrant && newImmDate) {
      const months = Math.floor((Date.now() - new Date(newImmDate).getTime()) / (1000*60*60*24*30));
      if (months <= 12) p += 0.75;
      else if (months <= 24) p += 0.5;
      else if (months <= 36) p += 0.25;
    }
    if (veteran) p += 0.5;
    if (disabledChild) p += 2.0;
    if (caregiver) p += 2.0;
    for (const c of children) if (c.birthDate) p += calcChildPoints(c.birthDate);
    return Math.round(p * 100) / 100;
  })();

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await mobileApi.patch(`/employees/${emp.id}/form101`, {
        maritalStatus: marital, spouseWorking: marital==='MARRIED' ? spouseWorking : false,
        resident, newImmigrant, newImmigrantDate: newImmDate || undefined,
        veteran, singleParent, disabledChild, caregiver, caregiverRelation: caregiverRel||undefined,
        additionalEmployer: addlEmployer, additionalEmployerName: addlEmpName||undefined,
        children: children.map(c=>({...c, points: c.birthDate ? calcChildPoints(c.birthDate) : (c.points??0)})),
        bankForRefund: bank ? { bank, branch, account } : undefined,
        signedAt: new Date().toISOString(),
      });
      setMsg('✅ הטופס נחתם ונשמר בהצלחה!');
      onSaved();
      setStep(0);
    } catch(e:any) { setMsg('שגיאה: ' + (e.response?.data?.error ?? e.message)); }
    finally { setSaving(false); setTimeout(()=>setMsg(''),5000); }
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={()=>onChange(!checked)}
      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${checked?'bg-blue-600':'bg-gray-200'}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${checked?'right-1':'left-1'}`}/>
    </button>
  );

  const ToggleRow = ({ label, note, checked, onChange }: any) => (
    <div className="flex items-center justify-between py-3.5 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {note && <p className="text-xs text-blue-600 font-medium">{note}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange}/>
    </div>
  );

  const addChild = () => setChildren(prev=>[...prev,{name:'',idNumber:'',birthDate:''}]);
  const removeChild = (i: number) => setChildren(prev=>prev.filter((_,idx)=>idx!==i));
  const updateChild = (i: number, field: string, val: string) =>
    setChildren(prev=>prev.map((c,idx)=>idx===i?{...c,[field]:val}:c));

  const steps = [
    { title:'פרטים אישיים', subtitle:'פרטים מהרישום (לעיון)' },
    { title:'מצב משפחתי וילדים', subtitle:'סעיפים ב׳-ג׳' },
    { title:'נקודות זיכוי', subtitle:'סעיפים 34-44' },
    { title:'עסוקים נוספים', subtitle:'סעיף ד׳' },
    { title:'פרטי בנק', subtitle:'סעיף ה׳ — להחזרי מס' },
    { title:'חתימה', subtitle:'אישור והגשת הטופס' },
  ];

  const signedAt = d.signedAt;

  return (
    <div className="pb-24">
      {/* Progress */}
      <div className="flex gap-1.5 mb-4">
        {steps.map((_,i)=>(
          <div key={i} onClick={()=>setStep(i)}
            className={`flex-1 h-1.5 rounded-full cursor-pointer transition-all ${i<=step?'bg-blue-600':'bg-gray-200'}`}/>
        ))}
      </div>

      {/* Step header */}
      <div className="mb-4">
        <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">{`שלב ${step+1} מתוך ${steps.length}`}</p>
        <h2 className="text-xl font-black text-gray-900">{steps[step].title}</h2>
        <p className="text-xs text-gray-400">{steps[step].subtitle}</p>
      </div>

      {msg && (
        <div className={`mb-4 text-sm font-bold px-4 py-3 rounded-2xl text-center ${
          msg.startsWith('✅')?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg}
        </div>
      )}

      {/* STEP 0 — Personal */}
      {step===0 && (
        <div className="space-y-3">
          {signedAt && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-sm font-bold text-emerald-800">טופס 101 חתום ובתוקף</p>
                <p className="text-xs text-emerald-600">עודכן: {fmtDate(signedAt)}</p>
              </div>
            </div>
          )}
          <Card>
            <Row label="שם מלא" value={`${emp?.firstName??''} ${emp?.lastName??''}`}/>
            <Row label="ת.ז." value={emp?.idNumber??'—'}/>
            <Row label="תאריך לידה" value={emp?.birthDate ? fmtDate(emp.birthDate) : '—'}/>
            <Row label="מין" value={emp?.gender==='M'?'זכר':emp?.gender==='F'?'נקבה':'—'}/>
            <Row label="כתובת" value={emp?.address ? `${emp.address.street}, ${emp.address.city}` : '—'}/>
            <Row label="טלפון" value={emp?.phone??'—'}/>
            <Row label="אימייל" value={emp?.personalEmail??'—'}/>
          </Card>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800">
            פרטים אישיים מוצגים לפי רישומי המעסיק. לעדכון פרטים, פנה למחלקת משאבי אנוש.
          </div>
        </div>
      )}

      {/* STEP 1 — Marital + Children */}
      {step===1 && (
        <div className="space-y-4">
          <div>
            <SectionTitle>מצב משפחתי</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(MARITAL).map(([k,v])=>(
                <button key={k} onClick={()=>setMarital(k)}
                  className={`py-3.5 rounded-2xl text-sm font-bold border-2 transition-all ${
                    marital===k?'bg-blue-600 text-white border-blue-600 shadow-md':'bg-white text-gray-700 border-gray-100'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {marital==='MARRIED' && (
            <Card className="p-5">
              <ToggleRow label="בן/בת זוג עובד/ת" note="+0.5 נק׳" checked={spouseWorking} onChange={setSpouseWorking}/>
            </Card>
          )}
          {/* Children */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionTitle>ילדים (לצורך חישוב נק׳ זיכוי)</SectionTitle>
              <button onClick={addChild} className="text-blue-600 text-sm font-bold">+ הוסף ילד</button>
            </div>
            {children.length===0 && (
              <div className="text-center text-gray-300 py-8 text-sm">לחץ "הוסף ילד" להוספת ילד</div>
            )}
            {children.map((c,i)=>(
              <Card key={i} className="p-4 mb-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700">ילד {i+1}</p>
                  <button onClick={()=>removeChild(i)} className="text-red-400 text-xs font-semibold">הסר</button>
                </div>
                <div className="space-y-2">
                  <input placeholder="שם הילד" value={c.name??''} onChange={e=>updateChild(i,'name',e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 text-right"/>
                  <input placeholder="ת.ז. ילד" value={c.idNumber??''} onChange={e=>updateChild(i,'idNumber',e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500" dir="ltr"/>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block text-right">תאריך לידה</label>
                    <input type="date" value={c.birthDate??''} onChange={e=>updateChild(i,'birthDate',e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500" dir="ltr"/>
                  </div>
                  {c.birthDate && (
                    <p className="text-xs text-blue-600 font-semibold">
                      נקודות זיכוי: {calcChildPoints(c.birthDate)} נק׳
                      ({new Date().getFullYear()-new Date(c.birthDate).getFullYear()} שנים)
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — Credit points */}
      {step===2 && (
        <div className="space-y-3">
          {/* Total points indicator */}
          <div className="rounded-2xl p-4 text-white text-center" style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)'}}>
            <p className="text-blue-200 text-xs mb-1">סה"כ נקודות זיכוי מחושבות</p>
            <p className="text-4xl font-black">{totalPoints}</p>
            <p className="text-blue-200 text-xs mt-1">ערך כספי: {fmtILS(totalPoints * 248)}/חודש</p>
          </div>

          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">סעיפי נקודות זיכוי</p>
            <ToggleRow label="סעיף 34 — תושב ישראל" note="2.25 נק׳" checked={resident} onChange={setResident}/>
            <ToggleRow label="שירות צבאי/שירות לאומי" note="0.5 נק׳" checked={veteran} onChange={setVeteran}/>
            <ToggleRow label="סעיף 38 — הורה יחידני" note="1.0 נק׳" checked={singleParent} onChange={setSingleParent}/>
            <ToggleRow label="סעיף 37 — ילד עם מוגבלות" note="2.0 נק׳ נוספות" checked={disabledChild} onChange={setDisabledChild}/>
            <ToggleRow label="סעיף 44 — שמירה על נטול יכולת" note="2.0 נק׳" checked={caregiver} onChange={setCaregiver}/>
            {caregiver && (
              <input placeholder="קרבה משפחתית (הורה, אח/ות...)" value={caregiverRel} onChange={e=>setCaregiverRel(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 text-right"/>
            )}
          </Card>

          {/* New immigrant section */}
          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">סעיף 35 — עולה חדש</p>
            <ToggleRow label="עולה חדש/ה" note="¾ / ½ / ¼ נק׳ לפי שנת עלייה" checked={newImmigrant} onChange={setNewImmigrant}/>
            {newImmigrant && (
              <div className="mt-3">
                <label className="text-xs text-gray-400 mb-1 block text-right">תאריך עלייה</label>
                <input type="date" value={newImmDate} onChange={e=>setNewImmDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500" dir="ltr"/>
                {newImmDate && (() => {
                  const months = Math.floor((Date.now()-new Date(newImmDate).getTime())/(1000*60*60*24*30));
                  const pts = months<=12?0.75:months<=24?0.5:months<=36?0.25:0;
                  return pts>0
                    ? <p className="text-xs text-blue-600 font-semibold mt-1">זכאות נוכחית: {pts} נק׳ (שנה {Math.ceil(months/12)} לעלייה)</p>
                    : <p className="text-xs text-gray-400 mt-1">תקופת הזכאות הסתיימה (מעל 3 שנים)</p>;
                })()}
              </div>
            )}
          </Card>

          {children.length>0 && (
            <Card className="p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">סעיף 36 — נקודות זיכוי לילדים</p>
              {children.filter(c=>c.birthDate).map((c,i)=>(
                <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700">{c.name || `ילד ${i+1}`}</span>
                  <span className="text-sm font-bold text-blue-600">{calcChildPoints(c.birthDate)} נק׳</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* STEP 3 — Additional employer */}
      {step===3 && (
        <div className="space-y-4">
          <Card className="p-5">
            <ToggleRow
              label="עובד/ת אצל מעסיק נוסף"
              note="אם כן, נדרש תיאום מס"
              checked={addlEmployer}
              onChange={setAddlEmployer}
            />
            {addlEmployer && (
              <div className="mt-3">
                <label className="text-xs text-gray-400 mb-1 block text-right">שם המעסיק הנוסף</label>
                <input value={addlEmpName} onChange={e=>setAddlEmpName(e.target.value)}
                  placeholder="שם החברה..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 text-right"/>
              </div>
            )}
          </Card>
          {addlEmployer && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800">
              ⚠️ עבודה אצל מעסיק נוסף מצריכה תיאום מס. פנה לפקיד השומה הקרוב לקבלת אישור.
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-xs text-blue-800">
            פרטי הכנסות ממקורות אחרים (הכנסה פאסיבית, שכר דירה וכו׳) יש לדווח ישירות לרשות המסים.
          </div>
        </div>
      )}

      {/* STEP 4 — Bank */}
      {step===4 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-xs text-blue-800">
            פרטי בנק אלו ישמשו להחזרי מס. השאר ריק אם אינך מעוניין בהחזר ישיר לחשבון.
          </div>
          <Card className="p-5 space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">שם הבנק</label>
              <select value={bank} onChange={e=>setBank(e.target.value)}
                className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 text-sm outline-none text-right">
                <option value="">-- בחר בנק --</option>
                {BANKS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">מס׳ סניף</label>
                <input value={branch} onChange={e=>setBranch(e.target.value.replace(/\D/g,''))}
                  placeholder="123" dir="ltr" maxLength={4}
                  className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-3 py-3 text-sm outline-none font-mono text-center"/>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">מס׳ חשבון</label>
                <input value={account} onChange={e=>setAcc(e.target.value.replace(/\D/g,''))}
                  placeholder="123456789" dir="ltr" maxLength={10}
                  className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-3 py-3 text-sm outline-none font-mono text-center"/>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 5 — Signature */}
      {step===5 && (
        <div className="space-y-4">
          <Card>
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">סיכום נקודות זיכוי</p>
            </div>
            <Row label="תושב ישראל (34)" value={resident?'2.25 נק׳':'—'}/>
            {newImmigrant && <Row label="עולה חדש (35)" value="לפי תאריך עלייה"/>}
            {children.filter(c=>c.birthDate).length>0 && (
              <Row label="ילדים (36)" value={`${children.filter(c=>c.birthDate).reduce((s,c)=>s+calcChildPoints(c.birthDate),0)} נק׳`}/>
            )}
            {singleParent    && <Row label="הורה יחידני (38)" value="1.0 נק׳"/>}
            {veteran         && <Row label="שירות צבאי" value="0.5 נק׳"/>}
            {disabledChild   && <Row label="ילד עם מוגבלות (37)" value="2.0 נק׳"/>}
            {caregiver       && <Row label="שמירה על נטול יכולת (44)" value="2.0 נק׳"/>}
            {marital==='MARRIED' && spouseWorking && <Row label="בן/בת זוג עובד/ת" value="0.5 נק׳"/>}
            <div className="px-5 py-3 bg-blue-50">
              <div className="flex justify-between">
                <span className="text-sm font-black text-blue-900">סה"כ נקודות</span>
                <span className="text-sm font-black text-blue-900">{totalPoints} נק׳</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-xs text-blue-600">ערך כספי חודשי</span>
                <span className="text-xs font-bold text-blue-600">{fmtILS(totalPoints * 248)}</span>
              </div>
            </div>
          </Card>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-xs text-amber-900 space-y-1">
            <p className="font-bold">הצהרת העובד/ת:</p>
            <p>אני הח"מ מצהיר/ה כי כל הפרטים שמסרתי לעיל הם נכונים ומלאים, ואני מסכים/ה לשמש בסיס לחישוב מס הכנסה המנוכה ממשכורתי.</p>
            <p>ידוע לי כי מסירת פרטים כוזבים מהווה עבירה על חוק מס הכנסה.</p>
          </div>

          <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-sm text-gray-600">תאריך חתימה</p>
            <p className="text-sm font-bold text-gray-900">{fmtDate(new Date())}</p>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full text-white font-black py-4 rounded-2xl text-base active:scale-[0.98] transition-all shadow-lg"
            style={{background:'linear-gradient(135deg,#1d4ed8,#2563eb)'}}>
            {saving ? '⏳ שומר...' : '✍️ חתום ושלח טופס 101'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-5">
        {step>0 && (
          <button onClick={()=>setStep(s=>s-1)}
            className="px-6 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-sm">
            ← חזרה
          </button>
        )}
        {step<steps.length-1 && (
          <button onClick={()=>setStep(s=>s+1)}
            className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-2xl text-sm active:scale-[0.98] transition-all">
            המשך →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ME TAB ───────────────────────────────────────────────────────
function MeTab({ emp }: { emp: any }) {
  const { logout } = useMobileAuth();
  const navigate   = useNavigate();
  const fullName   = `${emp?.firstName??''} ${emp?.lastName??''}`.trim();
  const initials   = fullName.split(' ').map((w:string)=>w[0]).join('').slice(0,2);

  return (
    <div className="space-y-4 pb-24">
      {/* Avatar header */}
      <div className="rounded-3xl p-6 text-white text-center"
           style={{background:'linear-gradient(135deg,#1e40af,#2563eb)'}}>
        <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-3xl font-black border-2 border-white/30">
          {initials}
        </div>
        <p className="text-xl font-black">{fullName}</p>
        <p className="text-blue-200 text-sm mt-0.5">{emp?.jobTitle} · {emp?.department}</p>
        <span className="inline-block mt-2 bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full">
          {EMP_TYPE[emp?.employmentType??''] ?? '—'}
        </span>
      </div>

      {/* Contact */}
      <Card>
        <div className="px-5 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">פרטי קשר</p>
        </div>
        <Row label="ת.ז." value={emp?.idNumber??'—'}/>
        <Row label="טלפון" value={emp?.phone??'—'}/>
        <Row label="אימייל" value={emp?.personalEmail??'—'}/>
        <Row label="כתובת" value={emp?.address?`${emp.address.street}, ${emp.address.city}`:'—'}/>
      </Card>

      {/* Employment */}
      <Card>
        <div className="px-5 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">פרטי העסקה</p>
        </div>
        <Row label="תפקיד" value={emp?.jobTitle??'—'}/>
        <Row label="מחלקה" value={emp?.department??'—'}/>
        <Row label="תחילת עבודה" value={emp?.startDate?fmtDate(emp.startDate):'—'}/>
        <Row label="שכר בסיס" value={fmtILS(Number(emp?.grossSalary??0))}/>
        <Row label="נקודות זיכוי" value={`${Number(emp?.taxCredits??0)} נק׳`}/>
        <Row label="קרן פנסיה" value={emp?.pensionFund??'—'}/>
      </Card>

      {/* Bank (from form 101) */}
      {(emp?.creditPointsDetails as any)?.bankForRefund?.bank && (
        <Card>
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">חשבון בנק (מטופס 101)</p>
          </div>
          <Row label="בנק" value={(emp.creditPointsDetails as any).bankForRefund.bank}/>
          <Row label="סניף" value={(emp.creditPointsDetails as any).bankForRefund.branch}/>
          <Row label="חשבון" value={(emp.creditPointsDetails as any).bankForRefund.account}/>
        </Card>
      )}

      {/* Logout */}
      <button onClick={()=>{ logout(); navigate('/m/login',{replace:true}); }}
        className="w-full bg-red-50 border border-red-100 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
        ← התנתק
      </button>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────
export default function MobileHomePage() {
  const { token } = useMobileAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [tab, setTab] = useState<Tab>('home');

  useEffect(()=>{ if (!token) navigate('/m/login',{replace:true}); },[token,navigate]);

  const { data: empData, refetch } = useQuery({
    queryKey: ['mobile-me'],
    queryFn:  () => mobileApi.get('/employees/mobile/me').then(r=>r.data),
    enabled:  !!token,
    staleTime: 5*60*1000,
  });

  const emp = empData;
  if (!token) return null;

  const TAB_LABELS: Record<Tab,string> = {
    home:'ראשי', payslips:'תלושי שכר', leave:'ניהול חופשות', form101:'טופס 101', me:'פרופיל אישי',
  };

  return (
    <div dir="rtl" className="h-screen flex flex-col bg-gray-50 max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-5 pt-10 pb-4 flex items-center justify-between"
           style={{background:'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#2563eb 100%)'}}>
        <div>
          <p className="text-blue-300 text-[11px] font-semibold uppercase tracking-wider">{TAB_LABELS[tab]}</p>
          <p className="text-white text-lg font-black leading-tight">
            {tab==='home' ? `שלום, ${emp?.firstName??''}` : TAB_LABELS[tab]}
          </p>
        </div>
        {emp && (
          <div className="w-11 h-11 rounded-xl bg-white/20 border-2 border-white/30 flex items-center justify-center font-black text-white text-base shrink-0">
            {`${emp.firstName??''} ${emp.lastName??''}`.trim().split(' ').map((w:string)=>w[0]).join('').slice(0,2)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tab==='home'     && <HomeTab    emp={emp} refetchEmp={refetch}/>}
        {tab==='payslips' && <PayslipsTab emp={emp}/>}
        {tab==='leave'    && <LeaveTab   emp={emp}/>}
        {tab==='form101'  && <Form101Tab emp={emp} onSaved={()=>refetch()}/>}
        {tab==='me'       && <MeTab      emp={emp}/>}
      </div>

      {/* Tab bar */}
      <div className="shrink-0 bg-white border-t border-gray-100 flex shadow-[0_-1px_20px_rgba(0,0,0,0.06)]">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 relative">
            {tab===t.id && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full"/>}
            <span className={`text-xl leading-none transition-all ${tab===t.id?'scale-110':'opacity-40'}`}>{t.emoji}</span>
            <span className={`text-[10px] font-bold ${tab===t.id?'text-blue-600':'text-gray-400'}`}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
