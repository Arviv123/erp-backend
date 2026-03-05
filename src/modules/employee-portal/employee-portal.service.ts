import { prisma } from '../../config/database';
import { generatePayslipPDF } from '../payroll/payslip.pdf.service';

// ─── Helper: resolve employee record linked to a user ────────────────────────
async function getMyEmployee(userId: string, tenantId: string) {
  // Primary lookup: via User → Employee relation (userId FK on Employee)
  const employee = await prisma.employee.findFirst({
    where: { userId, tenantId, isActive: true },
  });
  return employee ?? null;
}

// ─── getMyProfile ─────────────────────────────────────────────────────────────
// Returns safe employee info — no salary or bank details exposed
export async function getMyProfile(userId: string, tenantId: string) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  return {
    id:             emp.id,
    firstName:      emp.firstName,
    lastName:       emp.lastName,
    jobTitle:       emp.jobTitle,
    department:     emp.department,
    startDate:      emp.startDate,
    employmentType: emp.employmentType,
    phone:          emp.phone,
    personalEmail:  emp.personalEmail,
    isActive:       emp.isActive,
    // Emergency contact stored in metadata JSON
    emergencyContact: (emp.metadata as any)?.emergencyContact ?? null,
    emergencyPhone:   (emp.metadata as any)?.emergencyPhone   ?? null,
  };
}

// ─── getMyPayslips ────────────────────────────────────────────────────────────
// Paginated list of payslips for this employee only
export async function getMyPayslips(
  userId:   string,
  tenantId: string,
  filters?: { year?: number; page?: number; limit?: number }
) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  const page  = Math.max(1, filters?.page  ?? 1);
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 12));
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = {
    employeeId: emp.id,
    tenantId,
    deletedAt: null,
    ...(filters?.year
      ? { period: { startsWith: String(filters.year) } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payslip.findMany({
      where,
      select: {
        id:         true,
        period:     true,
        netSalary:  true,
        grossSalary: true,
        createdAt:  true,
        payrollRun: { select: { status: true } },
      },
      orderBy: { period: 'desc' },
      skip,
      take: limit,
    }),
    prisma.payslip.count({ where }),
  ]);

  // Flatten the status out of the nested payrollRun object
  const payslips = items.map(p => ({
    id:          p.id,
    period:      p.period,
    netPay:      Number(p.netSalary),
    grossPay:    Number(p.grossSalary),
    status:      p.payrollRun?.status ?? 'UNKNOWN',
    createdAt:   p.createdAt,
  }));

  return { payslips, total, page, limit };
}

// ─── getMyPayslipPDF ──────────────────────────────────────────────────────────
// Generates a payslip PDF — verifies ownership before generating
export async function getMyPayslipPDF(
  payslipId: string,
  userId:    string,
  tenantId:  string
): Promise<Buffer> {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) throw new Error('לא נמצא רשומת עובד מקושרת למשתמש זה');

  const payslip = await prisma.payslip.findFirst({
    where: {
      id:         payslipId,
      employeeId: emp.id,          // ownership check — can only download own payslip
      tenantId,
      deletedAt:  null,
    },
    include: {
      employee: true,
    },
  });

  if (!payslip) throw new Error('תלוש שכר לא נמצא');

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const bd     = (payslip.breakdown as any) ?? {};
  const name   = `${emp.firstName} ${emp.lastName}`;

  const pdfBuffer = generatePayslipPDF({
    payslip: {
      id:                         payslip.id,
      period:                     payslip.period,
      grossSalary:                Number(payslip.grossSalary),
      netSalary:                  Number(payslip.netSalary),
      incomeTax:                  Number(payslip.incomeTax),
      nationalInsuranceEmployee:  Number(payslip.nationalInsurance),
      nationalInsuranceEmployer:  Number(payslip.niEmployer),
      healthInsurance:            Number(payslip.healthInsurance),
      pensionEmployee:            Number(payslip.pensionEmployee),
      pensionEmployer:            Number(payslip.pensionEmployer),
      trainingFundEmployee:       Number(payslip.trainingFundEmployee),
      trainingFundEmployer:       Number(payslip.trainingFundEmployer),
      sickDays:                   payslip.sickDays ?? 0,
      vacationDays:               bd.vacationAccruedDays ?? 0,
      recuperationPay:            bd.recuperationPay  ?? 0,
      recuperationDays:           (payslip as any).recuperationDays ?? bd.recuperationDays ?? 0,
      overtimePay:                bd.overtimePay125 != null
                                    ? (Number(bd.overtimePay125 ?? 0) + Number(bd.overtimePay150 ?? 0))
                                    : ((payslip as any).overtimePay ?? 0),
      overtimeHours:              bd.adjustments?.overtime125Hours != null
                                    ? (Number(bd.adjustments.overtime125Hours ?? 0) + Number(bd.adjustments.overtime150Hours ?? 0))
                                    : ((payslip as any).overtimeHours ?? 0),
      baseSalary:                 bd.baseSalary ?? Number(payslip.grossSalary),
    },
    employeeName:     name,
    employeeId:       emp.id,
    idNumber:         emp.idNumber,
    jobTitle:         emp.jobTitle,
    department:       emp.department,
    companyName:      tenant?.name ?? 'החברה',
    companyVatNumber: tenant?.vatNumber ?? tenant?.businessNumber,
  });

  return pdfBuffer;
}

