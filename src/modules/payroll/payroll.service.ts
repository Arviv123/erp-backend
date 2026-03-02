import { prisma } from '../../config/database';
import { calculatePayslip } from './payroll.engine';

/**
 * PAYROLL SERVICE
 * Orchestrates payroll run: fetches employees, runs engine, persists payslips.
 * Uses a PostgreSQL transaction to ensure all-or-nothing atomicity.
 */

// ─── Run Payroll for a Period ─────────────────────────────────────

export async function runPayroll(
  tenantId: string,
  period: string, // "2025-01"
  createdBy: string
) {
  // Validate period format
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

  // Fetch all active employees for this tenant
  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true },
  });

  if (employees.length === 0) {
    throw new Error('No active employees found for this tenant');
  }

  // Calculate all payslips
  const payslipData = employees.map((emp) => {
    const calc = calculatePayslip({
      grossSalary:         Number(emp.grossSalary),
      taxCreditPoints:     Number(emp.taxCredits),
      pensionEmployeeRate: Number(emp.pensionEmployee),
      pensionEmployerRate: Number(emp.pensionEmployer),
      severancePayRate:    Number(emp.severancePay),
    });

    return { emp, calc };
  });

  // Totals
  const totalGross   = payslipData.reduce((s, p) => s + p.calc.grossSalary,          0);
  const totalNet     = payslipData.reduce((s, p) => s + p.calc.netSalary,            0);
  const totalTax     = payslipData.reduce((s, p) => s + p.calc.incomeTax,            0);
  const totalNI      = payslipData.reduce((s, p) => s + p.calc.nationalInsuranceEmployee, 0);
  const totalPension = payslipData.reduce((s, p) => s + p.calc.pensionEmployer,      0);

  // Persist everything in a single PostgreSQL transaction
  const run = await prisma.$transaction(async (tx) => {
    const payrollRun = await tx.payrollRun.create({
      data: {
        tenantId,
        period,
        status:      'DRAFT',
        totalGross,
        totalNet,
        totalTax,
        totalNI,
        totalPension,
      },
    });

    // Create all payslips
    for (const { emp, calc } of payslipData) {
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
          breakdown:         calc as any,
        },
      });
    }

    return payrollRun;
  });

  return run;
}

// ─── Approve Payroll Run (with auto GL posting) ───────────────────

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

  // Auto GL posting (non-blocking — best effort)
  // DR: הוצאות שכר (6100) = totalGross + totalPension
  // CR: חובות שכר (3500) = totalNet
  // CR: מס הכנסה (3400) = totalTax
  // CR: ביטוח לאומי + פנסיה (3300) = remainder
  try {
    const [accSalaryExpense, accSalariesPayable, accTaxWithholding, accNIPayable] = await Promise.all([
      prisma.account.findFirst({ where: { tenantId, code: '6100', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '3500', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '3400', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '3300', isActive: true } }),
    ]);

    if (accSalaryExpense && accSalariesPayable && accTaxWithholding && accNIPayable) {
      const totalGross    = Number(run.totalGross);
      const totalNet      = Number(run.totalNet);
      const totalTax      = Number(run.totalTax);
      const totalPension  = Number(run.totalPension);
      const totalNIAndPension = totalGross + totalPension - totalNet - totalTax;

      await prisma.transaction.create({
        data: {
          tenantId,
          date:        new Date(),
          reference:   `PAY-${run.period}`,
          description: `שכר חודשי — ${run.period}`,
          sourceType:  'PAYROLL',
          sourceId:    payrollRunId,
          totalAmount: totalNet + totalTax + totalNIAndPension,
          status:      'POSTED',
          postedAt:    new Date(),
          createdBy:   approvedBy,
          lines: {
            create: [
              // Employee net salaries
              { debitAccountId: accSalaryExpense.id, creditAccountId: accSalariesPayable.id, amount: totalNet,      description: 'שכר נטו לעובדים', sortOrder: 0 },
              // Income tax withholding
              { debitAccountId: accSalaryExpense.id, creditAccountId: accTaxWithholding.id,  amount: totalTax,      description: 'מס הכנסה ניכוי', sortOrder: 1 },
              // NI + pension (employee deductions + employer contributions)
              { debitAccountId: accSalaryExpense.id, creditAccountId: accNIPayable.id,       amount: totalNIAndPension + totalPension, description: 'ביטוח לאומי ופנסיה', sortOrder: 2 },
            ],
          },
        },
      });
    }
  } catch { /* GL posting is advisory — payroll approval still succeeds */ }

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

  // Clear salaries payable to bank when paid
  // DR: חובות שכר (3500) = totalNet
  // CR: חשבון בנק (1200) = totalNet
  try {
    const [accSalariesPayable, accBank] = await Promise.all([
      prisma.account.findFirst({ where: { tenantId, code: '3500', isActive: true } }),
      prisma.account.findFirst({ where: { tenantId, code: '1200', isActive: true } }),
    ]);

    if (accSalariesPayable && accBank) {
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
          createdBy:   tenantId, // system
          lines: {
            create: [{
              debitAccountId:  accSalariesPayable.id,
              creditAccountId: accBank.id,
              amount:          totalNet,
              description:     `ניקוי חובות שכר ${run.period}`,
              sortOrder:       0,
            }],
          },
        },
      });
    }
  } catch { /* GL posting is advisory */ }

  return updated;
}

// ─── Get Payslip ──────────────────────────────────────────────────

export async function getPayslip(
  payslipId: string,
  tenantId: string
) {
  const payslip = await prisma.payslip.findUnique({
    where:   { id: payslipId },
    include: { employee: { select: { firstName: true, lastName: true, idNumber: true } } },
  });

  if (!payslip || payslip.tenantId !== tenantId) {
    throw new Error('Payslip not found');
  }

  return payslip;
}

// ─── Preview (without saving) ─────────────────────────────────────

export async function previewEmployeePayslip(
  employeeId: string,
  tenantId: string
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });

  if (!emp || emp.tenantId !== tenantId) throw new Error('Employee not found');

  return calculatePayslip({
    grossSalary:         Number(emp.grossSalary),
    taxCreditPoints:     Number(emp.taxCredits),
    pensionEmployeeRate: Number(emp.pensionEmployee),
    pensionEmployerRate: Number(emp.pensionEmployer),
    severancePayRate:    Number(emp.severancePay),
  });
}
