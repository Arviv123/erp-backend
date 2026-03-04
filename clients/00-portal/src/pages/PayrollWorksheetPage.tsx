/**
 * PayrollWorksheetPage — גיליון עבודה שכר
 *
 * ממשק מקצועי לחישוב שכר בזמן אמת לכל העובדים.
 * מחשב צד לקוח (ללא API בכל שינוי) לפי דיני עבודה ישראל 2026.
 *
 * Laws: פקודת מס הכנסה, חוק ביטוח לאומי, צו פנסיה חובה,
 *       חוק שע"מ, חוק דמי נסיעה, חוק דמי הבראה, חוק שכר מינימום.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Play, AlertTriangle, CheckCircle, RotateCcw, ChevronRight,
  Info, TrendingUp, Eye,
} from 'lucide-react';
import api from '../lib/api';

// ─── Formatters ──────────────────────────────────────────────────
const fmtC = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function fmtPeriod(p: string) {
  const [y, m] = p.split('-');
  return `${HEBREW_MONTHS[Number(m)]} ${y}`;
}

// ─── Israeli 2026 Payroll Engine (Frontend) ──────────────────────
const TAX_BRACKETS = [
  { max: 7_180,  rate: 0.10 },
  { max: 10_290, rate: 0.14 },
  { max: 16_530, rate: 0.20 },
  { max: 22_970, rate: 0.31 },
  { max: 47_720, rate: 0.35 },
  { max: Infinity, rate: 0.47 },
];
const TAX_CREDIT_MONTHLY = 248;
const NI_THRESHOLD        = 7_100;
const NI_CEILING          = 50_200;
const MIN_WAGE            = 6_300;
const TRAVEL_DAILY_MAX    = 26;
const RECUPERATION_DAILY  = 432;
const MONTHLY_HOURS       = 186;

function getRecuperationDays(startDate?: string): number {
  if (!startDate) return 5;
  const years = (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 1)  return 5;
  if (years < 3)  return 6;
  if (years < 5)  return 7;
  if (years < 10) return 8;
  if (years < 15) return 9;
  return 10;
}

interface CalcResult {
  baseSalary:   number;
  ot125Pay:     number;
  ot150Pay:     number;
  recuperation: number;
  bonus:        number;
  travel:       number;
  gross:        number;
  grossForNI:   number;
  taxableIncome: number;
  incomeTax:    number;
  taxCredits:   number;
  niEmployee:   number;
  hiEmployee:   number;
  pensionEmp:   number;
  manualDed:    number;
  totalDed:     number;
  net:          number;
  // Employer
  pensionEr:    number;
  severance:    number;
  niEmployer:   number;
  totalEmployerCost: number;
  minimumWageOk: boolean;
}

interface AdjRow {
  ot125: number;
  ot150: number;
  travelDays: number;
  recuperation: boolean;
  bonus: number;
  manualDeduction: number;
  miluimDays: number;
  sickDays: number;
}

function defaultAdj(): AdjRow {
  return { ot125: 0, ot150: 0, travelDays: 21, recuperation: false, bonus: 0, manualDeduction: 0, miluimDays: 0, sickDays: 0 };
}

function calcPayroll(emp: any, adj: AdjRow): CalcResult {
  const base      = Number(emp.grossSalary) || 0;
  const credits   = Number(emp.taxCredits)  || 2.25;
  const penEeRate = Number(emp.pensionEmployee) || 6;
  const penErRate = Number(emp.pensionEmployer) || 6.5;
  const sevRate   = Number(emp.severancePay)    || 8.33;
  const hourly    = emp.hourlyRate ? Number(emp.hourlyRate) : base / MONTHLY_HOURS;

  // Income components
  const ot125Pay     = Math.round(adj.ot125 * hourly * 1.25 * 100) / 100;
  const ot150Pay     = Math.round(adj.ot150 * hourly * 1.50 * 100) / 100;
  const recupDays    = getRecuperationDays(emp.startDate);
  const recuperation = adj.recuperation ? Math.round(recupDays * RECUPERATION_DAILY / 12) : 0;
  const bonus        = Math.round(adj.bonus);
  const travel       = Math.round(Math.min(adj.travelDays, 31) * TRAVEL_DAILY_MAX);

  const gross        = base + ot125Pay + ot150Pay + recuperation + bonus;
  const grossForNI   = gross + travel;   // travel included in NI base
  const taxableIncome = gross;            // travel exempt from income tax

  // Income tax
  let rawTax = 0;
  let prev   = 0;
  for (const b of TAX_BRACKETS) {
    if (taxableIncome <= prev) break;
    rawTax += (Math.min(taxableIncome, b.max) - prev) * b.rate;
    prev    = b.max;
    if (b.max === Infinity) break;
  }
  const taxCredits = credits * TAX_CREDIT_MONTHLY;
  const incomeTax  = Math.max(0, Math.round(rawTax - taxCredits));

  // NI + Health (employee)
  const niBase = Math.min(grossForNI, NI_CEILING);
  const below  = Math.min(niBase, NI_THRESHOLD);
  const above  = Math.max(0, niBase - NI_THRESHOLD);
  const niEmployee = Math.round(below * 0.004 + above * 0.07);
  const hiEmployee = Math.round(below * 0.031 + above * 0.05);

  // Pension employee
  const pensionEmp = Math.round(gross * (penEeRate / 100));

  // Manual deduction
  const manualDed    = Math.round(adj.manualDeduction);
  const totalDed     = incomeTax + niEmployee + hiEmployee + pensionEmp + manualDed;
  const net          = Math.max(0, gross + travel - totalDed);

  // Employer costs
  const pensionEr    = Math.round(gross * (penErRate / 100));
  const severance    = Math.round(gross * (sevRate / 100));
  const niErBelow    = Math.min(grossForNI, NI_THRESHOLD);
  const niErAbove    = Math.max(0, Math.min(grossForNI, NI_CEILING) - NI_THRESHOLD);
  const niEmployer   = Math.round(niErBelow * 0.0355 + niErAbove * 0.076);
  const totalEmployerCost = gross + travel + pensionEr + severance + niEmployer;

  return {
    baseSalary: base, ot125Pay, ot150Pay, recuperation, bonus, travel,
    gross, grossForNI, taxableIncome,
    incomeTax, taxCredits, niEmployee, hiEmployee, pensionEmp,
    manualDed, totalDed, net,
    pensionEr, severance, niEmployer, totalEmployerCost,
    minimumWageOk: base >= MIN_WAGE,
  };
}

// ─── Editable number cell ────────────────────────────────────────
function NumCell({ value, onChange, placeholder, max, step = 0.5, highlight = false }: {
  value: number; onChange: (v: number) => void; placeholder?: string;
  max?: number; step?: number; highlight?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      placeholder={placeholder ?? '0'}
      value={value || ''}
      onChange={e => onChange(Number(e.target.value) || 0)}
      className={`w-full text-center text-xs py-1.5 border rounded focus:ring-1 focus:ring-indigo-400 outline-none tabular-nums
        ${highlight ? 'border-indigo-300 bg-indigo-50 focus:border-indigo-400' : 'border-gray-200 bg-white focus:border-gray-400'}`}
    />
  );
}

// ─── Amount cell (readonly) ──────────────────────────────────────
function AmtCell({ v, red, green, bold }: { v: number; red?: boolean; green?: boolean; bold?: boolean }) {
  if (v === 0) return <span className="text-gray-300">—</span>;
  return (
    <span className={`tabular-nums text-xs ${bold ? 'font-bold text-sm' : ''} ${red ? 'text-red-600' : green ? 'text-green-700 font-semibold' : 'text-gray-700'}`}>
      {red ? `(${fmtC(v)})` : fmtC(v)}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function PayrollWorksheetPage() {
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const now        = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [adjs, setAdjs] = useState<Record<string, AdjRow>>({});
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  // Load employees
  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-worksheet'],
    queryFn: () => api.get('/employees?isActive=true&pageSize=200').then(r => r.data),
  });
  const employees: any[] = Array.isArray(empData) ? empData
    : Array.isArray(empData?.data) ? empData.data : [];

  // Check if period already run
  const { data: runsData } = useQuery({
    queryKey: ['payroll-runs-check'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
  });
  const runs: any[] = Array.isArray(runsData) ? runsData
    : Array.isArray(runsData?.data) ? runsData.data : [];
  const existingRun = runs.find(r => r.period === period);

  // Adj helpers
  const getAdj = (id: string): AdjRow => adjs[id] ?? defaultAdj();
  const setAdj = (id: string, field: keyof AdjRow, val: number | boolean) =>
    setAdjs(prev => ({ ...prev, [id]: { ...getAdj(id), [field]: val } }));
  const resetAdj = (id: string) =>
    setAdjs(prev => { const n = { ...prev }; delete n[id]; return n; });

  // Calculate all employees
  const calcs = useMemo(() =>
    Object.fromEntries(employees.map(e => [e.id, calcPayroll(e, getAdj(e.id))])),
    [employees, adjs] // eslint-disable-line
  );

  // Totals
  const totals = useMemo(() => {
    const all = Object.values(calcs);
    return {
      gross:   all.reduce((s, c) => s + c.gross,   0),
      travel:  all.reduce((s, c) => s + c.travel,  0),
      tax:     all.reduce((s, c) => s + c.incomeTax, 0),
      ni:      all.reduce((s, c) => s + c.niEmployee + c.hiEmployee, 0),
      pension: all.reduce((s, c) => s + c.pensionEmp, 0),
      net:     all.reduce((s, c) => s + c.net,     0),
      empCost: all.reduce((s, c) => s + c.totalEmployerCost, 0),
    };
  }, [calcs]);

  const warnings = employees.filter(e => !calcs[e.id]?.minimumWageOk);

  // Submit payroll run
  const mutation = useMutation({
    mutationFn: () => api.post('/payroll/run', {
      period,
      adjustments: Object.fromEntries(
        employees
          .filter(e => {
            const a = getAdj(e.id);
            return a.ot125 > 0 || a.ot150 > 0 || a.travelDays !== 21 ||
                   a.recuperation || a.bonus > 0 || a.manualDeduction > 0 ||
                   a.miluimDays > 0 || a.sickDays > 0;
          })
          .map(e => {
            const a = getAdj(e.id);
            return [e.id, {
              overtime125Hours:    a.ot125,
              overtime150Hours:    a.ot150,
              travelWorkDays:      a.travelDays,
              includeRecuperation: a.recuperation,
              bonusAmount:         a.bonus,
              manualDeduction:     a.manualDeduction,
              miluimDays:          a.miluimDays,
              sickDays:            a.sickDays,
            }];
          })
      ),
    }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-runs-check'] });
      const runId = res?.data?.id ?? res?.id;
      if (runId) navigate(`/payroll/runs/${runId}`);
      else navigate('/payroll');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || 'שגיאה בהפעלת שכר');
    },
  });

  // Period options (current + 11 past)
  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: val, label: fmtPeriod(val) };
  });

  return (
    <div dir="rtl" className="flex flex-col h-full -m-6 md:-m-6">

      {/* ── Sticky header ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/payroll')} className="text-gray-400 hover:text-gray-600">
            <ChevronRight className="w-5 h-5" />
          </button>

          <h1 className="text-base font-bold text-gray-900 whitespace-nowrap">גיליון שכר</h1>

          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); setError(''); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {periodOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Warning count */}
          {warnings.length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5" />
              {warnings.length} הפרות שכר מינימום
            </div>
          )}

          {/* Employees count */}
          <span className="text-xs text-gray-400 hidden sm:block">
            {employees.length} עובדים פעילים
          </span>

          {/* Info toggle */}
          <button
            onClick={() => setShowInfo(p => !p)}
            className="text-gray-400 hover:text-indigo-600 transition"
            title="מקרא ומידע"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Totals summary in header */}
          <div className="mr-auto flex items-center gap-4 text-xs text-gray-600 hidden md:flex">
            <span>ברוטו: <strong className="text-gray-900">{fmtC(totals.gross)}</strong></span>
            <span>נטו: <strong className="text-green-700">{fmtC(totals.net)}</strong></span>
            <span>עלות מעסיק: <strong className="text-indigo-700">{fmtC(totals.empCost)}</strong></span>
          </div>

          {/* Run button */}
          {existingRun ? (
            <Link
              to={`/payroll/runs/${existingRun.id}`}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              <Eye className="w-4 h-4" />
              ריצה קיימת ← צפה
            </Link>
          ) : (
            <button
              onClick={() => { setError(''); mutation.mutate(); }}
              disabled={mutation.isPending || employees.length === 0}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              <Play className="w-4 h-4" />
              {mutation.isPending ? 'מעבד...' : `הפעל שכר ${fmtPeriod(period)}`}
            </button>
          )}
        </div>

        {/* Existing run banner */}
        {existingRun && (
          <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            <span>שכר לתקופה <strong>{fmtPeriod(period)}</strong> כבר הופעל (סטאטוס: {existingRun.status}).
            לא ניתן לפתוח שוב את אותה תקופה.</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Info panel */}
        {showInfo && (
          <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-xs text-indigo-700 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="font-bold mb-1">מדרגות מס 2026</p>
              <p>10% עד 7,180 | 14% עד 10,290</p>
              <p>20% עד 16,530 | 31% עד 22,970</p>
              <p>35% עד 47,720 | 47% מעל</p>
            </div>
            <div>
              <p className="font-bold mb-1">ביטוח לאומי עובד</p>
              <p>0.4% עד 7,100 ₪</p>
              <p>7.0% עד 50,200 ₪</p>
              <p className="font-bold mt-1">ביטוח בריאות</p>
              <p>3.1% / 5% (תקרה זהה)</p>
            </div>
            <div>
              <p className="font-bold mb-1">נסיעות</p>
              <p>26 ₪/יום × ימי עבודה</p>
              <p>פטור ממס הכנסה</p>
              <p>חייב ב.ל./בריאות</p>
              <p className="font-bold mt-1">שכר מינימום</p>
              <p>6,300 ₪/חודש (2026)</p>
            </div>
            <div>
              <p className="font-bold mb-1">פנסיה</p>
              <p>עובד: 6% | מעסיק: 6.5%</p>
              <p>פיצויים: 8.33%</p>
              <p className="font-bold mt-1">שע"נ</p>
              <p>שכר÷186 × 1.25 / 1.50</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Warnings bar ─────────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 text-xs text-red-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <strong>הפרת שכר מינימום:</strong>
          {warnings.map(e => `${e.firstName} ${e.lastName} (${fmtC(Number(e.grossSalary))})`).join(' | ')}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {empLoading ? (
          <div className="flex items-center justify-center h-60 text-gray-400 text-sm">טוען עובדים...</div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-gray-400">
            <p>לא נמצאו עובדים פעילים</p>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse" style={{ minWidth: '1100px' }}>
            <thead className="sticky top-0 z-10">
              {/* Column group labels */}
              <tr className="bg-gray-100 border-b border-gray-300">
                <th colSpan={2} className="px-3 py-1.5 text-right font-semibold text-gray-600 border-l border-gray-300 bg-gray-100">עובד</th>
                <th colSpan={6} className="px-3 py-1 text-center font-semibold text-indigo-700 border-l border-gray-300 bg-indigo-50">
                  ← ניתן לעריכה →
                </th>
                <th colSpan={5} className="px-3 py-1 text-center font-semibold text-gray-600 bg-gray-100 border-l border-gray-300">
                  ← חישוב אוטומטי →
                </th>
                <th className="px-2 py-1 bg-gray-100"></th>
              </tr>
              {/* Column headers */}
              <tr className="bg-white border-b-2 border-gray-300">
                {/* Sticky employee column */}
                <th className="sticky right-0 z-20 bg-white text-right px-3 py-2 font-semibold text-gray-700 border-l border-gray-200 w-36 whitespace-nowrap">
                  עובד
                </th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700 border-l border-gray-200 w-20 whitespace-nowrap">
                  שכר בסיס
                </th>
                {/* Editable */}
                <th className="text-center px-2 py-2 font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100 w-16">שע"נ 125%</th>
                <th className="text-center px-2 py-2 font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100 w-16">שע"נ 150%</th>
                <th className="text-center px-2 py-2 font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100 w-14">ימי נסיעה</th>
                <th className="text-center px-2 py-2 font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100 w-12">הבראה</th>
                <th className="text-center px-2 py-2 font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100 w-18">בונוס ₪</th>
                <th className="text-center px-2 py-2 font-semibold text-yellow-700 bg-yellow-50 border-l border-yellow-100 w-14" title="ימי מילואים — לדיווח טופס 126">מילואים</th>
                <th className="text-center px-2 py-2 font-semibold text-yellow-700 bg-yellow-50 border-l border-yellow-100 w-14" title="ימי מחלה — לדיווח">מחלה</th>
                <th className="text-center px-2 py-2 font-semibold text-orange-600 bg-orange-50 border-l border-orange-100 w-18">ניכוי ידני ₪</th>
                {/* Calculated */}
                <th className="text-center px-3 py-2 font-semibold text-gray-700 border-l border-gray-200 w-20 bg-gray-50">ברוטו</th>
                <th className="text-center px-2 py-2 font-semibold text-red-600 border-l border-gray-200 w-18 bg-red-50">מס הכנסה</th>
                <th className="text-center px-2 py-2 font-semibold text-orange-700 border-l border-gray-200 w-18 bg-orange-50">ב.ל.+בריאות</th>
                <th className="text-center px-2 py-2 font-semibold text-blue-700 border-l border-gray-200 w-16 bg-blue-50">פנסיה עובד</th>
                <th className="text-center px-3 py-2 font-bold text-green-700 border-l border-green-200 w-22 bg-green-50">נטו לתשלום</th>
                {/* Actions */}
                <th className="px-2 py-2 w-10 bg-white border-r border-gray-200"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {employees.map((emp: any) => {
                const adj  = getAdj(emp.id);
                const calc = calcs[emp.id];
                const isViolation = !calc.minimumWageOk;
                const hasAdj = adj.ot125 > 0 || adj.ot150 > 0 || adj.travelDays !== 21 ||
                               adj.recuperation || adj.bonus > 0 || adj.manualDeduction > 0;

                return (
                  <tr
                    key={emp.id}
                    className={`hover:bg-gray-50 transition-colors ${isViolation ? 'bg-red-50 hover:bg-red-100' : ''}`}
                  >
                    {/* Employee info — sticky */}
                    <td className={`sticky right-0 z-10 px-3 py-2 border-l border-gray-200 ${isViolation ? 'bg-red-50' : 'bg-white'}`}>
                      <div className="flex items-center gap-1.5">
                        {isViolation
                          ? <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                          : <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                        }
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-gray-400 text-xs truncate max-w-[120px]">
                            {emp.department || emp.jobTitle || ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Base salary */}
                    <td className="px-3 py-2 text-right border-l border-gray-200">
                      <span className="font-medium text-gray-900">{fmtC(Number(emp.grossSalary))}</span>
                      {isViolation && (
                        <p className="text-red-500 text-xs">מתחת למינימום!</p>
                      )}
                    </td>

                    {/* ── EDITABLE cells ────────────────────────── */}
                    <td className="px-1.5 py-1.5 bg-indigo-50 border-l border-indigo-100">
                      <NumCell
                        value={adj.ot125}
                        onChange={v => setAdj(emp.id, 'ot125', v)}
                        max={200}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 bg-indigo-50 border-l border-indigo-100">
                      <NumCell
                        value={adj.ot150}
                        onChange={v => setAdj(emp.id, 'ot150', v)}
                        max={200}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 bg-indigo-50 border-l border-indigo-100">
                      <NumCell
                        value={adj.travelDays}
                        onChange={v => setAdj(emp.id, 'travelDays', Math.min(31, v || 0))}
                        max={31}
                        step={1}
                        placeholder="21"
                        highlight={adj.travelDays !== 21}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 bg-indigo-50 border-l border-indigo-100 text-center">
                      <input
                        type="checkbox"
                        checked={adj.recuperation}
                        onChange={e => setAdj(emp.id, 'recuperation', e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                        title="כלול הבראה חודשית"
                      />
                      {adj.recuperation && (
                        <p className="text-indigo-600 text-xs mt-0.5">{fmtC(calc.recuperation)}</p>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 bg-indigo-50 border-l border-indigo-100">
                      <NumCell
                        value={adj.bonus}
                        onChange={v => setAdj(emp.id, 'bonus', v)}
                        step={100}
                        highlight={adj.bonus > 0}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 bg-yellow-50 border-l border-yellow-100">
                      <NumCell
                        value={adj.miluimDays}
                        onChange={v => setAdj(emp.id, 'miluimDays', v)}
                        max={31}
                        highlight={adj.miluimDays > 0}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 bg-yellow-50 border-l border-yellow-100">
                      <NumCell
                        value={adj.sickDays}
                        onChange={v => setAdj(emp.id, 'sickDays', v)}
                        max={31}
                        highlight={adj.sickDays > 0}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 bg-orange-50 border-l border-orange-100">
                      <NumCell
                        value={adj.manualDeduction}
                        onChange={v => setAdj(emp.id, 'manualDeduction', v)}
                        step={50}
                        highlight={adj.manualDeduction > 0}
                      />
                    </td>

                    {/* ── CALCULATED cells ──────────────────────── */}
                    <td className="px-3 py-2 text-center border-l border-gray-200 bg-gray-50">
                      <p className="font-semibold text-gray-900">{fmtC(calc.gross)}</p>
                      {calc.travel > 0 && (
                        <p className="text-indigo-600 text-xs">+{fmtC(calc.travel)} נסיעות</p>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center border-l border-gray-200 bg-red-50">
                      <AmtCell v={calc.incomeTax} red />
                    </td>
                    <td className="px-2 py-2 text-center border-l border-gray-200 bg-orange-50">
                      <AmtCell v={calc.niEmployee + calc.hiEmployee} red />
                    </td>
                    <td className="px-2 py-2 text-center border-l border-gray-200 bg-blue-50">
                      <AmtCell v={calc.pensionEmp} red />
                    </td>
                    <td className="px-3 py-2 text-center border-l border-green-200 bg-green-50">
                      <p className="font-bold text-green-700">{fmtC(calc.net)}</p>
                      {calc.manualDed > 0 && (
                        <p className="text-orange-600 text-xs">({fmtC(calc.manualDed)} ניכוי)</p>
                      )}
                    </td>

                    {/* Reset button */}
                    <td className="px-1 py-2 text-center border-r border-gray-200">
                      {hasAdj && (
                        <button
                          onClick={() => resetAdj(emp.id)}
                          className="text-gray-300 hover:text-red-400 transition"
                          title="אפס תוספות"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* ── Totals row ────────────────────────────────────── */}
            <tfoot>
              <tr className="bg-gray-900 text-white border-t-2 border-gray-700 sticky bottom-0">
                <td className="sticky right-0 z-10 bg-gray-900 px-3 py-3 border-l border-gray-700">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-bold text-sm">סה"כ {employees.length} עובדים</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right border-l border-gray-700 text-gray-300">
                  {fmtC(employees.reduce((s: number, e: any) => s + Number(e.grossSalary), 0))}
                </td>
                {/* Editable cols (empty in totals) */}
                <td colSpan={6} className="px-3 py-3 border-l border-gray-700 text-center text-gray-600 text-xs">
                  עלות מעסיק כוללת: <span className="text-indigo-300 font-semibold">{fmtC(totals.empCost)}</span>
                </td>
                {/* Calculated totals */}
                <td className="px-3 py-3 text-center border-l border-gray-700 text-white font-bold">
                  {fmtC(totals.gross)}
                  {totals.travel > 0 && <p className="text-indigo-300 text-xs font-normal">+{fmtC(totals.travel)}</p>}
                </td>
                <td className="px-2 py-3 text-center border-l border-gray-700 text-red-300 font-semibold">
                  ({fmtC(totals.tax)})
                </td>
                <td className="px-2 py-3 text-center border-l border-gray-700 text-orange-300 font-semibold">
                  ({fmtC(totals.ni)})
                </td>
                <td className="px-2 py-3 text-center border-l border-gray-700 text-blue-300 font-semibold">
                  ({fmtC(totals.pension)})
                </td>
                <td className="px-3 py-3 text-center border-l border-green-700 text-green-300 font-bold text-sm">
                  {fmtC(totals.net)}
                </td>
                <td className="px-1 py-3 border-r border-gray-700"></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Minimum wage violations detail ───────────────────────── */}
      {warnings.length > 0 && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            הפרות שכר מינימום (חוק שכר מינימום, תשמ"ז-1987) — שכר מינימום: {fmtC(MIN_WAGE)}/חודש
          </p>
          <div className="flex flex-wrap gap-2">
            {warnings.map(e => (
              <span key={e.id} className="text-xs bg-red-100 border border-red-300 text-red-700 px-2 py-0.5 rounded">
                {e.firstName} {e.lastName}: {fmtC(Number(e.grossSalary))} (חסר {fmtC(MIN_WAGE - Number(e.grossSalary))})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
