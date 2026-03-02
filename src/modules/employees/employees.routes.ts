import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';

const router = Router();
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
