import { prisma } from '../../config/database';
import { calculatePayslip, PayslipParams } from './payroll.engine';

/**
 * PAYROLL SERVICE
 * Orchestrates payroll run: fetches employees, runs engine, persists payslips.
 * Supports per-employee adjustments (overtime, travel, bonus, etc.)
 */

// ─── Adjustment per employee (passed from the UI/route) ──────────
export interface EmployeeAdjustment {
  overtime125Hours?:     number;   // שעות נוספות 125%
  overtime150Hours?:     number;   // שעות נוספות 150% / שבת / חג
  travelWorkDays?:       number;   // ימי נסיעה
  includeRecuperation?:  boolean;  // האם לכלול הבראה חודשית (1/12)
  bonusAmount?:          number;   // בונוס / תשלומים מיוחדים
  manualDeduction?:      number;   // ניכוי ידני (הלוואה, מס לנוסף וכד')
  partialMonthDays?:     number;   // ימים בפועל (עובד שנכנס/יצא באמצע)
  totalWorkDaysInMonth?: number;   // סה"כ ימי עבודה בחודש
}

// ─── Run Payroll for a Period ─────────────────────────────────────

export async function runPayroll(
  tenantId:    string,
  period:      string,  // "YYYY-MM"
  createdBy:   string,
  adjustments: Record<string, EmployeeAdjustment> = {}
) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Period must be in format YYYY-MM');
  }

  // Check not already run
  const existing = await prisma.payrollRun.findUnique({
    where: { tenantId_period: { tenantId, period } },
  });
  if (existing) {
    throw new Error(`Payroll for period ${period} already exists (status: ${existing.status})`);
  }

  // Fetch all active employees
  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true },
  });

  if (employees.length === 0) {
    throw new Error('No active employees found for this tenant');
  }

  // Derive the period date (first day of the period month)
  const [y, m] = period.split('-').map(Number);
  const periodDate = new Date(y, m - 1, 1);

  // ── Calculate all payslips ────────────────────────────────────
  const payslipData = employees.map((emp) => {
    const adj = adjustments[emp.id] ?? {};

    // Handle partial month
    let base = Number(emp.grossSalary);
    if (adj.partialMonthDays && adj.totalWorkDaysInMonth && adj.totalWorkDaysInMonth > 0) {
      base = Math.round(base * (adj.partialMonthDays / adj.totalWorkDaysInMonth) * 100) / 100;
    }

    const engineParams: PayslipParams = {
      grossSalary:         base,
      taxCreditPoints:     Number(emp.taxCredits),
      pensionEmployeeRate: Number(emp.pensionEmployee),
      pensionEmployerRate: Number(emp.pensionEmployer),
      severancePayRate:    Number(emp.severancePay),
      // Overtime
      hourlyRate:          emp.hourlyRate ? Number(emp.hourlyRate) : undefined,
      overtime125Hours:    adj.overtime125Hours  ?? 0,
      overtime150Hours:    adj.overtime150Hours  ?? 0,
      // Travel
      travelWorkDays:      adj.travelWorkDays    ?? 21,
      // Recuperation
      includeRecuperation: adj.includeRecuperation ?? false,
      startDate:           emp.startDate ? new Date(emp.startDate) : undefined,
      period,
      // Bonus
      bonusAmount:         adj.bonusAmount ?? 0,
    };

    const calc = calculatePayslip(engineParams);

    // Apply manual deduction (loan repayment, etc.) — reduce net
    const manualDeduction = adj.manualDeduction ?? 0;
    if (manualDeduction > 0) {
      calc.netSalary     = Math.max(0, Math.round((calc.netSalary - manualDeduction) * 100) / 100);
      calc.totalDeductions = Math.round((calc.totalDeductions + manualDeduction) * 100) / 100;
    }

    return { emp, calc, adj, base, manualDeduction };
  });

  // ── Totals ────────────────────────────────────────────────────
  const totalGross   = payslipData.reduce((s, p) => s + p.calc.grossSalary,                   0);
  const totalNet     = payslipData.reduce((s, p) => s + p.calc.netSalary,                      0);
  const totalTax     = payslipData.reduce((s, p) => s + p.calc.incomeTax,                      0);
  const totalNI      = payslipData.reduce((s, p) => s + p.calc.nationalInsuranceEmployee,      0);
  const totalPension = payslipData.reduce((s, p) => s + p.calc.pensionEmployer,                0);

  // ── Persist in transaction ────────────────────────────────────
  const run = await prisma.$transaction(async (tx) => {
    const payrollRun = await tx.payrollRun.create({
      data: {
        tenantId,
        period,
        status:      'DRAFT',
        totalGross:  Math.round(totalGross   * 100) / 100,
        totalNet:    Math.round(totalNet     * 100) / 100,
        totalTax:    Math.round(totalTax     * 100) / 100,
        totalNI:     Math.round(totalNI      * 100) / 100,
        totalPension:Math.round(totalPension * 100) / 100,
      },
    });

    for (const { emp, calc, adj, manualDeduction } of payslipData) {
      await tx.payslip.create({
        data: {
          payrollRunId:      payrollRun.id,
          employeeId:        emp.id,
          tenantId,
          period,
          grossSalary:       calc.grossSalary,
          taxableIncome:     calc.taxableIncome,
          incomeTax:         calc.incomeTax,
          nationalInsurance: calc.nationalInsuranceEmployee,
          healthInsurance:   calc.healthInsuranceEmployee,
          pensionEmployee:   calc.pensionEmployee,
          netSalary:         calc.netSalary,
          pensionEmployer:   calc.pensionEmployer,
          severancePay:      calc.severancePay,
          niEmployer:        calc.nationalInsuranceEmployer,
          totalEmployerCost: calc.totalEmployerCost,
          // Full breakdown in JSON (includes overtime, travel, recuperation, accruals)
          breakdown: {
            ...calc,
            // Extra context
            manualDeduction,
            adjustments: {
              overtime125Hours:    adj.overtime125Hours   ?? 0,
              overtime150Hours:    adj.overtime150Hours   ?? 0,
              travelWorkDays:      adj.travelWorkDays     ?? 21,
              includeRecuperation: adj.includeRecuperation ?? false,
              bonusAmount:         adj.bonusAmount        ?? 0,
            },
            // Employee snapshot at time of calculation
            employeeSnapshot: {
              pensionFund:     emp.pensionFund,
              employmentType:  emp.employmentType,
              jobTitle:        emp.jobTitle,
              department:      emp.department,
              startDate:       emp.startDate,
              bankAccount:     emp.bankAccount,
              taxCredits:      Number(emp.taxCredits),
              pensionEmployee: Number(emp.pensionEmployee),
              pensionEmployer: Number(emp.pensionEmployer),
              severancePay:    Number(emp.severancePay),
            },
          } as any,
        },
      });
    }

    return payrollRun;
  });

  // Emit warnings for minimum wage violations
  const violations = payslipData.filter(p => !p.calc.minimumWageOk);
  if (violations.length > 0) {
    console.warn(
      `[PAYROLL] ⚠ Minimum wage violations for period ${period}:`,
      violations.map(v => `${v.emp.firstName} ${v.emp.lastName} (${v.calc.grossSalary} < ${v.calc.minimumWage})`)
    );
  }

  return {
    ...run,
    warnings: violations.map(v => ({
      employeeId: v.emp.id,
      name:       `${v.emp.firstName} ${v.emp.lastName}`,
      salary:     v.calc.grossSalary,
      minimum:    v.calc.minimumWage,
      message:    `שכר מינימום מופר! ${v.calc.grossSalary} ₪ < ${v.calc.minimumWage} ₪`,
    })),
  };
}

