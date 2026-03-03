/**
 * PayrollPreviewPage — מחשבון שכר (ללא שמירה)
 * מאפשר סימולציה עם שעות נוספות, נסיעות, הבראה, בונוס
 * GET /payroll/preview/:employeeId?ot125=...&ot150=...&travel=...&recup=true&bonus=...
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number | undefined | null) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtDec = (n: number | undefined | null) =>
  new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

interface Params {
  ot125:   string;
  ot150:   string;
  travel:  string;
  recup:   boolean;
  bonus:   string;
}

function InputField({ label, sub, value, onChange, type = 'number', placeholder = '0' }: {
  label: string; sub?: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {sub && <p className="text-xs text-gray-400 mb-1">{sub}</p>}
      <input
        type={type}
        min={0}
        step={type === 'number' ? 0.5 : undefined}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
      />
    </div>
  );
}

function Row({ label, sub, amount, red, green, bold, indent }: {
  label: string; sub?: string; amount: number;
  red?: boolean; green?: boolean; bold?: boolean; indent?: boolean;
}) {
  if (amount === 0 && !bold) return null;
  return (
    <div className={`flex justify-between items-baseline py-1.5 border-b border-gray-100 text-sm ${bold ? 'bg-gray-50 -mx-3 px-3' : ''}`}>
      <span className={`${indent ? 'mr-3' : ''} ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
        {label}
        {sub && <span className="text-xs text-gray-400 mr-1">{sub}</span>}
      </span>
      <span className={`font-medium tabular-nums ${red ? 'text-red-600' : green ? 'text-green-700' : 'text-gray-800'} ${bold ? 'font-bold' : ''}`}>
        {red ? `(${fmt(amount)})` : fmt(amount)}
      </span>
    </div>
  );
}

export default function PayrollPreviewPage() {
  const [selectedId, setSelectedId]   = useState('');
  const [fetchId, setFetchId]         = useState('');
  const [showBrackets, setShowBrackets] = useState(false);
  const [params, setParams] = useState<Params>({
    ot125: '', ot150: '', travel: '', recup: false, bonus: '',
  });
  const [fetchParams, setFetchParams] = useState<Params | null>(null);

  const setP = <K extends keyof Params>(k: K, v: Params[K]) =>
    setParams(prev => ({ ...prev, [k]: v }));

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/employees', { params: { isActive: true, pageSize: 100 } }).then(r => r.data),
  });
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];

  const { data: previewData, isLoading, error } = useQuery({
    queryKey: ['payroll-preview', fetchId, fetchParams],
    queryFn: () => api.get(`/payroll/preview/${fetchId}`, {
      params: {
        ...(fetchParams?.ot125  ? { ot125:  fetchParams.ot125  } : {}),
        ...(fetchParams?.ot150  ? { ot150:  fetchParams.ot150  } : {}),
        ...(fetchParams?.travel ? { travel: fetchParams.travel } : {}),
        ...(fetchParams?.recup  ? { recup:  'true' }            : {}),
        ...(fetchParams?.bonus  ? { bonus:  fetchParams.bonus  } : {}),
      },
    }).then(r => r.data),
    enabled: !!fetchId && !!fetchParams,
  });

  const p = previewData?.data ?? previewData;

  const handleCalculate = () => {
    setFetchId(selectedId);
    setFetchParams({ ...params });
  };

  const selectedEmp = employees.find(e => e.id === selectedId);

  return (
    <div dir="rtl" className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Calculator className="w-5 h-5 text-indigo-600" />
        <h1 className="text-xl font-bold text-gray-900">מחשבון שכר</h1>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">סימולציה בלבד — לא נשמר</span>
      </div>

      {/* Employee + params */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-bold text-gray-500 uppercase mb-3">בחר עובד ופרמטרים</p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">עובד</label>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setFetchId(''); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
          >
            <option value="">בחר עובד...</option>
            {employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} — {fmt(Number(emp.grossSalary))} ברוטו
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <InputField
            label="שעות נוספות 125%"
            sub="2 שעות ראשונות"
            value={params.ot125}
            onChange={v => setP('ot125', v)}
          />
          <InputField
            label="שעות נוספות 150%"
            sub="שבת / חג / מעל 2 שעות"
            value={params.ot150}
            onChange={v => setP('ot150', v)}
          />
          <InputField
            label="ימי נסיעה"
            sub="ברירת מחדל: 21"
            placeholder="21"
            value={params.travel}
            onChange={v => setP('travel', v)}
          />
          <InputField
            label="בונוס ₪"
            sub="תשלום מיוחד"
            value={params.bonus}
            onChange={v => setP('bonus', v)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">הבראה חודשית</label>
            <p className="text-xs text-gray-400">1/12 מהסכום השנתי</p>
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={params.recup}
                onChange={e => setP('recup', e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-gray-700">כלול הבראה</span>
            </label>
          </div>
        </div>

        <button
          onClick={handleCalculate}
          disabled={!selectedId || isLoading}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-4 py-2.5 rounded-lg transition"
        >
          <Calculator className="w-4 h-4" />
          {isLoading ? 'מחשב...' : 'חשב תלוש'}
        </button>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            שגיאה בחישוב — ודא שהעובד הוגדר כראוי
          </div>
        )}
      </div>

      {/* Results */}
      {p && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase">תוצאת חישוב</p>
            {selectedEmp && (
              <p className="text-sm font-medium text-gray-700">
                {selectedEmp.firstName} {selectedEmp.lastName}
              </p>
            )}
          </div>

          {/* Minimum wage indicator */}
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${p.minimumWageOk !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {p.minimumWageOk !== false
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            }
            <span>
              שכר מינימום ({fmt(p.minimumWage ?? 6300)}):
              {p.minimumWageOk !== false ? ' ✓ עומד בחוק' : ' ✗ מופר!'}
            </span>
          </div>

          {/* EARNINGS */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-200 pb-1 mb-2">הכנסות</p>
            <Row label="שכר יסוד" amount={p.baseSalary ?? p.grossSalary ?? 0} />
            <Row label="שעות נוספות 125%" amount={p.overtimePay125 ?? 0} indent />
            <Row label="שעות נוספות 150%" amount={p.overtimePay150 ?? 0} indent />
            <Row label="דמי הבראה (חודשי)" amount={p.recuperationPay ?? 0} indent />
            <Row label="בונוס" amount={p.bonusAmount ?? 0} indent />
            {(p.travelAllowance ?? 0) > 0 && (
              <Row label="דמי נסיעה" sub="(פטור ממס הכנסה)" amount={p.travelAllowance} indent />
            )}
            <Row label='סה"כ ברוטו' amount={p.grossSalary ?? 0} bold green />
            {(p.travelAllowance ?? 0) > 0 && (
              <>
                <Row label="הכנסה חייבת במס" sub="(ברוטו – נסיעות)" amount={p.taxableIncome ?? 0} indent />
                <Row label="בסיס ביטוח לאומי" sub="(כולל נסיעות)" amount={p.grossForNI ?? 0} indent />
              </>
            )}
          </div>

          {/* DEDUCTIONS */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-200 pb-1 mb-2">ניכויים</p>
            <Row
              label="מס הכנסה"
              sub={p.taxCreditsAmount > 0 ? `אחרי זיכוי ${fmt(p.taxCreditsAmount)}` : undefined}
              amount={p.incomeTax ?? 0}
              red
            />
            <Row label="ביטוח לאומי עובד" amount={p.nationalInsuranceEmployee ?? 0} red indent />
            <Row label="ביטוח בריאות" amount={p.healthInsuranceEmployee ?? 0} red indent />
            <Row label="פנסיה עובד" amount={p.pensionEmployee ?? 0} red indent />
            <Row label='סה"כ ניכויים' amount={p.totalDeductions ?? (p.incomeTax + p.nationalInsuranceEmployee + p.healthInsuranceEmployee + p.pensionEmployee)} red bold />
          </div>

          {/* NET */}
          <div className="border-2 border-gray-800 rounded-xl p-4 flex justify-between items-center bg-green-50">
            <div>
              <p className="font-bold text-gray-900">שכר נטו</p>
              <p className="text-xs text-gray-500">לאחר כל הניכויים</p>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-green-700">{fmt(p.netSalary)}</p>
              <p className="text-xs text-gray-500">
                {p.grossSalary > 0 ? Math.round((p.netSalary / p.grossSalary) * 100) : 0}% מהברוטו
              </p>
            </div>
          </div>

          {/* EMPLOYER COSTS */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-700 uppercase mb-2">עלות מעסיק (מעבר לשכר)</p>
            <Row label="פנסיה מעסיק" amount={p.pensionEmployer ?? 0} />
            <Row label="פיצויים" amount={p.severancePay ?? 0} />
            <Row label="ביטוח לאומי מעסיק" amount={p.nationalInsuranceEmployer ?? 0} />
            <Row label="עלות מעסיק כוללת" amount={p.totalEmployerCost ?? 0} bold />
          </div>

          {/* ACCRUALS */}
          {((p.vacationAccruedDays ?? 0) > 0 || (p.sickLeaveAccruedDays ?? 0) > 0) && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs font-bold text-indigo-700 uppercase mb-2">צבירות חודשיות</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {(p.vacationAccruedDays ?? 0) > 0 && (
                  <div>
                    <p className="text-gray-600">ימי חופשה</p>
                    <p className="font-bold text-indigo-700">{fmtDec(p.vacationAccruedDays)} ימים</p>
                  </div>
                )}
                {(p.sickLeaveAccruedDays ?? 0) > 0 && (
                  <div>
                    <p className="text-gray-600">ימי מחלה</p>
                    <p className="font-bold text-indigo-700">{fmtDec(p.sickLeaveAccruedDays)} ימים</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAX BRACKET BREAKDOWN */}
          {(p.taxBracketBreakdown?.filter((b: any) => b.taxableAmount > 0).length ?? 0) > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowBrackets(!showBrackets)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                <span>פירוט מדרגות מס הכנסה (2026)</span>
                {showBrackets ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showBrackets && (
                <div className="px-4 pb-4 bg-gray-50 text-xs">
                  <div className="grid grid-cols-4 font-semibold text-gray-500 border-b pb-1 mb-1">
                    <span>מדרגה</span><span>אחוז</span><span>סכום חייב</span><span>מס</span>
                  </div>
                  {p.taxBracketBreakdown.filter((b: any) => b.taxableAmount > 0).map((b: any, i: number) => (
                    <div key={i} className="grid grid-cols-4 py-0.5 text-gray-600">
                      <span>{fmt(b.min)} – {b.max ? fmt(b.max) : '∞'}</span>
                      <span>{(b.rate * 100)}%</span>
                      <span>{fmt(b.taxableAmount)}</span>
                      <span>{fmt(b.taxAmount)}</span>
                    </div>
                  ))}
                  {(p.taxCreditsAmount ?? 0) > 0 && (
                    <div className="grid grid-cols-4 text-green-700 border-t pt-1">
                      <span className="col-span-3">זיכוי מס (נקודות זיכוי)</span>
                      <span>({fmt(p.taxCreditsAmount)})</span>
                    </div>
                  )}
                  <div className="grid grid-cols-4 font-bold text-gray-800 border-t pt-1">
                    <span className="col-span-3">מס הכנסה לתשלום</span>
                    <span>{fmt(p.incomeTax)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
