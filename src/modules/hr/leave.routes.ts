import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Leave Types ──────────────────────────────────────────────────

router.get(
  '/leave-types',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const types = await prisma.leaveType.findMany({
      where:   withTenant(req),
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, types);
  })
);

router.post(
  '/leave-types',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:             z.string().min(1),
      isPaid:           z.boolean().default(true),
      maxDaysPerYear:   z.number().int().positive().optional(),
      requiresApproval: z.boolean().default(true),
      colorHex:         z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const leaveType = await prisma.leaveType.create({
      data: { ...parsed.data, tenantId: req.user.tenantId },
    });
    sendSuccess(res, leaveType, 201);
  })
);

// ─── Leave Requests ───────────────────────────────────────────────

router.post(
  '/leave-requests',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      employeeId:  z.string().cuid(),
      leaveTypeId: z.string().cuid(),
      startDate:   z.string().datetime(),
      endDate:     z.string().datetime(),
      notes:       z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    // Verify employee and leave type belong to tenant
    const [employee, leaveType] = await Promise.all([
      prisma.employee.findUnique({ where: { id: parsed.data.employeeId } }),
      prisma.leaveType.findUnique({ where: { id: parsed.data.leaveTypeId } }),
    ]);

    if (!employee || employee.tenantId !== req.user.tenantId) {
      sendError(res, 'Employee not found', 404); return;
    }
    if (!leaveType || leaveType.tenantId !== req.user.tenantId) {
      sendError(res, 'Leave type not found', 404); return;
    }

    // Calculate business days (excluding weekends but not holidays for simplicity)
    const start = new Date(parsed.data.startDate);
    const end   = new Date(parsed.data.endDate);
    let totalDays = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const dow = cursor.getDay();
      if (dow !== 5 && dow !== 6) totalDays++; // exclude Friday & Saturday (Israel)
      cursor.setDate(cursor.getDate() + 1);
    }

    const request = await prisma.leaveRequest.create({
      data: {
        tenantId:    req.user.tenantId,
        employeeId:  parsed.data.employeeId,
        leaveTypeId: parsed.data.leaveTypeId,
        startDate:   start,
        endDate:     end,
        totalDays,
        notes:       parsed.data.notes,
        status:      leaveType.requiresApproval ? 'PENDING' : 'APPROVED',
      },
      include: {
        employee:  { select: { firstName: true, lastName: true } },
        leaveType: { select: { name: true, isPaid: true } },
      },
    });

    sendSuccess(res, request, 201);
  })
);

router.get(
  '/leave-requests',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { employeeId, status, page = '1', pageSize = '20' } = req.query;

    const where = withTenant(req, {
      ...(employeeId ? { employeeId: employeeId as string } : {}),
      ...(status     ? { status:     status as any }        : {}),
    });

    const [items, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: {
          employee:  { select: { firstName: true, lastName: true } },
          leaveType: { select: { name: true, isPaid: true, colorHex: true } },
        },
        orderBy: { startDate: 'desc' },
        skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take:    parseInt(pageSize as string),
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
  })
);

// PATCH /hr/leave-requests/:id/approve
router.patch(
  '/leave-requests/:id/approve',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const req_ = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!req_ || req_.tenantId !== req.user.tenantId) { sendError(res, 'Request not found', 404); return; }
    if (req_.status !== 'PENDING') { sendError(res, 'Can only approve PENDING requests'); return; }

    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data:  { status: 'APPROVED', approvedBy: req.user.userId, approvedAt: new Date() },
    });
    sendSuccess(res, updated);
  })
);

// PATCH /hr/leave-requests/:id/reject
router.patch(
  '/leave-requests/:id/reject',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({ reason: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const req_ = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!req_ || req_.tenantId !== req.user.tenantId) { sendError(res, 'Request not found', 404); return; }

    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data:  { status: 'REJECTED', rejectedReason: parsed.data.reason, approvedBy: req.user.userId },
    });
    sendSuccess(res, updated);
  })
);

// GET /hr/employees/:id/leave-balance
router.get(
  '/employees/:id/leave-balance',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee || employee.tenantId !== req.user.tenantId) {
      sendError(res, 'Employee not found', 404); return;
    }

    const year      = new Date().getFullYear();
    const startYear = new Date(year, 0, 1);
    const endYear   = new Date(year, 11, 31);

    const leaveTypes = await prisma.leaveType.findMany({
      where: { tenantId: req.user.tenantId },
    });

    const balances = await Promise.all(leaveTypes.map(async (lt) => {
      const used = await prisma.leaveRequest.aggregate({
        where: {
          employeeId:  req.params.id,
          leaveTypeId: lt.id,
          status:      'APPROVED',
          startDate:   { gte: startYear, lte: endYear },
        },
        _sum: { totalDays: true },
      });

      return {
        leaveType:     lt.name,
        maxDays:       lt.maxDaysPerYear,
        usedDays:      used._sum.totalDays ?? 0,
        remainingDays: lt.maxDaysPerYear ? lt.maxDaysPerYear - (used._sum.totalDays ?? 0) : null,
      };
    }));

    sendSuccess(res, { employeeId: req.params.id, year, balances });
  })
);

// ─── Holiday Calendar ─────────────────────────────────────────────

router.get(
  '/holidays',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    const holidays = await prisma.holidayCalendar.findMany({
      where: {
        tenantId: req.user.tenantId,
        date: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31),
        },
      },
      orderBy: { date: 'asc' },
    });
    sendSuccess(res, holidays);
  })
);

export default router;
