import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, FileText, Info } from 'lucide-react';
import api from '../lib/api';

async function getMyProfile() { const r = await api.get('/employees/me'); return r.data; }

interface Form101Data {
  // Personal
  maritalStatus:    string;
  spouseWorking:    boolean;
  // Credit points
  resident:         boolean;
  newImmigrant:     boolean;
  newImmigrantDate: string;
  veteran:          boolean;
  disability:       boolean;
  disabilityPct:    number;
  academicDegree:   boolean;
  singleParent:     boolean;
  children:         Array<{ birthYear: number; points: number }>;
  // Other income
  otherIncomeSources: boolean;
  otherIncomeDetails: string;
  // Bank
  bankForRefund:    { bank: string; branch: string; account: string };
}

const INITIAL: Form101Data = {
  maritalStatus: 'SINGLE', spouseWorking: false,
  resident: true, newImmigrant: false, newImmigrantDate: '',
  veteran: false, disability: false, disabilityPct: 0,
  academicDegree: false, singleParent: false, children: [],
  otherIncomeSources: false, otherIncomeDetails: '',
  bankForRefund: { bank: '', branch: '', account: '' },
};

const MARITAL = { SINGLE: 'רווק/ה', MARRIED: 'נשוי/אה', DIVORCED: 'גרוש/ה', WIDOWED: 'אלמן/ה' };

