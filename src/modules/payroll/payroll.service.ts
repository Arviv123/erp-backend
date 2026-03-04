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
  miluimDays?:           number;   // ימי מילואים — לדיווח טופס 126
  sickDays?:             number;   // ימי מחלה — לדיווח
  unpaidLeaveDays?:      number;   // ימי חופשה ללא תשלום
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
      // Company car — שווי רכב צמוד
      carListPrice:        emp.carListPrice ? Number(emp.carListPrice) : 0,
      carType:             (emp.carType as 'REGULAR' | 'HYBRID' | 'PLUGIN_HYBRID' | 'ELECTRIC') ?? 'REGULAR',
      // Training fund — קרן השתלמות
      trainingFundEmpRate: Number(emp.trainingFundRate),
      trainingFundErRate:  Number(emp.trainingFundErRate),
      // Reporting fields (Form 126)
      miluimDays:          adj.miluimDays      ?? 0,
      sickDays:            adj.sickDays        ?? 0,
      unpaidLeaveDays:     adj.unpaidLeaveDays ?? 0,
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
          payrollRunId:         payrollRun.id,
          employeeId:           emp.id,
          tenantId,
          period,
          grossSalary:          calc.grossSalary,
          taxableIncome:        calc.taxableIncome,
          incomeTax:            calc.incomeTax,
          nationalInsurance:    calc.nationalInsuranceEmployee,
          healthInsurance:      calc.healthInsuranceEmployee,
          pensionEmployee:      calc.pensionEmployee,
          netSalary:            calc.netSalary,
          pensionEmployer:      calc.pensionEmployer,
          severancePay:         calc.severancePay,
          niEmployer:           calc.nationalInsuranceEmployer,
          totalEmployerCost:    calc.totalEmployerCost,
          carBenefit:           calc.carBenefit,
          trainingFundEmployee: calc.trainingFundEmployee,
          trainingFundEmployer: calc.trainingFundEmployer,
          miluimDays:           calc.miluimDays   ?? 0,
          sickDays:             calc.sickDays     ?? 0,
          unpaidLeaveDays:      calc.unpaidLeaveDays ?? 0,
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
    carListPrice:        emp.carListPrice ? Number(emp.carListPrice) : 0,
    carType:             (emp.carType as 'REGULAR' | 'HYBRID' | 'PLUGIN_HYBRID' | 'ELECTRIC') ?? 'REGULAR',
    trainingFundEmpRate: Number(emp.trainingFundRate),
    trainingFundErRate:  Number(emp.trainingFundErRate),
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

// ─── Annual Report — Form 126 ─────────────────────────────────────
/**
 * טופס 126 — דוח שנתי / חצי שנתי של מעסיק לרשות המסים ולביטוח לאומי
 * מסכם עבור כל עובד: שכר שנתי, מס, ב.ל., פנסיה, קרן השתלמות
 *
 * half: 'H1' = ינואר–יוני (הגשה עד 31.7)
 *       'H2' = יולי–דצמבר (הגשה עד 31.1 של השנה הבאה)
 *       'FULL' = כל השנה (הגשה עד 30.4 של השנה הבאה) — ברירת מחדל
 */
