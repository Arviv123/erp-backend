import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireRole, requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as SalesOrderService from './sales-orders.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ────────────────────────────────────────────

const SOLineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitPrice:   z.number().nonnegative(),
  vatRate:     z.number().min(0).max(1).optional(),
  productId:   z.string().optional(),
});

const createSOSchema = z.object({
  customerId:   z.string().min(1),
  quoteId:      z.string().optional(),
  date:         z.string().optional(),
  expectedDate: z.string().optional(),
  notes:        z.string().optional(),
  lines:        z.array(SOLineSchema).min(1),
});

const updateSOSchema = z.object({
  expectedDate: z.string().optional(),
  notes:        z.string().optional(),
  lines:        z.array(SOLineSchema).min(1).optional(),
});

// ─── GET / — list sales orders ─────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, customerId, from, to, page = '1', limit = '25' } = req.query;

    const result = await SalesOrderService.listSalesOrders(req.user.tenantId, {
      status:     status     as string | undefined,
      customerId: customerId as string | undefined,
      from:       from       as string | undefined,
      to:         to         as string | undefined,
      page:       parseInt(page  as string),
      limit:      parseInt(limit as string),
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── POST / — create sales order ───────────────────────────────────

router.post(
  '/',
  requireRole('ADMIN', 'ACCOUNTANT', 'SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createSOSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400);
      return;
    }

    const { date, expectedDate, ...rest } = parsed.data;

    try {
      const order = await SalesOrderService.createSalesOrder(
        {
          ...rest,
          date:         date         ? new Date(date)         : undefined,
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
        },
        req.user.tenantId,
        req.user.userId
      );
      sendSuccess(res, order, 201);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  })
);

// ─── GET /:id — get single sales order ─────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const order = await SalesOrderService.getSalesOrder(req.params.id, req.user.tenantId);
      sendSuccess(res, order);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  })
);

// ─── PUT /:id — update sales order ─────────────────────────────────

router.put(
  '/:id',
  requireRole('ADMIN', 'SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateSOSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400);
      return;
    }

    const { expectedDate, ...rest } = parsed.data;

    try {
      const order = await SalesOrderService.updateSalesOrder(
        req.params.id,
        req.user.tenantId,
        {
          ...rest,
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
        }
      );
      sendSuccess(res, order);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/confirm — confirm order ─────────────────────────────

router.post(
  '/:id/confirm',
  requireRole('ADMIN', 'SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const order = await SalesOrderService.confirmSalesOrder(req.params.id, req.user.tenantId);
      sendSuccess(res, order);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/cancel — cancel order ───────────────────────────────

router.post(
  '/:id/cancel',
  requireRole('ADMIN', 'SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const order = await SalesOrderService.cancelSalesOrder(req.params.id, req.user.tenantId);
      sendSuccess(res, order);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/convert-to-invoice — convert to invoice ─────────────

router.post(
  '/:id/convert-to-invoice',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const invoice = await SalesOrderService.convertToInvoice(
        req.params.id,
        req.user.tenantId,
        req.user.userId
      );
      sendSuccess(res, invoice, 201);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

export default router;
