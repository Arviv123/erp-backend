import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as QuotesService from './quotes.service';
import { CreateQuoteSchema, UpdateQuoteSchema } from './quotes.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET / — list quotes ───────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, customerId, from, to, page = '1', limit = '25' } = req.query;

    const result = await QuotesService.listQuotes(req.user.tenantId, {
      status:     status     as string | undefined,
      customerId: customerId as string | undefined,
      from:       from       as string | undefined,
      to:         to         as string | undefined,
      page:       parseInt(page  as string),
      limit:      parseInt(limit as string),
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── POST / — create quote (ACCOUNTANT+) ──────────────────────────

router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400);
      return;
    }

    try {
      const quote = await QuotesService.createQuote(
        req.user.tenantId,
        parsed.data,
        req.user.userId
      );
      sendSuccess(res, quote, 201);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  })
);

// ─── GET /expire-check — expire overdue quotes (ADMIN+) ───────────
// IMPORTANT: must be registered BEFORE /:id to avoid "expire-check" being treated as an ID

router.get(
  '/expire-check',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await QuotesService.expireOverdueQuotes(req.user.tenantId);
    sendSuccess(res, result);
  })
);

// ─── GET /:id — get single quote ──────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quote = await QuotesService.getQuote(req.params.id, req.user.tenantId);
      sendSuccess(res, quote);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  })
);

// ─── GET /:id/pdf — download PDF ──────────────────────────────────

router.get(
  '/:id/pdf',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const buffer = await QuotesService.getQuotePDF(req.params.id, req.user.tenantId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="quote-${req.params.id}.pdf"`
      );
      res.end(buffer);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── PUT /:id — update quote (ACCOUNTANT+) ────────────────────────

router.put(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = UpdateQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400);
      return;
    }

    try {
      const quote = await QuotesService.updateQuote(
        req.params.id,
        req.user.tenantId,
        parsed.data
      );
      sendSuccess(res, quote);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/send — mark as sent (ACCOUNTANT+) ──────────────────

router.post(
  '/:id/send',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quote = await QuotesService.sendQuote(req.params.id, req.user.tenantId);
      sendSuccess(res, quote);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/accept — mark as accepted ──────────────────────────

router.post(
  '/:id/accept',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quote = await QuotesService.acceptQuote(req.params.id, req.user.tenantId);
      sendSuccess(res, quote);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/reject — mark as rejected ──────────────────────────

router.post(
  '/:id/reject',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quote = await QuotesService.rejectQuote(req.params.id, req.user.tenantId);
      sendSuccess(res, quote);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/convert-to-order — convert to sales order (ACCOUNTANT+) ───

router.post(
  '/:id/convert-to-order',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const salesOrder = await QuotesService.convertToSalesOrder(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, salesOrder, 201);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/convert-to-invoice — convert to invoice (ACCOUNTANT+) ─────

router.post(
  '/:id/convert-to-invoice',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const invoice = await QuotesService.convertToInvoice(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, invoice, 201);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

// ─── POST /:id/duplicate — duplicate quote (ACCOUNTANT+) ──────────

router.post(
  '/:id/duplicate',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quote = await QuotesService.duplicateQuote(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, quote, 201);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      sendError(res, err.message, status);
    }
  })
);

export default router;
