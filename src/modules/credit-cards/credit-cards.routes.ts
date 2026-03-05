import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  listCards,
  createCard,
  getCard,
  importCreditCardCSV,
  listTransactions,
  categorizeTransaction,
  matchToExpense,
  getCardSummary,
} from './credit-cards.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateCardSchema = z.object({
  cardNumber:     z.string().min(4, 'יש לספק לפחות 4 ספרות של מספר הכרטיס'),
  cardholderName: z.string().min(1, 'שם בעל הכרטיס נדרש'),
  employeeId:     z.string().optional(),
  cardType:       z.enum(['VISA', 'MASTERCARD', 'AMEX', 'OTHER']),
  issuer:         z.string().min(1, 'שם המנפיק נדרש'),  // "לאומי קארד" | "Cal" | "ישראכרט"
  creditLimit:    z.number().positive().optional(),
  glAccountId:    z.string().optional(),
});

const ImportCsvSchema = z.object({
  csvContent: z.string().min(1, 'תוכן CSV לא יכול להיות ריק'),
});

const CategorizeSchema = z.object({
  category: z.string().min(1, 'קטגוריה נדרשת'),
});

const MatchExpenseSchema = z.object({
  expenseId: z.string().min(1, 'מזהה דו"ח הוצאות נדרש'),
});

// ─── Card Management ──────────────────────────────────────────────────────────

// GET / — list all corporate credit cards (ACCOUNTANT+)
router.get(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const cards = await listCards(req.user.tenantId);
    sendSuccess(res, cards);
  }),
);

// POST / — create card (ADMIN only)
router.post(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateCardSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const card = await createCard(req.user.tenantId, parsed.data);
    sendSuccess(res, card, 201);
  }),
);

// GET /:id — get card details + recent transactions (ACCOUNTANT+)
router.get(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const card = await getCard(req.params.id, req.user.tenantId);
    if (!card) {
      sendError(res, 'כרטיס אשראי לא נמצא', 404);
      return;
    }
    sendSuccess(res, card);
  }),
);

// POST /:id/import — import CSV statement (ACCOUNTANT+)
// body: { csvContent: string }
router.post(
  '/:id/import',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = ImportCsvSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const result = await importCreditCardCSV(
        req.user.tenantId,
        req.params.id,
        parsed.data.csvContent,
      );
      sendSuccess(res, result, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בייבוא קובץ CSV');
    }
  }),
);

// GET /:id/transactions — list transactions (ACCOUNTANT+)
// query: status, from, to, page, limit
router.get(
  '/:id/transactions',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, from, to, page, limit } = req.query;

    const result = await listTransactions(req.user.tenantId, req.params.id, {
      status: status as string | undefined,
      from:   from   as string | undefined,
      to:     to     as string | undefined,
      page:   page   ? parseInt(page   as string, 10) : undefined,
      limit:  limit  ? parseInt(limit  as string, 10) : undefined,
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  }),
);

// PATCH /:id/transactions/:txId/categorize — categorize a transaction (ACCOUNTANT+)
// body: { category: string }
router.patch(
  '/:id/transactions/:txId/categorize',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CategorizeSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tx = await categorizeTransaction(
      req.params.txId,
      req.user.tenantId,
      parsed.data.category,
    );

    if (!tx) {
      sendError(res, 'עסקה לא נמצאה', 404);
      return;
    }

    sendSuccess(res, tx);
  }),
);

// POST /:id/transactions/:txId/match-expense — match to expense report (ACCOUNTANT+)
// body: { expenseId: string }
router.post(
  '/:id/transactions/:txId/match-expense',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = MatchExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tx = await matchToExpense(
      req.params.txId,
      req.user.tenantId,
      parsed.data.expenseId,
    );

    if (!tx) {
      sendError(res, 'עסקה לא נמצאה', 404);
      return;
    }

    sendSuccess(res, tx);
  }),
);

// GET /:id/summary — monthly summary (ACCOUNTANT+)
// query: month (YYYY-MM)
router.get(
  '/:id/summary',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month as string)) {
      sendError(res, 'פרמטר month נדרש בפורמט YYYY-MM');
      return;
    }

    const summary = await getCardSummary(
      req.user.tenantId,
      req.params.id,
      month as string,
    );

    if (!summary) {
      sendError(res, 'כרטיס אשראי לא נמצא', 404);
      return;
    }

    sendSuccess(res, summary);
  }),
);

export default router;
