/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           PENSION FUND MANAGEMENT SERVICE                       ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Israeli pension law (2026):                                     ║
 * ║  • צו הרחבה לפנסיה חובה 2008 + תיקון 2011                      ║
 * ║  • עובד: מינימום 6% | מעסיק: מינימום 6.5% | פיצויים: 8.33%    ║
 * ║  Supports: קרן פנסיה | קופת גמל | ביטוח מנהלים                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as XLSX from 'xlsx';
import { prisma } from '../../config/database';
import { PensionFundType } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────
// Israeli law 2026: combined employee + severance max ~25% of salary
const MAX_COMBINED_PCT = 25;

// ─── Interfaces ───────────────────────────────────────────────────

export interface PensionContributions {
  allocationId:         string;
  fundId:               string;
  fundName:             string;
  fundType:             PensionFundType;
  fundCode?:            string | null;
  employeePct:          number;
  employeeContribution: number;   // ₪ employee deduction per month
  employerPct:          number;
  employerContribution: number;   // ₪ employer contribution per month
  severancePct:         number;
  severanceContribution: number;  // ₪ severance provision per month (8.33%)
  totalMonthly:         number;   // total ₪ flowing to fund per month
}

export interface PensionReportRow {
  employeeId:      string;
  employeeName:    string;
  idNumber:        string;
  grossSalary:     number;
  fundName:        string;
  fundCode?:       string | null;
  fundType:        string;
  employeePct:     number;
  employeeAmount:  number;
  employerPct:     number;
  employerAmount:  number;
  severancePct:    number;
  severanceAmount: number;
}