// ─── Approve Payroll Run ──────────────────────────────────────────

export async function approvePayrollRun(
  payrollRunId: string,
  tenantId:     string,
  approvedBy:   string
) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!run || run.tenantId !== tenantId) throw new Error('Payroll run not found');
  if (run.status !== 'DRAFT') throw new Error(`Cannot approve run in status: ${run.status}`);

  const updated = await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data:  { status: 'APPROVED', approvedBy, approvedAt: new Date() },
  });

  // Auto GL posting (non-blocking)
  // DR: הוצאות שכר (6100) | CR: חובות שכר (3500) + מס (3400) + ב.ל./פנסיה (3300)
  try {
    const [accSalExp, accSalPay, accTax, accNI] = await Promise.all([
      prisma.account.findFirst({ where: { tenantId, code: '6100', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '3500', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '3400', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '3300', isActive: true } }),
    ]);

    if (accSalExp && accSalPay && accTax && accNI) {
      const gross   = Number(run.totalGross);
      const net     = Number(run.totalNet);
      const tax     = Number(run.totalTax);
      const pension = Number(run.totalPension);
      const niAndPension = gross + pension - net - tax;

      await prisma.transaction.create({
        data: {
          tenantId,
          date:        new Date(),
          reference:   `PAY-${run.period}`,
          description: `שכר חודשי — ${run.period}`,
          sourceType:  'PAYROLL',
          sourceId:    payrollRunId,
          totalAmount: net + tax + niAndPension,
          status:      'POSTED',
          postedAt:    new Date(),
          createdBy:   approvedBy,
          lines: {
            create: [
              { debitAccountId: accSalExp.id, creditAccountId: accSalPay.id, amount: net,            description: 'שכר נטו לעובדים',    sortOrder: 0 },
              { debitAccountId: accSalExp.id, creditAccountId: accTax.id,    amount: tax,            description: 'ניכוי מס הכנסה',      sortOrder: 1 },
              { debitAccountId: accSalExp.id, creditAccountId: accNI.id,     amount: niAndPension + pension, description: 'ביטוח לאומי ופנסיה', sortOrder: 2 },
            ],
          },
        },
      });
    }
  } catch { /* GL is advisory */ }

  return updated;
}

