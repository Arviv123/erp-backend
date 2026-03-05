/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           PENSION FUND MANAGEMENT — Routes                      ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Mount at: /api/pension                                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { PensionFundType } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import * as PensionService from './pension.service';

const router = Router();

// All pension routes require authentication + tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Zod Schemas ──────────────────────────────────────────────────

const fundTypeSchema = z.enum(['PENSION', 'PROVIDENT', 'LIFE_INSURANCE'] as const);

const createFundSchema = z.object({
  name: z.string().min(1).max(100),
  type: fundTypeSchema,
  code: z.string().max(50).optional(),
});

const updateFundSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: fundTypeSchema.optional(),
  code: z.string().max(50).nullable().optional(),
});

const setAllocationSchema = z.object({
  pensionFundId: z.string().min(1),
  employeePct:   z.number().min(0).max(25),
  employerPct:   z.number().min(0).max(25),
  severancePct:  z.number().min(0).max(15),
  startDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
});

// ═══════════════════════════════════════════════════════════════════
// PENSION FUNDS
// NOTE: Static paths (/funds, /report, /summary) must come BEFORE
//       any /:id-style routes to prevent Express swallowing them.
// ═══════════════════════════════════════════════════════════════════

// ─── GET /api/pension/funds ───────────────────────────────────────
router.get('/funds', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, isActive } = req.query as Record<string, string | undefined>;

    const filters: { type?: PensionFundType; isActive?: boolean } = {};
    if (type)     filters.type     = type as PensionFundType;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const funds = await PensionService.listPensionFunds(req.user.tenantId, filters);
    sendSuccess(res, funds);
  } catch (err: any) {
    sendError(res, err.message, 500);
  }
});

// ─── POST /api/pension/funds ──────────────────────────────────────
router.post(
  '/funds',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createFundSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors.map(e => e.message).join(', '));
      return;
    }
    try {
      const fund = await PensionService.createPensionFund(req.user.tenantId, parsed.data);
      sendSuccess(res, fund, 201);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ─── PUT /api/pension/funds/:id ───────────────────────────────────
router.put(
  '/funds/:id',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateFundSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors.map(e => e.message).join(', '));
      return;
    }
    try {
      const fund = await PensionService.updatePensionFund(
        req.params.id,
        req.user.tenantId,
        parsed.data
      );
      sendSuccess(res, fund);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ─── POST /api/pension/funds/:id/deactivate ───────────────────────
router.post(
  '/funds/:id/deactivate',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const fund = await PensionService.deactivatePensionFund(req.params.id, req.user.tenantId);
      sendSuccess(res, fund);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// REPORTS  (must be before /:id routes)
// ═══════════════════════════════════════════════════════════════════

// ─── GET /api/pension/report?month=&year= ─────────────────────────
router.get(
  '/report',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const month = parseInt(req.query.month as string);
    const year  = parseInt(req.query.year  as string);

    if (!month || month < 1 || month > 12 || !year || year < 2000) {
      sendError(res, 'נדרשים פרמטרים: month (1-12) ו-year (מספר 4 ספרות)');
      return;
    }

    try {
      const report = await PensionService.getPensionReport(req.user.tenantId, month, year);
      sendSuccess(res, { month, year, ...report });
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ─── GET /api/pension/report/export?month=&year= ──────────────────
router.get(
  '/report/export',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const month = parseInt(req.query.month as string);
    const year  = parseInt(req.query.year  as string);

    if (!month || month < 1 || month > 12 || !year || year < 2000) {
      sendError(res, 'נדרשים פרמטרים: month (1-12) ו-year (מספר 4 ספרות)');
      return;
    }

    try {
      const buf = await PensionService.exportPensionReportXLSX(req.user.tenantId, month, year);
      const paddedMonth = String(month).padStart(2, '0');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="pension-report-${year}-${paddedMonth}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ─── GET /api/pension/summary ─────────────────────────────────────
router.get(
  '/summary',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = await PensionService.getPensionSummary(req.user.tenantId);
      sendSuccess(res, summary);
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// EMPLOYEE ALLOCATIONS
// ═══════════════════════════════════════════════════════════════════

// ─── GET /api/pension/employees/:employeeId/allocations ───────────
router.get(
  '/employees/:employeeId/allocations',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allocations = await PensionService.getEmployeeAllocations(
        req.params.employeeId,
        req.user.tenantId
      );
      sendSuccess(res, allocations);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  }
);

// ─── POST /api/pension/employees/:employeeId/allocations ──────────
router.post(
  '/employees/:employeeId/allocations',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = setAllocationSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors.map(e => e.message).join(', '));
      return;
    }

    try {
      const allocation = await PensionService.setAllocation(req.user.tenantId, {
        employeeId:    req.params.employeeId,
        pensionFundId: parsed.data.pensionFundId,
        employeePct:   parsed.data.employeePct,
        employerPct:   parsed.data.employerPct,
        severancePct:  parsed.data.severancePct,
        startDate:     new Date(parsed.data.startDate),
      });
      sendSuccess(res, allocation, 201);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ─── GET /api/pension/employees/:employeeId/monthly ───────────────
// Monthly contribution breakdown for a specific employee
router.get(
  '/employees/:employeeId/monthly',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const month = parseInt(req.query.month as string);
    const year  = parseInt(req.query.year  as string);

    if (!month || month < 1 || month > 12 || !year || year < 2000) {
      sendError(res, 'נדרשים פרמטרים: month (1-12) ו-year (מספר 4 ספרות)');
      return;
    }

    try {
      const contributions = await PensionService.getMonthlyPensionContributions(
        req.params.employeeId,
        req.user.tenantId,
        month,
        year
      );
      sendSuccess(res, { employeeId: req.params.employeeId, month, year, contributions });
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  }
);

// ─── DELETE /api/pension/allocations/:id ──────────────────────────
// End an allocation (requires employeeId in request body for security)
router.delete(
  '/allocations/:id',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = req.body?.employeeId as string | undefined;
    if (!employeeId) {
      sendError(res, 'employeeId נדרש בגוף הבקשה');
      return;
    }

    try {
      const allocation = await PensionService.endAllocation(
        req.params.id,
        employeeId,
        req.user.tenantId
      );
      sendSuccess(res, allocation);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

export default router;
