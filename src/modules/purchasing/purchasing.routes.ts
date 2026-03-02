import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as PurchasingService from './purchasing.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Vendors ──────────────────────────────────────────────────────

const VendorSchema = z.object({
  name:         z.string().min(1),
  businessId:   z.string().optional(),
  vatNumber:    z.string().optional(),
  email:        z.string().email().optional(),
  phone:        z.string().optional(),
  address:      z.record(z.any()).optional(),
  paymentTerms: z.string().optional(),
  metadata:     z.record(z.any()).default({}),
});

router.get('/vendors', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { search, page = '1', pageSize = '25' } = req.query;

  const where = withTenant(req, {
    status: 'ACTIVE',
    ...(search ? { name: { contains: search as string, mode: 'insensitive' as any } } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.vendor.findMany({ where, orderBy: { name: 'asc' }, skip: (parseInt(page as string)-1)*parseInt(pageSize as string), take: parseInt(pageSize as string) }),
    prisma.vendor.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

router.post('/vendors', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = VendorSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }
  const vendor = await prisma.vendor.create({ data: { ...parsed.data, tenantId: req.user.tenantId } });
  sendSuccess(res, vendor, 201);
}));

router.patch('/vendors/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = VendorSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }
  const existing = await prisma.vendor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Vendor not found', 404); return; }
  const updated = await prisma.vendor.update({ where: { id: req.params.id }, data: parsed.data });
  sendSuccess(res, updated);
}));

// ─── Purchase Orders ──────────────────────────────────────────────

const POLineSchema = z.object({
  productId:   z.string().cuid().optional(),
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitCost:    z.number().positive(),
  vatRate:     z.number().default(0.18),
});

router.post('/purchase-orders', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    vendorId:     z.string().cuid(),
    date:         z.string().datetime(),
    expectedDate: z.string().datetime().optional(),
    notes:        z.string().optional(),
    lines:        z.array(POLineSchema).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const po = await PurchasingService.createPurchaseOrder({
    ...parsed.data,
    date:         new Date(parsed.data.date),
    expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : undefined,
    tenantId:     req.user.tenantId,
    createdBy:    req.user.userId,
  });
  sendSuccess(res, po, 201);
}));

router.get('/purchase-orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, vendorId, page = '1', pageSize = '25' } = req.query;
  const where = withTenant(req, {
    ...(status   ? { status:   status   as any } : {}),
    ...(vendorId ? { vendorId: vendorId as string } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { vendor: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: { date: 'desc' },
      skip: (parseInt(page as string)-1)*parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

router.get('/purchase-orders/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: { vendor: true, lines: { include: { product: { select: { name: true, sku: true } } } }, bills: true },
  });
  if (!po || po.tenantId !== req.user.tenantId) { sendError(res, 'PO not found', 404); return; }
  sendSuccess(res, po);
}));

// POST /purchasing/purchase-orders/:id/receive
router.post('/purchase-orders/:id/receive', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    warehouseId:  z.string().cuid(),
    receivedLines: z.array(z.object({
      lineId:      z.string().cuid(),
      receivedQty: z.number().positive(),
    })),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const result = await PurchasingService.receivePurchaseOrder(
    req.params.id, req.user.tenantId, parsed.data.warehouseId,
    parsed.data.receivedLines, req.user.userId
  );
  sendSuccess(res, result);
}));

// ─── Bills ────────────────────────────────────────────────────────

const BillLineSchema = z.object({
  productId:   z.string().cuid().optional(),
  accountId:   z.string().cuid().optional(),
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitCost:    z.number().positive(),
  vatRate:     z.number().default(0.18),
});

router.post('/bills', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    vendorId:       z.string().cuid(),
    purchaseOrderId: z.string().cuid().optional(),
    vendorRef:      z.string().optional(),
    date:           z.string().datetime(),
    dueDate:        z.string().datetime(),
    notes:          z.string().optional(),
    lines:          z.array(BillLineSchema).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const bill = await PurchasingService.createBill({
    ...parsed.data,
    date:    new Date(parsed.data.date),
    dueDate: new Date(parsed.data.dueDate),
    tenantId:  req.user.tenantId,
    createdBy: req.user.userId,
  });
  sendSuccess(res, bill, 201);
}));

router.get('/bills', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, vendorId, page = '1', pageSize = '25' } = req.query;
  const where = withTenant(req, {
    ...(status   ? { status:   status   as any } : {}),
    ...(vendorId ? { vendorId: vendorId as string } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: { vendor: { select: { name: true } } },
      orderBy: { date: 'desc' },
      skip: (parseInt(page as string)-1)*parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.bill.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

router.post('/bills/:id/pay', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    amount:    z.number().positive(),
    method:    z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'OTHER']),
    date:      z.string().datetime(),
    reference: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const payment = await PurchasingService.payBill({
    billId:    req.params.id,
    tenantId:  req.user.tenantId,
    ...parsed.data,
    date:      new Date(parsed.data.date),
    createdBy: req.user.userId,
  });
  sendSuccess(res, payment, 201);
}));

// GET /purchasing/ap-aging — Accounts Payable aging
router.get('/ap-aging', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const today  = new Date();

  const bills = await prisma.bill.findMany({
    where:   { tenantId: req.user.tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] } },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  });

  const buckets = {
    current: { total: 0, count: 0 },
    days30:  { total: 0, count: 0 },
    days60:  { total: 0, count: 0 },
    days90:  { total: 0, count: 0 },
    over90:  { total: 0, count: 0 },
  };

  for (const bill of bills) {
    const daysPast = Math.floor((today.getTime() - bill.dueDate.getTime()) / 86_400_000);
    const amount   = Number(bill.total);
    if (daysPast <= 0)       { buckets.current.total += amount; buckets.current.count++; }
    else if (daysPast <= 30) { buckets.days30.total  += amount; buckets.days30.count++; }
    else if (daysPast <= 60) { buckets.days60.total  += amount; buckets.days60.count++; }
    else if (daysPast <= 90) { buckets.days90.total  += amount; buckets.days90.count++; }
    else                     { buckets.over90.total  += amount; buckets.over90.count++; }
  }

  const grandTotal = bills.reduce((s, b) => s + Number(b.total), 0);
  sendSuccess(res, { buckets, grandTotal, asOf: today });
}));

export default router;
