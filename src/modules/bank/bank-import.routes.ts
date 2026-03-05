import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as BankImportService from './bank-import.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const BankFormatEnum = z.enum(['LEUMI', 'HAPOALIM', 'DISCOUNT', 'AUTO']);

const CreateBankAccountSchema = z.object({
  bankName:      z.string().min(1),
  accountNumber: z.string().min(1),
  branchNumber:  z.string().optional(),
  accountName:   z.string().optional(),
  currency:      z.string().default('ILS'),
  glAccountId:   z.string().cuid().optional(),
});

const UpdateBankAccountSchema = z.object({
  bankName:      z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  branchNumber:  z.string().optional(),
  accountName:   z.string().optional(),
  currency:      z.string().optional(),
  glAccountId:   z.string().cuid().optional(),
  isActive:      z.boolean().optional(),
});

const ImportSchema = z.object({
  csvContent: z.string().min(1, 'csvContent is required'),
  format:     BankFormatEnum.optional(),
  // legacy: accept bankName hint for backward compat
  bankName:   z.string().optional(),
});

// ─── GET /bank/accounts — list bank accounts ──────────────────────────────────

router.get(
  '/accounts',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const accounts = await BankImportService.listBankAccounts(req.user.tenantId);
    sendSuccess(res, accounts);
  })
);

// ─── POST /bank/accounts — create bank account ────────────────────────────────

router.post(
  '/accounts',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateBankAccountSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const account = await BankImportService.createBankAccount(
        req.user.tenantId,
        parsed.data
      );
      sendSuccess(res, account, 201);
    } catch (err: any) {
      if (err.code === 'P2002') sendError(res, 'חשבון בנק עם שם הבנק ומספר החשבון הזה כבר קיים', 409);
      else throw err;
    }
  })
);

// ─── PUT /bank/accounts/:id — update bank account ─────────────────────────────

router.put(
  '/accounts/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = UpdateBankAccountSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const updated = await BankImportService.updateBankAccount(
      req.params.id,
      req.user.tenantId,
      parsed.data
    );
    if (!updated) { sendError(res, 'חשבון בנק לא נמצא', 404); return; }

    sendSuccess(res, updated);
  })
);

// ─── DELETE /bank/accounts/:id — soft-delete bank account (ADMIN) ─────────────

router.delete(
  '/accounts/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await BankImportService.deleteBankAccount(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, account);
    } catch (err: any) {
      sendError(res, err.message ?? 'Failed to delete bank account', 404);
    }
  })
);

// ─── POST /bank/accounts/:id/import — import CSV statement ───────────────────

router.post(
  '/accounts/:id/import',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = ImportSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const result = await BankImportService.importBankStatement(
        req.user.tenantId,
        req.params.id,
        parsed.data.csvContent,
        parsed.data.format
      );
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בייבוא הקובץ', 400);
    }
  })
);

// ─── POST /bank/accounts/:id/auto-match — run auto-matching ──────────────────

router.post(
  '/accounts/:id/auto-match',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Verify account belongs to this tenant
    const account = await prisma.bankAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.tenantId !== req.user.tenantId) {
      sendError(res, 'חשבון בנק לא נמצא', 404);
      return;
    }

    try {
      const result = await BankImportService.autoMatchStatements(
        req.user.tenantId,
        req.params.id
      );
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message ?? 'Auto-match failed', 400);
    }
  })
);

// ─── GET /bank/accounts/:id/lines — list statement lines ─────────────────────

router.get(
  '/accounts/:id/lines',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, from, to, page, limit } = req.query;

    const account = await prisma.bankAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.tenantId !== req.user.tenantId) {
      sendError(res, 'חשבון בנק לא נמצא', 404);
      return;
    }

    const result = await BankImportService.getBankStatementLines(
      req.user.tenantId,
      req.params.id,
      {
        status: status as string | undefined,
        from:   from   as string | undefined,
        to:     to     as string | undefined,
        page:   page   ? parseInt(page   as string, 10) : undefined,
        limit:  limit  ? parseInt(limit  as string, 10) : undefined,
      }
    );

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── PUT /bank/accounts/:id/lines/:lineId/match — manually match a line ───────

router.put(
  '/accounts/:id/lines/:lineId/match',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({ transactionId: z.string().cuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    // Verify statement line belongs to this tenant + bank account
    const line = await prisma.bankStatementLine.findUnique({ where: { id: req.params.lineId } });
    if (!line || line.tenantId !== req.user.tenantId || line.bankAccountId !== req.params.id) {
      sendError(res, 'שורת דף חשבון לא נמצאה', 404);
      return;
    }

    // Verify the GL transaction belongs to this tenant
    const transaction = await prisma.transaction.findUnique({
      where: { id: parsed.data.transactionId },
    });
    if (!transaction || transaction.tenantId !== req.user.tenantId) {
      sendError(res, 'תנועה חשבונאית לא נמצאה', 404);
      return;
    }

    const updated = await prisma.bankStatementLine.update({
      where: { id: req.params.lineId },
      data:  { status: 'MATCHED', matchedTxId: parsed.data.transactionId },
    });

    sendSuccess(res, updated);
  })
);

// ─── PUT /bank/accounts/:id/lines/:lineId/ignore — ignore a line ──────────────

router.put(
  '/accounts/:id/lines/:lineId/ignore',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const line = await prisma.bankStatementLine.findUnique({ where: { id: req.params.lineId } });
    if (!line || line.tenantId !== req.user.tenantId || line.bankAccountId !== req.params.id) {
      sendError(res, 'שורת דף חשבון לא נמצאה', 404);
      return;
    }

    const updated = await prisma.bankStatementLine.update({
      where: { id: req.params.lineId },
      data:  { status: 'IGNORED', matchedTxId: null },
    });

    sendSuccess(res, updated);
  })
);

// ─── GET /bank/accounts/:id/summary — reconciliation summary ─────────────────

router.get(
  '/accounts/:id/summary',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const summary = await BankImportService.getReconciliationSummary(
      req.user.tenantId,
      req.params.id
    );
    if (!summary) { sendError(res, 'חשבון בנק לא נמצא', 404); return; }
    sendSuccess(res, summary);
  })
);

// ─── GET /bank/accounts/:id/unmatched — unmatched lines (legacy compat) ───────

router.get(
  '/accounts/:id/unmatched',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const lines = await BankImportService.getUnmatchedLines(
        req.user.tenantId,
        req.params.id
      );
      sendSuccess(res, lines);
    } catch (err: any) {
      sendError(res, err.message ?? 'Failed to fetch unmatched lines', 404);
    }
  })
);

export default router;
