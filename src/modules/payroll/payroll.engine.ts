/**
 * PAYROLL ENGINE - Israeli Labor Law (2026)
 *
 * Calculations based on:
 * - Income Tax Ordinance (פקודת מס הכנסה)
 * - National Insurance Law (חוק הביטוח הלאומי)
 * - Pension Comprehensive Order (צו פנסיה חובה)
 *
 * Last updated: March 2026 (tax year 2026)
 */

import { PayslipCalculation, TaxBracket } from '../../shared/types';

// ─── 2026 Tax Brackets (Monthly, ILS) ────────────────────────────
// Source: רשות המסים - מדרגות מס הכנסה 2026
const INCOME_TAX_BRACKETS_MONTHLY: TaxBracket[] = [
  { min: 0,      max: 7_180,  rate: 0.10 },
  { min: 7_180,  max: 10_290, rate: 0.14 },
  { min: 10_290, max: 16_530, rate: 0.20 },
  { min: 16_530, max: 22_970, rate: 0.31 },
  { min: 22_970, max: 47_720, rate: 0.35 },
  { min: 47_720, max: null,   rate: 0.47 },
];

// Value of one tax credit point per month (2026) - נקודת זיכוי
const TAX_CREDIT_POINT_VALUE_MONTHLY = 248; // ₪ per point

// ─── National Insurance Brackets (Monthly, ILS) ──────────────────
// ביטוח לאומי 2026
const NI_THRESHOLD_MONTHLY      = 7_700;   // תקרה נמוכה (60% משכר ממוצע)
const NI_CEILING_MONTHLY        = 50_200;  // תקרת שכר מקסימלי

// Employee rates
const NI_EMPLOYEE_RATE_BELOW    = 0.035;   // 3.5% עד תקרה נמוכה
const NI_EMPLOYEE_RATE_ABOVE    = 0.12;    // 12%  מעל תקרה נמוכה
const HEALTH_EMPLOYEE_RATE_BELOW = 0.031;  // 3.1% בריאות
const HEALTH_EMPLOYEE_RATE_ABOVE = 0.05;   // 5%   בריאות

// Employer rates
const NI_EMPLOYER_RATE_BELOW    = 0.035;   // 3.55% מעסיק
const NI_EMPLOYER_RATE_ABOVE    = 0.075;   // 7.6%  מעסיק

// ─── Income Tax Calculator ────────────────────────────────────────

function calculateIncomeTax(
  monthlyGross: number,
  taxCreditPoints: number
): {
  incomeTax: number;
  taxCreditsAmount: number;
  bracketBreakdown: PayslipCalculation['taxBracketBreakdown'];
} {
  let remainingIncome = Math.max(monthlyGross, 0);
  let totalTax = 0;
  const bracketBreakdown: PayslipCalculation['taxBracketBreakdown'] = [];

  for (const bracket of INCOME_TAX_BRACKETS_MONTHLY) {
    if (remainingIncome <= 0) break;

    const bracketSize =
      bracket.max !== null
        ? bracket.max - bracket.min
        : Infinity;

    const taxableInBracket = Math.min(remainingIncome, bracketSize);
    const taxInBracket     = taxableInBracket * bracket.rate;

    bracketBreakdown.push({
      min:          bracket.min,
      max:          bracket.max,
      rate:         bracket.rate,
      taxableAmount: taxableInBracket,
      taxAmount:     taxInBracket,
    });

    totalTax        += taxInBracket;
    remainingIncome -= taxableInBracket;
  }

  // Tax credits reduce the final tax (not the income)
  const taxCreditsAmount = taxCreditPoints * TAX_CREDIT_POINT_VALUE_MONTHLY;
  const incomeTax        = Math.max(totalTax - taxCreditsAmount, 0);

  return { incomeTax, taxCreditsAmount, bracketBreakdown };
}

// ─── National Insurance Calculator ───────────────────────────────