export async function getAnnualReport(tenantId: string, year: number, half: 'H1' | 'H2' | 'FULL' = 'FULL') {
  const startPeriod = half === 'H2' ? `${year}-07` : `${year}-01`;
  const endPeriod   = half === 'H1' ? `${year}-06` : `${year}-12`;

  const payslips = await prisma.payslip.findMany({
    where: {
      tenantId,
      period: { gte: startPeriod, lte: endPeriod },
      payrollRun: { status: { in: ['APPROVED', 'PAID'] } },
    },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, idNumber: true,
          jobTitle: true, department: true, startDate: true, endDate: true,
          birthDate: true, gender: true,
          taxCredits: true, pensionFund: true, bankAccount: true,
        },
      },
    },
    orderBy: [{ employeeId: 'asc' }, { period: 'asc' }],
  });

  // Aggregate per employee
  const byEmployee = new Map<string, {
    id:                string;
    idNumber:          string;
    name:              string;
    jobTitle:          string;
    department:        string;
    startDate:         string | null;
    pensionFund:       string | null;
    taxCredits:        number;
    grossSalary:       number;
    taxableIncome:     number;
    carBenefit:        number;
    incomeTax:         number;
    niEmployee:        number;
    hiEmployee:        number;
    niEmployer:        number;
    pensionEmployee:   number;
    pensionEmployer:   number;
    severancePay:      number;
    tfEmployee:        number;
    tfEmployer:        number;
    net:               number;
    months:            number;
    miluimDays:        number;
    gender:            string;
    birthDate:         string | null;
    endDate:           string | null;
  }>();

  for (const p of payslips) {
    const empId = p.employeeId;
    const bd = p.breakdown as any ?? {};
    if (!byEmployee.has(empId)) {
      byEmployee.set(empId, {
        id:              empId,
        idNumber:        p.employee?.idNumber ?? '',
        name:            `${p.employee?.firstName ?? ''} ${p.employee?.lastName ?? ''}`.trim(),
        jobTitle:        p.employee?.jobTitle ?? '',
        department:      p.employee?.department ?? '',
        startDate:       p.employee?.startDate ? String(p.employee.startDate) : null,
        endDate:         (p.employee as any)?.endDate ? String((p.employee as any).endDate) : null,
        birthDate:       (p.employee as any)?.birthDate ? String((p.employee as any).birthDate) : null,
        gender:          (p.employee as any)?.gender ?? '',
        pensionFund:     p.employee?.pensionFund ?? null,
        taxCredits:      Number(p.employee?.taxCredits ?? 0),
        grossSalary: 0, taxableIncome: 0, carBenefit: 0,
        incomeTax: 0, niEmployee: 0, hiEmployee: 0, niEmployer: 0,
        pensionEmployee: 0, pensionEmployer: 0, severancePay: 0,
        tfEmployee: 0, tfEmployer: 0, net: 0, months: 0,
        miluimDays: 0,
      });
    }

    const row = byEmployee.get(empId)!;
    row.grossSalary     += Number(p.grossSalary);
    row.taxableIncome   += Number(p.taxableIncome);
    row.carBenefit      += Number(p.carBenefit ?? 0);
    row.incomeTax       += Number(p.incomeTax);
    row.niEmployee      += Number(p.nationalInsurance);
    row.hiEmployee      += Number(p.healthInsurance);
    row.niEmployer      += Number(p.niEmployer);
    row.pensionEmployee += Number(p.pensionEmployee);
    row.pensionEmployer += Number(p.pensionEmployer);
    row.severancePay    += Number(p.severancePay);
    row.tfEmployee      += Number(p.trainingFundEmployee ?? bd.trainingFundEmployee ?? 0);
    row.tfEmployer      += Number(p.trainingFundEmployer ?? bd.trainingFundEmployer ?? 0);
    row.net             += Number(p.netSalary);
    row.miluimDays      += Number(bd.miluimDays ?? 0);
    row.months++;
  }

  const employees = [...byEmployee.values()].map(e => ({
    ...e,
    grossSalary:     Math.round(e.grossSalary     * 100) / 100,
    taxableIncome:   Math.round(e.taxableIncome   * 100) / 100,
    carBenefit:      Math.round(e.carBenefit      * 100) / 100,
    incomeTax:       Math.round(e.incomeTax       * 100) / 100,
    niEmployee:      Math.round(e.niEmployee      * 100) / 100,
    hiEmployee:      Math.round(e.hiEmployee      * 100) / 100,
    niEmployer:      Math.round(e.niEmployer      * 100) / 100,
    pensionEmployee: Math.round(e.pensionEmployee * 100) / 100,
    pensionEmployer: Math.round(e.pensionEmployer * 100) / 100,
    severancePay:    Math.round(e.severancePay    * 100) / 100,
    tfEmployee:      Math.round(e.tfEmployee      * 100) / 100,
    tfEmployer:      Math.round(e.tfEmployer      * 100) / 100,
    net:             Math.round(e.net             * 100) / 100,
  }));

  const totals = employees.reduce(
    (acc, e) => ({
      grossSalary:     acc.grossSalary     + e.grossSalary,
      taxableIncome:   acc.taxableIncome   + e.taxableIncome,
      carBenefit:      acc.carBenefit      + e.carBenefit,
      incomeTax:       acc.incomeTax       + e.incomeTax,
      niEmployee:      acc.niEmployee      + e.niEmployee,
      hiEmployee:      acc.hiEmployee      + e.hiEmployee,
      niEmployer:      acc.niEmployer      + e.niEmployer,
      pensionEmployee: acc.pensionEmployee + e.pensionEmployee,
      pensionEmployer: acc.pensionEmployer + e.pensionEmployer,
      severancePay:    acc.severancePay    + e.severancePay,
      tfEmployee:      acc.tfEmployee      + e.tfEmployee,
      tfEmployer:      acc.tfEmployer      + e.tfEmployer,
      net:             acc.net             + e.net,
    }),
    {
      grossSalary: 0, taxableIncome: 0, carBenefit: 0,
      incomeTax: 0, niEmployee: 0, hiEmployee: 0, niEmployer: 0,
      pensionEmployee: 0, pensionEmployer: 0, severancePay: 0,
      tfEmployee: 0, tfEmployer: 0, net: 0,
    }
  );

  const deadlineMap = {
    H1:   `31.7.${year}`,
    H2:   `31.1.${year + 1}`,
    FULL: `30.4.${year + 1}`,
  };

  return {
    year,
    half,
    periodLabel: half === 'H1' ? `ינואר–יוני ${year}` : half === 'H2' ? `יולי–דצמבר ${year}` : `כל שנת ${year}`,
    deadline: deadlineMap[half],
    employeeCount: employees.length,
    employees,
    totals: Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, Math.round((v as number) * 100) / 100])
    ),
  };
}

