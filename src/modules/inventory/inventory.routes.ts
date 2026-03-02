import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as InventoryService from './inventory.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Product Categories ───────────────────────────────────────────

router.get('/categories', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const cats = await prisma.productCategory.findMany({
    where:   withTenant(req),
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  sendSuccess(res, cats);
}));

router.post('/categories', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ name: z.string().min(1), parentId: z.string().cuid().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const cat = await prisma.productCategory.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, cat, 201);
}));

// ─── Products ─────────────────────────────────────────────────────

const ProductSchema = z.object({
  sku:           z.string().min(1),
  name:          z.string().min(1),
  description:   z.string().optional(),
  categoryId:    z.string().cuid().optional(),
  unitOfMeasure: z.string().default('יחידה'),
  costPrice:     z.number().min(0),
  sellingPrice:  z.number().min(0),
  vatRate:       z.number().min(0).max(1).default(0.18),
  isService:     z.boolean().default(false),
  barcode:       z.string().optional(),
  metadata:      z.record(z.any()).default({}),
});

router.get('/products', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { search, categoryId, isService, page = '1', pageSize = '25' } = req.query;

  const where = withTenant(req, {
    isActive: true,
    ...(categoryId ? { categoryId: categoryId as string } : {}),
    ...(isService !== undefined ? { isService: isService === 'true' } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search as string, mode: 'insensitive' as any } },
        { sku:  { contains: search as string, mode: 'insensitive' as any } },
      ],
    } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        stockLevels: { select: { quantity: true, warehouse: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.product.count({ where }),
  ]);

  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

router.get('/products/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const product = await prisma.product.findUnique({
    where:   { id: req.params.id },
    include: {
      category:    { select: { name: true } },
      stockLevels: { include: { warehouse: true } },
    },
  });
  if (!product || product.tenantId !== req.user.tenantId) { sendError(res, 'Product not found', 404); return; }
  sendSuccess(res, product);
}));

router.post('/products', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = ProductSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  try {
    const product = await prisma.product.create({
      data: { ...parsed.data, tenantId: req.user.tenantId },
    });
    sendSuccess(res, product, 201);
  } catch (err: any) {
    if (err.code === 'P2002') sendError(res, `SKU ${parsed.data.sku} already exists`);
    else throw err;
  }
}));

router.patch('/products/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = ProductSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Product not found', 404); return; }

  const updated = await prisma.product.update({ where: { id: req.params.id }, data: parsed.data });
  sendSuccess(res, updated);
}));

router.delete('/products/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Product not found', 404); return; }
  await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
  sendSuccess(res, { message: 'Product deactivated' });
}));

// ─── Warehouses ───────────────────────────────────────────────────

router.get('/warehouses', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const warehouses = await prisma.warehouse.findMany({
    where:   withTenant(req, { isActive: true }),
    include: { _count: { select: { stockLevels: true } } },
  });
  sendSuccess(res, warehouses);
}));

router.post('/warehouses', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:      z.string().min(1),
    address:   z.record(z.any()).optional(),
    isDefault: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const warehouse = await prisma.warehouse.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, warehouse, 201);
}));

// ─── Stock Levels ─────────────────────────────────────────────────

router.get('/stock', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { warehouseId, productId, lowStock } = req.query;
  const levels = await InventoryService.getStockLevels(req.user.tenantId, {
    warehouseId: warehouseId as string,
    productId:   productId   as string,
    lowStock:    lowStock === 'true',
  });
  sendSuccess(res, levels);
}));

// GET /inventory/stock/valuation
router.get('/stock/valuation', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await InventoryService.getStockValuation(req.user.tenantId, req.query.warehouseId as string);
  sendSuccess(res, result);
}));

// ─── Stock Movements ──────────────────────────────────────────────

router.post('/movements', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    productId:   z.string().cuid(),
    warehouseId: z.string().cuid(),
    type:        z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN_IN', 'RETURN_OUT']),
    quantity:    z.number().positive(),
    unitCost:    z.number().optional(),
    reference:   z.string().optional(),
    notes:       z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const movement = await InventoryService.moveStock({
    ...parsed.data,
    type:      parsed.data.type as any,
    tenantId:  req.user.tenantId,
    createdBy: req.user.userId,
  });
  sendSuccess(res, movement, 201);
}));

// POST /inventory/stock/adjust
router.post('/stock/adjust', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    productId:   z.string().cuid(),
    warehouseId: z.string().cuid(),
    newQuantity: z.number().min(0),
    reason:      z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const result = await InventoryService.adjustStock(
    req.user.tenantId, parsed.data.productId, parsed.data.warehouseId,
    parsed.data.newQuantity, parsed.data.reason, req.user.userId
  );
  sendSuccess(res, result);
}));

router.get('/movements', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { productId, warehouseId, type, page = '1', pageSize = '50' } = req.query;

  const where = withTenant(req, {
    ...(productId   ? { productId:   productId   as string } : {}),
    ...(warehouseId ? { warehouseId: warehouseId as string } : {}),
    ...(type        ? { type:        type        as any }    : {}),
  });

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        product:   { select: { name: true, sku: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.stockMovement.count({ where }),
  ]);

  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

export default router;
