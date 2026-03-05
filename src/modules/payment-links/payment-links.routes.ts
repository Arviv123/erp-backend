/**
 * Payment Links Routes
 *
 * Route layout:
 *   GET  /                          — list payment links (authenticated)
 *   POST /invoice/:invoiceId         — create a payment link for an invoice (ACCOUNTANT+)
 *   GET  /public/:token              — PUBLIC: get link details by token (no auth)
 *   POST /public/:token/confirm      — PUBLIC: confirm payment (called by payment gateway)
 *   GET  /expire                     — run expiry sweep (ADMIN+)
 *   GET  /:id                        — get single payment link (authenticated)
 *   PUT  /:id/mark-paid              — mark as paid (ACCOUNTANT+)
 *   POST /:id/send-email             — send email with payment link (ACCOUNTANT+)
 *   DELETE /:id/cancel               — cancel a payment link (ACCOUNTANT+)
 *
 * IMPORTANT: /public/* routes are registered BEFORE the authenticate middleware
 * so that they remain accessible without a JWT token.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as PaymentLinkService from './payment-links.service';

const router = Router();

// ─── PUBLIC routes (no authentication) ───────────────────────────────────────
// These MUST be declared before router.use(authenticate) below.

/**
 * GET /api/payment-links/public/:token
 * Returns safe public details of a payment link by its unique token.
 * Returns 410 if the link has expired.
 */
router.get(
  '/public/:token',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const link = await PaymentLinkService.getPaymentLinkByToken(req.params.token);
      sendSuccess(res, link);
    } catch (err: any) {
      const status = err.statusCode ?? 400;
      sendError(res, err.message, status);
    }
  })
);

/**
 * POST /api/payment-links/public/:token/confirm
 * Called by a payment gateway callback to confirm payment.
 * No authentication required — the token is the authorisation.
 */
router.post(
  '/public/:token/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    // First resolve the link by token to get its id + tenantId
    let publicLink: Awaited<ReturnType<typeof PaymentLinkService.getPaymentLinkByToken>>;
    try {
      publicLink = await PaymentLinkService.getPaymentLinkByToken(req.params.token);
    } catch (err: any) {
      const status = err.statusCode ?? 400;
      sendError(res, err.message, status);
      return;
    }

    const schema = z.object({
      payerName:  z.string().optional(),
      payerEmail: z.string().email().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    // We need the tenantId to call markAsPaid. Fetch the full record internally.
    // Use the prisma client directly via the service — markAsPaid verifies ownership.
    // We retrieve tenantId by re-querying; safe because we already validated the token above.
    const { prisma } = await import('../../config/database');
    const rawLink = await prisma.paymentLink.findUnique({
      where: { token: req.params.token },
      select: { id: true, tenantId: true },
    });

    if (!rawLink) {
      sendError(res, 'Payment link not found', 404);
      return;
    }

    const result = await PaymentLinkService.markAsPaid(
      rawLink.id,
      rawLink.tenantId,
      parsed.data
    );

    sendSuccess(res, result);
  })
);

// ─── Authenticated middleware (applied to all routes below) ───────────────────

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET / — list payment links ───────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { invoiceId, status, page = '1', limit = '25' } = req.query;

    const result = await PaymentLinkService.listPaymentLinks(req.user.tenantId, {
      invoiceId: invoiceId as string | undefined,
      status:    status as any,
      page:      parseInt(page as string),
      limit:     parseInt(limit as string),
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── POST /invoice/:invoiceId — create a payment link ────────────────────────

const CreatePaymentLinkSchema = z.object({
  expiresInDays: z.number().int().positive().max(365).optional(),
  notes:         z.string().optional(),
});

router.post(
  '/invoice/:invoiceId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreatePaymentLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const link = await PaymentLinkService.createPaymentLink(
      req.user.tenantId,
      req.params.invoiceId,
      parsed.data
    );

    sendSuccess(res, link, 201);
  })
);

// ─── GET /expire — bulk expiry sweep ─────────────────────────────────────────

router.get(
  '/expire',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await PaymentLinkService.expireOverdueLinks(req.user.tenantId);
    sendSuccess(res, { expired: count, message: `${count} לינקים הועברו לסטטוס EXPIRED` });
  })
);

// ─── GET /:id — get single payment link ──────────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const link = await PaymentLinkService.getPaymentLink(
      req.params.id,
      req.user.tenantId
    );
    sendSuccess(res, link);
  })
);

// ─── PUT /:id/mark-paid — mark as paid ───────────────────────────────────────

const MarkPaidSchema = z.object({
  payerName:  z.string().optional(),
  payerEmail: z.string().email().optional(),
});

router.put(
  '/:id/mark-paid',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = MarkPaidSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const result = await PaymentLinkService.markAsPaid(
      req.params.id,
      req.user.tenantId,
      parsed.data
    );

    sendSuccess(res, result);
  })
);

// ─── POST /:id/send-email — send email with payment link ─────────────────────

router.post(
  '/:id/send-email',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await PaymentLinkService.sendPaymentLinkEmail(req.params.id, req.user.tenantId);
    sendSuccess(res, { success: true, message: 'לינק התשלום נשלח בדוא"ל' });
  })
);

// ─── DELETE /:id/cancel — cancel a payment link ───────────────────────────────

router.delete(
  '/:id/cancel',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const link = await PaymentLinkService.cancelPaymentLink(
      req.params.id,
      req.user.tenantId
    );
    sendSuccess(res, link);
  })
);

export default router;
