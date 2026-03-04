/**
 * Form126Page — טופס 126 מקיף
 * ─────────────────────────────────────────────────────────────────────
 * חוק בסיס:
 *   תקנות מס הכנסה (ניכוי ממשכורת ומשכר עבודה), תשנ"ג-1993, סעיף 5
 *   חוק הביטוח הלאומי [נוסח משולב], תשנ"ה-1995, סעיף 355
 *
 * לוח הגשה:
 *   חצי שנתי H1 (ינואר–יוני):    הגשה עד 31.7 של אותה שנה
 *   חצי שנתי H2 (יולי–דצמבר):    הגשה עד 31.1 של השנה הבאה
 *   שנתי מלא:                      הגשה עד 30.4 של השנה הבאה
 *
 * מגיש למי:
 *   רשות המסים (מיסוי מקורות) + המוסד לביטוח לאומי
 *   דרך מערכת ניכויים: https://nikuim.taxes.gov.il
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer, Download, ChevronRight, AlertCircle, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../lib/api';
import { useEmployerInfo } from '../hooks/useEmployerInfo';

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

type HalfType = 'H1' | 'H2' | 'FULL';

const HALF_OPTIONS: { value: HalfType; label: string; period: string; deadlineLabel: string; color: string }[] = [
  { value: 'H1',   label: 'חצי שנה ראשונה',   period: 'ינואר–יוני',      deadlineLabel: 'הגשה עד 31.7', color: 'blue'   },
  { value: 'H2',   label: 'חצי שנה שנייה',    period: 'יולי–דצמבר',     deadlineLabel: 'הגשה עד 31.1', color: 'indigo' },
  { value: 'FULL', label: 'שנתי מלא',          period: 'ינואר–דצמבר',    deadlineLabel: 'הגשה עד 30.4', color: 'purple' },
];

// ─── Compliance Calendar Component ───────────────────────────────────────────
function ComplianceCalendar({ year }: { year: number }) {
  const today = new Date();
  const events = [
    { date: new Date(year, 6, 31), label: 'טופס 126 H1', desc: `ינואר–יוני ${year}`, type: 'form126', icon: '📋' },
    { date: new Date(year + 1, 0, 31), label: 'טופס 126 H2', desc: `יולי–דצמבר ${year}`, type: 'form126', icon: '📋' },
    { date: new Date(year + 1, 1, 28), label: 'טופס 106', desc: `תעודת שכר לעובדים — שנת ${year}`, type: 'form106', icon: '📄' },
    { date: new Date(year + 1, 3, 30), label: 'טופס 126 שנתי', desc: `שנה מלאה ${year}`, type: 'form126-annual', icon: '📋' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 no-print">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-800">לוח הגשה — שנת {year}</h3>
        <span className="text-xs text-gray-400 mr-auto">טופס 102 — הגשה חודשית עד ה-15 לכל חודש</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {events.map((ev, i) => {
          const isPast    = ev.date < today;
          const isClose   = !isPast && (ev.date.getTime() - today.getTime()) < 30 * 24 * 3600 * 1000;
          return (
            <div key={i} className={`rounded-lg p-3 border-2 text-sm ${
              isPast   ? 'bg-green-50 border-green-200 text-green-800' :
              isClose  ? 'bg-amber-50 border-amber-300 text-amber-800' :
                         'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                {isPast
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  : isClose
                  ? <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  : <span className="text-base">{ev.icon}</span>
                }
                <span className="font-bold text-xs">{ev.label}</span>
              </div>
              <p className="text-xs opacity-80">{ev.desc}</p>
              <p className={`text-xs font-bold mt-1 ${isPast ? 'text-green-600' : isClose ? 'text-amber-600' : 'text-gray-500'}`}>
                {ev.date.toLocaleDateString('he-IL')}
                {isPast && ' ✓'}
                {isClose && ' ⚠'}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        * הגשה דרך: <strong>nikuim.taxes.gov.il</strong> · אימות: תעודה דיגיטלית / ייפוי כוח
      </p>
    </div>
  );
}

// ─── Column/Cell helpers ────────────────────────────────────────────────────
function TH({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-2 text-right text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function TD({ children, className = '', money }: { children: React.ReactNode; className?: string; money?: boolean }) {
  return (
    <td className={`px-2 py-1.5 text-xs border border-gray-100 ${money ? 'text-left font-mono' : 'text-right'} ${className}`}>
      {children}
    </td>
  );
}

// ─── Data quality badge ──────────────────────────────────────────────────────
function QualityBadge({ employees }: { employees: any[] }) {
  const noId  = employees.filter(e => !e.idNumber).length;
  const noBank = employees.filter(e => !e.bankAccount).length;
  if (noId === 0 && noBank === 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> נתונים מלאים
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
      <AlertCircle className="w-3 h-3" />
      {noId > 0 && `${noId} ללא ת.ז.`}{noId > 0 && noBank > 0 && ' · '}{noBank > 0 && `${noBank} ללא בנק`}
    </span>
  );
}

export default function Form126Page() {
  const [year, setYear] = useState(CURRENT_YEAR - 1);
  const [half, setHalf] = useState<HalfType>('FULL');

  const { data, isLoading, error } = useQuery({
    queryKey: ['annual-report-126', year, half],
    queryFn:  () => api.get(`/payroll/reports/annual/${year}`, { params: { half } }).then(r => r.data?.data ?? r.data),
    enabled:  !!year,
  });

  const { data: employer } = useEmployerInfo();

  const report    = data as any;
  const employees: any[] = report?.employees ?? [];
  const totals: any      = report?.totals    ?? {};

  const halfOpt = HALF_OPTIONS.find(h => h.value === half)!;

  // ── Excel Export ──────────────────────────────────────────────────
  function handleExportExcel() {
    const rows = employees.map(e => ({
      'שם עובד':          e.name,
      'מספר ת.ז.':         e.idNumber,
      'מין':               e.gender === 'F' ? 'נקבה' : e.gender === 'M' ? 'זכר' : '',
      'תאריך לידה':        fmtDate(e.birthDate),
      'תפקיד':             e.jobTitle,
      'מחלקה':             e.department,
      'תאריך תחילה':       fmtDate(e.startDate),
      'תאריך סיום':        fmtDate(e.endDate),
      'קרן פנסיה':         e.pensionFund ?? '',
      'נק. זיכוי':         e.taxCredits,
      'חודשים':            e.months,
      'ימי מילואים':       e.miluimDays ?? 0,
      'שכר שנתי ברוטו':   e.grossSalary,
      'הכנסה חייבת':       e.taxableIncome,
      'שווי רכב':          e.carBenefit || 0,
      'מס הכנסה':          e.incomeTax,
      'ב.ל. עובד':         e.niEmployee,
      'בריאות':            e.hiEmployee,
      'ב.ל. מעסיק':        e.niEmployer,
      'פנסיה עובד':        e.pensionEmployee,
      'פנסיה מעסיק':       e.pensionEmployer,
      'פיצויים':           e.severancePay,
      'קה"ש עובד':         e.tfEmployee || 0,
      'קה"ש מעסיק':        e.tfEmployer || 0,
      'שכר נטו שנתי':      e.net,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'טופס 126');
    XLSX.writeFile(wb, `form126-${year}-${half}.xlsx`, { bookType: 'xlsx' });
  }

  // ── CSV Export (for ניכויים system) ─────────────────────────────────
  function handleExportCSV() {
    const BOM = '\uFEFF';
    const headers = [
      'שם עובד', 'מספר ת.ז.', 'מין', 'תאריך לידה', 'תפקיד', 'מחלקה',
      'תאריך תחילה', 'תאריך סיום', 'קרן פנסיה', 'נקודות זיכוי', 'חודשים', 'ימי מילואים',
      'שכר שנתי ברוטו', 'הכנסה חייבת', 'שווי רכב',
      'מס הכנסה', 'ביטוח לאומי עובד', 'ביטוח בריאות', 'ביטוח לאומי מעסיק',
      'פנסיה עובד', 'פנסיה מעסיק', 'פיצויים',
      'קרן השתלמות עובד', 'קרן השתלמות מעסיק',
      'שכר נטו שנתי',
    ];

    const rows = employees.map(e => [
      e.name, e.idNumber,
      e.gender === 'F' ? 'נקבה' : e.gender === 'M' ? 'זכר' : '',
      fmtDate(e.birthDate),
      e.jobTitle, e.department,
      e.startDate ? new Date(e.startDate).toLocaleDateString('he-IL') : '',
      e.endDate   ? new Date(e.endDate).toLocaleDateString('he-IL')   : '',
      e.pensionFund ?? '', e.taxCredits, e.months, e.miluimDays ?? 0,
      e.grossSalary, e.taxableIncome, e.carBenefit || 0,
      e.incomeTax, e.niEmployee, e.hiEmployee, e.niEmployer,
      e.pensionEmployee, e.pensionEmployer, e.severancePay,
      e.tfEmployee || 0, e.tfEmployer || 0,
      e.net,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

    const csv = BOM + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `form126-${year}-${half}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 print:bg-white">

      {/* ── Actions bar ── */}
      <div className="no-print flex items-center gap-3 mb-4">
        <Link to="/payroll" className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </Link>
        <FileText className="w-5 h-5 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">טופס 126 — ניכויים במקור</h1>
          <p className="text-sm text-gray-500">
            דוח {report?.periodLabel ?? halfOpt.period} · {halfOpt.deadlineLabel}
          </p>
        </div>

        {/* Controls */}
        <div className="mr-auto flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {HALF_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setHalf(opt.value)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  half === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.value === 'H1' ? 'H1 (יאנ–יוני)' : opt.value === 'H2' ? 'H2 (יול–דצמ)' : 'שנתי מלא'}
              </button>
            ))}
          </div>

          {employees.length > 0 && <QualityBadge employees={employees} />}
        </div>

        <button
          onClick={handleExportExcel}
          disabled={employees.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Download className="w-4 h-4" />
          Excel
        </button>

        <button
          onClick={handleExportCSV}
          disabled={employees.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Download className="w-4 h-4" />
          CSV לניכויים
        </button>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Printer className="w-4 h-4" />
          הדפס
        </button>
      </div>

      {/* Compliance Calendar */}
      <ComplianceCalendar year={year} />

      {/* ── Document ── */}
      <div className="bg-white border border-gray-300 shadow-sm rounded-lg print:shadow-none print:border-none max-w-full overflow-auto">

        {/* Header */}
        <div className="border-b-2 border-gray-800 px-6 py-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xl font-bold text-gray-900">טופס 126 — ניכויים במקור משכר עבודה</p>
              <p className="text-sm text-gray-600">דוח {report?.periodLabel ?? halfOpt.period} · מוגש לרשות המסים ולביטוח לאומי</p>
              <p className="text-xs text-gray-400 mt-0.5">
                תקנות מס הכנסה (ניכוי ממשכורת), תשנ"ג-1993 | חוק ב.ל. [נוסח משולב], תשנ"ה-1995
              </p>
            </div>
            <div className="text-left space-y-1">
              <p className="text-2xl font-bold text-indigo-700">שנת מס {year}</p>
              <p className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${
                half === 'H1' ? 'bg-blue-100 text-blue-700' :
                half === 'H2' ? 'bg-indigo-100 text-indigo-700' :
                                'bg-purple-100 text-purple-700'
              }`}>
                {half === 'H1' ? 'חצי שנה ראשונה' : half === 'H2' ? 'חצי שנה שנייה' : 'שנתי מלא'}
              </p>
              <p className="text-xs text-amber-600 font-semibold">
                ⏰ מועד הגשה: {report?.deadline ?? halfOpt.deadlineLabel}
              </p>
            </div>
          </div>

          {/* Employer info */}
          <div className="mt-3 grid grid-cols-4 gap-3 bg-indigo-50 rounded-lg p-3 text-sm">
            <div>
              <span className="text-gray-500 text-xs">שם המעסיק:</span>
              <p className="font-semibold text-gray-900">{employer?.businessName || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">ח.פ. / ע.מ.:</span>
              <p className="font-semibold text-gray-900">{employer?.businessNumber || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">מספר תיק ניכויים:</span>
              <p className="font-semibold text-gray-900">{employer?.withholdingFileNumber || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">תקופת דיווח:</span>
              <p className="font-semibold text-gray-900">{report?.periodLabel ?? `${halfOpt.period} ${year}`}</p>
            </div>
          </div>
        </div>

        {/* Loading / error / empty */}
        {isLoading && (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin ml-2" />
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
            <p className="text-sm">אין תלושים מאושרים/שולמו לתקופה זו</p>
            <p className="text-xs text-gray-300">רק ריצות בסטטוס APPROVED / PAID נכללות</p>
          </div>
        )}

        {!isLoading && employees.length > 0 && (
          <>
            {/* Summary stats */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-5 text-sm">
              <div><span className="text-gray-500">עובדים:</span> <strong>{report.employeeCount}</strong></div>
              <div><span className="text-gray-500">שכר ברוטו:</span> <strong>{fmtILS(totals.grossSalary ?? 0)}</strong></div>
              <div><span className="text-gray-500">מס הכנסה:</span> <strong className="text-red-700">{fmtILS(totals.incomeTax ?? 0)}</strong></div>
              <div>
                <span className="text-gray-500">ב.ל. כולל (עו+מע):</span>{' '}
                <strong className="text-orange-700">
                  {fmtILS((totals.niEmployee ?? 0) + (totals.hiEmployee ?? 0) + (totals.niEmployer ?? 0))}
                </strong>
              </div>
              <div>
                <span className="text-gray-500">פנסיה כולל:</span>{' '}
                <strong className="text-purple-700">
                  {fmtILS((totals.pensionEmployee ?? 0) + (totals.pensionEmployer ?? 0) + (totals.severancePay ?? 0))}
                </strong>
              </div>
              <div><span className="text-gray-500">שכר נטו:</span> <strong className="text-green-700">{fmtILS(totals.net ?? 0)}</strong></div>
            </div>

            {/* Main table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <TH>שם העובד</TH>
                    <TH>מספר ת.ז.</TH>
                    <TH>מין</TH>
                    <TH>ת. לידה</TH>
                    <TH>תפקיד / מחלקה</TH>
                    <TH>תאריך תחילה</TH>
                    <TH>תאריך סיום</TH>
                    <TH>קרן פנסיה</TH>
                    <TH>נק' זיכוי</TH>
                    <TH>חודשים</TH>
                    <TH>ימי מיל.</TH>
                    {/* Income */}
                    <TH className="bg-blue-50">שכר ברוטו</TH>
                    <TH className="bg-blue-50">הכנסה חייבת</TH>
                    {totals.carBenefit > 0 && <TH className="bg-blue-50">שווי רכב</TH>}
                    {/* Tax */}
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
                    <TH className="bg-green-50">שכר נטו</TH>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, i) => (
                    <tr key={e.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${e.endDate ? 'opacity-75' : ''}`}>
                      <TD className={`font-medium ${!e.idNumber ? 'text-amber-700' : 'text-gray-900'}`}>
                        {e.name}
                        {e.endDate && <span className="mr-1 text-xs text-red-500">(פוטר)</span>}
                      </TD>
                      <TD className={`font-mono ${!e.idNumber ? 'bg-amber-50 text-amber-600' : ''}`}>
                        {e.idNumber || '⚠ חסר'}
                      </TD>
                      <TD>{e.gender === 'F' ? 'נ' : e.gender === 'M' ? 'ז' : '—'}</TD>
                      <TD>{fmtDate(e.birthDate)}</TD>
                      <TD>
                        <span className="block">{e.jobTitle}</span>
                        {e.department && <span className="text-gray-400">{e.department}</span>}
                      </TD>
                      <TD>{fmtDate(e.startDate)}</TD>
                      <TD className={e.endDate ? 'text-red-600 font-medium' : ''}>{fmtDate(e.endDate)}</TD>
                      <TD>{e.pensionFund ?? '—'}</TD>
                      <TD money>{e.taxCredits}</TD>
                      <TD money>{e.months}</TD>
                      <TD money className={e.miluimDays > 0 ? 'bg-yellow-50 text-yellow-700 font-bold' : ''}>
                        {e.miluimDays > 0 ? e.miluimDays : '—'}
                      </TD>
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
                    <TD className="font-bold text-gray-900" colSpan={11}>
                      סה"כ — {report.employeeCount} עובדים
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

            {/* Summary section */}
            <div className="px-6 py-4 border-t border-gray-200 mt-2">
              <div className="grid grid-cols-3 gap-8 text-sm text-gray-600">
                <div>
                  <p className="font-bold text-gray-800 mb-2">סיכום לרשות המסים</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>מס הכנסה שנוכה:</span>
                      <strong className="text-red-700">{fmtILS(totals.incomeTax ?? 0)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>שכר ברוטו כולל:</span>
                      <strong>{fmtILS(totals.grossSalary ?? 0)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>הכנסה חייבת:</span>
                      <strong>{fmtILS(totals.taxableIncome ?? 0)}</strong>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-2">סיכום לביטוח לאומי</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>ב.ל. + בריאות (עובד):</span>
                      <strong>{fmtILS((totals.niEmployee ?? 0) + (totals.hiEmployee ?? 0))}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>ב.ל. מעסיק:</span>
                      <strong>{fmtILS(totals.niEmployer ?? 0)}</strong>
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-semibold">סה"כ לב.ל.:</span>
                      <strong className="text-orange-700">
                        {fmtILS((totals.niEmployee ?? 0) + (totals.hiEmployee ?? 0) + (totals.niEmployer ?? 0))}
                      </strong>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-2">פנסיה וקרן השתלמות</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>פנסיה (עובד+מעסיק+פיצ.):</span>
                      <strong>{fmtILS((totals.pensionEmployee ?? 0) + (totals.pensionEmployer ?? 0) + (totals.severancePay ?? 0))}</strong>
                    </div>
                    {(totals.tfEmployee ?? 0) + (totals.tfEmployer ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>קרן השתלמות:</span>
                        <strong>{fmtILS((totals.tfEmployee ?? 0) + (totals.tfEmployer ?? 0))}</strong>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-semibold">שכר נטו כולל:</span>
                      <strong className="text-green-700">{fmtILS(totals.net ?? 0)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Signature / Submission section */}
              <div className="flex justify-between items-end mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400">
                <div>
                  <p>הופק: {new Date().toLocaleDateString('he-IL')}</p>
                  <p>שנת מס: {year} · תקופה: {report?.periodLabel ?? halfOpt.period}</p>
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

            {/* Regulations reference box */}
            <div className="px-6 pb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 no-print">
                <p className="font-bold mb-1">📋 הנחיות הגשה — מערכת ניכויים</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p>• הגשה: <strong>nikuim.taxes.gov.il</strong> (אימות: תעודה דיגיטלית)</p>
                    <p>• קובץ: פורמט UTF-8 / ISO-8859-8 לפי מפרט רשות המסים</p>
                    <p>• קנס איחור: 250 ₪ לעובד לחודש (חצי שנתי) / 500 ₪ (שנתי)</p>
                  </div>
                  <div>
                    <p>• H1: ינואר–יוני → הגשה עד <strong>31.7.{year}</strong></p>
                    <p>• H2: יולי–דצמבר → הגשה עד <strong>31.1.{year + 1}</strong></p>
                    <p>• שנתי: → הגשה עד <strong>30.4.{year + 1}</strong></p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700 flex gap-2 no-print mt-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  דוח זה נוצר אוטומטית. פרטי המעסיק (שם, ח.פ., מספר תיק ניכויים) יש לעדכן בהגדרות המערכת.
                  רק ריצות שכר בסטטוס "מאושר" או "שולם" נכללות. אין להגיש ללא אימות רואה חשבון.
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