// ─── Edit Payslip (DRAFT only) ────────────────────────────────────

export async function editPayslip(
  payslipId:   string,
  tenantId:    string,
  adjustments: EmployeeAdjustment
) {
  // Load payslip + run
  const payslip = await prisma.payslip.findUnique({
    where:   { id: payslipId },
    include: { payrollRun: true },
  });
  if (!payslip || payslip.tenantId !== tenantId) throw new Error('Payslip not found');
  if (payslip.payrollRun.status !== 'DRAFT') throw new Error('Can only edit payslips in DRAFT runs');

  // Load employee
  const emp = await prisma.employee.findUnique({ where: { id: payslip.employeeId } });
  if (!emp) throw new Error('Employee not found');

  // Re-calculate
  const adj = adjustments;
  let base = Number(emp.grossSalary);
  if (adj.partialMonthDays && adj.totalWorkDaysInMonth && adj.totalWorkDaysInMonth > 0) {
    base = Math.round(base * (adj.partialMonthDays / adj.totalWorkDaysInMonth) * 100) / 100;
  }

  const calc = calculatePayslip({
    grossSalary:         base,
    taxCreditPoints:     Number(emp.taxCredits),
    pensionEmployeeRate: Number(emp.pensionEmployee),
    pensionEmployerRate: Number(emp.pensionEmployer),
    severancePayRate:    Number(emp.severancePay),
    hourlyRate:          emp.hourlyRate ? Number(emp.hourlyRate) : undefined,
    overtime125Hours:    adj.overtime125Hours  ?? 0,
    overtime150Hours:    adj.overtime150Hours  ?? 0,
    travelWorkDays:      adj.travelWorkDays    ?? 21,
    includeRecuperation: adj.includeRecuperation ?? false,
    startDate:           emp.startDate ? new Date(emp.startDate) : undefined,
    period:              payslip.period,
    bonusAmount:         adj.bonusAmount ?? 0,
    carListPrice:        emp.carListPrice ? Number(emp.carListPrice) : 0,
    carType:             (emp.carType as 'REGULAR' | 'HYBRID' | 'PLUGIN_HYBRID' | 'ELECTRIC') ?? 'REGULAR',
    trainingFundEmpRate: Number(emp.trainingFundRate),
    trainingFundErRate:  Number(emp.trainingFundErRate),
  });

  const manualDeduction = adj.manualDeduction ?? 0;
  if (manualDeduction > 0) {
    calc.netSalary       = Math.max(0, Math.round((calc.netSalary - manualDeduction) * 100) / 100);
    calc.totalDeductions = Math.round((calc.totalDeductions + manualDeduction) * 100) / 100;
  }

  // Update payslip
  const updated = await prisma.payslip.update({
    where: { id: payslipId },
    data: {
      grossSalary:          calc.grossSalary,
      taxableIncome:        calc.taxableIncome,
      incomeTax:            calc.incomeTax,
      nationalInsurance:    calc.nationalInsuranceEmployee,
      healthInsurance:      calc.healthInsuranceEmployee,
      pensionEmployee:      calc.pensionEmployee,
      netSalary:            calc.netSalary,
      pensionEmployer:      calc.pensionEmployer,
      severancePay:         calc.severancePay,
      niEmployer:           calc.nationalInsuranceEmployer,
      totalEmployerCost:    calc.totalEmployerCost,
      carBenefit:           calc.carBenefit,
      trainingFundEmployee: calc.trainingFundEmployee,
      trainingFundEmployer: calc.trainingFundEmployer,
      breakdown: {
        ...calc,
        manualDeduction,
        adjustments: {
          overtime125Hours:    adj.overtime125Hours   ?? 0,
          overtime150Hours:    adj.overtime150Hours   ?? 0,
          travelWorkDays:      adj.travelWorkDays     ?? 21,
          includeRecuperation: adj.includeRecuperation ?? false,
          bonusAmount:         adj.bonusAmount        ?? 0,
        },
        employeeSnapshot: (payslip.breakdown as any)?.employeeSnapshot ?? {},
      } as any,
    },
  });

  // Recalculate run totals from all payslips
  const allPayslips = await prisma.payslip.findMany({ where: { payrollRunId: payslip.payrollRunId } });
  await prisma.payrollRun.update({
    where: { id: payslip.payrollRunId },
    data: {
      totalGross:   Math.round(allPayslips.reduce((s, p) => s + Number(p.grossSalary),       0) * 100) / 100,
      totalNet:     Math.round(allPayslips.reduce((s, p) => s + Number(p.netSalary),         0) * 100) / 100,
      totalTax:     Math.round(allPayslips.reduce((s, p) => s + Number(p.incomeTax),         0) * 100) / 100,
      totalNI:      Math.round(allPayslips.reduce((s, p) => s + Number(p.nationalInsurance), 0) * 100) / 100,
      totalPension: Math.round(allPayslips.reduce((s, p) => s + Number(p.pensionEmployer),   0) * 100) / 100,
    },
  });

  return updated;
}

