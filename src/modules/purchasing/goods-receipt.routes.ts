import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as GoodsReceiptService from './goods-receipt.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ───────────────────────────────────────────

const GRLineSchema = z.object({
  productId:   z.string().cuid().optional(),
  description: z.string().min(1),
  orderedQty:  z.number().nonnegative(),
  receivedQty: z.number().nonnegative(),
  unitPrice:   z.number().nonnegative(),
});

const CreateGRSchema = z.object({
  purchaseOrderId: z.string().cuid(),
  receivedDate:    z.string().datetime().optional(),
  warehouseId:     z.string().optional(),
  notes:           z.string().optional(),
  lines:           z.array(GRLineSchema).min(1),
});

// ─── GET / — List all Goods Receipts ─────────────────────────────
// Query params: ?purchaseOrderId= &status= &from= &to=

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { purchaseOrderId, status, from, to } = req.query;

    const items = await GoodsReceiptService.listGoodsReceipts(req.user.tenantId, {
      purchaseOrderId: purchaseOrderId as string | undefined,
      status:          status          as string | undefined,
      from:            from            as string | undefined,
      to:              to              as string | undefined,
    });

    sendSuccess(res, items);
  })
);

// ─── POST / — Create a new Goods Receipt ─────────────────────────
// Role: ADMIN or ACCOUNTANT

router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateGRSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const gr = await GoodsReceiptService.createGoodsReceipt(
      {
        ...parsed.data,
        receivedDate: parsed.data.receivedDate ? new Date(parsed.data.receivedDate) : undefined,
      },
      req.user.tenantId,
      req.user.userId
    );

    sendSuccess(res, { success: true, data: gr }, 201);
  })
);

// ─── GET /three-way-match — Match status for ALL non-draft POs ────
// Must be declared BEFORE /:id so the literal path is not mistaken for a param.

router.get(
  '/three-way-match',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const results = await GoodsReceiptService.getMatchStatusForAllPOs(req.user.tenantId);
    sendSuccess(res, results);
  })
);

// ─── GET /three-way-match/:poId — PO-centric 3-way match ─────────

router.get(
  '/three-way-match/:poId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await GoodsReceiptService.threeWayMatch(
      req.params.poId,
      req.user.tenantId
    );
    sendSuccess(res, result);
  })
);

// ─── GET /po/:purchaseOrderId — All GRs for a specific PO ─────────
// Must be before /:id so "po" is not parsed as an id.

router.get(
  '/po/:purchaseOrderId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await GoodsReceiptService.getGoodsReceiptsForPO(
      req.params.purchaseOrderId,
      req.user.tenantId
    );
    sendSuccess(res, { success: true, data: items });
  })
);

// ─── POST /validate-match/:billId — Bill-centric 3-way match ──────
// Validates that a Bill is safe to pay: matches linked PO (±5%) AND
// at least one approved GR covers all billed quantities.
// Response: { isValid, poMatch, grMatch, discrepancies }

router.post(
  '/validate-match/:billId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await GoodsReceiptService.validateThreeWayMatch(
      req.params.billId,
      req.user.tenantId
    );
    sendSuccess(res, result);
  })
);

// ─── GET /:id — Get a single Goods Receipt ────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const gr = await GoodsReceiptService.getGoodsReceipt(
      req.params.id,
      req.user.tenantId
    );
    sendSuccess(res, { success: true, data: gr });
  })
);

// ─── POST /:id/approve — Advance GR status (DRAFT→RECEIVED→INSPECTED)
// Role: ADMIN or ACCOUNTANT

router.post(
  '/:id/approve',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const gr = await GoodsReceiptService.approveGoodsReceipt(
      req.params.id,
      req.user.tenantId
    );
    sendSuccess(res, { success: true, data: gr });
  })
);

// ─── POST /:id/inspect — Legacy alias for /:id/approve ────────────

router.post(
  '/:id/inspect',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const gr = await GoodsReceiptService.approveGoodsReceipt(
      req.params.id,
      req.user.tenantId
    );
    sendSuccess(res, { success: true, data: gr });
  })
);

export default router;
