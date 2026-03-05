import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as PriceListsService from './price-lists.service';
import {
  CreatePriceListSchema,
  UpdatePriceListSchema,
  PriceListItemSchema,
} from './price-lists.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET / — List all price lists ────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, isDefault } = req.query;

  const filters: { type?: string; isDefault?: boolean } = {};
  if (type)      filters.type      = type as string;
  if (isDefault !== undefined) filters.isDefault = isDefault === 'true';

  const priceLists = await PriceListsService.listPriceLists(req.user.tenantId, filters);
  sendSuccess(res, priceLists);
}));

// ─── POST / — Create price list (MANAGER+) ───────────────────────

router.post('/', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CreatePriceListSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  try {
    const priceList = await PriceListsService.createPriceList(req.user.tenantId, parsed.data);
    sendSuccess(res, priceList, 201);
  } catch (err: any) {
    if (err.code === 'P2002') {
      sendError(res, `A price list named "${parsed.data.name}" already exists`);
    } else {
      throw err;
    }
  }
}));

// ─── GET /effective-price/:productId — Effective price ───────────
// Placed BEFORE /:id to avoid route collision

router.get('/effective-price/:productId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.params;
  const { customerId, quantity } = req.query;

  if (!customerId) { sendError(res, 'customerId query parameter is required'); return; }

  const qty = quantity ? parseFloat(quantity as string) : 1;
  if (isNaN(qty) || qty <= 0) { sendError(res, 'quantity must be a positive number'); return; }

  const result = await PriceListsService.getEffectivePrice(
    productId,
    customerId as string,
    req.user.tenantId,
    qty
  );
  sendSuccess(res, result);
}));

// ─── DELETE /unassign/:customerId — Unassign from customer (MANAGER+) ─
// Placed BEFORE /:id to avoid route collision

router.delete('/unassign/:customerId', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await PriceListsService.unassignFromCustomer(
    req.params.customerId,
    req.user.tenantId
  );
  sendSuccess(res, result);
}));

// ─── GET /:id — Get single price list ────────────────────────────

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const priceList = await PriceListsService.getPriceList(req.params.id, req.user.tenantId);
  sendSuccess(res, priceList);
}));

// ─── PUT /:id — Update price list (MANAGER+) ─────────────────────

router.put('/:id', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = UpdatePriceListSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  try {
    const updated = await PriceListsService.updatePriceList(req.params.id, req.user.tenantId, parsed.data);
    sendSuccess(res, updated);
  } catch (err: any) {
    if (err.message === 'Price list not found') { sendError(res, err.message, 404); return; }
    if (err.code === 'P2002') { sendError(res, 'A price list with that name already exists'); return; }
    throw err;
  }
}));

// ─── DELETE /:id — Delete price list (ADMIN+) ────────────────────

router.delete('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await PriceListsService.deletePriceList(req.params.id, req.user.tenantId);
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.message === 'Price list not found') { sendError(res, err.message, 404); return; }
    if (err.message.startsWith('Cannot delete')) { sendError(res, err.message, 409); return; }
    throw err;
  }
}));

// ─── POST /:id/items — Add item (MANAGER+) ───────────────────────

router.post('/:id/items', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = PriceListItemSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  try {
    const item = await PriceListsService.addItem(req.params.id, req.user.tenantId, parsed.data);
    sendSuccess(res, item, 201);
  } catch (err: any) {
    if (err.message === 'Price list not found' || err.message === 'Product not found') {
      sendError(res, err.message, 404); return;
    }
    if (err.message.includes('already in this price list')) {
      sendError(res, err.message, 409); return;
    }
    throw err;
  }
}));

// ─── DELETE /:id/items/:itemId — Remove item (MANAGER+) ──────────

router.delete('/:id/items/:itemId', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await PriceListsService.removeItem(
      req.params.id,
      req.params.itemId,
      req.user.tenantId
    );
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.message.includes('not found')) { sendError(res, err.message, 404); return; }
    throw err;
  }
}));

// ─── POST /:id/assign/:customerId — Assign to customer (MANAGER+) ─

router.post('/:id/assign/:customerId', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await PriceListsService.assignToCustomer(
      req.params.id,
      req.params.customerId,
      req.user.tenantId
    );
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.message.includes('not found')) { sendError(res, err.message, 404); return; }
    throw err;
  }
}));

// ─── GET /:id/customer/:customerId — Price list for customer ──────

router.get('/:id/customer/:customerId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await PriceListsService.getPriceListForCustomer(
      req.params.customerId,
      req.user.tenantId
    );
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.message.includes('not found')) { sendError(res, err.message, 404); return; }
    throw err;
  }
}));

export default router;
