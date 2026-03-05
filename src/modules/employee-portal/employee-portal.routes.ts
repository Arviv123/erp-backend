import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as PortalService from './employee-portal.service';

const router = Router();

// All portal routes require a valid JWT + active tenant — no role restriction.
// Any employee (or higher role) who has a linked employee record may use this.
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Extract userId — handles both userId and id field variations in payload */
function getUserId(req: AuthenticatedRequest): string {
  return (req as any).user?.id ?? req.user.userId;
}

/** Shorthand: tenantId from middleware */
function getTenantId(req: AuthenticatedRequest): string {
  return withTenant(req).tenantId as string;
}

/** Standard 404 response when no employee record is linked to the user */
const EMPLOYEE_NOT_FOUND = 'לא נמצא רשומת עובד מקושרת למשתמש זה';

// ─── GET /api/employee-portal/me ─────────────────────────────────────────────
// Returns employee's public profile (no salary / bank info)
router.get(
  '/me',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const profile = await PortalService.getMyProfile(getUserId(req), getTenantId(req));
    if (!profile) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
    sendSuccess(res, profile);
  })
);

// ─── GET /api/employee-portal/me/payslips ────────────────────────────────────
// Paginated list of own payslips
// Query: year (number), page (number), limit (number)
router.get(
  '/me/payslips',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const year  = req.query.year  ? Number(req.query.year)  : undefined;
    const page  = req.query.page  ? Number(req.query.page)  : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 12;

    const result = await PortalService.getMyPayslips(getUserId(req), getTenantId(req), {
      year, page, limit,
    });

    if (!result) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }

    sendSuccess(res, result.payslips, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── GET /api/employee-portal/me/payslips/:id/pdf ────────────────────────────
// Download own payslip as PDF — ownership verified inside service
router.get(
  '/me/payslips/:id/pdf',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pdfBuffer = await PortalService.getMyPayslipPDF(
        req.params.id,
        getUserId(req),
        getTenantId(req)
      );

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="payslip-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      if (
        err.message === 'לא נמצא רשומת עובד מקושרת למשתמש זה' ||
        err.message === 'תלוש שכר לא נמצא'
      ) {
        sendError(res, err.message, 404);
      } else {
        sendError(res, err.message, 500);
      }
    }
  })
);

// ─── GET /api/employee-portal/me/leave-balance ───────────────────────────────
// Returns current-year leave balances for this employee
router.get(
  '/me/leave-balance',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const balance = await PortalService.getMyLeaveBalance(getUserId(req), getTenantId(req));
    if (!balance) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
    sendSuccess(res, balance);
  })
);

// ─── GET /api/employee-portal/me/leave-requests ──────────────────────────────
// Returns own leave requests
// Query: status (PENDING | APPROVED | REJECTED | CANCELLED), year (number)
router.get(
  '/me/leave-requests',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const year   = req.query.year ? Number(req.query.year) : undefined;

    const requests = await PortalService.getMyLeaveRequests(
      getUserId(req),
      getTenantId(req),
      { status, year }
    );

    if (!requests) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
    sendSuccess(res, requests);
  })
);

// ─── POST /api/employee-portal/me/leave-requests ─────────────────────────────
// Submit a new leave request on behalf of the logged-in employee
router.post(
  '/me/leave-requests',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      leaveTypeId: z.string().cuid({ message: 'leaveTypeId must be a valid CUID' }),
      startDate:   z.string().min(1, 'startDate is required'),
      endDate:     z.string().min(1, 'endDate is required'),
      notes:       z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors.map(e => e.message).join(', '));
      return;
    }

    try {
      const request = await PortalService.submitLeaveRequest(
        getUserId(req),
        getTenantId(req),
        parsed.data
      );

      if (!request) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
      sendSuccess(res, request, 201);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  })
);

// ─── GET /api/employee-portal/me/attendance ──────────────────────────────────
// Returns attendance logs within a required date range
// Query: from (YYYY-MM-DD, required), to (YYYY-MM-DD, required)
router.get(
  '/me/attendance',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query as Record<string, string | undefined>;

    if (!from || !to) {
      sendError(res, 'שדות from ו-to הינם חובה (פורמט: YYYY-MM-DD)');
      return;
    }

    // Basic date format validation
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(from) || !datePattern.test(to)) {
      sendError(res, 'פורמט תאריך שגוי — נדרש YYYY-MM-DD');
      return;
    }

    const result = await PortalService.getMyAttendance(
      getUserId(req),
      getTenantId(req),
      { from, to }
    );

    if (!result) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
    sendSuccess(res, result);
  })
);

// ─── GET /api/employee-portal/me/documents ───────────────────────────────────
// Returns expense reports belonging to this employee
router.get(
  '/me/documents',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const docs = await PortalService.getMyDocuments(getUserId(req), getTenantId(req));
    if (!docs) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
    sendSuccess(res, docs);
  })
);

// ─── PUT /api/employee-portal/me/contact ─────────────────────────────────────
// Update only safe contact fields: phone, emergencyContact, emergencyPhone
router.put(
  '/me/contact',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      phone:            z.string().min(1).optional(),
      emergencyContact: z.string().min(1).optional(),
      emergencyPhone:   z.string().min(1).optional(),
    }).refine(
      data => Object.values(data).some(v => v !== undefined),
      { message: 'יש לספק לפחות שדה אחד לעדכון: phone, emergencyContact, emergencyPhone' }
    );

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors.map(e => e.message).join(', '));
      return;
    }

    const updated = await PortalService.updateMyContact(
      getUserId(req),
      getTenantId(req),
      parsed.data
    );

    if (!updated) { sendError(res, EMPLOYEE_NOT_FOUND, 404); return; }
    sendSuccess(res, updated);
  })
);

export default router;
