/**
 * MonthlyReport102Page — דוח ניכויים חודשי (טופס 102)
 *
 * יש להגיש לרשות המסים ולביטוח הלאומי עד ה-15 לחודש העוקב.
 * כולל: מס הכנסה שנוכה, ב.ל. עובד + מעסיק, ביטוח בריאות.
 * פנסיה אינה חלק מטופס 102 — מועברת ישירות לקרן תוך 7 ימי עסקים.
 *
 * Law: פקודת מס הכנסה, חוק ביטוח לאומי, צו פנסיה חובה.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useEmployerInfo } from '../hooks/useEmployerInfo';

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtN = (n: number | null | undefined, dec = 2) =>
  new Intl.NumberFormat('he-IL', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n ?? 0);

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

// ─── Summary box ──────────────────────────────────────────────────
function SumBox({
  label, sub, value, color, border,
}: { label: string; sub?: string; value: number; color: string; border: string }) {
  return (
    <div className={`rounded-xl border-2 ${border} bg-white p-4 flex flex-col gap-1`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      <p className={`text-2xl font-bold ${color}`}>{fmt(value)}</p>
    </div>
  );
}

// ─── Printable page ───────────────────────────────────────────────
function Report102Document({ data, period, employer }: { data: any; period: string; employer?: any }) {
  const now = new Date();
  const dueDate = (() => {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m, 15).toLocaleDateString('he-IL');
  })();

  return (
    <div id="report102-doc" className="bg-white max-w-5xl mx-auto border border-gray-300 shadow-sm rounded print:shadow-none print:border-none print:rounded-none print:max-w-none text-sm">

      {/* Header */}
      <div className="border-b-2 border-gray-800 px-6 py-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-lg font-bold text-gray-900">דוח ניכויים חודשי — טופס 102</p>
            <p className="text-xs text-gray-500">לפי פקודת מס הכנסה וחוק ביטוח לאומי</p>
            <p className="text-xs text-gray-500 mt-0.5">מועד הגשה: עד ה-15 לחודש העוקב ({dueDate})</p>
          </div>
          <div className="text-left">
            <p className="text-xl font-bold text-indigo-700">{fmtPeriod(period)}</p>
            <p className="text-xs text-gray-500">תקופת שכר</p>
            <p className={`text-xs font-semibold mt-1 ${data.status === 'PAID' ? 'text-green-600' : 'text-amber-600'}`}>
              {data.status === 'PAID' ? '✓ שולם' : data.status === 'APPROVED' ? 'מאושר — ממתין לתשלום' : 'טיוטה'}
            </p>
          </div>
        </div>
      </div>

      {/* Employer info */}
      <div className="grid grid-cols-4 gap-4 border-b border-gray-200 px-6 py-3 bg-gray-50 text-xs">
        <div>
          <p className="font-semibold text-gray-600">שם המעסיק</p>
          <p className="text-gray-800">{employer?.businessName || '—'}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-600">ח.פ. / ע.מ.</p>
          <p className="text-gray-800">{employer?.businessNumber || '—'}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-600">מספר תיק ניכויים</p>
          <p className="text-gray-800">{employer?.withholdingFileNumber || '—'}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-600">מספר תיק ב.ל.</p>
          <p className="text-gray-800">{employer?.niFileNumber || '—'}</p>
        </div>
      </div>

      {/* Summary totals */}
      <div className="px-6 py-4 border-b border-gray-200">
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">סיכום לתשלום</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { label: 'מספר עובדים', value: `${data.employeeCount} עובדים`, bold: false },
            { label: 'ברוטו כולל', value: fmt(data.totalGross), bold: true },
            { label: 'מס הכנסה לרשות המסים', value: fmt(data.totalTax), bold: true, red: true },
            { label: 'ביטוח לאומי + בריאות (סה"כ)', value: fmt(data.totalNITotal), bold: true, red: true },
          ].map((item, i) => (
            <div key={i} className={`border rounded p-2 ${item.red ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className="text-gray-500">{item.label}</p>
              <p className={`font-bold text-base ${item.red ? 'text-red-700' : 'text-gray-900'}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-employee table */}
      <div className="px-6 py-4">
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">פירוט עובדים</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-right px-2 py-2 font-semibold text-gray-700 border-l border-gray-200">עובד</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-700 border-l border-gray-200">ת.ז.</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-700 border-l border-gray-200">שכר ברוטו</th>
                <th className="text-right px-2 py-2 font-semibold text-red-600 border-l border-gray-200">מס הכנסה</th>
                <th className="text-right px-2 py-2 font-semibold text-orange-600 border-l border-gray-200">ב.ל. עובד</th>
                <th className="text-right px-2 py-2 font-semibold text-orange-700 border-l border-gray-200">בריאות עובד</th>
                <th className="text-right px-2 py-2 font-semibold text-orange-800 border-l border-gray-200">ב.ל. מעסיק</th>
                <th className="text-right px-2 py-2 font-semibold text-green-700">נטו</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.employees.map((emp: any, i: number) => (
                <tr key={emp.employeeId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 font-medium text-gray-900 border-l border-gray-200">{emp.name}</td>
                  <td className="px-2 py-1.5 font-mono text-gray-600 border-l border-gray-200">{emp.idNumber ?? '—'}</td>
                  <td className="px-2 py-1.5 text-gray-900 font-semibold border-l border-gray-200">{fmtN(emp.gross, 0)}</td>
                  <td className="px-2 py-1.5 text-red-600 border-l border-gray-200">({fmtN(emp.incomeTax, 0)})</td>
                  <td className="px-2 py-1.5 text-orange-600 border-l border-gray-200">({fmtN(emp.niEmployee, 0)})</td>
                  <td className="px-2 py-1.5 text-orange-700 border-l border-gray-200">({fmtN(emp.hiEmployee, 0)})</td>
                  <td className="px-2 py-1.5 text-orange-800 border-l border-gray-200">({fmtN(emp.niEmployer, 0)})</td>
                  <td className="px-2 py-1.5 text-green-700 font-semibold">{fmtN(emp.net, 0)}</td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-gray-900 text-white font-bold">
                <td className="px-2 py-2 border-l border-gray-700" colSpan={2}>סה"כ ({data.employeeCount} עובדים)</td>
                <td className="px-2 py-2 border-l border-gray-700">{fmtN(data.totalGross, 0)}</td>
                <td className="px-2 py-2 border-l border-gray-700 text-red-300">
                  ({fmtN(data.totalTax, 0)})
                </td>
                <td className="px-2 py-2 border-l border-gray-700 text-orange-300">
                  ({fmtN(data.employees.reduce((s: number, e: any) => s + e.niEmployee, 0), 0)})
                </td>
                <td className="px-2 py-2 border-l border-gray-700 text-orange-300">
                  ({fmtN(data.employees.reduce((s: number, e: any) => s + e.hiEmployee, 0), 0)})
                </td>
                <td className="px-2 py-2 border-l border-gray-700 text-orange-300">
                  ({fmtN(data.totalNIEmployer, 0)})
                </td>
                <td className="px-2 py-2 text-green-300">
                  {fmtN(data.employees.reduce((s: number, e: any) => s + e.net, 0), 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payment summary for tax authority */}
      <div className="mx-6 mb-4 border-2 border-red-300 rounded-lg overflow-hidden">
        <div className="bg-red-50 px-4 py-2 border-b border-red-200">
          <p className="text-xs font-bold text-red-700 uppercase">סיכום תשלומים לרשויות</p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Income Tax */}
          <div className="border border-red-200 rounded p-3 bg-red-50">
            <p className="font-bold text-red-800 mb-1">לרשות המסים — מס הכנסה</p>
            <p className="text-xs text-gray-600">מספר תיק: ___________</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{fmt(data.totalTax)}</p>
            <p className="text-xs text-gray-500 mt-1">יש לשלם עד ה-15 לחודש העוקב</p>
          </div>
          {/* NI */}
          <div className="border border-orange-200 rounded p-3 bg-orange-50">
            <p className="font-bold text-orange-800 mb-1">לביטוח לאומי (עובד + מעסיק)</p>
            <p className="text-xs text-gray-600">כולל ביטוח בריאות</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{fmt(data.totalNITotal)}</p>
            <p className="text-xs text-gray-500 mt-1">יש לשלם עד ה-15 לחודש העוקב</p>
          </div>
          {/* Pension note — NOT part of Form 102 */}
          <div className="border border-blue-200 rounded p-3 bg-blue-50 col-span-1">
            <p className="font-bold text-blue-800 mb-1">פנסיה — לא חלק מטופס 102</p>
            <p className="text-xs text-gray-600">פנסיה מועברת ישירות לקרן תוך 7 ימי עסקים</p>
            <p className="text-xs text-blue-700 mt-1 font-medium">{fmt(data.totalPensionTotal ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-1">צו הרחבה פנסיה חובה</p>
          </div>
        </div>
      </div>

      {/* Signature area */}
      <div className="mx-6 mb-6 flex justify-between items-end text-xs text-gray-500 pt-4 border-t border-gray-200">
        <div>
          <p>הופק: {now.toLocaleDateString('he-IL')}</p>
          <p className="mt-2">תקופה: {fmtPeriod(period)}</p>
        </div>
        <div className="flex gap-8">
          <div className="text-center">
            <div className="border-b border-gray-400 w-40 mb-1"></div>
            <p>חתימת מורשה חתימה</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-400 w-40 mb-1"></div>
            <p>תאריך</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function MonthlyReport102Page() {
  const navigate = useNavigate();
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['payroll-report-102', period],
    queryFn:  () => api.get(`/payroll/reports/monthly/${period}`).then(r => r.data),
    enabled:  !!period,
    retry:    false,
  });

  const { data: employer } = useEmployerInfo();

  const data = rawData?.data ?? rawData;

  // Build period options (current + 11 past months)
  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: val, label: fmtPeriod(val) };
  });

  const dueDate = (() => {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m, 15).toLocaleDateString('he-IL');
  })();

  return (
    <div dir="rtl" className="space-y-4">
      {/* Top bar */}
      <div className="no-print flex items-center gap-3">
        <button onClick={() => navigate('/payroll')} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">דוח ניכויים חודשי — טופס 102</h1>
        <div className="mr-auto flex items-center gap-3">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {periodOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            disabled={!data}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Printer className="w-4 h-4" />
            הדפס / PDF
          </button>
        </div>
      </div>

      {/* Legal reminder */}
      <div className="no-print flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>מועד הגשה: </strong>
          יש להגיש דוח ניכויים ולשלם מס הכנסה + ביטוח לאומי לא יאוחר מ-<strong>{dueDate}</strong>.
          פנסיה יש להעביר תוך 7 ימי עסקים ממועד תשלום השכר.
        </span>
      </div>

      {/* Summary boxes (shown when data is loaded) */}
      {data && (
        <div className="no-print grid grid-cols-2 md:grid-cols-4 gap-3">
          <SumBox label="עובדים" value={data.employeeCount} color="text-gray-900" border="border-gray-200" />
          <SumBox label="ברוטו כולל" value={data.totalGross} color="text-gray-900" border="border-gray-300" />
          <SumBox
            label="לרשות המסים"
            sub="מס הכנסה"
            value={data.totalTax}
            color="text-red-700"
            border="border-red-300"
          />
          <SumBox
            label="לביטוח לאומי"
            sub="עובד + מעסיק + בריאות"
            value={data.totalNITotal}
            color="text-orange-700"
            border="border-orange-300"
          />
        </div>
      )}

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center h-60 text-gray-500">טוען דוח...</div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-60 gap-3">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className="text-gray-600 font-medium">לא נמצא דוח שכר לתקופה {fmtPeriod(period)}</p>
          <p className="text-sm text-gray-400">יש תחילה להפעיל שכר לתקופה זו</p>
        </div>
      )}

      {data && !isLoading && (
        <>
          {data.status === 'PAID' && (
            <div className="no-print flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>שכר לתקופה זו סומן כשולם בתאריך {data.paidAt ? new Date(data.paidAt).toLocaleDateString('he-IL') : '—'}</span>
            </div>
          )}
          <Report102Document data={data} period={period} employer={employer} />
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          #report102-doc { border: none; box-shadow: none; max-width: 100%; margin: 0; }
        }
      `}</style>
    </div>
  );
}