function calculateNationalInsurance(monthlyGross: number): {
  niEmployee:     number;
  healthEmployee: number;
  niEmployer:     number;
} {
  const cappedSalary = Math.min(monthlyGross, NI_CEILING_MONTHLY);

  // Employee
  const belowThreshold = Math.min(cappedSalary, NI_THRESHOLD_MONTHLY);
  const aboveThreshold = Math.max(cappedSalary - NI_THRESHOLD_MONTHLY, 0);

  const niEmployee = (belowThreshold * NI_EMPLOYEE_RATE_BELOW) +
                     (aboveThreshold * NI_EMPLOYEE_RATE_ABOVE);

  const healthEmployee = (belowThreshold * HEALTH_EMPLOYEE_RATE_BELOW) +
                         (aboveThreshold * HEALTH_EMPLOYEE_RATE_ABOVE);

  // Employer
  const niEmployer = (belowThreshold * NI_EMPLOYER_RATE_BELOW) +
                     (aboveThreshold * NI_EMPLOYER_RATE_ABOVE);

  return {
    niEmployee:     round2(niEmployee),
    healthEmployee: round2(healthEmployee),
    niEmployer:     round2(niEmployer),
  };
}

// ─── Pension Calculator ───────────────────────────────────────────

function calculatePension(
  grossSalary: number,
  pensionEmployeeRate: number,   // e.g. 6.00 (percent)
  pensionEmployerRate: number,   // e.g. 6.50
  severancePayRate:   number     // e.g. 8.33
): {
  pensionEmployee: number;
  pensionEmployer: number;
  severancePay:   number;
} {
  return {
    pensionEmployee: round2(grossSalary * (pensionEmployeeRate / 100)),
    pensionEmployer: round2(grossSalary * (pensionEmployerRate / 100)),
    severancePay:    round2(grossSalary * (severancePayRate   / 100)),
  };
}

// ─── Main Payslip Calculator ──────────────────────────────────────

export function calculatePayslip(params: {
  grossSalary:        number;
  taxCreditPoints:    number;  // נקודות זיכוי (e.g. 2.25)
  pensionEmployeeRate: number; // % (e.g. 6.00)
  pensionEmployerRate: number; // % (e.g. 6.50)
  severancePayRate:   number;  // % (e.g. 8.33)
}): PayslipCalculation {
  const {
    grossSalary,
    taxCreditPoints,
    pensionEmployeeRate,
    pensionEmployerRate,
    severancePayRate,
  } = params;

  if (grossSalary < 0) throw new Error('Gross salary cannot be negative');

  // 1. Income tax
  const { incomeTax, taxCreditsAmount, bracketBreakdown } =
    calculateIncomeTax(grossSalary, taxCreditPoints);

  // 2. National Insurance
  const { niEmployee, healthEmployee, niEmployer } =
    calculateNationalInsurance(grossSalary);

  // 3. Pension
  const { pensionEmployee, pensionEmployer, severancePay } =
    calculatePension(grossSalary, pensionEmployeeRate, pensionEmployerRate, severancePayRate);

  // 4. Net Salary = Gross - all employee deductions
  const totalDeductions = incomeTax + niEmployee + healthEmployee + pensionEmployee;
  const netSalary       = round2(grossSalary - totalDeductions);

  // 5. Total employer cost
  const totalEmployerCost = round2(
    grossSalary + pensionEmployer + severancePay + niEmployer
  );

  return {
    grossSalary,
    taxableIncome:            grossSalary,   // simplification; may subtract pension in advanced mode
    incomeTax:                round2(incomeTax),
    taxCreditsAmount:         round2(taxCreditsAmount),
    nationalInsuranceEmployee: niEmployee,
    healthInsuranceEmployee:   healthEmployee,
    pensionEmployee,
    netSalary,
    pensionEmployer,
    severancePay,
    nationalInsuranceEmployer: niEmployer,
    totalEmployerCost,
    taxBracketBreakdown:       bracketBreakdown,
  };
}

// ─── Utility ──────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
