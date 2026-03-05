/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              FORM 161 ROUTES — /api/form161                     ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  All routes require: authenticate + enforceTenantIsolation      ║
 * ║  Minimum role: ACCOUNTANT                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * GET  /list                — list all Form 161s (paginated)
 * POST /calculate           — calculate without saving
 * POST /                    — create Form 161 draft
 * GET  /terminating         — employees terminating soon
 * GET  /:id                 — get single form
 * PUT  /:id                 — update draft
 * POST /:id/submit          — submit
 * POST /:id/approve         — approve (ADMIN+)
 * GET  /:id/pdf             — download PDF
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import * as Form161Service from './form161.service';

const router = Router();

// ─── Global Middleware ─────────────────────────────────────────────
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);
router.use(requireMinRole('ACCOUNTANT') as any);

// ─── Validation Schemas ────────────────────────────────────────────

const createSchema = z.object({
  employeeId:        z.string().min(1),
  terminationDate:   z.string().refine(d => !isNaN(Date.parse(d)), { message: 'Invalid date' }),
  severancePay:      z.number().min(0),
  pensionSeverance:  z.number().min(0).optional().default(0),
  notes:             z.string().optional(),
});

const updateSchema = z.object({
  terminationDate:   z.string().refine(d => !isNaN(Date.parse(d)), { message: 'Invalid date' }).optional(),
  severancePay:      z.number().min(0).optional(),
  pensionSeverance:  z.number().min(0).optional(),
  notes:             z.string().optional(),
});

const calculateSchema = z.object({
  employeeId:        z.string().min(1),
  terminationDate:   z.string().refine(d => !isNaN(Date.parse(d)), { message: 'Invalid date' }),
  severancePay:      z.number().min(0),
  pensionSeverance:  z.number().min(0).optional().default(0),
});

// ═══════════════════════════════════════════════════════════════════
// GET /list — List all Form 161s (paginated, filterable)
// ═══════════════════════════════════════════════════════════════════
router.get('/list', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId    = withTenant(req).tenantId as string;
    const { employeeId, status, page, limit } = req.query as Record<string, string | undefined>;

    const result = await Form161Service.listForm161s(tenantId, {
      employeeId,
      status,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /terminating — Employees terminating soon without a Form 161
// Must be declared BEFORE /:id to avoid route conflict
// ═══════════════════════════════════════════════════════════════════
router.get('/terminating', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId  = withTenant(req).tenantId as string;
    const daysAhead = req.query.days ? parseInt(req.query.days as string, 10) : 30;

    const employees = await Form161Service.listTerminatingEmployees(tenantId, daysAhead);
    sendSuccess(res, { count: employees.length, daysAhead, employees });
  } catch (err: any) {
    sendError(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /calculate — Calculate without saving
// ═══════════════════════════════════════════════════════════════════
router.post('/calculate', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = calculateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map(e => e.message).join(', '));
    return;
  }

  try {
    const tenantId = withTenant(req).tenantId as string;
    const { employeeId, terminationDate, severancePay, pensionSeverance } = parsed.data;

    // שליפת עובד לחישוב שנות ותק ושכר
    const { prisma } = await import('../../config/database');
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { startDate: true, grossSalary: true, firstName: true, lastName: true },
    });
    if (!employee) {
      sendError(res, 'Employee not found', 404);
      return;
    }

    const termDate   = new Date(terminationDate);
    const startDate  = new Date(employee.startDate);
    const msPerDay   = 24 * 3600 * 1000;
    const daysDiff   = (termDate.getTime() - startDate.getTime()) / msPerDay;
    const yearsOfService = Math.round((daysDiff / 365) * 100) / 100;

    const calc = Form161Service.calculateForm161({
      yearsOfService,
      lastSalary:       Number(employee.grossSalary),
      severancePay,
      pensionSeverance: pensionSeverance ?? 0,
    });

    sendSuccess(res, {
      employee: { id: employeeId, name: `${employee.firstName} ${employee.lastName}` },
      calculation: calc,
    });
  } catch (err: any) {
    sendError(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST / — Create Form 161 draft
// ═══════════════════════════════════════════════════════════════════
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map(e => e.message).join(', '));
    return;
  }

  try {
    const tenantId = withTenant(req).tenantId as string;
    const result = await Form161Service.createForm161(tenantId, parsed.data);
    sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.code === 'P2002') {
      sendError(res, 'A Form 161 already exists for this employee on this termination date', 409);
    } else {
      sendError(res, err.message, err.message.includes('not found') ? 404 : 400);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /:id — Get single Form 161
// ═══════════════════════════════════════════════════════════════════
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = withTenant(req).tenantId as string;
    const form = await Form161Service.getForm161(req.params.id, tenantId);
    sendSuccess(res, form);
  } catch (err: any) {
    sendError(res, err.message, 404);
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /:id — Update Form 161 draft
// ═══════════════════════════════════════════════════════════════════
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map(e => e.message).join(', '));
    return;
  }

  try {
    const tenantId = withTenant(req).tenantId as string;
    const result = await Form161Service.updateForm161(req.params.id, tenantId, parsed.data);
    sendSuccess(res, result);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404
                 : err.message.includes('Only DRAFT')  ? 409
                 : 400;
    sendError(res, err.message, status);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /:id/submit — Submit Form 161
// ═══════════════════════════════════════════════════════════════════
router.post('/:id/submit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = withTenant(req).tenantId as string;
    const form = await Form161Service.submitForm161(req.params.id, tenantId);
    sendSuccess(res, form);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404
                 : err.message.includes('Only DRAFT')  ? 409
                 : 400;
    sendError(res, err.message, status);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /:id/approve — Approve Form 161 (ADMIN only)
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/:id/approve',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = withTenant(req).tenantId as string;
      const form = await Form161Service.approveForm161(req.params.id, tenantId);
      sendSuccess(res, form);
    } catch (err: any) {
      const status = err.message.includes('not found')        ? 404
                   : err.message.includes('Only SUBMITTED')   ? 409
                   : 400;
      sendError(res, err.message, status);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /:id/pdf — Download Form 161 as PDF
// ═══════════════════════════════════════════════════════════════════
router.get('/:id/pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = withTenant(req).tenantId as string;
    const pdfBuffer = await Form161Service.getForm161PDF(req.params.id, tenantId);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="form161-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    sendError(res, err.message, err.message.includes('not found') ? 404 : 500);
  }
});

export default router;
