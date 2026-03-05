import { prisma } from '../../config/database';

// ─── Course Catalog ────────────────────────────────────────────────────────

export async function listCourses(
  tenantId: string,
  filters?: { isMandatory?: boolean; isActive?: boolean }
) {
  return prisma.trainingCourse.findMany({
    where: {
      tenantId,
      ...(filters?.isMandatory !== undefined ? { isMandatory: filters.isMandatory } : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    include: {
      _count: { select: { enrollments: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getCourse(id: string, tenantId: string) {
  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      _count: { select: { enrollments: true } },
    },
  });
  if (!course || course.tenantId !== tenantId) return null;
  return course;
}

export async function createCourse(
  tenantId: string,
  data: {
    name: string;
    description?: string;
    provider?: string;
    durationHours?: number;
    cost?: number;
    isMandatory?: boolean;
    validityMonths?: number;
  }
) {
  return prisma.trainingCourse.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      provider: data.provider,
      durationHours: data.durationHours,
      cost: data.cost !== undefined ? data.cost : undefined,
      isMandatory: data.isMandatory ?? false,
      validityMonths: data.validityMonths,
      isActive: true,
    },
  });
}

export async function updateCourse(
  id: string,
  tenantId: string,
  data: {
    name?: string;
    description?: string;
    provider?: string;
    durationHours?: number;
    cost?: number;
    isMandatory?: boolean;
    validityMonths?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.trainingCourse.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) return null;

  return prisma.trainingCourse.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.provider !== undefined ? { provider: data.provider } : {}),
      ...(data.durationHours !== undefined ? { durationHours: data.durationHours } : {}),
      ...(data.cost !== undefined ? { cost: data.cost } : {}),
      ...(data.isMandatory !== undefined ? { isMandatory: data.isMandatory } : {}),
      ...(data.validityMonths !== undefined ? { validityMonths: data.validityMonths } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

// ─── Enrollments ───────────────────────────────────────────────────────────

export async function enrollEmployee(
  tenantId: string,
  data: { employeeId: string; courseId: string }
) {
  // Verify employee and course both belong to this tenant
  const [employee, course] = await Promise.all([
    prisma.employee.findUnique({ where: { id: data.employeeId } }),
    prisma.trainingCourse.findUnique({ where: { id: data.courseId } }),
  ]);

  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('Employee not found');
  }
  if (!course || course.tenantId !== tenantId) {
    throw new Error('Course not found');
  }
  if (!course.isActive) {
    throw new Error('Course is not active');
  }

  // Calculate initial expiresAt if course has validityMonths
  let expiresAt: Date | undefined;
  if (course.validityMonths) {
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + course.validityMonths);
  }

  return prisma.employeeTraining.create({
    data: {
      tenantId,
      employeeId: data.employeeId,
      courseId: data.courseId,
      status: 'ENROLLED',
      enrolledAt: new Date(),
      expiresAt,
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      course: { select: { name: true, provider: true } },
    },
  });
}

export async function updateEnrollment(
  id: string,
  tenantId: string,
  data: {
    status?: string;
    score?: number;
    completedAt?: string;
    notes?: string;
    certificateUrl?: string;
  }
) {
  const enrollment = await prisma.employeeTraining.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!enrollment || enrollment.tenantId !== tenantId) return null;

  let expiresAt: Date | undefined = enrollment.expiresAt ?? undefined;

  // If marking as COMPLETED and course has validityMonths, set expiry from completedAt
  if (data.status === 'COMPLETED' && enrollment.course.validityMonths) {
    const base = data.completedAt ? new Date(data.completedAt) : new Date();
    expiresAt = new Date(base);
    expiresAt.setMonth(expiresAt.getMonth() + enrollment.course.validityMonths);
  }

  return prisma.employeeTraining.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.score !== undefined ? { score: data.score } : {}),
      ...(data.completedAt !== undefined ? { completedAt: new Date(data.completedAt) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.certificateUrl !== undefined ? { certificateUrl: data.certificateUrl } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      course: { select: { name: true, provider: true } },
    },
  });
}

