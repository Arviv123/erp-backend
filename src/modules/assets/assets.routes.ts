import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as AssetsService from './assets.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Fixed Assets CRUD ────────────────────────────────────────────

const AssetSchema = z.object({
  code:                            z.string().min(1),
  name:                            z.string().min(1),
  category:                        z.string().min(1),
  purchaseDate:                    z.string().datetime(),
  purchasePrice:                   z.number().positive(),
  salvageValue:                    z.number().min(0).default(0),
  usefulLifeYears:                 z.number().int().min(1).max(100),
  depreciationMethod:              z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE']).default('STRAIGHT_LINE'),
  assetAccountId:                  z.string().cuid().optional(),
  depreciationExpenseAccountId:    z.string().cuid().optional(),
  accumulatedDepreciationAccountId: z.string().cuid().optional(),
  notes:                           z.string().optional(),
});

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { category, status, page = '1', pageSize = '25' } = req.query;

  const where = withTenant(req, {
    ...(category ? { category: category as string }   : {}),
    ...(status   ? { status: status as any }           : {}),
  });

  const [items, total] = await Promise.all([
    prisma.fixedAsset.findMany({
      where,
      include: { depreciationLedger: { orderBy: { period: 'desc' }, take: 1 } },
      orderBy: { code: 'asc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.fixedAsset.count({ where }),
  ]);

  // Enrich with book value
  const enriched = await Promise.all(items.map(async (asset) => {
    const accumulated = await AssetsService.getAccumulatedDepreciation(asset.id);
    return {
      ...asset,
      accumulatedDepreciation: accumulated,
      bookValue: Number(asset.purchasePrice) - accumulated,
    };
  }));

  sendSuccess(res, enriched, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const asset = await prisma.fixedAsset.findUnique({
    where:   { id: req.params.id },
    include: { depreciationLedger: { orderBy: { period: 'asc' } } },
  });
  if (!asset || asset.tenantId !== req.user.tenantId) { sendError(res, 'Asset not found', 404); return; }

  const accumulated = await AssetsService.getAccumulatedDepreciation(asset.id);

  sendSuccess(res, {
    ...asset,
    accumulatedDepreciation: accumulated,
    bookValue: Number(asset.purchasePrice) - accumulated,
  });
}));

router.post('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = AssetSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  try {
    const asset = await prisma.fixedAsset.create({
      data: { ...parsed.data, purchaseDate: new Date(parsed.data.purchaseDate), tenantId: req.user.tenantId },
    });
    sendSuccess(res, asset, 201);
  } catch (err: any) {
    if (err.code === 'P2002') sendError(res, `Asset code ${parsed.data.code} already exists`);
    else throw err;
  }
}));

router.patch('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = AssetSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.fixedAsset.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Asset not found', 404); return; }

  const data: any = { ...parsed.data };
  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate);

  const updated = await prisma.fixedAsset.update({ where: { id: req.params.id }, data });
  sendSuccess(res, updated);
}));

// ─── Depreciation Schedule ────────────────────────────────────────

// GET /assets/:id/schedule — full theoretical depreciation table
router.get('/:id/schedule', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const asset = await prisma.fixedAsset.findUnique({ where: { id: req.params.id } });
  if (!asset || asset.tenantId !== req.user.tenantId) { sendError(res, 'Asset not found', 404); return; }

  const schedule = AssetsService.generateDepreciationSchedule({
    purchasePrice:     Number(asset.purchasePrice),
    salvageValue:      Number(asset.salvageValue),
    usefulLifeYears:   asset.usefulLifeYears,
    depreciationMethod: asset.depreciationMethod,
    purchaseDate:      asset.purchaseDate,
  });

  sendSuccess(res, { asset: { id: asset.id, name: asset.name, code: asset.code }, schedule });
}));

// POST /assets/:id/depreciate — post depreciation for a specific period
router.post('/:id/depreciate', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const result = await AssetsService.postMonthlyDepreciation(
    req.params.id, req.user.tenantId, parsed.data.period, req.user.userId
  );
  sendSuccess(res, result, 201);
}));

// POST /assets/depreciate/bulk — post all active assets for a period
router.post('/depreciate/bulk', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const results = await AssetsService.postAllDepreciationsForPeriod(
    req.user.tenantId, parsed.data.period, req.user.userId
  );
  sendSuccess(res, results);
}));

// ─── Dispose Asset ────────────────────────────────────────────────

router.post('/:id/dispose', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    disposedAt:    z.string().datetime(),
    disposalPrice: z.number().min(0),
    notes:         z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const result = await AssetsService.disposeAsset({
    assetId:      req.params.id,
    tenantId:     req.user.tenantId,
    disposedAt:   new Date(parsed.data.disposedAt),
    disposalPrice: parsed.data.disposalPrice,
    notes:        parsed.data.notes,
    createdBy:    req.user.userId,
  });
  sendSuccess(res, result);
}));

// ─── Asset Summary Report ─────────────────────────────────────────

router.get('/reports/summary', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const assets = await prisma.fixedAsset.findMany({
    where: withTenant(req),
    include: { depreciationLedger: true },
  });

  const summary = await Promise.all(assets.map(async (a) => {
    const accumulated = await AssetsService.getAccumulatedDepreciation(a.id);
    return {
      id:              a.id,
      code:            a.code,
      name:            a.name,
      category:        a.category,
      purchasePrice:   Number(a.purchasePrice),
      accumulated,
      bookValue:       Number(a.purchasePrice) - accumulated,
      status:          a.status,
      depreciationMethod: a.depreciationMethod,
    };
  }));

  const totalCost  = summary.reduce((s, a) => s + a.purchasePrice, 0);
  const totalAccum = summary.reduce((s, a) => s + a.accumulated, 0);
  const totalBook  = summary.reduce((s, a) => s + a.bookValue, 0);

  sendSuccess(res, { assets: summary, totalCost, totalAccumulated: totalAccum, totalBookValue: totalBook });
}));

export default router;
