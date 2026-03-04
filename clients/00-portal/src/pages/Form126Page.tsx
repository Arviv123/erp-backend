/**
 * Form126Page — טופס 126
 * דוח שנתי של מעסיק לרשות המסים ולביטוח לאומי
 *
 * תקנות מס הכנסה (ניכוי ממשכורת ומשכר עבודה), תשנ"ג-1993, סעיף 5
 * חוק הביטוח הלאומי [נוסח משולב], תשנ"ה-1995, סעיף 355
 *
 * מוגש מדי שנה עד 30 באפריל של השנה הבאה
 * כולל: שכר שנתי, מס הכנסה שנוכה, ב.ל. + בריאות, פנסיה, קרן השתלמות
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer, Download, ChevronRight, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useEmployerInfo } from '../hooks/useEmployerInfo';

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Column header ─────────────────────────────────────────────────
function TH({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-2 text-right text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

// ─── Table cell ────────────────────────────────────────────────────
function TD({ children, className = '', money }: { children: React.ReactNode; className?: string; money?: boolean }) {
  return (
    <td className={`px-2 py-1.5 text-xs border border-gray-100 ${money ? 'text-left font-mono' : 'text-right'} ${className}`}>
      {children}
    </td>
  );
}

export default function Form126Page() {
  const [year, setYear] = useState(CURRENT_YEAR - 1); // ברירת מחדל: שנה קודמת

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['annual-report-126', year],
    queryFn:  () => api.get(`/payroll/reports/annual/${year}`).then(r => r.data?.data ?? r.data),
    enabled:  !!year,
  });

  const { data: employer } = useEmployerInfo();

  const report = data as any;
  const employees: any[] = report?.employees ?? [];
  const totals: any      = report?.totals    ?? {};

  // ── CSV Export ────────────────────────────────────────────────────
  function handleExportCSV() {
    const BOM = '\uFEFF';
    const headers = [
      'שם עובד', 'מספר ת.ז.', 'תפקיד', 'מחלקה', 'תאריך תחילה',
      'קרן פנסיה', 'נקודות זיכוי', 'חודשים',
      'שכר שנתי ברוטו', 'הכנסה חייבת', 'שווי רכב',
      'מס הכנסה', 'ביטוח לאומי עובד', 'ביטוח בריאות', 'ביטוח לאומי מעסיק',
      'פנסיה עובד', 'פנסיה מעסיק', 'פיצויים',
      'קרן השתלמות עובד', 'קרן השתלמות מעסיק',
      'שכר נטו שנתי',
    ];

    const rows = employees.map(e => [
      e.name, e.idNumber, e.jobTitle, e.department,
      e.startDate ? new Date(e.startDate).toLocaleDateString('he-IL') : '',
      e.pensionFund ?? '', e.taxCredits, e.months,
      e.grossSalary, e.taxableIncome, e.carBenefit,
      e.incomeTax, e.niEmployee, e.hiEmployee, e.niEmployer,
      e.pensionEmployee, e.pensionEmployer, e.severancePay,
      e.tfEmployee, e.tfEmployer,
      e.net,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

    const csv = BOM + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `form126-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 print:bg-white">

      {/* ── Actions bar (hidden on print) ── */}
      <div className="no-print flex items-center gap-3 mb-6">
        <Link to="/payroll" className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </Link>
        <FileText className="w-5 h-5 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">טופס 126 — דוח שנתי למעסיק</h1>
          <p className="text-sm text-gray-500">
            לרשות המסים ולביטוח הלאומי · מוגש עד 30.4 של השנה הבאה
          </p>
        </div>

        {/* Year picker */}
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="mr-auto border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button
          onClick={handleExportCSV}
          disabled={employees.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Download className="w-4 h-4" />
          ייצוא CSV
        </button>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Printer className="w-4 h-4" />
          הדפס / PDF
        </button>
      </div>

      {/* ── Document ── */}
      <div className="bg-white border border-gray-300 shadow-sm rounded-lg print:shadow-none print:border-none max-w-full overflow-auto">

        {/* Header */}
        <div className="border-b-2 border-gray-800 px-6 py-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xl font-bold text-gray-900">טופס 126</p>
              <p className="text-sm text-gray-600">דוח שנתי של מעסיק — שכר ותשלומים אחרים</p>
              <p className="text-xs text-gray-400 mt-0.5">
                תקנות מס הכנסה (ניכוי ממשכורת), תשנ"ג-1993 | חוק ב.ל. [נוסח משולב], תשנ"ה-1995
              </p>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-indigo-700">שנת מס {year}</p>
              <p className="text-xs text-gray-400">תקופת דיווח: 1.1.{year} — 31.12.{year}</p>
            </div>
          </div>

          {/* Employer info */}
          <div className="mt-3 grid grid-cols-3 gap-4 bg-indigo-50 rounded-lg p-3 text-sm">
            <div>
              <span className="text-gray-500">שם המעסיק:</span>{' '}
              <span className="font-semibold text-gray-900">{employer?.businessName || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">ח.פ. / ע.מ.:</span>{' '}
              <span className="font-semibold text-gray-900">{employer?.businessNumber || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">מספר תיק ניכויים:</span>{' '}
              <span className="font-semibold text-gray-900">{employer?.withholdingFileNumber || '—'}</span>
            </div>
          </div>
        </div>

        {/* Loading / error / empty */}
        {isLoading && (
          <div className="flex items-center justify-center h-40 text-gray-400">
            טוען נתוני שנת {year}...
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 justify-center h-40 text-red-500">
            <AlertCircle className="w-5 h-5" />
            שגיאה בטעינת הנתונים
          </div>
        )}

        {!isLoading && !error && employees.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <FileText className="w-8 h-8 opacity-30" />
            <p className="text-sm">אין תלושים מאושרים/שולמו לשנת {year}</p>
            <p className="text-xs text-gray-300">רק ריצות בסטטוס APPROVED / PAID נכללות בדוח</p>
          </div>
        )}

        {!isLoading && employees.length > 0 && (
          <>
            {/* Summary stats */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">עובדים:</span>{' '}
                <strong className="text-gray-900">{report.employeeCount}</strong>
              </div>
              <div>
                <span className="text-gray-500">סה"כ שכר ברוטו:</span>{' '}
                <strong className="text-gray-900">{fmtILS(totals.grossSalary ?? 0)}</strong>
              </div>
              <div>
                <span className="text-gray-500">סה"כ מס הכנסה:</span>{' '}
                <strong className="text-red-700">{fmtILS(totals.incomeTax ?? 0)}</strong>
              </div>
              <div>
                <span className="text-gray-500">סה"כ ביטוח לאומי (עובד+מעסיק):</span>{' '}
                <strong className="text-red-700">
                  {fmtILS((totals.niEmployee ?? 0) + (totals.hiEmployee ?? 0) + (totals.niEmployer ?? 0))}
                </strong>
              </div>
              <div>
                <span className="text-gray-500">סה"כ שכר נטו:</span>{' '}
                <strong className="text-green-700">{fmtILS(totals.net ?? 0)}</strong>
              </div>
            </div>

            {/* Main table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <TH>שם העובד</TH>
                    <TH>מספר ת.ז.</TH>
                    <TH>תפקיד / מחלקה</TH>
                    <TH>תאריך תחילה</TH>
                    <TH>קרן פנסיה</TH>
                    <TH>נק' זיכוי</TH>
                    <TH>חודשים</TH>
                    {/* Income */}
                    <TH className="bg-blue-50">שכר שנתי ברוטו</TH>
                    <TH className="bg-blue-50">הכנסה חייבת</TH>
                    {totals.carBenefit > 0 && <TH className="bg-blue-50">שווי רכב</TH>}
                    {/* Deductions — income tax */}
                    <TH className="bg-red-50">מס הכנסה</TH>
                    {/* NI */}
                    <TH className="bg-orange-50">ב.ל. עובד</TH>
                    <TH className="bg-orange-50">בריאות</TH>
                    <TH className="bg-orange-50">ב.ל. מעסיק</TH>
                    {/* Pension */}
                    <TH className="bg-purple-50">פנסיה עובד</TH>
                    <TH className="bg-purple-50">פנסיה מעסיק</TH>
                    <TH className="bg-purple-50">פיצויים</TH>
                    {/* Training fund */}
                    {totals.tfEmployee > 0 && <TH className="bg-emerald-50">קה"ש עובד</TH>}
                    {totals.tfEmployer > 0 && <TH className="bg-emerald-50">קה"ש מעסיק</TH>}
                    {/* Net */}
                    <TH className="bg-green-50">שכר נטו שנתי</TH>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, i) => (
                    <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <TD className="font-medium text-gray-900">{e.name}</TD>
                      <TD className="font-mono">{e.idNumber}</TD>
                      <TD>
                        <span className="block">{e.jobTitle}</span>
                        {e.department && <span className="text-gray-400">{e.department}</span>}
                      </TD>
                      <TD>{fmtDate(e.startDate)}</TD>
                      <TD>{e.pensionFund ?? '—'}</TD>
                      <TD money>{e.taxCredits}</TD>
                      <TD money>{e.months}</TD>
                      {/* Income */}
                      <TD money className="bg-blue-50/40">{fmtILS(e.grossSalary)}</TD>
                      <TD money className="bg-blue-50/40">{fmtILS(e.taxableIncome)}</TD>
                      {totals.carBenefit > 0 && <TD money className="bg-blue-50/40">{e.carBenefit > 0 ? fmtILS(e.carBenefit) : '—'}</TD>}
                      {/* Tax */}
                      <TD money className="text-red-700 bg-red-50/40">{fmtILS(e.incomeTax)}</TD>
                      {/* NI */}
                      <TD money className="bg-orange-50/40">{fmtILS(e.niEmployee)}</TD>
                      <TD money className="bg-orange-50/40">{fmtILS(e.hiEmployee)}</TD>
                      <TD money className="bg-orange-50/40">{fmtILS(e.niEmployer)}</TD>
                      {/* Pension */}
                      <TD money className="bg-purple-50/40">{fmtILS(e.pensionEmployee)}</TD>
                      <TD money className="bg-purple-50/40">{fmtILS(e.pensionEmployer)}</TD>
                      <TD money className="bg-purple-50/40">{fmtILS(e.severancePay)}</TD>
                      {/* Training fund */}
                      {totals.tfEmployee > 0 && <TD money className="bg-emerald-50/40">{e.tfEmployee > 0 ? fmtILS(e.tfEmployee) : '—'}</TD>}
                      {totals.tfEmployer > 0 && <TD money className="bg-emerald-50/40">{e.tfEmployer > 0 ? fmtILS(e.tfEmployer) : '—'}</TD>}
                      {/* Net */}
                      <TD money className="text-green-700 font-semibold bg-green-50/40">{fmtILS(e.net)}</TD>
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                    <TD className="font-bold text-gray-900" colSpan={7}>
                      סה"כ שנתי — {report.employeeCount} עובדים
                    </TD>
                    <TD money className="bg-blue-100">{fmtILS(totals.grossSalary ?? 0)}</TD>
                    <TD money className="bg-blue-100">{fmtILS(totals.taxableIncome ?? 0)}</TD>
                    {totals.carBenefit > 0 && <TD money className="bg-blue-100">{fmtILS(totals.carBenefit ?? 0)}</TD>}
                    <TD money className="text-red-700 bg-red-100">{fmtILS(totals.incomeTax ?? 0)}</TD>
                    <TD money className="bg-orange-100">{fmtILS(totals.niEmployee ?? 0)}</TD>
                    <TD money className="bg-orange-100">{fmtILS(totals.hiEmployee ?? 0)}</TD>
                    <TD money className="bg-orange-100">{fmtILS(totals.niEmployer ?? 0)}</TD>
                    <TD money className="bg-purple-100">{fmtILS(totals.pensionEmployee ?? 0)}</TD>
                    <TD money className="bg-purple-100">{fmtILS(totals.pensionEmployer ?? 0)}</TD>
                    <TD money className="bg-purple-100">{fmtILS(totals.severancePay ?? 0)}</TD>
                    {totals.tfEmployee > 0 && <TD money className="bg-emerald-100">{fmtILS(totals.tfEmployee ?? 0)}</TD>}
                    {totals.tfEmployer > 0 && <TD money className="bg-emerald-100">{fmtILS(totals.tfEmployer ?? 0)}</TD>}
                    <TD money className="text-green-700 bg-green-100">{fmtILS(totals.net ?? 0)}</TD>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature / submission section */}
            <div className="px-6 py-4 border-t border-gray-200 mt-2">
              <div className="grid grid-cols-3 gap-8 text-sm text-gray-600">
                <div>
                  <p className="font-semibold text-gray-800 mb-1">סיכום תשלומים לרשות המסים</p>
                  <p>מס הכנסה שנוכה: <strong>{fmtILS(totals.incomeTax ?? 0)}</strong></p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 mb-1">סיכום תשלומים לביטוח לאומי</p>
                  <p>ב.ל. + בריאות (עובד): <strong>{fmtILS((totals.niEmployee ?? 0) + (totals.hiEmployee ?? 0))}</strong></p>
                  <p>ב.ל. מעסיק: <strong>{fmtILS(totals.niEmployer ?? 0)}</strong></p>
                  <p className="font-semibold">סה"כ לב.ל.: <strong>{fmtILS((totals.niEmployee ?? 0) + (totals.hiEmployee ?? 0) + (totals.niEmployer ?? 0))}</strong></p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 mb-1">פנסיה וקרן השתלמות</p>
                  <p>סה"כ פנסיה: <strong>{fmtILS((totals.pensionEmployee ?? 0) + (totals.pensionEmployer ?? 0) + (totals.severancePay ?? 0))}</strong></p>
                  {totals.tfEmployee > 0 && (
                    <p>סה"כ קרן השתלמות: <strong>{fmtILS((totals.tfEmployee ?? 0) + (totals.tfEmployer ?? 0))}</strong></p>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-end mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400">
                <div>
                  <p>הופק: {new Date().toLocaleDateString('he-IL')}</p>
                  <p>שנת מס: {year}</p>
                </div>
                <div className="text-left space-y-3">
                  <div className="border-b border-gray-400 w-40" />
                  <p>חתימת המעסיק / מורשה חתימה</p>
                </div>
                <div className="text-left space-y-3">
                  <div className="border-b border-gray-400 w-40" />
                  <p>תאריך</p>
                </div>
              </div>
            </div>

            {/* Legal disclaimer */}
            <div className="px-6 pb-4">
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700 flex gap-2 no-print">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  דוח זה נוצר אוטומטית ממערכת ERP. פרטי המעסיק (שם, ח.פ., מספר תיק ניכויים) יש לעדכן בהגדרות המערכת
                  לפני הגשה לרשות המסים ולביטוח הלאומי.
                  רק ריצות שכר בסטטוס "מאושר" או "שולם" נכללות בדוח.
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