// ─── getMyLeaveBalance ────────────────────────────────────────────────────────
// Returns leave balances for this employee — mirrors HR route logic
export async function getMyLeaveBalance(userId: string, tenantId: string) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  const year      = new Date().getFullYear();
  const startYear = new Date(year, 0, 1);
  const endYear   = new Date(year, 11, 31);

  const leaveTypes = await prisma.leaveType.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });

  const balances = await Promise.all(
    leaveTypes.map(async (lt) => {
      const used = await prisma.leaveRequest.aggregate({
        where: {
          employeeId:  emp.id,
          leaveTypeId: lt.id,
          status:      'APPROVED',
          startDate:   { gte: startYear, lte: endYear },
        },
        _sum: { totalDays: true },
      });

      // Also check dedicated LeaveBalance records if they exist
      const balanceRecord = await prisma.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: lt.id, year } },
      });

      const usedDays      = used._sum.totalDays ?? 0;
      const accrued       = balanceRecord?.accrued   ?? lt.maxDaysPerYear ?? null;
      const carryForward  = balanceRecord?.carryForward ?? 0;
      const totalAvailable = accrued != null ? Number(accrued) + Number(carryForward) : null;

      return {
        leaveType:      lt.name,
        leaveTypeId:    lt.id,
        isPaid:         lt.isPaid,
        maxDays:        lt.maxDaysPerYear,
        accrued:        accrued,
        carryForward:   carryForward,
        usedDays,
        remainingDays:  totalAvailable != null ? totalAvailable - Number(usedDays) : null,
      };
    })
  );

  return { employeeId: emp.id, year, balances };
}

// ─── getMyLeaveRequests ───────────────────────────────────────────────────────
// Returns leave requests for this employee only
export async function getMyLeaveRequests(
  userId:   string,
  tenantId: string,
  filters?: { status?: string; year?: number }
) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  const where: Record<string, unknown> = {
    employeeId: emp.id,
    tenantId,
    ...(filters?.status ? { status: filters.status as any } : {}),
    ...(filters?.year
      ? {
          startDate: {
            gte: new Date(filters.year, 0, 1),
            lte: new Date(filters.year, 11, 31),
          },
        }
      : {}),
  };

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      leaveType: { select: { name: true, isPaid: true, colorHex: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  return requests;
}

// ─── submitLeaveRequest ───────────────────────────────────────────────────────
// Employee submits a leave request on their own behalf
export async function submitLeaveRequest(
  userId:   string,
  tenantId: string,
  data: {
    leaveTypeId: string;
    startDate:   string;
    endDate:     string;
    notes?:      string;
  }
) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  const start = new Date(data.startDate);
  const end   = new Date(data.endDate);
  const now   = new Date();
  now.setHours(0, 0, 0, 0);

  // Validate: startDate must be before or equal to endDate
  if (start > end) {
    throw new Error('תאריך התחלה חייב להיות לפני תאריך הסיום');
  }

  // Validate: no past dates (allow today)
  if (start < now) {
    throw new Error('לא ניתן להגיש בקשת חופשה לתאריך שעבר');
  }

  // Validate: leaveTypeId belongs to this tenant
  const leaveType = await prisma.leaveType.findUnique({
    where: { id: data.leaveTypeId },
  });
  if (!leaveType || leaveType.tenantId !== tenantId) {
    throw new Error('סוג חופשה לא נמצא');
  }

  // Calculate business days (excluding Friday & Saturday — Israeli work week)
  let totalDays = 0;
  const cursor  = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 5 && dow !== 6) totalDays++;
    cursor.setDate(cursor.getDate() + 1);
  }

  const request = await prisma.leaveRequest.create({
    data: {
      tenantId,
      employeeId:  emp.id,
      leaveTypeId: data.leaveTypeId,
      startDate:   start,
      endDate:     end,
      totalDays,
      notes:       data.notes,
      status:      leaveType.requiresApproval ? 'PENDING' : 'APPROVED',
    },
    include: {
      leaveType: { select: { name: true, isPaid: true, requiresApproval: true } },
    },
  });

  return request;
}

