import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  enrollEmployee,
  updateEnrollment,
  listEmployeeTrainings,
  listCourseEnrollments,
  getMandatoryTrainingReport,
  getExpiringCertifications,
} from './training.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Course Catalog ────────────────────────────────────────────────────────

// GET /hr/training/courses
router.get(
  '/courses',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { isMandatory, isActive } = req.query;
    const filters: { isMandatory?: boolean; isActive?: boolean } = {};
    if (isMandatory !== undefined) filters.isMandatory = isMandatory === 'true';
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const courses = await listCourses(req.user.tenantId, filters);
    sendSuccess(res, courses);
  })
);

// POST /hr/training/courses
router.post(
  '/courses',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:           z.string().min(1),
      description:    z.string().optional(),
      provider:       z.string().optional(),
      durationHours:  z.number().int().positive().optional(),
      cost:           z.number().min(0).optional(),
      isMandatory:    z.boolean().default(false),
      validityMonths: z.number().int().positive().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const course = await createCourse(req.user.tenantId, parsed.data);
    sendSuccess(res, course, 201);
  })
);

// GET /hr/training/courses/:id
router.get(
  '/courses/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const course = await getCourse(req.params.id, req.user.tenantId);
    if (!course) { sendError(res, 'Course not found', 404); return; }
    sendSuccess(res, course);
  })
);

// PUT /hr/training/courses/:id
router.put(
  '/courses/:id',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:           z.string().min(1).optional(),
      description:    z.string().optional(),
      provider:       z.string().optional(),
      durationHours:  z.number().int().positive().optional(),
      cost:           z.number().min(0).optional(),
      isMandatory:    z.boolean().optional(),
      validityMonths: z.number().int().positive().optional(),
      isActive:       z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const course = await updateCourse(req.params.id, req.user.tenantId, parsed.data);
    if (!course) { sendError(res, 'Course not found', 404); return; }
    sendSuccess(res, course);
  })
);

// ─── Enrollments ───────────────────────────────────────────────────────────

// POST /hr/training/courses/:id/enroll
router.post(
  '/courses/:id/enroll',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      employeeId: z.string().cuid(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const enrollment = await enrollEmployee(req.user.tenantId, {
        employeeId: parsed.data.employeeId,
        courseId:   req.params.id,
      });
      sendSuccess(res, enrollment, 201);
    } catch (err: any) {
      if (err.code === 'P2002') {
        sendError(res, 'Employee is already enrolled in this course', 409);
      } else {
        sendError(res, err.message ?? 'Enrollment failed', 400);
      }
    }
  })
);

// GET /hr/training/enrollments/employee/:empId
router.get(
  '/enrollments/employee/:empId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const trainings = await listEmployeeTrainings(req.params.empId, req.user.tenantId);
    if (trainings === null) { sendError(res, 'Employee not found', 404); return; }
    sendSuccess(res, trainings);
  })
);

// GET /hr/training/enrollments/course/:courseId
router.get(
  '/enrollments/course/:courseId',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const enrollments = await listCourseEnrollments(req.params.courseId, req.user.tenantId);
    if (enrollments === null) { sendError(res, 'Course not found', 404); return; }
    sendSuccess(res, enrollments);
  })
);

// PATCH /hr/training/enrollments/:id
router.patch(
  '/enrollments/:id',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      status:         z.enum(['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED']).optional(),
      score:          z.number().int().min(0).max(100).optional(),
      completedAt:    z.string().datetime().optional(),
      notes:          z.string().optional(),
      certificateUrl: z.string().url().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const enrollment = await updateEnrollment(req.params.id, req.user.tenantId, parsed.data);
    if (!enrollment) { sendError(res, 'Enrollment not found', 404); return; }
    sendSuccess(res, enrollment);
  })
);

// ─── Reports ───────────────────────────────────────────────────────────────

// GET /hr/training/reports/mandatory
router.get(
  '/reports/mandatory',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const report = await getMandatoryTrainingReport(req.user.tenantId);
    sendSuccess(res, report);
  })
);

// GET /hr/training/reports/expiring
router.get(
  '/reports/expiring',
  requireMinRole('HR_MANAGER') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const daysAhead = req.query.daysAhead ? parseInt(req.query.daysAhead as string, 10) : 30;
    if (isNaN(daysAhead) || daysAhead < 1) {
      sendError(res, 'daysAhead must be a positive integer'); return;
    }
    const expiring = await getExpiringCertifications(req.user.tenantId, daysAhead);
    sendSuccess(res, expiring);
  })
);

export default router;
