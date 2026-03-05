import { prisma } from '../../config/database';

// ─── Israeli Annual Leave Law (חוק חופשה שנתית, תשי"א-1951) ──────────────
// Returns the annual entitlement in working days based on full years of service.
// Partial-year employees (< 1 year) get prorated days, handled separately.
function getAnnualLeaveDays(yearsOfService: number): number {
  if (yearsOfService < 1) return 14; // base rate used for proration; caller handles partial year
  if (yearsOfService <= 3) return 14; // years 1-3: 14 days
  if (yearsOfService === 4) return 16; // year 4: 16 days
  if (yearsOfService === 5) return 18; // year 5: 18 days
  if (yearsOfService === 6) return 21; // year 6: 21 days
  return Math.min(yearsOfService + 14, 28); // year 7+: up to 28 days (7+14=21 → cap 28)
}

// Max carryover from previous year per Israeli law
const MAX_CARRY_FORWARD = 14;

// ─── Helper: get or create the annual leave type for a tenant ─────────────
async function getOrCreateAnnualLeaveType(tenantId: string): Promise<string> {
  // Look for existing annual leave type by common Hebrew/English names
  let leaveType = await prisma.leaveType.findFirst({
    where: {
      tenantId,
      OR: [
        { name: { contains: 'שנתי' } },
        { name: { contains: 'שנתית' } },
        { name: { contains: 'annual' } },
        { name: { contains: 'Annual' } },
        { name: { contains: 'ANNUAL' } },
        { name: 'חופשה שנתית' },
      ],
    },
  });

  if (!leaveType) {
    // Create a default annual leave type if none exists
    leaveType = await prisma.leaveType.create({
      data: {
        tenantId,
        name:             'חופשה שנתית',
        isPaid:           true,
        maxDaysPerYear:   14,
        requiresApproval: true,
        colorHex:         '#3B82F6',
      },
    });
  }

  return leaveType.id;
}

// ─── Run Annual Accrual for All Active Employees ─────────────────────────
export async function runAnnualAccrual(tenantId: string): Promise<{
  processed: number;
  skipped:   number;
  errors:    string[];
}> {
  const today = new Date();
  const year  = today.getFullYear();

  const leaveTypeId = await getOrCreateAnnualLeaveType(tenantId);

  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, firstName: true, lastName: true, startDate: true },
  });

  let processed = 0;
  let skipped   = 0;
  const errors: string[] = [];

  for (const emp of employees) {
    try {
      if (!emp.startDate) {
        skipped++;
        errors.push(`${emp.firstName} ${emp.lastName} (${emp.id}): no startDate, skipped`);
        continue;
      }

      // Calculate years of service as of January 1st of the accrual year
      const referenceDate = new Date(year, 0, 1); // Jan 1 of current year
      const hireDate      = new Date(emp.startDate);

      // Skip if employee started after the reference date (started this year)
      if (hireDate >= referenceDate) {
        skipped++;
        continue;
      }

      const msPerYear       = 1000 * 60 * 60 * 24 * 365.25;
      const yearsOfService  = (referenceDate.getTime() - hireDate.getTime()) / msPerYear;
      const fullYears       = Math.floor(yearsOfService);

      // Calculate entitled days
      let entitledDays: number;
      if (fullYears < 1) {
        // Prorated: days proportional to months worked in previous year
        const baseDays = 14; // base rate for first year
        const monthsWorked = yearsOfService * 12;
        entitledDays = Math.round((baseDays / 12) * Math.min(monthsWorked, 12));
      } else {
        entitledDays = getAnnualLeaveDays(fullYears);
      }

      if (entitledDays <= 0) {
        skipped++;
        continue;
      }

      // Fetch existing balance from the PREVIOUS year to determine carryforward
      const prevYearBalance = await prisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId:  emp.id,
            leaveTypeId,
            year:        year - 1,
          },
        },
      });

      // Calculate carry-forward: remaining from last year, capped at MAX_CARRY_FORWARD
      let carryForward = 0;
      if (prevYearBalance) {
        const prevRemaining = prevYearBalance.accrued + prevYearBalance.carryForward - prevYearBalance.used - prevYearBalance.expired;
        carryForward = Math.min(Math.max(prevRemaining, 0), MAX_CARRY_FORWARD);
      }

      // Upsert this year's balance record
      // accrued = entitled days for this year (not counting carry-forward)
      // carryForward = days brought over from last year
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId:  emp.id,
            leaveTypeId,
            year,
          },
        },
        create: {
          tenantId,
          employeeId:  emp.id,
          leaveTypeId,
          year,
          accrued:     entitledDays,
          used:        0,
          carryForward,
          expired:     0,
        },
        update: {
          accrued:     entitledDays,
          carryForward,
        },
      });

      // Mark expired carryforward on previous year's record (cap enforcement)
      if (prevYearBalance) {
        const prevRemaining = prevYearBalance.accrued + prevYearBalance.carryForward - prevYearBalance.used;
        const actualExpired = Math.max(prevRemaining - MAX_CARRY_FORWARD, 0);
        if (actualExpired > 0) {
          await prisma.leaveBalance.update({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId:  emp.id,
                leaveTypeId,
                year:        year - 1,
              },
            },
            data: { expired: actualExpired },
          });
        }
      }

      processed++;
    } catch (err: any) {
      errors.push(
        `${emp.firstName} ${emp.lastName} (${emp.id}): ${err.message ?? String(err)}`
      );
    }
  }

  return { processed, skipped, errors };
}

