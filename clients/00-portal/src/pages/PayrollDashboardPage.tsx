/**
 * PayrollDashboardPage — לוח בקרה שכר
 *
 * מציג:
 * 1. סטטוס חודש נוכחי (האם רץ שכר?)
 * 2. לוח מועדים ישראלי (9 לחודש שכר, 15 ניכויים, 30/4 טופס 106)
 * 3. סיכום ריצות שכר + הפעלת ריצה חדשה
 * 4. קישורים לדוחות
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Play, Eye, CheckCircle, Banknote, AlertTriangle, FileText,
  Calendar, TrendingUp, Users, Calculator, ClipboardList, TableProperties,
} from 'lucide-react';
import api from '../lib/api';
import RunPayrollModal from '../components/RunPayrollModal';

const fmtC = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};
const STATUS_LBL: Record<string, string> = {
  DRAFT: 'טיוטה', APPROVED: 'מאושר', PAID: 'שולם',
};

// ─── Israeli payroll obligation calendar ───────────────────────────────────
function getObligations(now: Date) {
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  // Next salary payment: 9th of NEXT month
  const salaryDue = new Date(year, month, 9); // month is already +1 above, so this is next month

  // Tax withholding report (ניכויים) + NI payment: 15th of next month
  const taxReportDue = new Date(year, month, 15);

  // Annual form 106: April 30 of NEXT year
  const form106Due = new Date(year + 1, 3, 30);

  // Annual 856 report (שכר שנתי): March 31 of NEXT year
  const annualReportDue = new Date(year + 1, 2, 31);

  const daysUntil = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86400000);

  return [
    {
      label: `תשלום שכר ${HEBREW_MONTHS[month]}`,
      date: salaryDue,
      days: daysUntil(salaryDue),
      law: 'חוק הגנת השכר — עד ה-9 לחודש העוקב',
      urgent: daysUntil(salaryDue) <= 5,
    },
    {
      label: 'דוח ניכויים (ביטוח לאומי + מס הכנסה)',
      date: taxReportDue,
      days: daysUntil(taxReportDue),
      law: 'פקודת מס הכנסה — עד ה-15 לחודש העוקב',
      urgent: daysUntil(taxReportDue) <= 5,
    },
    {
      label: 'טופס 106 לעובדים',
      date: form106Due,
      days: daysUntil(form106Due),
      law: 'תקנות מס הכנסה — עד 30 לאפריל',
      urgent: false,
    },
    {
      label: 'דוח 856 שנתי לרשות המסים',
      date: annualReportDue,
      days: daysUntil(annualReportDue),
      law: 'פקודת מס הכנסה — עד 31 למרץ',
      urgent: false,
    },
  ];
}

// ─── Israeli 2026 rate reference ───────────────────────────────────────────
const RATE_INFO = [
  { label: 'מס הכנסה — מדרגה 1', detail: 'עד 7,180 ₪', rate: '10%' },
  { label: 'מס הכנסה — מדרגה 2', detail: '7,181 – 10,290 ₪', rate: '14%' },
  { label: 'מס הכנסה — מדרגה 3', detail: '10,291 – 16,530 ₪', rate: '20%' },
  { label: 'מס הכנסה — מדרגה 4', detail: '16,531 – 22,970 ₪', rate: '31%' },
  { label: 'מס הכנסה — מדרגה 5', detail: '22,971 – 47,720 ₪', rate: '35%' },
  { label: 'מס הכנסה — מדרגה 6', detail: 'מעל 47,720 ₪', rate: '47%' },
  { label: 'נקודת זיכוי', detail: 'ערך חודשי', rate: '248 ₪' },
  { label: 'ביטוח לאומי עובד (נמוך)', detail: 'עד 7,100 ₪', rate: '0.4%' },
  { label: 'ביטוח לאומי עובד (גבוה)', detail: '7,101 – 50,200 ₪', rate: '7%' },
  { label: 'ביטוח בריאות עובד (נמוך)', detail: 'עד 7,100 ₪', rate: '3.1%' },
  { label: 'ביטוח בריאות עובד (גבוה)', detail: 'מעל 7,100 ₪', rate: '5%' },
  { label: 'ב.ל. מעסיק (נמוך / גבוה)', detail: 'עד / מעל תקרה', rate: '3.55% / 7.6%' },
  { label: 'פנסיה עובד (מינימום)', detail: 'צו הרחבה פנסיה', rate: '6%' },
  { label: 'פנסיה מעסיק (מינימום)', detail: 'כולל 6.5% + 8.33% פיצויים', rate: '14.83%' },
];

export default function PayrollDashboardPage() {
  const [showModal, setShowModal] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const qc = useQueryClient();
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
  });

  const runs: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const currentRun = runs.find(r => r.period === currentPeriod);
  const lastRun    = runs[0];

  // YTD stats (current year)
  const yearPrefix = String(now.getFullYear());
  const ytdRuns    = runs.filter(r => r.period.startsWith(yearPrefix) && r.status !== 'DRAFT');
  const ytdGross   = ytdRuns.reduce((s, r) => s + Number(r.totalGross ?? 0), 0);
  const ytdNet     = ytdRuns.reduce((s, r) => s + Number(r.totalNet ?? 0), 0);
  const ytdTax     = ytdRuns.reduce((s, r) => s + Number(r.totalTax ?? 0), 0);

  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(`/payroll/runs/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });
  const paidMut = useMutation({
    mutationFn: (id: string) => api.post(`/payroll/runs/${id}/paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  });

  const obligations = getObligations(now);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ניהול שכר</h1>
        <div className="flex items-center gap-2">
          <Link to="/payroll/worksheet"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
            <TableProperties className="w-4 h-4" />
            גיליון שכר
          </Link>
          <Link to="/payroll/report102"
            className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition">
            <ClipboardList className="w-4 h-4" />
            דוח 102
          </Link>
          <Link to="/payroll/form106"
            className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition">
            <FileText className="w-4 h-4" />
            טופס 106
          </Link>
          <Link to="/payroll/preview"
            className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition">
            <Calculator className="w-4 h-4" />
            מחשבון שכר
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <Play className="w-4 h-4" />
            הפעל שכר חדש
          </button>
        </div>
      </div>

      {/* Current month status */}
      <div className={`rounded-xl border-2 p-4 ${
        !currentRun
          ? 'border-amber-300 bg-amber-50'
          : currentRun.status === 'PAID'
          ? 'border-green-300 bg-green-50'
          : 'border-blue-300 bg-blue-50'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!currentRun
              ? <AlertTriangle className="w-5 h-5 text-amber-600" />
              : <CheckCircle className="w-5 h-5 text-green-600" />
            }
            <div>
              <p className="font-semibold text-gray-900">
                שכר {HEBREW_MONTHS[now.getMonth() + 1]} {now.getFullYear()}
              </p>
              <p className="text-sm text-gray-600">
                {!currentRun
                  ? 'טרם הופעל — יש להפעיל עד ה-9 לחודש הבא'
                  : `סטאטוס: ${STATUS_LBL[currentRun.status]} | ${fmtC(currentRun.totalGross)} ברוטו | ${fmtC(currentRun.totalNet)} נטו | ${currentRun._count?.payslips ?? 0} עובדים`
                }
              </p>
            </div>
          </div>
          {currentRun && (
            <div className="flex items-center gap-2">
              {currentRun.status === 'DRAFT' && (
                <button onClick={() => approveMut.mutate(currentRun.id)} disabled={approveMut.isPending}
                  className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" />
                  אשר
                </button>
              )}
              {currentRun.status === 'APPROVED' && (
                <button onClick={() => paidMut.mutate(currentRun.id)} disabled={paidMut.isPending}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                  <Banknote className="w-3.5 h-3.5" />
                  סמן כשולם
                </button>
              )}
              <Link to={`/payroll/runs/${currentRun.id}`}
                className="flex items-center gap-1 border border-gray-300 hover:bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg">
                <Eye className="w-3.5 h-3.5" />
                פרטים
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* YTD + Obligations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* YTD Stats */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-800">מצטבר {now.getFullYear()}</h2>
            <span className="text-xs text-gray-400 mr-auto">({ytdRuns.length} ריצות)</span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'ברוטו מצטבר', value: fmtC(ytdGross), cls: 'text-gray-900' },
              { label: 'נטו מצטבר', value: fmtC(ytdNet), cls: 'text-green-700' },
              { label: 'מס הכנסה מצטבר', value: fmtC(ytdTax), cls: 'text-red-600' },
              { label: 'ניכויים מצטברים', value: fmtC(ytdGross - ytdNet), cls: 'text-red-500' },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-sm border-b border-gray-100 pb-1.5">
                <span className="text-gray-600">{r.label}</span>
                <span className={`font-semibold ${r.cls}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Obligations calendar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-800">לוח מועדים — חובות מעסיק</h2>
          </div>
          <div className="space-y-2.5">
            {obligations.map((o, i) => (
              <div key={i} className={`flex items-start gap-3 p-2 rounded-lg ${o.urgent ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                <div className={`text-center min-w-[40px] rounded px-1 py-0.5 text-xs font-bold ${
                  o.days <= 5 ? 'bg-red-600 text-white' : o.days <= 15 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {o.days}d
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{o.label}</p>
                  <p className="text-xs text-gray-400">{o.date.toLocaleDateString('he-IL')} — {o.law}</p>
                </div>
                {o.urgent && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rates reference (collapsible) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setShowRates(!showRates)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-indigo-500" />
            שיעורי מס ותקרות — שנת 2026
          </div>
          <span className="text-gray-400">{showRates ? '▲' : '▼'}</span>
        </button>
        {showRates && (
          <div className="px-5 pb-4 border-t border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              {RATE_INFO.map(r => (
                <div key={r.label} className="bg-gray-50 rounded p-2 text-xs">
                  <p className="font-semibold text-gray-700">{r.label}</p>
                  <p className="text-gray-500">{r.detail}</p>
                  <p className="text-indigo-700 font-bold text-sm mt-0.5">{r.rate}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* All runs table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-700">היסטוריית ריצות שכר</h2>
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">טוען...</div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <Play className="w-8 h-8 text-gray-200" />
            <p>אין ריצות שכר — לחץ "הפעל שכר חדש" להתחיל</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תקופה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">עובדים</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ברוטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מס הכנסה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטאטוס</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run: any) => (
                <tr key={run.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtPeriod(run.period)}</td>
                  <td className="px-4 py-3 text-gray-600">{run._count?.payslips ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{fmtC(run.totalGross ?? 0)}</td>
                  <td className="px-4 py-3 text-red-600">({fmtC(run.totalTax ?? 0)})</td>
                  <td className="px-4 py-3 font-medium text-green-700">{fmtC(run.totalNet ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[run.status] ?? 'bg-gray-100'}`}>
                      {STATUS_LBL[run.status] ?? run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/payroll/runs/${run.id}`}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                        <Eye className="w-3.5 h-3.5" />
                        צפה
                      </Link>
                      {run.status === 'DRAFT' && (
                        <button onClick={() => approveMut.mutate(run.id)} disabled={approveMut.isPending}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          אשר
                        </button>
                      )}
                      {run.status === 'APPROVED' && (
                        <button onClick={() => paidMut.mutate(run.id)} disabled={paidMut.isPending}
                          className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium">
                          <Banknote className="w-3.5 h-3.5" />
                          שולם
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <RunPayrollModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