// ─── Delete Payroll Run (DRAFT only) ─────────────────────────────

export async function deletePayrollRun(runId: string, tenantId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run || run.tenantId !== tenantId) throw new Error('Payroll run not found');
  if (run.status !== 'DRAFT') throw new Error('Can only delete DRAFT payroll runs');

  await prisma.$transaction([
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
    prisma.payrollRun.delete({ where: { id: runId } }),
  ]);

  return { deleted: true, period: run.period };
}

// ─── Bank Export CSV ──────────────────────────────────────────────

export async function generateBankExport(runId: string, tenantId: string): Promise<string> {
  const run = await prisma.payrollRun.findUnique({
    where:   { id: runId },
    include: {
      payslips: {
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, idNumber: true, bankAccount: true,
            },
          },
        },
      },
    },
  });

  if (!run || run.tenantId !== tenantId) throw new Error('Payroll run not found');
  if (run.status === 'DRAFT') throw new Error('Cannot export bank file for DRAFT run — approve first');

  // UTF-8 BOM for Excel Hebrew compatibility
  const BOM = '\uFEFF';
  const headers = ['שם עובד', 'מספר ת.ז.', 'שם בנק', 'מספר סניף', 'מספר חשבון', 'סכום לתשלום (₪)', 'הערה'];

  const rows = run.payslips.map(p => {
    const bank = p.employee?.bankAccount as any;
    const name = `${p.employee?.firstName ?? ''} ${p.employee?.lastName ?? ''}`.trim();
    const idNum = p.employee?.idNumber ?? '';
    const bankName  = bank?.bank          ?? '';
    const branch    = bank?.branchCode    ?? '';
    const account   = bank?.accountNumber ?? '';
    const net       = Number(p.netSalary).toFixed(2);
    const note      = `שכר ${run.period}`;
    // Escape CSV fields that might contain commas
    return [name, idNum, bankName, branch, account, net, note]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  return BOM + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
}
