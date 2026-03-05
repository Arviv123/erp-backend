import { prisma } from '../../config/database';

// ─── Templates ─────────────────────────────────────────────────────────────

interface TaskTemplate {
  title:       string;
  description: string;
  assignedTo:  string;
  dueAfterDays: number; // positive = days after hireDate/lastDay, negative = days before lastDay
}

const ONBOARDING_TEMPLATE: TaskTemplate[] = [
  {
    title:        'חתימת הסכם עבודה',
    description:  'חתימה דיגיטלית על הסכם העסקה',
    assignedTo:   'HR',
    dueAfterDays: 1,
  },
  {
    title:        'מילוי טופס 101',
    description:  'נקודות זיכוי מס הכנסה',
    assignedTo:   'EMPLOYEE',
    dueAfterDays: 3,
  },
  {
    title:        'פרטי חשבון בנק',
    description:  'קבלת פרטי חשבון לתשלום משכורת',
    assignedTo:   'EMPLOYEE',
    dueAfterDays: 3,
  },
  {
    title:        'הגדרת תחנת עבודה',
    description:  'מחשב, מסך, ציוד משרדי',
    assignedTo:   'IT',
    dueAfterDays: 1,
  },
  {
    title:        'פתיחת חשבון דוא"ל',
    description:  'חשבון דוא"ל חברתי',
    assignedTo:   'IT',
    dueAfterDays: 1,
  },
  {
    title:        'הדרכת בטיחות',
    description:  'קורס בטיחות בסיסי',
    assignedTo:   'HR',
    dueAfterDays: 7,
  },
  {
    title:        'הכרת הצוות',
    description:  'פגישת היכרות עם צוות המחלקה',
    assignedTo:   'MANAGER',
    dueAfterDays: 3,
  },
  {
    title:        'הצטרפות לקרן פנסיה',
    description:  'מילוי טפסי קרן פנסיה',
    assignedTo:   'HR',
    dueAfterDays: 30,
  },
];

const OFFBOARDING_TEMPLATE: TaskTemplate[] = [
  {
    title:        'החזרת ציוד IT',
    description:  'מחשב, מסך, מקלדת, עכבר',
    assignedTo:   'IT',
    dueAfterDays: 0,
  },
  {
    title:        'ביטול גישות מערכת',
    description:  'ביטול כל הגישות והחשבונות',
    assignedTo:   'IT',
    dueAfterDays: 0,
  },
  {
    title:        'העברת אחריות',
    description:  'העברת עבודה שוטפת למחליף',
    assignedTo:   'MANAGER',
    dueAfterDays: -7,
  },
  {
    title:        'ראיון עזיבה',
    description:  'Exit interview עם HR',
    assignedTo:   'HR',
    dueAfterDays: -3,
  },
  {
    title:        'תלוש שכר אחרון',
    description:  'הכנת תלוש שכר סיום',
    assignedTo:   'HR',
    dueAfterDays: 0,
  },
  {
    title:        'החזרת מפתחות ותג',
    description:  'מפתחות משרד ותג כניסה',
    assignedTo:   'EMPLOYEE',
    dueAfterDays: 0,
  },
];

// ─── Helper ────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── Service Functions ─────────────────────────────────────────────────────

export async function createOnboardingChecklist(
  tenantId: string,
  employeeId: string,
  hireDate: Date
) {
  // Verify employee belongs to tenant
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('Employee not found');
  }

  const tasks = await prisma.$transaction(
    ONBOARDING_TEMPLATE.map((template) =>
      prisma.onboardingTask.create({
        data: {
          tenantId,
          employeeId,
          type:        'ONBOARDING',
          title:       template.title,
          description: template.description,
          assignedTo:  template.assignedTo,
          dueDate:     addDays(hireDate, template.dueAfterDays),
          status:      'PENDING',
        },
      })
    )
  );

  return tasks;
}

export async function createOffboardingChecklist(
  tenantId: string,
  employeeId: string,
  lastDay: Date
) {
  // Verify employee belongs to tenant
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    throw new Error('Employee not found');
  }

  const tasks = await prisma.$transaction(
    OFFBOARDING_TEMPLATE.map((template) =>
      prisma.onboardingTask.create({
        data: {
          tenantId,
          employeeId,
          type:        'OFFBOARDING',
          title:       template.title,
          description: template.description,
          assignedTo:  template.assignedTo,
          dueDate:     addDays(lastDay, template.dueAfterDays),
          status:      'PENDING',
        },
      })
    )
  );

  return tasks;
}

export async function getEmployeeTasks(
  employeeId: string,
  tenantId: string,
  type?: 'ONBOARDING' | 'OFFBOARDING'
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) return null;

  return prisma.onboardingTask.findMany({
    where: {
      employeeId,
      tenantId,
      ...(type ? { type } : {}),
    },
    orderBy: [{ type: 'asc' }, { dueDate: 'asc' }],
  });
}

export async function updateTask(
  id: string,
  tenantId: string,
  data: {
    status:      string;
    completedAt?: string;
    notes?:       string;
  }
) {
  const task = await prisma.onboardingTask.findUnique({ where: { id } });
  if (!task || task.tenantId !== tenantId) return null;

  // Auto-set completedAt if marking COMPLETED and not provided
  let completedAt: Date | undefined = task.completedAt ?? undefined;
  if (data.status === 'COMPLETED') {
    completedAt = data.completedAt ? new Date(data.completedAt) : new Date();
  } else if (data.status === 'PENDING' || data.status === 'IN_PROGRESS') {
    // Reopen: clear completedAt
    completedAt = undefined;
  }

  return prisma.onboardingTask.update({
    where: { id },
    data: {
      status:      data.status,
      completedAt: completedAt ?? null,
      ...(data.notes !== undefined ? { description: data.notes } : {}),
    },
  });
}

export async function getChecklistProgress(
  employeeId: string,
  tenantId: string,
  type: string
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) return null;

  const tasks = await prisma.onboardingTask.findMany({
    where: {
      employeeId,
      tenantId,
      type,
    },
    select: { status: true },
  });

  const total      = tasks.length;
  const completed  = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const skipped    = tasks.filter((t) => t.status === 'SKIPPED').length;
  const pending    = tasks.filter((t) => t.status === 'PENDING').length;

  // Completion percentage ignores skipped tasks from denominator
  const relevantTotal = total - skipped;
  const completionPct = relevantTotal > 0 ? Math.round((completed / relevantTotal) * 100) : 0;

  return {
    total,
    completed,
    inProgress,
    skipped,
    pending,
    completionPct,
  };
}