export interface PensionSummary {
  totalEmployeesWithPension:    number;
  employeesWithoutPension:      number;
  fundsCount:                   number;
  estimatedMonthlyTotal:        number;
  byFund: Array<{
    fundId:            string;
    fundName:          string;
    fundType:          PensionFundType;
    employeeCount:     number;
    estimatedMonthly:  number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — PENSION FUND CRUD
// ═══════════════════════════════════════════════════════════════════

/**
 * List all pension funds for a tenant, with employee count per fund.
 */
export async function listPensionFunds(
  tenantId: string,
  filters?: { type?: PensionFundType; isActive?: boolean }
) {
  const funds = await prisma.pensionFund.findMany({
    where: {
      tenantId,
      ...(filters?.type     !== undefined ? { type: filters.type }         : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    include: {
      _count: { select: { allocations: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Attach active-only employee count
  return Promise.all(
    funds.map(async (fund) => {
      const activeCount = await prisma.employeePensionAllocation.count({
        where: { pensionFundId: fund.id, tenantId, isActive: true },
      });
      return {
        ...fund,
        employeeCount:       activeCount,
        totalAllocations:    fund._count.allocations,
      };
    })
  );
}

/**
 * Create a new pension fund for the tenant.
 */
export async function createPensionFund(
  tenantId: string,
  data: { name: string; type: PensionFundType; code?: string }
) {
  // Enforce unique name within tenant
  const existing = await prisma.pensionFund.findFirst({
    where: { tenantId, name: data.name },
  });
  if (existing) {
    throw new Error(`קרן פנסיה בשם "${data.name}" כבר קיימת`);
  }

  return prisma.pensionFund.create({
    data: {
      tenantId,
      name:    data.name,
      type:    data.type,
      code:    data.code ?? null,
      isActive: true,
    },
  });
}

/**
 * Update a pension fund (name, code, type).
 */
export async function updatePensionFund(
  id: string,
  tenantId: string,
  data: { name?: string; type?: PensionFundType; code?: string | null }
) {
  const fund = await prisma.pensionFund.findUnique({ where: { id } });
  if (!fund || fund.tenantId !== tenantId) {
    throw new Error('קרן פנסיה לא נמצאה');
  }

  // If renaming, check no conflict
  if (data.name && data.name !== fund.name) {
    const conflict = await prisma.pensionFund.findFirst({
      where: { tenantId, name: data.name, id: { not: id } },
    });
    if (conflict) {
      throw new Error(`שם "${data.name}" כבר בשימוש`);
    }
  }

  return prisma.pensionFund.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name }   : {}),
      ...(data.type !== undefined ? { type: data.type }   : {}),
      ...(data.code !== undefined ? { code: data.code }   : {}),
    },
  });
}

/**
 * Deactivate a pension fund (soft delete — keeps history intact).
 */
export async function deactivatePensionFund(id: string, tenantId: string) {
  const fund = await prisma.pensionFund.findUnique({ where: { id } });
  if (!fund || fund.tenantId !== tenantId) {
    throw new Error('קרן פנסיה לא נמצאה');
  }
  if (!fund.isActive) {
    throw new Error('קרן הפנסיה כבר מנוטרלת');
  }

  return prisma.pensionFund.update({
    where: { id },
    data:  { isActive: false },
  });
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — EMPLOYEE PENSION ALLOCATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch all pension allocations for one employee (with fund details).
 */
export async function getEmployeeAllocations(employeeId: string, tenantId: string) {
  // Verify employee belongs to tenant
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('עובד לא נמצא');
  }

  return prisma.employeePensionAllocation.findMany({
    where:   { employeeId, tenantId },
    include: { pensionFund: true },
    orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
  });
}

/**
 * Create or update an employee's pension allocation for a fund.
 *
 * Rules (Israeli law):
 *  - employeePct + severancePct <= 25% (typical max)
 *  - fund must belong to same tenant
 *  - if employee already has an ACTIVE allocation for the same fund:
 *      → endDate that allocation (startDate new − 1 day), isActive = false
 *      → create fresh allocation from startDate
 */
export async function setAllocation(
  tenantId: string,
  data: {
    employeeId:   string;
    pensionFundId: string;
    employeePct:  number;
    employerPct:  number;
    severancePct: number;
    startDate:    Date;
  }
) {
  const { employeeId, pensionFundId, employeePct, employerPct, severancePct, startDate } = data;

  // Validate combined percentage
  if (employeePct + severancePct > MAX_COMBINED_PCT) {
    throw new Error(
      `אחוז עובד (${employeePct}%) + פיצויים (${severancePct}%) = ${employeePct + severancePct}% — חורג מהמקסימום המותר (${MAX_COMBINED_PCT}%)`
    );
  }
  if (employeePct < 0 || employerPct < 0 || severancePct < 0) {
    throw new Error('אחוזי הפנסיה לא יכולים להיות שליליים');
  }

  // Verify fund belongs to tenant
  const fund = await prisma.pensionFund.findUnique({ where: { id: pensionFundId } });
  if (!fund || fund.tenantId !== tenantId) {
    throw new Error('קרן פנסיה לא נמצאה או לא שייכת לדייר זה');
  }
  if (!fund.isActive) {
    throw new Error('לא ניתן להקצות לקרן פנסיה לא פעילה');
  }

  // Verify employee belongs to tenant
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('עובד לא נמצא');
  }

  // Check for existing active allocation for same fund
  const existingActive = await prisma.employeePensionAllocation.findFirst({
    where: { employeeId, pensionFundId, tenantId, isActive: true },
  });

  if (existingActive) {
    // Close existing allocation: endDate = startDate of new - 1 day
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() - 1);

    await prisma.employeePensionAllocation.update({
      where: { id: existingActive.id },
      data:  { isActive: false, endDate },
    });
  }

  return prisma.employeePensionAllocation.create({
    data: {
      tenantId,
      employeeId,
      pensionFundId,
      employeePct,
      employerPct,
      severancePct,
      startDate,
      isActive: true,
    },
    include: { pensionFund: true },
  });
}

/**
 * End (deactivate) a pension allocation — sets isActive=false and endDate=today.
 */
export async function endAllocation(allocationId: string, employeeId: string, tenantId: string) {
  const allocation = await prisma.employeePensionAllocation.findUnique({
    where: { id: allocationId },
  });

  if (!allocation || allocation.tenantId !== tenantId || allocation.employeeId !== employeeId) {
    throw new Error('הקצאת פנסיה לא נמצאה');
  }
  if (!allocation.isActive) {
    throw new Error('הקצאה זו כבר סגורה');
  }

  return prisma.employeePensionAllocation.update({
    where: { id: allocationId },
    data:  { isActive: false, endDate: new Date() },
    include: { pensionFund: true },
  });
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — PENSION CONTRIBUTION CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate monthly pension contributions for one employee.
 * Uses the employee's grossSalary as the pension base, and
 * their active EmployeePensionAllocation records.
 *
 * @param month  1–12
 * @param year   4-digit year
 */
export async function getMonthlyPensionContributions(
  employeeId: string,
  tenantId: string,
  month: number,
  year: number
): Promise<PensionContributions[]> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('עובד לא נמצא');
  }

  // Period start/end for allocation check
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 0);  // last day of month

  // Fetch allocations that were active during this month
  const allocations = await prisma.employeePensionAllocation.findMany({
    where: {
      employeeId,
      tenantId,
      startDate: { lte: periodEnd },
      OR: [
        { endDate: null },
        { endDate: { gte: periodStart } },
      ],
    },
    include: { pensionFund: true },
  });

  const grossSalary = round2(Number(employee.grossSalary));

