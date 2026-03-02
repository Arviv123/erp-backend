/**
 * Payroll Engine Unit Tests (2026 tax brackets)
 * Run with: npx vitest
 *
 * Manual verification for key values:
 * ─────────────────────────────────
 * 5,880 ₪ minimum wage:
 *   Bracket 1: 5,880 × 10% = 588
 *   Credits:   2.25 × 248  = 558
 *   Tax:       588 − 558   = 30 ₪
 *
 * 10,000 ₪:
 *   Bracket 1: 7,180 × 10%  = 718.0
 *   Bracket 2: 2,820 × 14%  = 394.8
 *   Gross tax: 1,112.8 − 558 = 554.8 ₪
 *   NI:        7,700×3.5% + 2,300×12%  = 269.5 + 276 = 545.5
 *   Health:    7,700×3.1% + 2,300×5%   = 238.7 + 115 = 353.7
 *   Pension:   10,000 × 6%             = 600
 *   Net:       10,000 − 554.8 − 545.5 − 353.7 − 600 = 7,946 ₪
 */

import { describe, it, expect } from 'vitest';
import { calculatePayslip } from '../payroll.engine';

const DEFAULT_PARAMS = {
  taxCreditPoints:     2.25,
  pensionEmployeeRate: 6.00,
  pensionEmployerRate: 6.50,
  severancePayRate:    8.33,
};

