import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as BudgetService from './budget.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Budgets CRUD ─────────────────────────────────────────────────

router.get('/', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { year, status } = req.query;
  const where = withTenant(req, {
    ...(year   ? { year: parseInt(year as string) } : {}),
    ...(status ? { status: status as any }          : {}),
  });
  const budgets = await prisma.budget.findMany({
    where,
    include: { _count: { select: { lines: true } } },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
  });
  sendSuccess(res, budgets);
}));

router.get('/:id', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const budget = await prisma.budget.findUnique({
    where:   { id: req.params.id },
    include: { lines: { include: { budget: false } } },
  });
  if (!budget || budget.tenantId !== req.user.tenantId) { sendError(res, 'Budget not found', 404); return; }
  sendSuccess(res, budget);
}));

router.post('/', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:  z.string().min(1),
    year:  z.number().int().min(2020).max(2100),
    notes: z.string().optional(),
    lines: z.array(z.object({
      accountId: z.string().cuid(),
      amount:    z.number().min(0),
      notes:     z.string().optional(),
    })).default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const totalBudget = parsed.data.lines.reduce((s, l) => s + l.amount, 0);

  try {
    const budget = await prisma.budget.create({
      data: {
        tenantId:    req.user.tenantId,
        name:        parsed.data.name,
        year:        parsed.data.year,
        status:      'DRAFT',
        totalBudget,
        notes:       parsed.data.notes,
        createdBy:   req.user.userId,
        lines: { create: parsed.data.lines },
      },
      include: { lines: true },
    });
    sendSuccess(res, budget, 201);
  } catch (err: any) {
    if (err.code === 'P2002') sendError(res, 'A budget with this name and year already exists');
    else throw err;
  }
}));

// PATCH /budget/:id — update header fields + replace lines
router.patch('/:id', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:  z.string().min(1).optional(),
    notes: z.string().optional(),
    lines: z.array(z.object({
      accountId: z.string().cuid(),
      amount:    z.number().min(0),
      notes:     z.string().optional(),
    })).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.budget.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Budget not found', 404); return; }
  if (existing.status !== 'DRAFT') { sendError(res, 'Only DRAFT budgets can be edited', 400); return; }

  const data: any = {};
  if (parsed.data.name)  data.name  = parsed.data.name;
  if (parsed.data.notes) data.notes = parsed.data.notes;

  if (parsed.data.lines) {
    data.totalBudget = parsed.data.lines.reduce((s, l) => s + l.amount, 0);
    // Delete existing lines then recreate
    await prisma.budgetLine.deleteMany({ where: { budgetId: req.params.id } });
    data.lines = { create: parsed.data.lines };
  }

  const updated = await prisma.budget.update({
    where:   { id: req.params.id },
    data,
    include: { lines: true },
  });
  sendSuccess(res, updated);
}));

// POST /budget/:id/activate
router.post('/:id/activate', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.budget.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Budget not found', 404); return; }
  if (existing.status !== 'DRAFT') { sendError(res, 'Only DRAFT budgets can be activated', 400); return; }

  const updated = await prisma.budget.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
  sendSuccess(res, updated);
}));

// ─── Budget vs Actual ─────────────────────────────────────────────

router.get('/:id/vs-actual', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await BudgetService.getBudgetVsActual(req.params.id, req.user.tenantId);
  sendSuccess(res, result);
}));

// ─── Clone Budget ─────────────────────────────────────────────────

router.post('/:id/clone', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    newYear: z.number().int().min(2020).max(2100),
    newName: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const cloned = await BudgetService.cloneBudget(
    req.params.id, req.user.tenantId,
    parsed.data.newYear, parsed.data.newName, req.user.userId
  );
  sendSuccess(res, cloned, 201);
}));

export default router;
