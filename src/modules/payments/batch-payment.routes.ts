import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as BatchPaymentService from './batch-payment.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Zod Schemas ──────────────────────────────────────────────────

const createBatchSchema = z.object({
  name: z.string().min(1),
  dueDate: z.string(), // ISO date string
  items: z
    .array(
      z.object({
        vendorId: z.string().min(1),
        billId: z.string().optional(),
        amount: z.number().positive(),
        bankAccount: z.string().optional(),
        bankName: z.string().optional(),
        reference: z.string().optional(),
      }),
    )
    .min(1),
});

const addItemSchema = z.object({
  vendorId: z.string().min(1),
  billId: z.string().optional(),
  amount: z.number().positive(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  reference: z.string().optional(),
});

// ─── GET / — List batches ─────────────────────────────────────────

router.get(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.query;

    const batches = await BatchPaymentService.listPaymentBatches(
      req.user.tenantId,
      { status: status as string | undefined },
    );

    sendSuccess(res, batches);
  }),
);

// ─── POST / — Create batch ────────────────────────────────────────

router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const batch = await BatchPaymentService.createPaymentBatch(
      {
        name: parsed.data.name,
        dueDate: new Date(parsed.data.dueDate),
        items: parsed.data.items,
      },
      req.user.tenantId,
      req.user.userId,
    );

    sendSuccess(res, batch, 201);
  }),
);

// ─── GET /:id — Get batch with items ─────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await BatchPaymentService.getPaymentBatch(
        req.params.id,
        req.user.tenantId,
      );
      sendSuccess(res, batch);
    } catch (err: any) {
      if (err.message === 'Payment batch not found') {
        sendError(res, err.message, 404);
      } else {
        throw err;
      }
    }
  }),
);

// ─── POST /:id/items — Add item to batch ─────────────────────────

router.post(
  '/:id/items',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const item = await BatchPaymentService.addItemToBatch(
        req.params.id,
        req.user.tenantId,
        parsed.data,
      );
      sendSuccess(res, item, 201);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        sendError(res, err.message, 404);
      } else {
        throw err;
      }
    }
  }),
);

// ─── DELETE /:id/items/:itemId — Remove item from batch ──────────

router.delete(
  '/:id/items/:itemId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await BatchPaymentService.removeItemFromBatch(
        req.params.id,
        req.params.itemId,
        req.user.tenantId,
      );
      sendSuccess(res, { message: 'Item removed successfully' });
    } catch (err: any) {
      if (err.message.includes('not found')) {
        sendError(res, err.message, 404);
      } else {
        throw err;
      }
    }
  }),
);

// ─── POST /:id/approve — Approve batch ───────────────────────────

router.post(
  '/:id/approve',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await BatchPaymentService.approveBatch(
        req.params.id,
        req.user.tenantId,
      );
      sendSuccess(res, batch);
    } catch (err: any) {
      if (err.message === 'Payment batch not found') {
        sendError(res, err.message, 404);
      } else {
        sendError(res, err.message, 422);
      }
    }
  }),
);

// ─── GET /:id/export — Export batch as CSV download ──────────────

router.get(
  '/:id/export',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const csvString = await BatchPaymentService.exportBatchToCSV(
        req.params.id,
        req.user.tenantId,
      );

      const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `batch-${req.params.id.slice(-8)}-${dateStamp}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      // BOM for Excel UTF-8 compatibility with Hebrew text
      res.send('\uFEFF' + csvString);
    } catch (err: any) {
      if (err.message === 'Payment batch not found') {
        sendError(res, err.message, 404);
      } else {
        sendError(res, err.message, 422);
      }
    }
  }),
);

// ─── POST /:id/mark-processed — Mark batch as processed ──────────

router.post(
  '/:id/mark-processed',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await BatchPaymentService.markBatchProcessed(
        req.params.id,
        req.user.tenantId,
      );
      sendSuccess(res, batch);
    } catch (err: any) {
      if (err.message === 'Payment batch not found') {
        sendError(res, err.message, 404);
      } else {
        sendError(res, err.message, 422);
      }
    }
  }),
);

export default router;
