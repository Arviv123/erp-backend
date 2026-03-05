import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  createOnboardingChecklist,
  createOffboardingChecklist,
  getEmployeeTasks,
  updateTask,
  getChecklistProgress,
} from './onboarding.service';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Onboarding ────────────────────────────────────────────────────────────

// POST /hr/onboarding/employees/:empId/onboarding
router.post(
  '/employees/:empId/onboarding',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      hireDate: z.string().datetime().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    // If hireDate not provided, use employee's startDate or today
    let hireDate: Date;
    if (parsed.data.hireDate) {
      hireDate = new Date(parsed.data.hireDate);
    } else {
      const emp = await prisma.employee.findUnique({ where: { id: req.params.empId } });
      if (!emp || emp.tenantId !== req.user.tenantId) {
        sendError(res, 'Employee not found', 404); return;
      }
      hireDate = emp.startDate ?? new Date();
    }

    try {
      const tasks = await createOnboardingChecklist(
        req.user.tenantId,
        req.params.empId,
        hireDate
      );
      sendSuccess(res, tasks, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'Failed to create onboarding checklist', 400);
    }
  })
);

// POST /hr/onboarding/employees/:empId/offboarding
router.post(
  '/employees/:empId/offboarding',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      lastDay: z.string().datetime(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const tasks = await createOffboardingChecklist(
        req.user.tenantId,
        req.params.empId,
        new Date(parsed.data.lastDay)
      );
      sendSuccess(res, tasks, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'Failed to create offboarding checklist', 400);
    }
  })
);

// GET /hr/onboarding/employees/:empId/tasks
router.get(
  '/employees/:empId/tasks',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Allow HR_MANAGER+ or the employee themselves (by userId→employeeId)
    const isHR = ['HR_MANAGER', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    if (!isHR) {
      // Check if the requesting user is the employee themselves
      const user = req.user.userId
        ? await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true } as any })
        : null;
      const userEmployee = user
        ? await prisma.employee.findFirst({ where: { userId: req.user.userId, id: req.params.empId } })
        : null;
      if (!userEmployee) {
        sendError(res, 'Forbidden', 403); return;
      }
    }

    const typeParam = req.query.type as string | undefined;
    const validTypes = ['ONBOARDING', 'OFFBOARDING'];
    if (typeParam && !validTypes.includes(typeParam)) {
      sendError(res, 'type must be ONBOARDING or OFFBOARDING'); return;
    }

    const tasks = await getEmployeeTasks(
      req.params.empId,
      req.user.tenantId,
      typeParam as 'ONBOARDING' | 'OFFBOARDING' | undefined
    );

    if (tasks === null) { sendError(res, 'Employee not found', 404); return; }
    sendSuccess(res, tasks);
  })
);

// PATCH /hr/onboarding/tasks/:id
router.patch(
  '/tasks/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      status:      z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']),
      completedAt: z.string().datetime().optional(),
      notes:       z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    // Only HR_MANAGER+ can mark tasks, or assignee via HR role
    // For simplicity, require HR_MANAGER minimum (individual assignees managed at app layer)
    const isHR = ['HR_MANAGER', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    if (!isHR) {
      sendError(res, 'Forbidden - HR_MANAGER role required', 403); return;
    }

    const task = await updateTask(req.params.id, req.user.tenantId, parsed.data);
    if (!task) { sendError(res, 'Task not found', 404); return; }
    sendSuccess(res, task);
  })
);

// GET /hr/onboarding/employees/:empId/progress
router.get(
  '/employees/:empId/progress',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const typeParam = req.query.type as string | undefined;
    const validTypes = ['ONBOARDING', 'OFFBOARDING'];
    if (!typeParam || !validTypes.includes(typeParam)) {
      sendError(res, 'type query parameter required (ONBOARDING or OFFBOARDING)'); return;
    }

    const progress = await getChecklistProgress(
      req.params.empId,
      req.user.tenantId,
      typeParam
    );

    if (progress === null) { sendError(res, 'Employee not found', 404); return; }
    sendSuccess(res, progress);
  })
);

export default router;
