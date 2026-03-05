import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as BatchPaymentsService from './batch-payments.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Zod Schemas ──────────────────────────────────────────────────

const BatchItemSchema = z.object({
  vendorId: z.string().min(1),
  billId: z.string().optional(),
  amount: z.number().positive(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  reference: z.string().optional(),
});

const CreateBatchSchema = z.object({
  name: z.string().min(1, 'Batch name is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  items: z.array(BatchItemSchema).min(1, 'At least one payment item is required'),
});

// ─── GET / — List batches ─────────────────────────────────────────

router.get(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, from, to } = req.query;

    const batches = await BatchPaymentsService.listPaymentBatches(
      req.user.tenantId,
      {
        status: status as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
      },
    );

    sendSuccess(res, batches);
  }),
);

// ─── POST / — Create batch ────────────────────────────────────────

router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const batch = await BatchPaymentsService.createPaymentBatch(
        req.user.tenantId,
        req.user.userId,
        parsed.data,
      );
      sendSuccess(res, batch, 201);
    } catch (err: any) {
      sendError(res, err.message, 422);
    }
  }),
);

// ─── GET /unpaid-bills — Unpaid bills grouped by vendor ───────────
// Must be declared before /:id to avoid being swallowed by that route.

router.get(
  '/unpaid-bills',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { vendorId, dueBy } = req.query;

    const result = await BatchPaymentsService.getUnpaidBillsForBatch(
      req.user.tenantId,
      {
        vendorId: vendorId as string | undefined,
        dueBy: dueBy as string | undefined,
      },
    );

    sendSuccess(res, result);
  }),
);

// ─── GET /:id — Get batch details ─────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await BatchPaymentsService.getPaymentBatch(
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

// ─── POST /:id/approve — Approve batch (DRAFT → APPROVED) ────────

router.post(
  '/:id/approve',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await BatchPaymentsService.approvePaymentBatch(
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

// ─── GET /:id/export/csv — Download Israeli bank transfer CSV ──────

router.get(
  '/:id/export/csv',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const csvContent = await BatchPaymentsService.exportBatchToCSV(
        req.params.id,
        req.user.tenantId,
      );

      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set(
        'Content-Disposition',
        `attachment; filename="batch-${req.params.id}.csv"`,
      );
      // BOM prefix so Excel opens Hebrew content correctly
      res.send('\uFEFF' + csvContent);
    } catch (err: any) {
      if (err.message === 'Payment batch not found') {
        sendError(res, err.message, 404);
      } else {
        sendError(res, err.message, 422);
      }
    }
  }),
);

// ─── GET /:id/export/masav — Download MASAV file (.txt) ──────────

router.get(
  '/:id/export/masav',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const masavContent = await BatchPaymentsService.exportBatchToMASAV(
        req.params.id,
        req.user.tenantId,
      );

      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.set(
        'Content-Disposition',
        `attachment; filename="MASAV-${req.params.id}.txt"`,
      );
      res.send(masavContent);
    } catch (err: any) {
      if (err.message === 'Payment batch not found') {
        sendError(res, err.message, 404);
      } else {
        sendError(res, err.message, 422);
      }
    }
  }),
);

// ─── POST /:id/process — Mark batch as processed + pay bills ──────

router.post(
  '/:id/process',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await BatchPaymentsService.markBatchProcessed(
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