  return allocations.map((alloc): PensionContributions => {
    const empPct  = round2(Number(alloc.employeePct));
    const erPct   = round2(Number(alloc.employerPct));
    const sevPct  = round2(Number(alloc.severancePct));

    const empAmt  = round2(grossSalary * empPct  / 100);
    const erAmt   = round2(grossSalary * erPct   / 100);
    const sevAmt  = round2(grossSalary * sevPct  / 100);

    return {
      allocationId:          alloc.id,
      fundId:                alloc.pensionFundId,
      fundName:              alloc.pensionFund.name,
      fundType:              alloc.pensionFund.type,
      fundCode:              alloc.pensionFund.code,
      employeePct:           empPct,
      employeeContribution:  empAmt,
      employerPct:           erPct,
      employerContribution:  erAmt,
      severancePct:          sevPct,
      severanceContribution: sevAmt,
      totalMonthly:          round2(empAmt + erAmt + sevAmt),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — PENSION REPORT (monthly remittance report)
// ═══════════════════════════════════════════════════════════════════

/**
 * Build the monthly pension report for ALL employees with active allocations.
 * Grouped by fund — used for remittance to pension companies.
 */
export async function getPensionReport(
  tenantId: string,
  month: number,
  year: number
): Promise<{ rows: PensionReportRow[]; byFund: Record<string, PensionReportRow[]>; totals: object }> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 0);

  const allocations = await prisma.employeePensionAllocation.findMany({
    where: {
      tenantId,
      startDate: { lte: periodEnd },
      OR: [
        { endDate: null },
        { endDate: { gte: periodStart } },
      ],
    },
    include: {
      pensionFund: true,
      employee:    {
        select: {
          id:          true,
          firstName:   true,
          lastName:    true,
          idNumber:    true,
          grossSalary: true,
        },
      },
    },
    orderBy: [{ pensionFund: { name: 'asc' } }, { employee: { lastName: 'asc' } }],
  });

  const rows: PensionReportRow[] = allocations.map((alloc) => {
    const gross   = round2(Number(alloc.employee.grossSalary));
    const empPct  = round2(Number(alloc.employeePct));
    const erPct   = round2(Number(alloc.employerPct));
    const sevPct  = round2(Number(alloc.severancePct));

    return {
      employeeId:      alloc.employee.id,
      employeeName:    `${alloc.employee.firstName} ${alloc.employee.lastName}`,
      idNumber:        alloc.employee.idNumber,
      grossSalary:     gross,
      fundName:        alloc.pensionFund.name,
      fundCode:        alloc.pensionFund.code,
      fundType:        alloc.pensionFund.type,
      employeePct:     empPct,
      employeeAmount:  round2(gross * empPct / 100),
      employerPct:     erPct,
      employerAmount:  round2(gross * erPct  / 100),
      severancePct:    sevPct,
      severanceAmount: round2(gross * sevPct / 100),
    };
  });

  // Group by fund name
  const byFund: Record<string, PensionReportRow[]> = {};
  for (const row of rows) {
    if (!byFund[row.fundName]) byFund[row.fundName] = [];
    byFund[row.fundName].push(row);
  }

  // Aggregate totals
  const totals = {
    employeeCount:   new Set(rows.map(r => r.employeeId)).size,
    totalGross:      round2(rows.reduce((s, r) => s + r.grossSalary,     0)),
    totalEmployee:   round2(rows.reduce((s, r) => s + r.employeeAmount,  0)),
    totalEmployer:   round2(rows.reduce((s, r) => s + r.employerAmount,  0)),
    totalSeverance:  round2(rows.reduce((s, r) => s + r.severanceAmount, 0)),
    grandTotal:      round2(rows.reduce((s, r) => s + r.employeeAmount + r.employerAmount + r.severanceAmount, 0)),
  };

  return { rows, byFund, totals };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — XLSX EXPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Export the monthly pension report as XLSX.
 * One sheet per pension fund; last sheet = summary.
 */
export async function exportPensionReportXLSX(
  tenantId: string,
  month: number,
  year: number
): Promise<Buffer> {
  const { byFund, totals } = await getPensionReport(tenantId, month, year);

  const wb = XLSX.utils.book_new();

  const HEADER = [
    'שם עובד',
    'ת.ז.',
    'שכר ברוטו',
    '% עובד',
    'סכום עובד',
    '% מעסיק',
    'סכום מעסיק',
    '% פיצויים',
    'סכום פיצויים',
    'סה"כ לקרן',
  ];

  // One sheet per fund
  for (const [fundName, rows] of Object.entries(byFund)) {
    const dataRows = rows.map((r) => [
      r.employeeName,
      r.idNumber,
      r.grossSalary,
      r.employeePct,
      r.employeeAmount,
      r.employerPct,
      r.employerAmount,
      r.severancePct,
      r.severanceAmount,
      round2(r.employeeAmount + r.employerAmount + r.severanceAmount),
    ]);

    // Totals row
    const totalRow = [
      'סה"כ',
      '',
      round2(rows.reduce((s, r) => s + r.grossSalary,     0)),
      '',
      round2(rows.reduce((s, r) => s + r.employeeAmount,  0)),
      '',
      round2(rows.reduce((s, r) => s + r.employerAmount,  0)),
      '',
      round2(rows.reduce((s, r) => s + r.severanceAmount, 0)),
      round2(rows.reduce((s, r) => s + r.employeeAmount + r.employerAmount + r.severanceAmount, 0)),
    ];

    const ws = XLSX.utils.aoa_to_sheet([HEADER, ...dataRows, totalRow]);

    // Column widths
    ws['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 8 },
      { wch: 14 }, { wch: 8 },  { wch: 14 }, { wch: 8 },
      { wch: 14 }, { wch: 14 },
    ];

    // Truncate sheet name to Excel's 31-char limit
    const sheetName = fundName.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Summary sheet
  const summaryHeader = ['קרן', 'מספר עובדים', 'סכום עובד', 'סכום מעסיק', 'פיצויים', 'סה"כ'];
  const summaryRows = Object.entries(byFund).map(([fundName, rows]) => [
    fundName,
    rows.length,
    round2(rows.reduce((s, r) => s + r.employeeAmount,  0)),
    round2(rows.reduce((s, r) => s + r.employerAmount,  0)),
    round2(rows.reduce((s, r) => s + r.severanceAmount, 0)),
    round2(rows.reduce((s, r) => s + r.employeeAmount + r.employerAmount + r.severanceAmount, 0)),
  ]);

  const summaryTotals = [
    'סה"כ',
    '',
    round2(Object.values(byFund).flat().reduce((s, r) => s + r.employeeAmount,  0)),
    round2(Object.values(byFund).flat().reduce((s, r) => s + r.employerAmount,  0)),
    round2(Object.values(byFund).flat().reduce((s, r) => s + r.severanceAmount, 0)),
    round2(Object.values(byFund).flat().reduce((s, r) => s + r.employeeAmount + r.employerAmount + r.severanceAmount, 0)),
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows, summaryTotals]);
  wsSummary['!cols'] = [
    { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — PORTFOLIO SUMMARY (tenant-wide stats)
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns a high-level pension portfolio summary for the tenant.
 * Estimates are based on current employee salaries.
 */
export async function getPensionSummary(tenantId: string): Promise<PensionSummary> {
  // All active employees
  const allEmployees = await prisma.employee.findMany({
    where:  { tenantId, isActive: true },
    select: { id: true, grossSalary: true },
  });

  // All active pension allocations (with fund + employee salary)
  const activeAllocations = await prisma.employeePensionAllocation.findMany({
    where:   { tenantId, isActive: true },
    include: {
      pensionFund: { select: { id: true, name: true, type: true } },
      employee:    { select: { id: true, grossSalary: true } },
    },
  });

  // Employees that have at least one active allocation
  const employeesWithPension = new Set(activeAllocations.map((a) => a.employeeId));

  // Active funds referenced in current allocations
  const activeFundIds = [...new Set(activeAllocations.map((a) => a.pensionFundId))];

  // Build per-fund stats
  const fundMap: Record<
    string,
    { fundId: string; fundName: string; fundType: PensionFundType; employeeIds: Set<string>; estimatedMonthly: number }
  > = {};

  for (const alloc of activeAllocations) {
    const fid  = alloc.pensionFundId;
    const gross = round2(Number(alloc.employee.grossSalary));
    const empPct = round2(Number(alloc.employeePct));
    const erPct  = round2(Number(alloc.employerPct));
    const sevPct = round2(Number(alloc.severancePct));
    const monthly = round2(gross * (empPct + erPct + sevPct) / 100);

    if (!fundMap[fid]) {
      fundMap[fid] = {
        fundId:           fid,
        fundName:         alloc.pensionFund.name,
        fundType:         alloc.pensionFund.type,
        employeeIds:      new Set(),
        estimatedMonthly: 0,
      };
    }
    fundMap[fid].employeeIds.add(alloc.employeeId);
    fundMap[fid].estimatedMonthly = round2(fundMap[fid].estimatedMonthly + monthly);
  }

  const estimatedMonthlyTotal = round2(
    Object.values(fundMap).reduce((s, f) => s + f.estimatedMonthly, 0)
  );

  return {
    totalEmployeesWithPension: employeesWithPension.size,
    employeesWithoutPension:   allEmployees.length - employeesWithPension.size,
    fundsCount:                activeFundIds.length,
    estimatedMonthlyTotal,
    byFund: Object.values(fundMap).map((f) => ({
      fundId:           f.fundId,
      fundName:         f.fundName,
      fundType:         f.fundType,
      employeeCount:    f.employeeIds.size,
      estimatedMonthly: f.estimatedMonthly,
    })),
  };
}

// ─── Utility ──────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
