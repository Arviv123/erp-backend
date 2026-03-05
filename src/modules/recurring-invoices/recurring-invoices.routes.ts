import { Router, Response } from 'express';
import { authenticate }                          from '../../middleware/auth';
import { enforceTenantIsolation, withTenant }    from '../../middleware/tenant';
import { requireMinRole }                        from '../../middleware/rbac';
import { AuthenticatedRequest }                  from '../../shared/types';
import { sendSuccess, sendError }                from '../../shared/utils/response';
import { asyncHandler }                          from '../../shared/utils/asyncHandler';
import {
  CreateRecurringInvoiceSchema,
  UpdateRecurringInvoiceSchema,
  listRecurringInvoices,
  getRecurringInvoice,
  createRecurringInvoice,
  updateRecurringInvoice,
  pauseRecurringInvoice,
  resumeRecurringInvoice,
  cancelRecurringInvoice,
  generateDueInvoices,
  getRecurringInvoicePreview,
} from './recurring-invoices.service';
import { RecurringStatus } from '@prisma/client';

const router = Router();

// Apply auth + tenant isolation to every route in this router
// (same pattern as invoices.routes.ts — cast to `any` to satisfy Express overloads)
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET / — list recurring invoices (paginated) ─────────────────
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, customerId, page = '1', limit = '25' } = req.query;

    const tenantId = withTenant(req).tenantId as string;

    const data = await listRecurringInvoices(tenantId, {
      status:     status     ? (status     as RecurringStatus) : undefined,
      customerId: customerId ? (customerId as string)          : undefined,
      page:       parseInt(page  as string, 10),
      limit:      parseInt(limit as string, 10),
    });

    sendSuccess(res, data.items, 200, {
      total:    data.total,
      page:     data.page,
      pageSize: data.limit,
    });
  })
);

// ─── POST / — create a recurring invoice ─────────────────────────
router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateRecurringInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;
    const record   = await createRecurringInvoice(tenantId, parsed.data);
    sendSuccess(res, record, 201);
  })
);

// ─── GET /generate — run generation for this tenant ──────────────
// Must be declared BEFORE /:id routes to avoid being captured by them.
router.get(
  '/generate',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const result   = await generateDueInvoices(tenantId);
    sendSuccess(res, result);
  })
);

// ─── GET /:id — get single recurring invoice ──────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    try {
      const record = await getRecurringInvoice(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch {
      sendError(res, 'Recurring invoice not found', 404);
    }
  })
);

// ─── PUT /:id — update header fields + optionally replace lines ───
router.put(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = UpdateRecurringInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;
    try {
      const record = await updateRecurringInvoice(req.params.id, tenantId, parsed.data);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      sendError(res, message);
    }
  })
);

// ─── POST /:id/pause ──────────────────────────────────────────────
router.post(
  '/:id/pause',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    try {
      const record = await pauseRecurringInvoice(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pause failed';
      sendError(res, message);
    }
  })
);

// ─── POST /:id/resume ─────────────────────────────────────────────
router.post(
  '/:id/resume',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    try {
      const record = await resumeRecurringInvoice(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resume failed';
      sendError(res, message);
    }
  })
);

// ─── DELETE /:id — cancel ────────────────────────────────────────
router.delete(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    try {
      const record = await cancelRecurringInvoice(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cancel failed';
      sendError(res, message);
    }
  })
);

// ─── GET /:id/preview — next 12 occurrences ──────────────────────
router.get(
  '/:id/preview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    try {
      const occurrences = await getRecurringInvoicePreview(req.params.id, tenantId);
      sendSuccess(res, occurrences);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      sendError(res, message, 404);
    }
  })
);

export default router;
