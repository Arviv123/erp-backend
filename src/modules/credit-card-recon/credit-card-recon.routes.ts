import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { CreditCardProcessor } from '@prisma/client';
import {
  importStatement,
  listStatements,
  getStatement,
  getStatementSummary,
  deleteStatement,
  autoMatchStatement,
  matchManually,
  unmatch,
  approveReconciliation,
  disputeReconciliation,
  getReconciliationReport,
  exportReconciliationXLSX,
} from './credit-card-recon.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const ImportStatementSchema = z.object({
  cardId:        z.string().min(1, 'cardId נדרש'),
  processor:     z.nativeEnum(CreditCardProcessor),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD'),
  periodFrom:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD'),
  periodTo:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD'),
  csvContent:    z.string().min(1, 'תוכן CSV לא יכול להיות ריק'),
  rawFilename:   z.string().optional(),
});

const ManualMatchSchema = z.object({
  statementLineIds: z.array(z.string()).min(1, 'יש לספק לפחות שורה אחת'),
  bankLineId:       z.string().optional(),
  notes:            z.string().optional(),
  statementId:      z.string().min(1, 'statementId נדרש'),
});

const DisputeSchema = z.object({
  reason: z.string().min(1, 'סיבה להתנגדות נדרשת'),
});

// ─── Statements ───────────────────────────────────────────────────────────────

// POST /statements — import statement from CSV
router.post(
  '/statements',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = ImportStatementSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const { cardId, ...rest } = parsed.data;
    try {
      const stmt = await importStatement(
        req.user.tenantId,
        cardId,
        rest,
        req.user.userId,
      );
      sendSuccess(res, stmt, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בייבוא הצהרה');
    }
  }),
);

// GET /statements — list statements
router.get(
  '/statements',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { cardId, status, from, to } = req.query;
    const statements = await listStatements(req.user.tenantId, {
      cardId: cardId as string | undefined,
      status: status as string | undefined,
      from:   from   as string | undefined,
      to:     to     as string | undefined,
    });
    sendSuccess(res, statements);
  }),
);

// GET /statements/:id — get statement with lines
router.get(
  '/statements/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stmt = await getStatement(req.user.tenantId, req.params.id);
    if (!stmt) {
      sendError(res, 'הצהרה לא נמצאה', 404);
      return;
    }
    sendSuccess(res, stmt);
  }),
);

// GET /statements/:id/summary — summary with category breakdown
router.get(
  '/statements/:id/summary',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const summary = await getStatementSummary(req.user.tenantId, req.params.id);
    if (!summary) {
      sendError(res, 'הצהרה לא נמצאה', 404);
      return;
    }
    sendSuccess(res, summary);
  }),
);

// DELETE /statements/:id — delete PENDING statement
router.delete(
  '/statements/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteStatement(req.user.tenantId, req.params.id);
      sendSuccess(res, { message: 'הצהרה נמחקה בהצלחה' });
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה במחיקת הצהרה');
    }
  }),
);

// POST /statements/:id/auto-match — run auto-matching engine
router.post(
  '/statements/:id/auto-match',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await autoMatchStatement(req.user.tenantId, req.params.id);
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בהתאמה אוטומטית');
    }
  }),
);

// POST /statements/:id/export — export statement to XLSX
router.post(
  '/statements/:id/export',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const buf = await exportReconciliationXLSX(req.user.tenantId, req.params.id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="recon-${req.params.id}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה ביצוא');
    }
  }),
);

// ─── Manual Match ─────────────────────────────────────────────────────────────

// POST /match/manual — manually match statement lines to a bank line
router.post(
  '/match/manual',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = ManualMatchSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const recon = await matchManually(
        req.user.tenantId,
        parsed.data,
        req.user.userId,
      );
      sendSuccess(res, recon, 201);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בהתאמה ידנית');
    }
  }),
);

// ─── Reconciliations ──────────────────────────────────────────────────────────

// DELETE /reconciliations/:id — reverse a reconciliation
router.delete(
  '/reconciliations/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await unmatch(req.user.tenantId, req.params.id);
      sendSuccess(res, { message: 'התאמה בוטלה בהצלחה' });
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בביטול התאמה');
    }
  }),
);

// POST /reconciliations/:id/approve — approve a reconciliation
router.post(
  '/reconciliations/:id/approve',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recon = await approveReconciliation(
        req.user.tenantId,
        req.params.id,
        req.user.userId,
      );
      sendSuccess(res, recon);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה באישור התאמה');
    }
  }),
);

// POST /reconciliations/:id/dispute — dispute a reconciliation
router.post(
  '/reconciliations/:id/dispute',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = DisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const recon = await disputeReconciliation(
        req.user.tenantId,
        req.params.id,
        parsed.data.reason,
      );
      sendSuccess(res, recon);
    } catch (err: any) {
      sendError(res, err.message ?? 'שגיאה בסימון סכסוך');
    }
  }),
);

// ─── Reporting ────────────────────────────────────────────────────────────────

// GET /report — reconciliation report per card
router.get(
  '/report',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to, cardId } = req.query;
    const report = await getReconciliationReport(req.user.tenantId, {
      from:   from   as string | undefined,
      to:     to     as string | undefined,
      cardId: cardId as string | undefined,
    });
    sendSuccess(res, report);
  }),
);

export default router;
