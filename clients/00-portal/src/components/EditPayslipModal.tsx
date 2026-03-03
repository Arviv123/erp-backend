import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../lib/api';

// ─── Minimal frontend calculation (mirrors backend engine) ────────
const TAX_BRACKETS = [
  { max: 7_180,    rate: 0.10 },
  { max: 10_290,   rate: 0.14 },
  { max: 16_530,   rate: 0.20 },
  { max: 22_970,   rate: 0.31 },
  { max: 47_720,   rate: 0.35 },
  { max: Infinity, rate: 0.47 },
];
const CREDIT_POINT = 248;

function calcTax(taxable: number, credits: number): number {
  let tax = 0, prev = 0;
  for (const { max, rate } of TAX_BRACKETS) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, max) - prev) * rate;
    prev = max;
  }
  return Math.max(0, Math.round((tax - credits * CREDIT_POINT) * 100) / 100);
}

function calcNI(base: number): { employee: number; health: number } {
  const lo = Math.min(base, 7_100);
  const hi = Math.max(0, Math.min(base, 50_200) - 7_100);
  return {
    employee: Math.round((lo * 0.004 + hi * 0.07) * 100) / 100,
    health:   Math.round((lo * 0.031 + hi * 0.05)  * 100) / 100,
  };
}

function getRecupDays(startDate?: string): number {
  if (!startDate) return 5;
  const years = (Date.now() - new Date(startDate).getTime()) / 31_536_000_000;
  if (years < 1) return 5; if (years < 3) return 6; if (years < 5) return 7;
  if (years < 10) return 8; if (years < 15) return 9; return 10;
}

interface Props {
  payslip: any;
  employee: any;
  runId: string;
  onClose: () => void;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export default function EditPayslipModal({ payslip, employee, runId, onClose }: Props) {
  const qc = useQueryClient();
  const bd = (payslip.breakdown ?? {}) as any;
  const prevAdj = bd.adjustments ?? {};

  const [ot125,    setOt125]    = useState(String(prevAdj.overtime125Hours   ?? 0));
  const [ot150,    setOt150]    = useState(String(prevAdj.overtime150Hours   ?? 0));
  const [travel,   setTravel]   = useState(String(prevAdj.travelWorkDays     ?? 21));
  const [recup,    setRecup]    = useState<boolean>(prevAdj.includeRecuperation ?? false);
  const [bonus,    setBonus]    = useState(String(prevAdj.bonusAmount        ?? 0));
  const [deduct,   setDeduct]   = useState(String(bd.manualDeduction         ?? 0));

  // Live preview calculation
  const preview = useMemo(() => {
    const base         = Number(employee.grossSalary ?? 0);
    const credits      = Number(employee.taxCredits   ?? 2.25);
    const pensEmpRate  = Number(employee.pensionEmployee ?? 6) / 100;
    const hourlyRate   = base / 186;

    const ot125Pay  = Math.round(hourlyRate * 1.25 * Number(ot125)  * 100) / 100;
    const ot150Pay  = Math.round(hourlyRate * 1.50 * Number(ot150)  * 100) / 100;
    const travelPay = Math.round(26 * Number(travel) * 100) / 100;
    const recupPay  = recup ? Math.round(getRecupDays(employee.startDate) * 432 / 12 * 100) / 100 : 0;
    const bonusPay  = Number(bonus);

    const grossSalary  = base + ot125Pay + ot150Pay + recupPay + bonusPay;
    const taxableIncome = grossSalary; // travel is tax-exempt
    const grossForNI    = grossSalary + travelPay;

    const incomeTax  = calcTax(taxableIncome, credits);
    const { employee: niEmp, health } = calcNI(grossForNI);
    const pension    = Math.round(grossSalary * pensEmpRate * 100) / 100;
    const deductions = incomeTax + niEmp + health + pension + Number(deduct);
    const net        = Math.max(0, Math.round((grossSalary + travelPay - deductions) * 100) / 100);

    return { grossSalary, travelPay, incomeTax, niEmp, health, pension, net };
  }, [ot125, ot150, travel, recup, bonus, deduct, employee]);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/payroll/payslips/${payslip.id}`, {
      overtime125Hours:    Number(ot125),
      overtime150Hours:    Number(ot150),
      travelWorkDays:      Number(travel),
      includeRecuperation: recup,
      bonusAmount:         Number(bonus),
      manualDeduction:     Number(deduct),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-run', runId] });
      onClose();
    },
  });

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">עריכת תלוש</h3>
            <p className="text-xs text-gray-500">{employee.firstName} {employee.lastName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Base salary (read-only) */}
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-sm flex justify-between">
            <span className="text-gray-500">שכר יסוד</span>
            <span className="font-semibold">{fmtCurrency(Number(employee.grossSalary))}</span>
          </div>

          {/* Adjustments */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">שע"נ 125% (שעות)</label>
              <input type="number" min="0" step="0.5" className={inputCls} value={ot125} onChange={e => setOt125(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">שע"נ 150% (שעות)</label>
              <input type="number" min="0" step="0.5" className={inputCls} value={ot150} onChange={e => setOt150(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ימי נסיעה</label>
              <input type="number" min="0" max="31" className={inputCls} value={travel} onChange={e => setTravel(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">בונוס (₪)</label>
              <input type="number" min="0" className={inputCls} value={bonus} onChange={e => setBonus(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ניכוי ידני (₪)</label>
              <input type="number" min="0" className={inputCls} value={deduct} onChange={e => setDeduct(e.target.value)} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={recup} onChange={e => setRecup(e.target.checked)} className="w-4 h-4 text-indigo-600" />
                <span className="text-gray-700">הבראה חודשית</span>
              </label>
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-indigo-50 rounded-xl p-4 text-sm space-y-1.5">
            <p className="text-xs font-semibold text-indigo-700 mb-2">תצוגה מקדימה</p>
            <div className="flex justify-between"><span className="text-gray-600">ברוטו</span><span className="font-medium">{fmtCurrency(preview.grossSalary)}</span></div>
            {preview.travelPay > 0 && <div className="flex justify-between"><span className="text-gray-500">+ נסיעות (פטור)</span><span>{fmtCurrency(preview.travelPay)}</span></div>}
            <div className="flex justify-between text-red-600"><span>מס הכנסה</span><span>({fmtCurrency(preview.incomeTax)})</span></div>
            <div className="flex justify-between text-red-500"><span>ב.ל. + בריאות</span><span>({fmtCurrency(preview.niEmp + preview.health)})</span></div>
            <div className="flex justify-between text-red-500"><span>פנסיה עובד</span><span>({fmtCurrency(preview.pension)})</span></div>
            <div className="border-t border-indigo-200 pt-2 flex justify-between font-bold text-indigo-700">
              <span>נטו לתשלום</span><span>{fmtCurrency(preview.net)}</span>
            </div>
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-600">{(mutation.error as any)?.response?.data?.error ?? 'שגיאה בשמירה'}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-2.5 rounded-xl text-sm font-semibold transition">
            {mutation.isPending ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button onClick={onClose}
            className="px-5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm transition">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