export default function EmployeeForm101Page() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });

  const [form, setForm] = useState<Form101Data>(INITIAL);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.creditPointsDetails) {
      setForm(prev => ({ ...prev, ...profile.creditPointsDetails }));
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.patch(`/employees/${profile?.id}/form101`, { ...data, signedAt: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: any) => setError(e.response?.data?.error ?? e.message),
  });

  const set = (key: keyof Form101Data, val: any) => setForm(p => ({ ...p, [key]: val }));

  const addChild = () => setForm(p => ({ ...p, children: [...p.children, { birthYear: 2020, points: 0.5 }] }));
  const updateChild = (i: number, key: string, val: any) =>
    setForm(p => ({ ...p, children: p.children.map((c, idx) => idx === i ? { ...c, [key]: val } : c) }));
  const removeChild = (i: number) =>
    setForm(p => ({ ...p, children: p.children.filter((_, idx) => idx !== i) }));

  // New immigrant monthly credit: ¾ pt yr1, ½ pt yr2, ¼ pt yr3 (section 35 ITO)
  const newImmigrantMonthlyCredit = (() => {
    if (!form.newImmigrant || !form.newImmigrantDate) return 0;
    const aliyahDate = new Date(form.newImmigrantDate);
    const now = new Date();
    const months = (now.getFullYear() - aliyahDate.getFullYear()) * 12
      + (now.getMonth() - aliyahDate.getMonth());
    if (months <= 12)  return 0.75;
    if (months <= 24)  return 0.5;
    if (months <= 36)  return 0.25;
    return 0; // credit period ended
  })();

  // Estimate total credit points
  const estimatedPoints = (() => {
    let pts = 0;
    if (form.resident)      pts += 1.0;
    if (profile?.gender === 'F') pts += 0.5;
    // spouseWorking credit: only when married (section 36 ITO)
    if (form.spouseWorking && form.maritalStatus === 'MARRIED') pts += 0.5;
    if (form.singleParent)  pts += 1.0;
    pts += newImmigrantMonthlyCredit; // graduated monthly credit
    if (form.veteran)       pts += 0.5;
    if (form.disability && form.disabilityPct >= 90) pts += 1.0;
    else if (form.disability && form.disabilityPct >= 50) pts += 0.5;
    if (form.academicDegree) pts += 0.25;
    for (const c of form.children) pts += c.points;
    return Math.round(pts * 100) / 100;
  })();

  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>;

  const alreadySigned = profile?.creditPointsDetails?.signedAt;

  return (
    <div dir="rtl" className="max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">טופס 101 — הצהרת עובד</h1>
            <p className="text-sm text-gray-500">הצהרה שנתית לצורכי ניכוי מס הכנסה במקור</p>
          </div>
        </div>
        {alreadySigned && (
          <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800">
            <CheckCircle className="w-4 h-4" />
            הטופס נחתם ב-{new Date(alreadySigned).toLocaleDateString('he-IL')}. ניתן לעדכן ולחתום מחדש.
          </div>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-5">

        {/* Personal Details */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">פרטים אישיים</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">שם</p>
              <p className="text-sm font-medium text-gray-800">{profile?.firstName} {profile?.lastName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">ת.ז.</p>
              <p className="text-sm font-medium text-gray-800">{profile?.idNumber}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">תאריך לידה</p>
              <p className="text-sm font-medium text-gray-800">{profile?.birthDate ? new Date(profile.birthDate).toLocaleDateString('he-IL') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">מין</p>
              <p className="text-sm font-medium text-gray-800">{profile?.gender === 'M' ? 'זכר' : profile?.gender === 'F' ? 'נקבה' : '—'}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מצב משפחתי</label>
            <select value={form.maritalStatus} onChange={e => set('maritalStatus', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {Object.entries(MARITAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* Credit Points Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">
            נקודות זיכוי — סה&quot;כ מוערך: {estimatedPoints} נקודות
            <span className="text-xs text-gray-400 font-normal mr-2">(₪{Math.round(estimatedPoints * 248).toLocaleString()} לחודש)</span>
          </h2>

          {/* Checkboxes */}
          <div className="space-y-3">
            {[
              { key: 'resident',      label: 'תושב ישראל',                     points: '1 נקודה',   note: 'אוטומטי לתושבי ישראל' },
              { key: 'newImmigrant',  label: 'עולה חדש',                        points: '¾/½/¼ נקודה', note: 'מדורג: ¾ נק׳ שנה 1, ½ נק׳ שנה 2, ¼ נק׳ שנה 3' },
              { key: 'veteran',       label: 'שירות צבאי / לאומי',              points: '0.5 נקודה', note: 'ל-3 שנים לאחר שחרור' },
              { key: 'disability',    label: 'נכות מוכרת',                       points: 'עד 1 נקודה', note: 'בהתאם לאחוז הנכות' },
              { key: 'academicDegree', label: 'תואר אקדמי',                     points: '0.25 נקודה', note: 'תואר ראשון ומעלה' },
              { key: 'singleParent',  label: 'הורה יחידני',                      points: '1 נקודה',   note: 'נוסף על ילדים' },
              { key: 'spouseWorking', label: 'בן/בת זוג עובד/ת',                points: '0.5 נקודה', note: 'רלוונטי לנשוי/אה' },
            ].map(item => (
              <label key={item.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={(form as any)[item.key] ?? false}
                    onChange={e => set(item.key as keyof Form101Data, e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.note}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{item.points}</span>
              </label>
            ))}

            {form.newImmigrant && (
              <div className="mr-7 bg-blue-50 rounded-lg p-3 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">תאריך עלייה</label>
                  <input type="date" value={form.newImmigrantDate}
                    onChange={e => set('newImmigrantDate', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44" />
                </div>
                {newImmigrantMonthlyCredit > 0 ? (
                  <p className="text-xs text-blue-700">
                    זיכוי חודשי נוכחי: <strong>{newImmigrantMonthlyCredit} נקודה</strong> (סעיף 35 לפקודת מס הכנסה)
                  </p>
                ) : form.newImmigrantDate ? (
                  <p className="text-xs text-orange-600">תקופת הזיכוי לעולים חדשים הסתיימה (36 חודשים)</p>
                ) : null}
              </div>
            )}

            {form.disability && (
              <div className="mr-7">
                <label className="block text-sm font-medium text-gray-700 mb-1">אחוז נכות</label>
                <input type="number" min={0} max={100} value={form.disabilityPct}
                  onChange={e => set('disabilityPct', Number(e.target.value))}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
            )}
          </div>

          {/* Children */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">ילדים (נקודות זיכוי)</h3>
              <button type="button" onClick={addChild}
                className="text-xs text-blue-600 hover:underline">+ הוסף ילד</button>
            </div>
            {form.children.length === 0 ? (
              <p className="text-xs text-gray-400">אין ילדים להצהרה</p>
            ) : (
              <div className="space-y-2">
                {form.children.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">שנת לידה</label>
                      <input type="number" value={c.birthYear} min={1990} max={2026}
                        onChange={e => updateChild(i, 'birthYear', Number(e.target.value))}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">נקודות זיכוי</label>
                      <select value={c.points} onChange={e => updateChild(i, 'points', Number(e.target.value))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                        <option value={0.5}>0.5 — ילד 6–17</option>
                        <option value={1.0}>1.0</option>
                        <option value={1.5}>1.5 — ילד עד 5</option>
                        <option value={2.0}>2.0 — ילד עם מוגבלות</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => removeChild(i)}
                      className="text-red-400 hover:text-red-600 text-xs mt-4">הסר</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Other Income */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">הכנסות נוספות</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.otherIncomeSources}
              onChange={e => set('otherIncomeSources', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700">יש לי מקורות הכנסה נוספים (עצמאי, שכר דירה, ריבית וכד')</span>
          </label>
          {form.otherIncomeSources && (
            <textarea value={form.otherIncomeDetails} rows={2} placeholder="פרט את מקורות ההכנסה..."
              onChange={e => set('otherIncomeDetails', e.target.value)}
              className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          )}
        </div>

        {/* Bank for Refund */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">חשבון בנק להחזר מס (אם רלוונטי)</h2>
          <div className="grid grid-cols-3 gap-3">
            {[['bank','בנק'], ['branch','סניף'], ['account','חשבון']].map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type="text" value={(form.bankForRefund as any)[k]}
                  onChange={e => set('bankForRefund', { ...form.bankForRefund, [k]: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            ))}
          </div>
        </div>

        {/* Legal Note */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            הנני מצהיר/ה כי הפרטים שמסרתי לעיל הינם נכונים ומלאים.
            אני מודע/ת לכך שמסירת פרטים כוזבים מהווה עבירה פלילית.
            הצהרה זו מחליפה טופס 101 ידני לצרכי ניכוי מס הכנסה במקור.
          </p>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {saved && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm">
            <CheckCircle className="w-4 h-4" /> הטופס נחתם ונשמר בהצלחה!
          </div>
        )}

        <button type="submit" disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition text-sm">
          {mutation.isPending ? 'שומר...' : '✍️ חתום ושמור טופס 101'}
        </button>
      </form>
    </div>
  );
}