// ─── Mark as Paid ─────────────────────────────────────────────────

export async function markPayrollPaid(payrollRunId: string, tenantId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!run || run.tenantId !== tenantId) throw new Error('Payroll run not found');
  if (run.status !== 'APPROVED') throw new Error('Payroll must be APPROVED before marking as PAID');

  const updated = await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data:  { status: 'PAID', paidAt: new Date() },
  });

  // DR: חובות שכר (3500) → CR: חשבון בנק (1200)
  try {
    const [accSalPay, accBank] = await Promise.all([
      prisma.account.findFirst({ where: { tenantId, code: '3500', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '1200', isActive: true } }),
    ]);
    if (accSalPay && accBank) {
      const totalNet = Number(run.totalNet);
      await prisma.transaction.create({
        data: {
          tenantId,
          date:        new Date(),
          reference:   `PAY-CASH-${run.period}`,
          description: `תשלום שכר — ${run.period}`,
          sourceType:  'PAYROLL',
          sourceId:    payrollRunId,
          totalAmount: totalNet,
          status:      'POSTED',
          postedAt:    new Date(),
          createdBy:   tenantId,
          lines: {
            create: [{
              debitAccountId:  accSalPay.id,
              creditAccountId: accBank.id,
              amount:          totalNet,
              description:     `ניקוי חובות שכר ${run.period}`,
              sortOrder:       0,
            }],
          },
        },
      });
    }
  } catch { /* GL is advisory */ }

  return updated;
}

// ─── Get Payslip ──────────────────────────────────────────────────

export async function getPayslip(payslipId: string, tenantId: string) {
  const payslip = await prisma.payslip.findUnique({
    where:   { id: payslipId },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, idNumber: true,
          jobTitle: true, department: true, startDate: true,
          taxCredits: true, pensionEmployee: true, pensionEmployer: true,
          severancePay: true, pensionFund: true, employmentType: true,
          bankAccount: true, phone: true,
        },
      },
      payrollRun: { select: { period: true, status: true } },
    },
  });

  if (!payslip || payslip.tenantId !== tenantId) {
    throw new Error('Payslip not found');
  }

  return payslip;
}

// ─── Preview (without saving) ─────────────────────────────────────

