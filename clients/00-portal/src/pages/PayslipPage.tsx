/**
 * PayslipPage — תלוש שכר חוקי
 *
 * עומד בדרישות:
 * - חוק הגנת השכר, תשי"ח-1958 (תיקון תשס"ח-2008)
 * - פקודת מס הכנסה — מדרגות מס 2026
 * - חוק ביטוח לאומי — נ.ב./ב.ל. 2026
 * - צו הרחבה פנסיה חובה — 2008
 * - חוק שעות עבודה ומנוחה, תשי"א-1951 (שע"נ 125%/150%)
 * - חוק דמי נסיעה — תקנות 2023
 * - תקנות דמי הבראה — שיעורי 2026
 * - חוק חופשה שנתית / חוק דמי מחלה
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Printer, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 }).format(n ?? 0);

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}

// ─── Table row ────────────────────────────────────────────────────
function Row({ label, sub, pct, amount, bold, red, green, indent, highlight }: {
  label: string; sub?: string; pct?: string; amount: number;
  bold?: boolean; red?: boolean; green?: boolean; indent?: boolean; highlight?: boolean;
}) {
  return (
    <tr className={`border-b border-gray-100 ${bold ? 'bg-gray-50' : ''} ${highlight ? 'bg-amber-50' : ''}`}>
      <td className={`py-1.5 text-gray-700 ${indent ? 'pr-4' : ''} ${bold ? 'font-semibold text-gray-900' : ''}`}>
        {label}
        {sub && <span className="text-xs text-gray-400 mr-1">{sub}</span>}
      </td>
      <td className="py-1.5 text-gray-400 text-xs w-16 text-left">{pct ?? ''}</td>
      <td className={`py-1.5 text-left w-28 ${bold ? 'font-semibold' : ''} ${red ? 'text-red-600' : ''} ${green ? 'text-green-700' : ''}`}>
        {amount === 0 ? '—' : red ? `(${fmt(amount)})` : fmt(amount)}
      </td>
    </tr>
  );
}

export default function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: psData, isLoading, error } = useQuery({
    queryKey: ['payslip', id],
    queryFn: () => api.get(`/payroll/payslips/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const ps = psData?.data ?? psData;

  const { data: empData } = useQuery({
    queryKey: ['employee-for-payslip', ps?.employeeId],
    queryFn: () => api.get(`/employees/${ps.employeeId}`).then(r => r.data),
    enabled: !!ps?.employeeId,
  });

  const emp = empData?.data ?? empData ?? {};
  const snapshot = (ps?.breakdown as any)?.employeeSnapshot ?? {};
  const breakdown = ps?.breakdown as any ?? {};
  const adjustments = breakdown.adjustments ?? {};
  const taxBrackets: any[] = breakdown.taxBracketBreakdown ?? [];

  // ── Income components from breakdown ────────────────────────────
  const baseSalary       = Number(breakdown.baseSalary       ?? ps?.grossSalary ?? 0);
  const overtimePay125   = Number(breakdown.overtimePay125   ?? 0);
  const overtimePay150   = Number(breakdown.overtimePay150   ?? 0);
  const travelAllowance  = Number(breakdown.travelAllowance  ?? 0);
  const recuperationPay  = Number(breakdown.recuperationPay  ?? 0);
  const bonusAmount      = Number(breakdown.bonusAmount      ?? 0);
  const carBenefit       = Number(breakdown.carBenefit       ?? ps?.carBenefit ?? 0);
  const grossSalary      = Number(ps?.grossSalary ?? 0);
  const taxableIncome    = Number(breakdown.taxableIncome    ?? ps?.taxableIncome ?? grossSalary);
  const grossForNI       = Number(breakdown.grossForNI       ?? grossSalary);

  // ── Deductions ──────────────────────────────────────────────────
  const incomeTax        = Number(ps?.incomeTax          ?? 0);
  const taxCreditsAmount = Number(breakdown.taxCreditsAmount ?? 0);
  const ni               = Number(ps?.nationalInsurance   ?? breakdown.nationalInsuranceEmployee ?? 0);
  const hi               = Number(ps?.healthInsurance     ?? breakdown.healthInsuranceEmployee   ?? 0);
  const penEe            = Number(ps?.pensionEmployee     ?? 0);
  const tfEmp            = Number(breakdown.trainingFundEmployee ?? ps?.trainingFundEmployee ?? 0);
  const manualDeduction  = Number(breakdown.manualDeduction ?? 0);
  const totalDeductions  = incomeTax + ni + hi + penEe + tfEmp + manualDeduction;
  const netSalary        = Number(ps?.netSalary ?? 0);

  // ── Employer costs ───────────────────────────────────────────────
  const penEr    = Number(ps?.pensionEmployer  ?? 0);
  const sev      = Number(ps?.severancePay     ?? 0);
  const niEr     = Number(ps?.niEmployer       ?? 0);
  const tfEr     = Number(breakdown.trainingFundEmployer ?? ps?.trainingFundEmployer ?? 0);
  const empCost  = Number(ps?.totalEmployerCost ?? 0);

  // ── Accruals (from breakdown) ────────────────────────────────────
  const vacationDays  = Number(breakdown.vacationAccruedDays  ?? 0);
  const sickDays      = Number(breakdown.sickLeaveAccruedDays ?? 0);

  // ── Legal checks ─────────────────────────────────────────────────
  const minimumWageOk  = breakdown.minimumWageOk !== false;
  const minimumWage    = Number(breakdown.minimumWage ?? 6300);

  // ── Pension rates ────────────────────────────────────────────────
  const penEePct  = snapshot.pensionEmployee ? `${snapshot.pensionEmployee}%` : emp.pensionEmployee ? `${emp.pensionEmployee}%` : '6%';
  const penErPct  = snapshot.pensionEmployer ? `${snapshot.pensionEmployer}%` : emp.pensionEmployer ? `${emp.pensionEmployer}%` : '6.5%';
  const sevPct    = snapshot.severancePay    ? `${snapshot.severancePay}%`    : emp.severancePay    ? `${emp.severancePay}%`    : '8.33%';

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען תלוש...</div>;
  if (error || !ps) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה בטעינת תלוש</div>;

  const empName = [emp.firstName ?? ps.employee?.firstName, emp.lastName ?? ps.employee?.lastName]
    .filter(Boolean).join(' ') || '—';

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Actions bar — hidden on print */}
      <div className="no-print flex items-center gap-3 mb-4 px-4 pt-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">תלוש שכר</h1>

        {!minimumWageOk && (
          <div className="flex items-center gap-1.5 bg-red-100 border border-red-300 text-red-700 text-xs font-semibold px-2 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5" />
            אזהרה: שכר מינימום
          </div>
        )}

        <button
          onClick={() => window.print()}
          className="mr-auto flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Printer className="w-4 h-4" />
          הדפס / PDF
        </button>
      </div>

      {/* ─── THE DOCUMENT ─── */}
      <div
        id="payslip-doc"
        className="bg-white max-w-2xl mx-auto border border-gray-300 shadow-sm rounded print:shadow-none print:border-none print:rounded-none print:max-w-none"
      >
        {/* ── HEADER ── */}
        <div className="border-b-2 border-gray-800 px-6 py-4 flex justify-between items-start">
          <div>
            <p className="text-lg font-bold text-gray-900">תלוש שכר</p>
            <p className="text-xs text-gray-500">לפי חוק הגנת השכר, תשי"ח-1958 (תיקון תשס"ח)</p>
          </div>
          <div className="text-left">
            <p className="text-xl font-bold text-indigo-700">{fmtPeriod(ps.period)}</p>
            <p className="text-xs text-gray-500">תקופת שכר</p>
          </div>
        </div>

        {/* ── EMPLOYER + EMPLOYEE INFO ── */}
        <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
          <div className="px-6 py-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">פרטי המעסיק</p>
            <p className="font-semibold text-gray-900">שם החברה — הדגמה</p>
            <p className="text-sm text-gray-600">ח.פ. / ע.מ.: 000000000</p>
            <p className="text-sm text-gray-600">מספר תיק ניכויים: 000000</p>
            <p className="text-sm text-gray-600">כתובת: תל אביב, ישראל</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">פרטי העובד</p>
            <p className="font-semibold text-gray-900">{empName}</p>
            <p className="text-sm font-mono text-gray-600">
              ת.ז.: {emp.idNumber ?? ps.employee?.idNumber ?? '—'}
            </p>
            <p className="text-sm text-gray-600">תפקיד: {snapshot.jobTitle ?? emp.jobTitle ?? '—'}</p>
            <p className="text-sm text-gray-600">מחלקה: {snapshot.department ?? emp.department ?? '—'}</p>
            {(emp.startDate || snapshot.startDate) && (
              <p className="text-sm text-gray-600">תאריך תחילה: {fmtDate(emp.startDate ?? snapshot.startDate)}</p>
            )}
            <p className="text-sm text-gray-600">
              נקודות זיכוי: {snapshot.taxCredits ?? emp.taxCredits ?? '2.25'}
            </p>
            {(snapshot.pensionFund || emp.pensionFund) && (
              <p className="text-sm text-gray-600">קרן פנסיה: {snapshot.pensionFund ?? emp.pensionFund}</p>
            )}
          </div>
        </div>

        {/* ── MINIMUM WAGE WARNING ── */}
        {!minimumWageOk && (
          <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>אזהרה חוקית:</strong> שכר ברוטו {fmt(grossSalary)} נמוך משכר המינימום החוקי ({fmt(minimumWage)}).
              על פי חוק שכר מינימום, תשמ"ז-1987, תשלום זה אינו חוקי.
            </span>
          </div>
        )}

        {/* ── TABLES ── */}
        <div className="px-6 py-4 space-y-4">

          {/* EARNINGS TABLE */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-1 border-b-2 border-gray-800 pb-1">
              הכנסות
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-right py-1 font-medium w-1/2">רכיב</th>
                  <th className="text-left py-1 font-medium w-24">ימים / שעות</th>
                  <th className="text-left py-1 font-medium w-28">סכום ₪</th>
                </tr>
              </thead>
              <tbody>
                <Row label="שכר יסוד" amount={baseSalary} />

                {overtimePay125 > 0 && (
                  <Row
                    label="שעות נוספות 125%"
                    sub="(2 שעות ראשונות)"
                    pct={adjustments.overtime125Hours ? `${adjustments.overtime125Hours}ש'` : undefined}
                    amount={overtimePay125}
                    indent
                  />
                )}
                {overtimePay150 > 0 && (
                  <Row
                    label="שעות נוספות 150%"
                    sub="(מעל שתיים / שבת / חג)"
                    pct={adjustments.overtime150Hours ? `${adjustments.overtime150Hours}ש'` : undefined}
                    amount={overtimePay150}
                    indent
                  />
                )}
                {bonusAmount > 0 && (
                  <Row label="בונוס / תשלום מיוחד" amount={bonusAmount} indent />
                )}
                {carBenefit > 0 && (
                  <Row
                    label="שווי רכב צמוד"
                    sub="(2.48% ממחירון / 12 — חייב במס ובב.ל.)"
                    amount={carBenefit}
                    indent
                    highlight
                  />
                )}
                {recuperationPay > 0 && (
                  <Row
                    label="דמי הבראה"
                    sub="(1/12 מהשנתי)"
                    amount={recuperationPay}
                    indent
                  />
                )}
                {travelAllowance > 0 && (
                  <Row
                    label="דמי נסיעה"
                    sub="(פטור ממס הכנסה — חייב ב.ל.)"
                    pct={adjustments.travelWorkDays ? `${adjustments.travelWorkDays}י'` : undefined}
                    amount={travelAllowance}
                    indent
                    highlight
                  />
                )}

                <Row label='סה"כ ברוטו' amount={grossSalary} bold green />

                {/* Tax base breakdown (informational) */}
                {(travelAllowance > 0 || taxableIncome !== grossSalary) && (
                  <>
                    <tr className="border-b border-gray-100">
                      <td colSpan={3} className="py-1 text-xs text-gray-400 font-medium pt-2">
                        — בסיסי חישוב —
                      </td>
                    </tr>
                    <Row
                      label="הכנסה חייבת במס הכנסה"
                      sub="(ברוטו בניכוי נסיעות)"
                      amount={taxableIncome}
                      indent
                    />
                    <Row
                      label="בסיס לביטוח לאומי"
                      sub="(כולל נסיעות)"
                      amount={grossForNI}
                      indent
                    />
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* DEDUCTIONS TABLE */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-1 border-b-2 border-gray-800 pb-1">
              ניכויים
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-right py-1 font-medium w-1/2">ניכוי</th>
                  <th className="text-left py-1 font-medium w-16">אחוז</th>
                  <th className="text-left py-1 font-medium w-28">סכום ₪</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="מס הכנסה"
                  sub={taxCreditsAmount > 0 ? `אחרי זיכוי ${fmt(taxCreditsAmount)}` : undefined}
                  amount={incomeTax}
                  red
                />
                <Row
                  label="ביטוח לאומי"
                  pct={grossForNI > 0 ? ((ni / grossForNI) * 100).toFixed(1) + '%' : ''}
                  amount={ni}
                  red
                />
                <Row
                  label="ביטוח בריאות"
                  pct={grossForNI > 0 ? ((hi / grossForNI) * 100).toFixed(1) + '%' : ''}
                  amount={hi}
                  red
                />
                <Row
                  label="פנסיה עובד"
                  pct={penEePct}
                  amount={penEe}
                  red
                />
                {tfEmp > 0 && (
                  <Row
                    label="קרן השתלמות עובד"
                    sub="(צו הרחבה)"
                    pct={breakdown.trainingFundEmpRate ? `${breakdown.trainingFundEmpRate ?? 2.5}%` : '2.5%'}
                    amount={tfEmp}
                    red
                    indent
                  />
                )}
                {manualDeduction > 0 && (
                  <Row
                    label="ניכוי ידני"
                    sub="(הלוואה / אחר)"
                    amount={manualDeduction}
                    red
                    indent
                  />
                )}
                <Row label='סה"כ ניכויים' amount={totalDeductions} bold red />
              </tbody>
            </table>
          </div>

          {/* NET PAY */}
          <div className={`border-2 rounded-lg p-4 flex justify-between items-center ${minimumWageOk ? 'border-gray-800 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <div>
              <p className="text-base font-bold text-gray-900">שכר נטו לתשלום</p>
              <p className="text-xs text-gray-500">לאחר כל הניכויים</p>
            </div>
            <div className="text-left">
              <p className={`text-2xl font-bold ${minimumWageOk ? 'text-green-700' : 'text-red-700'}`}>
                {fmt(netSalary)}
              </p>
              <p className="text-xs text-gray-500">
                {grossSalary > 0 ? ((netSalary / grossSalary) * 100).toFixed(0) : 0}% מהברוטו
              </p>
            </div>
          </div>

          {/* EMPLOYER COSTS */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs font-bold text-blue-700 uppercase mb-2">
              עלויות מעסיק — אינן מנוכות משכרך (מידע בלבד)
            </p>
            <table className="w-full text-sm">
              <tbody>
                <Row label={`פנסיה מעסיק (${penErPct})`} pct={penErPct} amount={penEr} />
                <Row label={`פיצויים (${sevPct})`} pct={sevPct} amount={sev} />
                <Row label="ביטוח לאומי מעסיק" amount={niEr} />
                {tfEr > 0 && (
                  <Row
                    label="קרן השתלמות מעסיק"
                    sub="(פטור ממס עד תקרת שכר 18,854 ₪)"
                    pct={breakdown.trainingFundErRate ? `${breakdown.trainingFundErRate ?? 7.5}%` : '7.5%'}
                    amount={tfEr}
                  />
                )}
                <Row label='עלות מעסיק כוללת' amount={empCost} bold />
              </tbody>
            </table>
          </div>

          {/* ACCRUALS */}
          {(vacationDays > 0 || sickDays > 0) && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <p className="text-xs font-bold text-indigo-700 uppercase mb-2">
                צבירות החודש (מידע בלבד — לא תשלום)
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {vacationDays > 0 && (
                  <div>
                    <p className="text-gray-600">ימי חופשה שנצברו</p>
                    <p className="font-bold text-indigo-700">
                      {vacationDays.toFixed(2)} ימים
                    </p>
                    <p className="text-xs text-gray-400">חוק חופשה שנתית, תשי"א-1951</p>
                  </div>
                )}
                {sickDays > 0 && (
                  <div>
                    <p className="text-gray-600">ימי מחלה שנצברו</p>
                    <p className="font-bold text-indigo-700">
                      {sickDays.toFixed(2)} ימים
                    </p>
                    <p className="text-xs text-gray-400">חוק דמי מחלה, תשל"ו-1976</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MINIMUM WAGE CHECK */}
          <div className={`flex items-center gap-2 rounded-lg p-2 text-xs ${minimumWageOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {minimumWageOk
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            }
            <span>
              שכר מינימום ({fmt(minimumWage)}):
              {minimumWageOk ? ' ✓ עומד בדרישה החוקית' : ` ✗ מופר! שכר ברוטו (${fmt(grossSalary)}) נמוך מהמינימום`}
            </span>
          </div>

          {/* TAX BRACKET BREAKDOWN */}
          {taxBrackets.length > 0 && (
            <details className="border border-gray-200 rounded-lg text-xs">
              <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-600 hover:bg-gray-50">
                ◂ פירוט חישוב מס הכנסה לפי מדרגות (2026)
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-1 text-gray-600">
                <div className="grid grid-cols-4 font-semibold text-gray-500 border-b pb-1 mb-1">
                  <span>מדרגה</span><span>אחוז</span><span>סכום חייב</span><span>מס</span>
                </div>
                {taxBrackets.filter((b: any) => b.taxableAmount > 0).map((b: any, i: number) => (
                  <div key={i} className="grid grid-cols-4">
                    <span>{fmt(b.min)} – {b.max ? fmt(b.max) : '∞'}</span>
                    <span>{(b.rate * 100)}%</span>
                    <span>{fmt(b.taxableAmount)}</span>
                    <span>{fmt(b.taxAmount)}</span>
                  </div>
                ))}
                {taxCreditsAmount > 0 && (
                  <div className="grid grid-cols-4 text-green-700 border-t pt-1">
                    <span className="col-span-3">זיכוי מס (נקודות זיכוי × 248 ₪)</span>
                    <span>({fmt(taxCreditsAmount)})</span>
                  </div>
                )}
                <div className="grid grid-cols-4 font-bold text-gray-800 border-t pt-1">
                  <span className="col-span-3">מס הכנסה לתשלום</span>
                  <span>{fmt(incomeTax)}</span>
                </div>
              </div>
            </details>
          )}

          {/* LEGAL NOTE + SIGNATURE */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="flex justify-between items-end text-xs text-gray-400">
              <div>
                <p>מזהה תלוש: {id?.slice(-12)}</p>
                <p>הופק: {new Date().toLocaleDateString('he-IL')}</p>
              </div>
              <div className="text-left">
                <div className="border-b border-gray-300 w-32 mb-1"></div>
                <p>חתימת המעסיק</p>
              </div>
            </div>
          </div>

          {/* DISCLAIMER */}
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700 flex gap-2 no-print">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              פרטי המעסיק (שם חברה, ח.פ., כתובת, מספר תיק ניכויים) יש לעדכן בהגדרות המערכת.
              חישובים לפי נתוני העובד ועל בסיס תקנות 2026.
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          #payslip-doc { border: none; box-shadow: none; max-width: 100%; margin: 0; }
        }
      `}</style>
    </div>
  );
}