// ─── getMyAttendance ──────────────────────────────────────────────────────────
// Returns attendance logs for this employee within a date range
export async function getMyAttendance(
  userId:   string,
  tenantId: string,
  filters:  { from: string; to: string }
) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  const from = new Date(filters.from);
  const to   = new Date(filters.to);
  to.setHours(23, 59, 59, 999); // include full last day

  const logs = await prisma.attendanceLog.findMany({
    where: {
      employeeId: emp.id,
      tenantId,
      date: { gte: from, lte: to },
    },
    select: {
      id:           true,
      date:         true,
      clockIn:      true,
      clockOut:     true,
      breakMinutes: true,
      notes:        true,
      gpsLocation:  true,
    },
    orderBy: { date: 'asc' },
  });

  // Compute worked hours per log
  const logsWithHours = logs.map(log => {
    let workedHours: number | null = null;
    if (log.clockOut) {
      const totalMs  = log.clockOut.getTime() - log.clockIn.getTime();
      const breakMs  = log.breakMinutes * 60 * 1000;
      workedHours    = Math.round(((totalMs - breakMs) / 3_600_000) * 100) / 100;
    }
    return { ...log, workedHours };
  });

  const summary = {
    totalDays:   logsWithHours.filter(l => l.clockOut).length,
    totalHours:  Math.round(
      logsWithHours.reduce((s, l) => s + (l.workedHours ?? 0), 0) * 100
    ) / 100,
  };

  return { logs: logsWithHours, summary };
}

// ─── getMyDocuments ───────────────────────────────────────────────────────────
// Returns expense reports belonging to this employee as their "documents"
// (The Document model is for business documents — quotes, invoices, etc.
//  Employee personal documents live in ExpenseReport + metadata)
export async function getMyDocuments(userId: string, tenantId: string) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  const reports = await prisma.expenseReport.findMany({
    where: {
      employeeId: emp.id,
      tenantId,
    },
    select: {
      id:          true,
      title:       true,
      period:      true,
      status:      true,
      totalAmount: true,
      notes:       true,
      createdAt:   true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return reports;
}

// ─── updateMyContact ──────────────────────────────────────────────────────────
// Employee may update only: phone, emergencyContact, emergencyPhone
// Emergency contact fields are stored in the metadata JSONB field
export async function updateMyContact(
  userId:   string,
  tenantId: string,
  data: {
    phone?:            string;
    emergencyContact?: string;
    emergencyPhone?:   string;
  }
) {
  const emp = await getMyEmployee(userId, tenantId);
  if (!emp) return null;

  // Merge new emergency contact fields into existing metadata
  const currentMetadata  = (emp.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata  = {
    ...currentMetadata,
    ...(data.emergencyContact !== undefined ? { emergencyContact: data.emergencyContact } : {}),
    ...(data.emergencyPhone   !== undefined ? { emergencyPhone:   data.emergencyPhone   } : {}),
  };

  const updated = await prisma.employee.update({
    where: { id: emp.id },
    data: {
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      metadata: updatedMetadata,
    },
    select: {
      id:             true,
      firstName:      true,
      lastName:       true,
      phone:          true,
      metadata:       true,
    },
  });

  return {
    id:               updated.id,
    firstName:        updated.firstName,
    lastName:         updated.lastName,
    phone:            updated.phone,
    emergencyContact: (updated.metadata as any)?.emergencyContact ?? null,
    emergencyPhone:   (updated.metadata as any)?.emergencyPhone   ?? null,
  };
}
