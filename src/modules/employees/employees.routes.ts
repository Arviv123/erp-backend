import { Router, Response, Request } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';

const router = Router();

// ─── Public mobile login (no auth middleware) ─────────────────────
// POST /employees/mobile-login
// Body: { idNumber, pin, tenantId }
// Returns: { token, employee: { id, firstName, lastName } }
router.post('/mobile-login', async (req: Request, res: Response) => {
  const schema = z.object({
    idNumber: z.string().length(9),
    pin:      z.string().length(6).regex(/^\d{6}$/),
    tenantId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 'ת.ז. חייבת להיות 9 ספרות ו-PIN 6 ספרות', 400); return; }

  const { idNumber, pin, tenantId } = parsed.data;

  const emp = await prisma.employee.findFirst({
    where: { tenantId, idNumber, isActive: true },
    select: { id: true, firstName: true, lastName: true, mobilePin: true, tenantId: true },
  });

  if (!emp) { sendError(res, 'עובד לא נמצא', 401); return; }
  if (!emp.mobilePin) { sendError(res, 'PIN לא הוגדר — פנה למעסיק', 401); return; }

  const valid = await bcrypt.compare(pin, emp.mobilePin);
  if (!valid) { sendError(res, 'PIN שגוי', 401); return; }

  const token = jwt.sign(
    { employeeId: emp.id, tenantId: emp.tenantId, role: 'EMPLOYEE', email: '' },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' }
  );

  sendSuccess(res, {
    token,
    employee: { id: emp.id, firstName: emp.firstName, lastName: emp.lastName },
  });
});

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const CreateEmployeeSchema = z.object({
  firstName:      z.string().min(1),
  lastName:       z.string().min(1),
  idNumber:       z.string().length(9),
  birthDate:      z.string().datetime(),
  gender:         z.enum(['M', 'F', 'OTHER']),
  address:        z.object({ street: z.string(), city: z.string(), zip: z.string().optional() }),
  phone:          z.string().min(9),
  personalEmail:  z.string().email(),
  startDate:      z.string().datetime(),
  jobTitle:       z.string().min(1),
  department:     z.string().min(1),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'HOURLY', 'CONTRACTOR']).default('FULL_TIME'),
  grossSalary:    z.number().positive(),
  taxCredits:     z.number().default(2.25),
  pensionFund:    z.string().optional(),
  pensionEmployee: z.number().default(6.00),
  pensionEmployer: z.number().default(6.50),
  severancePay:    z.number().default(8.33),
  // Optional: create a user account
  createUser:     z.boolean().default(false),
  userEmail:      z.string().email().optional(),
  userPassword:   z.string().min(8).optional(),
  userRole:       z.enum(['EMPLOYEE', 'HR_MANAGER', 'ACCOUNTANT', 'ADMIN']).default('EMPLOYEE'),
});

// GET /employees/me — own employee profile for logged-in user
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user || !(user as any).employeeId) {
    sendError(res, 'No employee profile linked to this user', 404);
    return;
  }
  const emp = await prisma.employee.findUnique({
    where:   { id: (user as any).employeeId },
    include: { salaryHistory: { orderBy: { changedAt: 'desc' }, take: 5 } },
  });
  if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }
  sendSuccess(res, emp);
});

// ─── Mobile employee self-service routes ─────────────────────────

// GET /employees/mobile/me — employee profile by JWT employeeId
router.get('/mobile/me', async (req: AuthenticatedRequest, res: Response) => {
  const empId = req.user.employeeId;
  if (!empId) { sendError(res, 'לא סשן מובייל', 403); return; }
  const emp = await prisma.employee.findUnique({
    where: { id: empId },
    include: {
      payslips: {
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { payrollRun: { select: { period: true, status: true, paidAt: true } } },
      },
    },
  });
  if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }
  // Strip sensitive fields
  const { mobilePin: _pin, ...safeEmp } = emp as any;
  sendSuccess(res, safeEmp);
});

// POST /employees/:id/set-pin — HR sets PIN for employee
router.post('/:id/set-pin', requireMinRole('HR_MANAGER') as any, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ pin: z.string().length(6).regex(/^\d{6}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 'PIN חייב להיות 6 ספרות', 400); return; }

  const emp = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

  const pinHash = await bcrypt.hash(parsed.data.pin, 12);
  await prisma.employee.update({ where: { id: req.params.id }, data: { mobilePin: pinHash } });
  sendSuccess(res, { message: 'PIN עודכן בהצלחה' });
});

