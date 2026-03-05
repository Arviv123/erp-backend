import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  listPettyCashes,
  createPettyCash,
  getPettyCash,
  addTransaction,
  listTransactions,
  getReconciliationReport,
} from './petty-cash.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateFundSchema = z.object({
  name:        z.string().min(1, 'שם קופה נדרש'),
  maxBalance:  z.number().positive().optional(),
  custodianId: z.string().optional(),
});

const AddTransactionSchema = z.object({
  type:        z.enum(['WITHDRAWAL', 'DEPOSIT', 'REPLENISHMENT']),
  amount:      z.number().positive('הסכום חייב להיות חיובי'),
  description: z.string().min(1, 'תיאור עסקה נדרש'),
  category:    z.string().optional(),
  receiptUrl:  z.string().url().optional(),
  glAccountId: z.string().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET / — list all petty cash funds (ADMIN or ACCOUNTANT)
router.get(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const funds = await listPettyCashes(req.user.tenantId);
    sendSuccess(res, funds);
  }),
);

// POST / — create petty cash fund (ADMIN only)
router.post(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateFundSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const fund = await createPettyCash(req.user.tenantId, parsed.data);
    sendSuccess(res, fund, 201);
  }),
);

// GET /:id — get fund with recent transactions (ACCOUNTANT+)
router.get(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const fund = await getPettyCash(req.params.id, req.user.tenantId);
    if (!fund) {
      sendError(res, 'קופה קטנה לא נמצאה', 404);
      return;
    }
    sendSuccess(res, fund);
  }),
);

// POST /:id/transactions — add transaction (ACCOUNTANT+)
// body: { type, amount, description, category?, receiptUrl?, glAccountId? }
router.post(
  '/:id/transactions',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = AddTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const tx = await addTransaction(req.user.tenantId, req.user.userId, {
        pettyCashId:  req.params.id,
        type:         parsed.data.type,
        amount:       parsed.data.amount,
        description:  parsed.data.description,
        category:     parsed.data.category,
        receiptUrl:   parsed.data.receiptUrl,
        glAccountId:  parsed.data.glAccountId,
      });
      sendSuccess(res, tx, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בהוספת עסקה לקופה קטנה');
    }
  }),
);

// GET /:id/transactions — list transactions (ACCOUNTANT+)
// query: from, to, type, page, limit
router.get(
  '/:id/transactions',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to, type, page, limit } = req.query;

    const result = await listTransactions(req.user.tenantId, req.params.id, {
      from:  from  as string | undefined,
      to:    to    as string | undefined,
      type:  type  as string | undefined,
      page:  page  ? parseInt(page  as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  }),
);

// GET /:id/report — monthly reconciliation report (ACCOUNTANT+)
// query: month (YYYY-MM)
router.get(
  '/:id/report',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month as string)) {
      sendError(res, 'פרמטר month נדרש בפורמט YYYY-MM');
      return;
    }

    const report = await getReconciliationReport(
      req.user.tenantId,
      req.params.id,
      month as string
    );

    if (!report) {
      sendError(res, 'קופה קטנה לא נמצאה', 404);
      return;
    }

    sendSuccess(res, report);
  }),
);

export default router;
