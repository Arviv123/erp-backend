/**
 * Form106Page — טופס 106 / אישור שנתי לעובד
 *
 * חוק:  תקנות מס הכנסה (ניכוי ממשכורת ומשכר עבודה), תשי"ד-1954
 * מועד: חייב להגיע לעובד עד 30 באפריל של השנה שלאחר שנת המס
 *
 * הדף מחשב מצטבר שנתי לכל עובד מתוך ריצות השכר שנשמרו במערכת.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number | undefined | null) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 }).format(n ?? 0);

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function fmtPeriod(period: string) {
  const [year, month] = period.split('-');
  return `${HEBREW_MONTHS[Number(month)]} ${year}`;
}

interface EmpAnnual {
  employeeId: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  jobTitle?: string;
  department?: string;
  taxCredits?: number;
  months: number;
  grossSalary: number;
  taxableIncome: number;
  incomeTax: number;
  nationalInsurance: number;
  healthInsurance: number;
  pensionEmployee: number;
  netSalary: number;
  pensionEmployer: number;
  severancePay: number;
  niEmployer: number;
  totalEmployerCost: number;
  payslips: any[];
}

export default function Form106Page() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  // Get all runs
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
  });

  const allRuns: any[] = Array.isArray(runsData) ? runsData : Array.isArray(runsData?.data) ? runsData.data : [];

  // Filter runs for selected year, only PAID or APPROVED
  const yearRuns = allRuns.filter(r =>
    r.period.startsWith(String(year)) &&
    (r.status === 'PAID' || r.status === 'APPROVED')
  );

  // Fetch payslips for each run in year
  const [employeeMap, setEmployeeMap] = useState<Map<string, EmpAnnual>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (yearRuns.length === 0) { setEmployeeMap(new Map()); return; }
    setLoading(true);
    const map = new Map<string, EmpAnnual>();

    Promise.all(
      yearRuns.map(run => api.get(`/payroll/runs/${run.id}/payslips`).then(r => r.data))
    ).then(results => {
      results.forEach((res: any) => {
        const runData = res?.data ?? res;
        const payslips: any[] = Array.isArray(runData?.payslips) ? runData.payslips : [];
        payslips.forEach(ps => {
          const empId = ps.employeeId;
          const existing = map.get(empId);
          const emp = ps.employee ?? {};
          if (!existing) {
            map.set(empId, {
              employeeId:       empId,
              firstName:        emp.firstName  ?? '—',
              lastName:         emp.lastName   ?? '—',
              idNumber:         emp.idNumber   ?? '—',
              jobTitle:         emp.jobTitle,
              department:       emp.department,
              taxCredits:       emp.taxCredits,
              months:           1,
              grossSalary:      Number(ps.grossSalary      ?? 0),
              taxableIncome:    Number(ps.taxableIncome    ?? 0),
              incomeTax:        Number(ps.incomeTax        ?? 0),
              nationalInsurance:Number(ps.nationalInsurance?? 0),
              healthInsurance:  Number(ps.healthInsurance  ?? 0),
              pensionEmployee:  Number(ps.pensionEmployee  ?? 0),
              netSalary:        Number(ps.netSalary        ?? 0),
              pensionEmployer:  Number(ps.pensionEmployer  ?? 0),
              severancePay:     Number(ps.severancePay     ?? 0),
              niEmployer:       Number(ps.niEmployer       ?? 0),
              totalEmployerCost:Number(ps.totalEmployerCost?? 0),
              payslips:         [ps],
            });
          } else {
            existing.months           += 1;
            existing.grossSalary      += Number(ps.grossSalary      ?? 0);
            existing.taxableIncome    += Number(ps.taxableIncome    ?? 0);
            existing.incomeTax        += Number(ps.incomeTax        ?? 0);
            existing.nationalInsurance+= Number(ps.nationalInsurance?? 0);
            existing.healthInsurance  += Number(ps.healthInsurance  ?? 0);
            existing.pensionEmployee  += Number(ps.pensionEmployee  ?? 0);
            existing.netSalary        += Number(ps.netSalary        ?? 0);
            existing.pensionEmployer  += Number(ps.pensionEmployer  ?? 0);
            existing.severancePay     += Number(ps.severancePay     ?? 0);
            existing.niEmployer       += Number(ps.niEmployer       ?? 0);
            existing.totalEmployerCost+= Number(ps.totalEmployerCost?? 0);
            existing.payslips.push(ps);
          }
        });
      });
      setEmployeeMap(new Map(map));
      setLoading(false);
    }).catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearRuns.length, year]);

  const employees = Array.from(employeeMap.values());

  const printEmployee = (emp: EmpAnnual) => {
    setPrintId(emp.employeeId);
    setTimeout(() => { window.print(); setPrintId(null); }, 100);
  };

  const availableYears = Array.from(new Set(allRuns.map(r => r.period.split('-')[0])))
    .sort((a, b) => Number(b) - Number(a));

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">טופס 106 — אישור שנתי לעובד</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            פקודת מס הכנסה — חייב להגיע לעובד עד 30 לאפריל
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">שנת מס:</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            {!availableYears.includes(String(now.getFullYear())) && (
              <option value={now.getFullYear()}>{now.getFullYear()}</option>
            )}
          </select>
        </div>
      </div>

      {/* Summary banner */}
      {yearRuns.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 flex flex-wrap gap-4 text-sm">
          <span className="text-indigo-700">
            <span className="font-bold">{yearRuns.length}</span> ריצות שכר בשנת {year}
          </span>
          <span className="text-indigo-700">
            <span className="font-bold">{employees.length}</span> עובדים
          </span>
          <span className="text-indigo-700">
            ברוטו שנתי: <span className="font-bold">{fmt(employees.reduce((s, e) => s + e.grossSalary, 0))}</span>
          </span>
          <span className="text-indigo-700">
            מס הכנסה שנתי: <span className="font-bold">{fmt(employees.reduce((s, e) => s + e.incomeTax, 0))}</span>
          </span>
        </div>
      )}

      {/* Loading / empty states */}
      {(runsLoading || loading) && (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען נתונים...</div>
      )}
      {!runsLoading && !loading && yearRuns.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <FileText className="w-10 h-10 text-gray-200" />
          <p>אין ריצות שכר שאושרו לשנת {year}</p>
        </div>
      )}

      {/* Employee cards */}
      {!loading && employees.map(emp => (
        <div
          key={emp.employeeId}
          className={`bg-white rounded-xl border shadow-sm ${printId === emp.employeeId ? '' : printId !== null ? 'print:hidden' : ''}`}
        >
          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                {emp.firstName[0]}{emp.lastName[0]}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{emp.firstName} {emp.lastName}</p>
                <p className="text-xs text-gray-500">ת.ז. {emp.idNumber} | {emp.jobTitle ?? '—'} | {emp.months} חודשים</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => printEmployee(emp)}
                className="no-print flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" />
                הדפס 106
              </button>
              <button
                onClick={() => setExpandedId(expandedId === emp.employeeId ? null : emp.employeeId)}
                className="no-print flex items-center gap-1 text-gray-400 hover:text-gray-600"
              >
                {expandedId === emp.employeeId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Annual summary table */}
          <div className="px-5 py-4">
            {/* Header row */}
            <div className="text-center mb-4 print:block hidden">
              <p className="text-lg font-bold">טופס 106 — אישור שנתי על הכנסות ותשלומים</p>
              <p className="text-sm">שנת מס: {year} | {emp.firstName} {emp.lastName} | ת.ז.: {emp.idNumber}</p>
              <p className="text-xs text-gray-500">המעסיק: שם החברה — הדגמה | תיק ניכויים: 000000</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'הכנסה ברוטו שנתית', value: fmt(emp.grossSalary), cls: 'text-gray-900' },
                { label: 'הכנסה חייבת במס', value: fmt(emp.taxableIncome), cls: 'text-gray-700' },
                { label: 'מס הכנסה שנוכה', value: fmt(emp.incomeTax), cls: 'text-red-600' },
                { label: 'ביטוח לאומי עובד', value: fmt(emp.nationalInsurance), cls: 'text-red-500' },
                { label: 'ביטוח בריאות', value: fmt(emp.healthInsurance), cls: 'text-red-500' },
                { label: 'פנסיה עובד', value: fmt(emp.pensionEmployee), cls: 'text-red-500' },
                { label: 'שכר נטו שנתי', value: fmt(emp.netSalary), cls: 'text-green-700 font-bold' },
                { label: 'פיצויים שנצברו', value: fmt(emp.severancePay), cls: 'text-blue-600' },
              ].map(r => (
                <div key={r.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{r.label}</p>
                  <p className={`text-base font-bold ${r.cls}`}>{r.value}</p>
                </div>
              ))}
            </div>

            {/* Employer costs */}
            <div className="mt-3 bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-bold text-blue-700 mb-2">עלויות מעסיק שנתיות</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: 'פנסיה מעסיק', value: fmt(emp.pensionEmployer) },
                  { label: 'ביטוח לאומי מעסיק', value: fmt(emp.niEmployer) },
                  { label: 'עלות מעסיק כוללת', value: fmt(emp.totalEmployerCost) },
                ].map(r => (
                  <div key={r.label}>
                    <p className="text-blue-600">{r.label}</p>
                    <p className="font-bold text-blue-900">{r.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly breakdown (expandable) */}
            {expandedId === emp.employeeId && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">פירוט חודשי</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-right px-2 py-1.5 font-medium">חודש</th>
                      <th className="text-right px-2 py-1.5 font-medium">ברוטו</th>
                      <th className="text-right px-2 py-1.5 font-medium">מס הכנסה</th>
                      <th className="text-right px-2 py-1.5 font-medium">ב.ל.</th>
                      <th className="text-right px-2 py-1.5 font-medium">פנסיה</th>
                      <th className="text-right px-2 py-1.5 font-medium">נטו</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {emp.payslips
                      .sort((a, b) => (a.period > b.period ? 1 : -1))
                      .map((ps: any) => (
                        <tr key={ps.id} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5">{fmtPeriod(ps.period)}</td>
                          <td className="px-2 py-1.5">{fmt(ps.grossSalary)}</td>
                          <td className="px-2 py-1.5 text-red-600">({fmt(ps.incomeTax)})</td>
                          <td className="px-2 py-1.5 text-red-600">({fmt(ps.nationalInsurance)})</td>
                          <td className="px-2 py-1.5 text-red-600">({fmt(ps.pensionEmployee)})</td>
                          <td className="px-2 py-1.5 text-green-700 font-medium">{fmt(ps.netSalary)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legal footer for print */}
            <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-400 print:block hidden">
              <p>אישור זה מהווה טופס 106 לפי תקנות מס הכנסה (ניכוי ממשכורת), תשי"ד-1954</p>
              <p>הופק: {new Date().toLocaleDateString('he-IL')} | מערכת ERP</p>
              <div className="flex justify-between mt-4">
                <div><div className="border-b border-gray-400 w-36 mb-1" /><p>חתימת המעסיק</p></div>
                <div><div className="border-b border-gray-400 w-36 mb-1" /><p>חתימת העובד</p></div>
              </div>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
