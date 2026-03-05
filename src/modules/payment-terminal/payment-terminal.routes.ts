/**
 * Payment Terminal Routes (מסופני אשראי)
 * Endpoints for managing Israeli payment terminals and card transactions.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TerminalProvider, CardTxStatus } from '@prisma/client';
import { authenticate }              from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole }            from '../../middleware/rbac';
import { AuthenticatedRequest }      from '../../shared/types/index';
import { sendSuccess, sendError }    from '../../shared/utils/response';
import { asyncHandler }              from '../../shared/utils/asyncHandler';
import * as PaymentTerminalService   from './payment-terminal.service';

const router = Router();

// ─── Auth guard on all non-webhook routes ─────────────────────────────────────
// Webhook route is registered BEFORE the auth middleware so it stays public.

// POST /payment-terminal/webhook/:provider — PUBLIC (no auth)
router.post(
  '/webhook/:provider',
  asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    await PaymentTerminalService.handleWebhook(provider, req.body ?? {});
    res.json({ success: true });
  })
);

// Apply authentication + tenant isolation to all routes below
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Terminals ────────────────────────────────────────────────────────────────

// GET /payment-terminal/terminals
router.get(
  '/terminals',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;
    const terminals = await PaymentTerminalService.listTerminals(req.user.tenantId, branchId);
    sendSuccess(res, terminals);
  })
);

// POST /payment-terminal/terminals
router.post(
  '/terminals',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:       z.string().min(1),
      terminalId: z.string().min(1),
      provider:   z.nativeEnum(TerminalProvider),
      apiUrl:     z.string().url().optional(),
      apiKey:     z.string().optional(),
      apiSecret:  z.string().optional(),
      merchantId: z.string().optional(),
      currency:   z.string().length(3).default('ILS'),
      branchId:   z.string().cuid().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const terminal = await PaymentTerminalService.createTerminal(
      req.user.tenantId,
      req.user.userId,
      parsed.data
    );
    sendSuccess(res, terminal, 201);
  })
);

// GET /payment-terminal/terminals/:id
router.get(
  '/terminals/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const terminal = await PaymentTerminalService.getTerminal(req.user.tenantId, req.params.id);
      sendSuccess(res, terminal);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Not found', 404);
    }
  })
);

// PUT /payment-terminal/terminals/:id
router.put(
  '/terminals/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:       z.string().min(1).optional(),
      terminalId: z.string().min(1).optional(),
      provider:   z.nativeEnum(TerminalProvider).optional(),
      apiUrl:     z.string().url().optional().nullable(),
      apiKey:     z.string().optional().nullable(),
      apiSecret:  z.string().optional().nullable(),
      merchantId: z.string().optional().nullable(),
      currency:   z.string().length(3).optional(),
      branchId:   z.string().cuid().optional().nullable(),
      isActive:   z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const terminal = await PaymentTerminalService.updateTerminal(
        req.user.tenantId,
        req.params.id,
        parsed.data
      );
      sendSuccess(res, terminal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, msg, msg === 'Terminal not found' ? 404 : 400);
    }
  })
);

// DELETE /payment-terminal/terminals/:id
router.delete(
  '/terminals/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await PaymentTerminalService.deactivateTerminal(req.user.tenantId, req.params.id);
      sendSuccess(res, { message: 'Terminal deactivated' });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Not found', 404);
    }
  })
);

// POST /payment-terminal/terminals/:id/test
router.post(
  '/terminals/:id/test',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await PaymentTerminalService.testTerminal(req.user.tenantId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Test failed', 400);
    }
  })
);

// ─── Charge ───────────────────────────────────────────────────────────────────

// POST /payment-terminal/charge
router.post(
  '/charge',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      terminalId:   z.string().cuid(),
      amount:       z.number().positive(),
      currency:     z.string().length(3).default('ILS'),
      installments: z.number().int().min(1).max(36).default(1),
      customerId:   z.string().cuid().optional(),
      invoiceId:    z.string().cuid().optional(),
      description:  z.string().optional(),
      cardToken:    z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const tx = await PaymentTerminalService.chargeCard(
        req.user.tenantId,
        req.user.userId,
        parsed.data
      );
      sendSuccess(res, tx, 201);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Charge failed', 400);
    }
  })
);

// ─── Payment Link ─────────────────────────────────────────────────────────────

// POST /payment-terminal/payment-link
router.post(
  '/payment-link',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      terminalId:     z.string().cuid(),
      amount:         z.number().positive(),
      currency:       z.string().length(3).default('ILS'),
      description:    z.string().optional(),
      customerId:     z.string().cuid().optional(),
      invoiceId:      z.string().cuid().optional(),
      customerName:   z.string().optional(),
      customerEmail:  z.string().email().optional(),
      customerPhone:  z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const result = await PaymentTerminalService.generatePaymentLink(
        req.user.tenantId,
        req.user.userId,
        parsed.data
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to generate payment link', 400);
    }
  })
);

// ─── Transactions ─────────────────────────────────────────────────────────────

// GET /payment-terminal/transactions
router.get(
  '/transactions',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      terminalId,
      customerId,
      status,
      from,
      to,
      minAmount,
      maxAmount,
      page     = '1',
      pageSize = '50',
    } = req.query;

    const filters: PaymentTerminalService.TransactionFilters = {
      terminalId: terminalId as string | undefined,
      customerId: customerId as string | undefined,
      status:     status     as CardTxStatus | undefined,
      from:       from       ? new Date(from as string) : undefined,
      to:         to         ? new Date(to   as string) : undefined,
      minAmount:  minAmount  ? Number(minAmount)        : undefined,
      maxAmount:  maxAmount  ? Number(maxAmount)        : undefined,
      page:       parseInt(page     as string),
      pageSize:   parseInt(pageSize as string),
    };

    const result = await PaymentTerminalService.listTransactions(req.user.tenantId, filters);
    sendSuccess(res, result.items, 200, { total: result.total });
  })
);

// GET /payment-terminal/transactions/:id
router.get(
  '/transactions/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tx = await PaymentTerminalService.getTransaction(req.user.tenantId, req.params.id);
      sendSuccess(res, tx);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Not found', 404);
    }
  })
);

// POST /payment-terminal/transactions/:id/refund
router.post(
  '/transactions/:id/refund',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      amount: z.number().positive().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const refundTx = await PaymentTerminalService.refundTransaction(
        req.user.tenantId,
        req.user.userId,
        req.params.id,
        parsed.data.amount
      );
      sendSuccess(res, refundTx, 201);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Refund failed', 400);
    }
  })
);

// ─── Terminal Summary ─────────────────────────────────────────────────────────

// GET /payment-terminal/terminals/:id/summary
router.get(
  '/terminals/:id/summary',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const now  = new Date();
    const from = req.query.from
      ? new Date(req.query.from as string)
      : new Date(now.getFullYear(), now.getMonth(), 1); // start of current month

    const to = req.query.to
      ? new Date(req.query.to as string)
      : now;

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      sendError(res, 'Invalid date range — use ISO 8601 format');
      return;
    }

    try {
      const summary = await PaymentTerminalService.getTerminalSummary(
        req.user.tenantId,
        req.params.id,
        from,
        to
      );
      sendSuccess(res, summary);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Not found', 404);
    }
  })
);

export default router;
