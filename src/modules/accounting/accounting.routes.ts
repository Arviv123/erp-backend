import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';
import * as AccountingService from './accounting.service';
import * as ReportsService from './reports.service';
import { asyncHandler } from '../../shared/utils/asyncHandler';

const router = Router();

// All accounting routes require authentication + tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Chart of Accounts ───────────────────────────────────────────

router.get('/accounts', async (req: AuthenticatedRequest, res: Response) => {
  const accounts = await prisma.account.findMany({
    where:   withTenant(req, { isActive: true }),
    orderBy: { code: 'asc' },
  });
  sendSuccess(res, accounts);
});

const CreateAccountSchema = z.object({
  code:     z.string().min(2).max(10),
  name:     z.string().min(1),
  nameEn:   z.string().optional(),
  type:     z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().cuid().optional(),
});

router.post(
  '/accounts',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const account = await prisma.account.create({
        data: { ...parsed.data, tenantId: req.user.tenantId },
      });
      sendSuccess(res, account, 201);
    } catch (err: any) {
      if (err.code === 'P2002') {
        sendError(res, `Account code ${parsed.data.code} already exists`);
      } else {
        throw err;
      }
    }
  }
);

// ─── Transactions ─────────────────────────────────────────────────

const TransactionLineSchema = z.object({
  debitAccountId:  z.string().cuid(),
  creditAccountId: z.string().cuid(),
  amount:          z.number().positive(),
  description:     z.string().optional(),
});

const CreateTransactionSchema = z.object({
  date:        z.string().datetime(),
  reference:   z.string().min(1),
  description: z.string().min(1),
  sourceType:  z.string().min(1),
  sourceId:    z.string().optional(),
  lines:       z.array(TransactionLineSchema).min(1),
});

router.post(
  '/transactions',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const tx = await AccountingService.createTransaction({
        ...parsed.data,
        date:     new Date(parsed.data.date),
        tenantId: req.user.tenantId,
        createdBy: req.user.userId,
      });
      sendSuccess(res, tx, 201);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

router.get('/transactions', async (req: AuthenticatedRequest, res: Response) => {
  const { status, sourceType, from, to, page, pageSize } = req.query;

  const result = await AccountingService.listTransactions(req.user.tenantId, {
    status:     status as any,
    sourceType: sourceType as string,
    from:       from ? new Date(from as string) : undefined,
    to:         to   ? new Date(to   as string) : undefined,
    page:       page     ? parseInt(page as string)     : 1,
    pageSize:   pageSize ? parseInt(pageSize as string) : 50,
  });

  sendSuccess(res, result.items, 200, {
    total:    result.total,
    page:     result.page,
    pageSize: result.pageSize,
  });
});

// POST /transactions/:id/post
router.post(
  '/transactions/:id/post',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tx = await AccountingService.postTransaction(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, tx);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// POST /transactions/:id/void
router.post(
  '/transactions/:id/void',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tx = await AccountingService.voidTransaction(
        req.params.id,
        req.user.tenantId,
        req.user.userId
      );
      sendSuccess(res, tx);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// ─── Reports ──────────────────────────────────────────────────────

// GET /accounting/trial-balance
router.get(
  '/trial-balance',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
    const result = await AccountingService.getTrialBalance(req.user.tenantId, asOf);
    sendSuccess(res, result);
  }
);

// GET /accounting/accounts/:id/balance
router.get(
  '/accounts/:id/balance',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
    const result = await AccountingService.getAccountBalance(
      req.params.id,
      req.user.tenantId,
      asOf
    );
    sendSuccess(res, result);
  }
);

// ─── Financial Reports ────────────────────────────────────────────

// GET /accounting/reports/pl?from=2026-01-01&to=2026-03-31
router.get(
  '/reports/pl',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    if (!from || !to) { sendError(res, 'from and to dates are required'); return; }

    const result = await ReportsService.getProfitAndLoss(
      req.user.tenantId,
      new Date(from as string),
      new Date(to   as string)
    );
    sendSuccess(res, result);
  })
);

// GET /accounting/reports/balance-sheet?asOf=2026-03-01
router.get(
  '/reports/balance-sheet',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : new Date();
    const result = await ReportsService.getBalanceSheet(req.user.tenantId, asOf);
    sendSuccess(res, result);
  })
);

// GET /accounting/reports/vat?period=2026-02
router.get(
  '/reports/vat',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const period = req.query.period as string;
    if (!period) { sendError(res, 'period (YYYY-MM) is required'); return; }

    const result = await ReportsService.getVatReport(req.user.tenantId, period);
    sendSuccess(res, result);
  })
);

// GET /accounting/reports/cash-flow?from=2026-01-01&to=2026-03-31
router.get(
  '/reports/cash-flow',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    if (!from || !to) { sendError(res, 'from and to dates are required'); return; }

    const result = await ReportsService.getCashFlowStatement(
      req.user.tenantId,
      new Date(from as string),
      new Date(to   as string)
    );
    sendSuccess(res, result);
  })
);

export default router;