// ─── Accrue Leave for a Single Employee ───────────────────────────────────
export async function accrueLeaveForEmployee(
  employeeId: string,
  tenantId:   string,
  year?:      number
): Promise<{ days: number; yearsOfService: number }> {
  const targetYear = year ?? new Date().getFullYear();

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('Employee not found');
  }
  if (!employee.startDate) {
    throw new Error('Employee has no hire date');
  }

  const leaveTypeId   = await getOrCreateAnnualLeaveType(tenantId);
  const referenceDate = new Date(targetYear, 0, 1); // Jan 1 of target year
  const hireDate      = new Date(employee.startDate);

  if (hireDate >= referenceDate) {
    throw new Error('Employee had not started by January 1st of the target year');
  }

  const msPerYear      = 1000 * 60 * 60 * 24 * 365.25;
  const yearsOfService = (referenceDate.getTime() - hireDate.getTime()) / msPerYear;
  const fullYears      = Math.floor(yearsOfService);

  let entitledDays: number;
  if (fullYears < 1) {
    const baseDays     = 14;
    const monthsWorked = yearsOfService * 12;
    entitledDays = Math.round((baseDays / 12) * Math.min(monthsWorked, 12));
  } else {
    entitledDays = getAnnualLeaveDays(fullYears);
  }

  // Carry-forward from previous year
  const prevYearBalance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: targetYear - 1 },
    },
  });

  let carryForward = 0;
  if (prevYearBalance) {
    const prevRemaining = prevYearBalance.accrued + prevYearBalance.carryForward - prevYearBalance.used - prevYearBalance.expired;
    carryForward = Math.min(Math.max(prevRemaining, 0), MAX_CARRY_FORWARD);
  }

  await prisma.leaveBalance.upsert({
    where: {
      employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: targetYear },
    },
    create: {
      tenantId,
      employeeId,
      leaveTypeId,
      year:        targetYear,
      accrued:     entitledDays,
      used:        0,
      carryForward,
      expired:     0,
    },
    update: {
      accrued:     entitledDays,
      carryForward,
    },
  });

  return { days: entitledDays, yearsOfService: Math.round(yearsOfService * 10) / 10 };
}

// ─── Get Accrual History for an Employee ─────────────────────────────────
export async function getAccrualHistory(employeeId: string, tenantId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) return null;

  // Find the annual leave type for this tenant
  const leaveType = await prisma.leaveType.findFirst({
    where: {
      tenantId,
      OR: [
        { name: { contains: 'שנתי' } },
        { name: { contains: 'שנתית' } },
        { name: { contains: 'annual' } },
        { name: { contains: 'Annual' } },
        { name: { contains: 'ANNUAL' } },
        { name: 'חופשה שנתית' },
      ],
    },
  });

  if (!leaveType) return [];

  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId, tenantId, leaveTypeId: leaveType.id },
    orderBy: { year: 'desc' },
    include: {
      leaveType: { select: { name: true } },
    },
  });

  return balances.map((b) => ({
    year:         b.year,
    leaveType:    b.leaveType.name,
    accrued:      b.accrued,
    carryForward: b.carryForward,
    used:         b.used,
    expired:      b.expired,
    remaining:    b.accrued + b.carryForward - b.used - b.expired,
    createdAt:    b.createdAt,
    updatedAt:    b.updatedAt,
  }));
}