describe('Payroll Engine 2026', () => {

  // ─── Gross → Net ─────────────────────────────────────────────

  it('minimum wage (5,880 ₪) — income tax = 30 ₪ (not zero)', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 5_880 });

    expect(result.grossSalary).toBe(5_880);
    // Tax = 5,880×10% − 2.25×248 = 588 − 558 = 30
    expect(result.incomeTax).toBeCloseTo(30, 0);
    expect(result.netSalary).toBeGreaterThan(0);
    expect(result.netSalary).toBeLessThan(5_880);
    // Net = 5,880 − 30 − 205.8 − 182.28 − 352.8 ≈ 5,109
    expect(result.netSalary).toBeCloseTo(5_109, 0);
  });

  it('10,000 ₪ gross — correct income tax and net salary', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 10_000 });

    // Tax = 718 + 394.8 − 558 = 554.8
    expect(result.incomeTax).toBeCloseTo(554.8, 0);
    expect(result.incomeTax).toBeGreaterThan(500);
    expect(result.incomeTax).toBeLessThan(620);

    // Net = 10,000 − 554.8 − 545.5 − 353.7 − 600 = 7,946
    expect(result.netSalary).toBeCloseTo(7_946, 0);
    expect(result.netSalary).toBeGreaterThan(7_800);
    expect(result.netSalary).toBeLessThan(8_200);
  });

  it('30,000 ₪ gross should hit the 35% bracket', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 30_000 });

    const bracketsWith35 = result.taxBracketBreakdown.some(b => b.rate === 0.35);
    expect(bracketsWith35).toBe(true);
    expect(result.incomeTax).toBeGreaterThan(5_000);
  });

  it('80,000 ₪ gross should hit the 47% bracket', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 80_000 });

    const bracketsWith47 = result.taxBracketBreakdown.some(b => b.rate === 0.47);
    expect(bracketsWith47).toBe(true);
    expect(result.incomeTax).toBeGreaterThan(20_000);
  });

  it('tax credits: exact value matches 2.25 × 248 = 558 ₪', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 15_000 });
    expect(result.taxCreditsAmount).toBeCloseTo(558, 0);
  });

  // ─── Net Salary Identity ───────────────────────────────────────

  it('net salary = gross − (tax + NI + health + pension_employee)', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 15_000 });

    const expectedNet =
      result.grossSalary
      - result.incomeTax
      - result.nationalInsuranceEmployee
      - result.healthInsuranceEmployee
      - result.pensionEmployee;

    expect(result.netSalary).toBeCloseTo(expectedNet, 1);
  });

  it('net salary is always positive and below gross', () => {
    for (const gross of [5_000, 10_000, 20_000, 50_000]) {
      const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: gross });
      expect(result.netSalary).toBeGreaterThan(0);
      expect(result.netSalary).toBeLessThan(gross);
    }
  });

  // ─── Pension ──────────────────────────────────────────────────

  it('pension calculation matches rates exactly', () => {
    const gross  = 12_000;
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: gross });

    expect(result.pensionEmployee).toBeCloseTo(gross * 0.06,   1);  // 6%
    expect(result.pensionEmployer).toBeCloseTo(gross * 0.065,  1);  // 6.5%
    expect(result.severancePay).toBeCloseTo(gross   * 0.0833,  1);  // 8.33%
  });

  // ─── National Insurance ───────────────────────────────────────

  it('national insurance for 5,880 ₪ — all below 7,700 threshold', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 5_880 });
    expect(result.nationalInsuranceEmployee).toBeCloseTo(5_880 * 0.035, 1);
    expect(result.healthInsuranceEmployee).toBeCloseTo(5_880 * 0.031, 1);
  });

  it('national insurance above threshold uses two-tier rate', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 20_000 });
    // Below 7,700: 3.5%  Above: 12%
    const expectedNI =
      7_700 * 0.035 +
      (20_000 - 7_700) * 0.12;
    expect(result.nationalInsuranceEmployee).toBeCloseTo(expectedNI, 1);
  });

  it('national insurance should not exceed ceiling (50,200)', () => {
    const high = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 100_000 });
    const cap  = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 50_200 });

    expect(high.nationalInsuranceEmployee)
      .toBeCloseTo(cap.nationalInsuranceEmployee, 0);
    expect(high.healthInsuranceEmployee)
      .toBeCloseTo(cap.healthInsuranceEmployee, 0);
  });

  // ─── Tax Credits ──────────────────────────────────────────────

  it('more tax credit points = less income tax', () => {
    const gross  = 15_000;
    const r225   = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: gross, taxCreditPoints: 2.25 });
    const r300   = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: gross, taxCreditPoints: 3.00 });
    const r400   = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: gross, taxCreditPoints: 4.00 });

    expect(r225.incomeTax).toBeGreaterThan(r300.incomeTax);
    expect(r300.incomeTax).toBeGreaterThan(r400.incomeTax);
    expect(r225.netSalary).toBeLessThan(r300.netSalary);

    // Each extra credit point = 248 ₪ less tax
    const diff = r225.incomeTax - r300.incomeTax;
    expect(diff).toBeCloseTo(0.75 * 248, 0); // 0.75 extra points × 248 ₪
  });

  it('tax credits cannot make income tax negative — floored at 0', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 1_000, taxCreditPoints: 10 });
    expect(result.incomeTax).toBe(0);
  });

  // ─── Employer Cost ────────────────────────────────────────────

  it('total employer cost > gross salary', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 10_000 });
    expect(result.totalEmployerCost).toBeGreaterThan(10_000);
  });

  it('employer cost = gross + pension_employer + severance + NI_employer', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 10_000 });

    const expected =
      result.grossSalary
      + result.pensionEmployer
      + result.severancePay
      + result.nationalInsuranceEmployer;

    expect(result.totalEmployerCost).toBeCloseTo(expected, 1);
  });

  // ─── Edge Cases ───────────────────────────────────────────────

  it('zero salary → all deductions are zero', () => {
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: 0 });
    expect(result.incomeTax).toBe(0);
    expect(result.netSalary).toBe(0);
    expect(result.nationalInsuranceEmployee).toBe(0);
    expect(result.pensionEmployee).toBe(0);
    expect(result.totalEmployerCost).toBe(0);
  });

  it('negative salary throws error', () => {
    expect(() =>
      calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: -1000 })
    ).toThrow('Gross salary cannot be negative');
  });

  it('bracket breakdown covers the full gross income', () => {
    const gross  = 25_000;
    const result = calculatePayslip({ ...DEFAULT_PARAMS, grossSalary: gross });
    const covered = result.taxBracketBreakdown.reduce((s, b) => s + b.taxableAmount, 0);
    expect(covered).toBeCloseTo(gross, 0);
  });
});