// PATCH /employees/:id/form101 — save Form 101 (tax declaration data)
router.patch('/:id/form101', async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    // Personal
    maritalStatus:    z.enum(['SINGLE','MARRIED','DIVORCED','WIDOWED']).optional(),
    spouseWorking:    z.boolean().optional(),
    // Credit point details
    resident:         z.boolean().optional(),
    newImmigrant:     z.boolean().optional(),
    newImmigrantDate: z.string().optional(),
    veteran:          z.boolean().optional(),
    disability:       z.boolean().optional(),
    disabilityPct:    z.number().min(0).max(100).optional(),
    academicDegree:   z.boolean().optional(),
    singleParent:     z.boolean().optional(),
    children:         z.array(z.object({ birthYear: z.number(), points: z.number() })).optional(),
    // Other income
    otherIncomeSources: z.boolean().optional(),
    otherIncomeDetails: z.string().optional(),
    // Bank
    bankForRefund:    z.object({ bank: z.string(), branch: z.string(), account: z.string() }).optional(),
    // Signature
    signedAt:         z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Allow: self (EMPLOYEE role with matching employeeId) OR HR_MANAGER+
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  const isSelf = user && (user as any).employeeId === req.params.id;
  const isHR   = ['HR_MANAGER','ACCOUNTANT','PAYROLL_ADMIN','ADMIN','MANAGER'].includes(req.user.role);
  if (!isSelf && !isHR) { sendError(res, 'Forbidden', 403); return; }

  const emp = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

  const { children, ...rest } = parsed.data;

  // Recalculate credit points
  let points = Number(emp.taxCredits) ?? 2.25;
  const current = (emp.creditPointsDetails as any) ?? {};

  const merged = { ...current, ...rest, ...(children !== undefined ? { children } : {}) };

  // Auto-calculate points from details
  points = 0;
  if (merged.resident !== false)     points += 1.0;
  if (merged.gender === 'F' || emp.gender === 'F') points += 0.5;
  if (merged.spouseWorking)          points += 0.5;
  if (merged.singleParent)           points += 1.0;
  if (merged.newImmigrant)           points += 1.0;
  if (merged.veteran)                points += 0.5;
  if (merged.disability && merged.disabilityPct >= 90) points += 1.0;
  else if (merged.disability && merged.disabilityPct >= 50) points += 0.5;
  if (merged.academicDegree)         points += 0.25;
  for (const c of (merged.children ?? [])) points += c.points;

  const updated = await prisma.employee.update({
    where: { id: req.params.id },
    data:  {
      creditPointsDetails: merged,
      taxCredits: points,
      ...(parsed.data.maritalStatus ? { maritalStatus: parsed.data.maritalStatus } as any : {}),
    },
  });
  sendSuccess(res, updated);
});

// GET /employees
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const { page = '1', pageSize = '20', department, isActive } = req.query;

  const where = withTenant(req, {
    ...(department ? { department: department as string } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, jobTitle: true,
        department: true, grossSalary: true, isActive: true, startDate: true,
      },
      orderBy: { lastName: 'asc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.employee.count({ where }),
  ]);

  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
});

// GET /employees/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const emp = await prisma.employee.findUnique({
    where:   { id: req.params.id },
    include: { salaryHistory: { orderBy: { changedAt: 'desc' } } },
  });

  if (!emp || emp.tenantId !== req.user.tenantId) {
    sendError(res, 'Employee not found', 404);
    return;
  }

  sendSuccess(res, emp);
});

// POST /employees
router.post(
  '/',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const { createUser, userEmail, userPassword, userRole, ...empData } = parsed.data;

    try {
      const employee = await prisma.$transaction(async (tx) => {
        const emp = await tx.employee.create({
          data: {
            ...empData,
            birthDate: new Date(empData.birthDate),
            startDate: new Date(empData.startDate),
            tenantId:  req.user.tenantId,
          },
        });

        if (createUser && userEmail && userPassword) {
          const passwordHash = await bcrypt.hash(userPassword, 12);
          const user = await tx.user.create({
            data: {
              tenantId:     req.user.tenantId,
              email:        userEmail,
              passwordHash,
              role:         userRole,
              firstName:    empData.firstName,
              lastName:     empData.lastName,
              employeeId:   emp.id,
            } as any,
          });
          await tx.employee.update({ where: { id: emp.id }, data: { userId: user.id } });
        }

        return emp;
      });

      sendSuccess(res, employee, 201);
    } catch (err: any) {
      if (err.code === 'P2002') sendError(res, 'Employee with this ID number already exists');
      else throw err;
    }
  }
);

// PATCH /employees/:id/salary  - update salary with history
router.patch(
  '/:id/salary',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({ grossSalary: z.number().positive(), reason: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const emp = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

    const [updated] = await prisma.$transaction([
      prisma.employee.update({
        where: { id: req.params.id },
        data:  { grossSalary: parsed.data.grossSalary },
      }),
      prisma.salaryHistory.create({
        data: {
          employeeId:  req.params.id,
          grossSalary: parsed.data.grossSalary,
          changedBy:   req.user.userId,
          reason:      parsed.data.reason,
        },
      }),
    ]);

    sendSuccess(res, updated);
  }
);

// PATCH /employees/:id/bank  — update bank account details
router.patch(
  '/:id/bank',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      bank:          z.string().min(1),
      branchCode:    z.string().min(1),
      accountNumber: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const emp = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data:  { bankAccount: parsed.data },
    });

    sendSuccess(res, updated);
  }
);

// DELETE /employees/:id  (soft delete)
router.delete(
  '/:id',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const emp = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

    await prisma.employee.update({
      where: { id: req.params.id },
      data:  { isActive: false, endDate: new Date() },
    });

    sendSuccess(res, { message: 'Employee deactivated' });
  }
);

export default router;