export async function listEmployeeTrainings(employeeId: string, tenantId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) return null;

  return prisma.employeeTraining.findMany({
    where: { employeeId, tenantId },
    include: {
      course: {
        select: {
          name: true,
          provider: true,
          durationHours: true,
          isMandatory: true,
          validityMonths: true,
        },
      },
    },
    orderBy: { enrolledAt: 'desc' },
  });
}

export async function listCourseEnrollments(courseId: string, tenantId: string) {
  const course = await prisma.trainingCourse.findUnique({ where: { id: courseId } });
  if (!course || course.tenantId !== tenantId) return null;

  return prisma.employeeTraining.findMany({
    where: { courseId, tenantId },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
          jobTitle: true,
        },
      },
    },
    orderBy: { enrolledAt: 'desc' },
  });
}

// ─── Compliance Report ─────────────────────────────────────────────────────

export async function getMandatoryTrainingReport(tenantId: string): Promise<
  Array<{
    employeeId: string;
    employeeName: string;
    courseId: string;
    courseName: string;
    status: 'COMPLETED' | 'MISSING' | 'EXPIRED';
    expiresAt?: Date;
  }>
> {
  const now = new Date();

  const [mandatoryCourses, activeEmployees] = await Promise.all([
    prisma.trainingCourse.findMany({
      where: { tenantId, isMandatory: true, isActive: true },
    }),
    prisma.employee.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  if (mandatoryCourses.length === 0 || activeEmployees.length === 0) return [];

  // Fetch all relevant enrollments in one query
  const enrollments = await prisma.employeeTraining.findMany({
    where: {
      tenantId,
      courseId: { in: mandatoryCourses.map((c) => c.id) },
      employeeId: { in: activeEmployees.map((e) => e.id) },
    },
  });

  // Build lookup map: employeeId+courseId -> enrollment
  const enrollmentMap = new Map<string, (typeof enrollments)[0]>();
  for (const e of enrollments) {
    enrollmentMap.set(`${e.employeeId}:${e.courseId}`, e);
  }

  const report: Array<{
    employeeId: string;
    employeeName: string;
    courseId: string;
    courseName: string;
    status: 'COMPLETED' | 'MISSING' | 'EXPIRED';
    expiresAt?: Date;
  }> = [];

  for (const employee of activeEmployees) {
    for (const course of mandatoryCourses) {
      const key = `${employee.id}:${course.id}`;
      const enrollment = enrollmentMap.get(key);
      const employeeName = `${employee.firstName} ${employee.lastName}`;

      if (!enrollment || enrollment.status !== 'COMPLETED') {
        report.push({
          employeeId: employee.id,
          employeeName,
          courseId: course.id,
          courseName: course.name,
          status: 'MISSING',
        });
      } else if (enrollment.expiresAt && enrollment.expiresAt < now) {
        report.push({
          employeeId: employee.id,
          employeeName,
          courseId: course.id,
          courseName: course.name,
          status: 'EXPIRED',
          expiresAt: enrollment.expiresAt,
        });
      } else {
        report.push({
          employeeId: employee.id,
          employeeName,
          courseId: course.id,
          courseName: course.name,
          status: 'COMPLETED',
          expiresAt: enrollment.expiresAt ?? undefined,
        });
      }
    }
  }

  return report;
}

// ─── Expiry Alerts ─────────────────────────────────────────────────────────

export async function getExpiringCertifications(tenantId: string, daysAhead = 30) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  return prisma.employeeTraining.findMany({
    where: {
      tenantId,
      status: 'COMPLETED',
      expiresAt: {
        gte: now,
        lte: future,
      },
    },
    include: {
      employee: {
        select: { firstName: true, lastName: true, department: true },
      },
      course: {
        select: { name: true, provider: true, isMandatory: true },
      },
    },
    orderBy: { expiresAt: 'asc' },
  });
}