export async function previewEmployeePayslip(
  employeeId: string,
  tenantId:   string,
  adjustment?: EmployeeAdjustment
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.tenantId !== tenantId) throw new Error('Employee not found');

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const params: PayslipParams = {
    grossSalary:         Number(emp.grossSalary),
    taxCreditPoints:     Number(emp.taxCredits),
    pensionEmployeeRate: Number(emp.pensionEmployee),
    pensionEmployerRate: Number(emp.pensionEmployer),
    severancePayRate:    Number(emp.severancePay),
    hourlyRate:          emp.hourlyRate ? Number(emp.hourlyRate) : undefined,
    overtime125Hours:    adjustment?.overtime125Hours  ?? 0,
    overtime150Hours:    adjustment?.overtime150Hours  ?? 0,
    travelWorkDays:      adjustment?.travelWorkDays    ?? 21,
    includeRecuperation: adjustment?.includeRecuperation ?? false,
    startDate:           emp.startDate ? new Date(emp.startDate) : undefined,
    period,
    bonusAmount:         adjustment?.bonusAmount ?? 0,
  };

  return calculatePayslip(params);
}

// ─── Monthly Report (for 102 form) ───────────────────────────────

export async function getMonthlyReport(tenantId: string, period: string) {
  const run = await prisma.payrollRun.findUnique({
    where:   { tenantId_period: { tenantId, period } },
    include: {
      payslips: {
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, idNumber: true,
              taxCredits: true, pensionFund: true,
            },
          },
        },
      },
    },
  });

  if (!run) throw new Error(`No payroll run found for period ${period}`);

  const payslips = run.payslips;
  const totalGross   = payslips.reduce((s, p) => s + Number(p.grossSalary),       0);
  const totalTax     = payslips.reduce((s, p) => s + Number(p.incomeTax),         0);
  const totalNIEmp   = payslips.reduce((s, p) => s + Number(p.nationalInsurance), 0);
  const totalHIEmp   = payslips.reduce((s, p) => s + Number(p.healthInsurance),   0);
  const totalNIEr    = payslips.reduce((s, p) => s + Number(p.niEmployer),        0);
  const totalPenEmp  = payslips.reduce((s, p) => s + Number(p.pensionEmployee),   0);
  const totalPenEr   = payslips.reduce((s, p) => s + Number(p.pensionEmployer),   0);
  const totalSev     = payslips.reduce((s, p) => s + Number(p.severancePay),      0);

  return {
    period,
    status: run.status,
    paidAt: run.paidAt,
    employeeCount: payslips.length,

    // ── For Tax Authority (ניכויים) ──────────────────────────
    totalGross,
    totalTax,         // יש לשלם לרשות המסים
    totalNIEmployee:  totalNIEmp + totalHIEmp,  // ב.ל. + בריאות עובד
    totalNIEmployer:  totalNIEr,                // ב.ל. מעסיק
    totalNITotal:     totalNIEmp + totalHIEmp + totalNIEr, // הכל לב.ל.

    // ── Pension (לקרן פנסיה) ──────────────────────────────
    totalPensionEmployee: totalPenEmp,
    totalPensionEmployer: totalPenEr,
    totalSeverance:       totalSev,
    totalPensionTotal:    totalPenEmp + totalPenEr + totalSev,

    // ── Per-employee detail ───────────────────────────────
    employees: payslips.map(p => ({
      employeeId:    p.employeeId,
      idNumber:      p.employee?.idNumber,
      name:          `${p.employee?.firstName} ${p.employee?.lastName}`,
      taxCredits:    p.employee?.taxCredits,
      pensionFund:   p.employee?.pensionFund,
      gross:         Number(p.grossSalary),
      incomeTax:     Number(p.incomeTax),
      niEmployee:    Number(p.nationalInsurance),
      hiEmployee:    Number(p.healthInsurance),
      niEmployer:    Number(p.niEmployer),
      pensionEmp:    Number(p.pensionEmployee),
      pensionEr:     Number(p.pensionEmployer),
      severance:     Number(p.severancePay),
      net:           Number(p.netSalary),
    })),
  };
}
