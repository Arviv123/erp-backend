/**
 * Customer Portal Routes
 *
 * Route layout:
 *
 *   ── Admin routes (Bearer JWT, ACCOUNTANT+) ──────────────────────────────
 *   POST   /magic-link          — send a magic-link email to a customer
 *   GET    /sessions            — list active sessions for this tenant (ADMIN+)
 *   DELETE /sessions/:id        — revoke a specific session (ADMIN+)
 *
 *   ── Public portal routes (Portal token, no JWT) ──────────────────────────
 *   Token passed as:
 *     • Authorization: Portal <token>    header, OR
 *     • ?token=<token>                   query param
 *
 *   GET    /portal/validate           — validate token, return customer name
 *   GET    /portal/me                 — customer public profile
 *   GET    /portal/summary            — dashboard summary
 *   GET    /portal/invoices           — paginated invoice list
 *   GET    /portal/invoices/:id/pdf   — download invoice as PDF
 *   GET    /portal/quotes             — list SENT/ACCEPTED quotes
 *   POST   /portal/quotes/:id/accept  — customer accepts a quote
 *   POST   /portal/quotes/:id/reject  — customer rejects a quote
 *   GET    /portal/payments           — payment history
 *
 * Mounted at: /api/customer-portal
 *
 * IMPORTANT: /portal/* routes are declared BEFORE router.use(authenticate)
 * so they remain accessible without a JWT token.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate }        from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole }      from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler }        from '../../shared/utils/asyncHandler';
import * as PortalService      from './customer-portal.service';

const router = Router();

// ─── Portal token middleware ──────────────────────────────────────────────────

/**
 * portalAuth — validates the portal magic-link token passed either as
 *   Authorization: Portal <token>  OR  ?token=<token>
 *
 * On success, attaches req.portalCustomerId and req.portalTenantId for use
 * in all /portal/* route handlers.
 */
async function portalAuth(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = req.query.token as string | undefined;

  if (authHeader?.startsWith('Portal ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    sendError(res, 'Portal token required', 401);
    return;
  }

  const session = await PortalService.validatePortalToken(token);

  if (!session.valid) {
    sendError(res, 'Invalid or expired portal token', 401);
    return;
  }

  (req as any).portalCustomerId = session.customerId;
  (req as any).portalTenantId   = session.tenantId;
  (req as any).portalSessionId  = session.sessionId;

  next();
}

// ─── PUBLIC portal routes (no JWT) ───────────────────────────────────────────
// MUST be declared before router.use(authenticate) below.

/**
 * GET /api/customer-portal/portal/validate
 * Returns { valid: true, name, email } when the token is alive.
 * Used by the frontend to gate-keep the portal page.
 */
router.get(
  '/portal/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    let token = req.query.token as string | undefined;
    if (authHeader?.startsWith('Portal ')) token = authHeader.slice(7).trim();

    if (!token) {
      sendError(res, 'Portal token required', 401);
      return;
    }

    const session = await PortalService.validatePortalToken(token);

    if (!session.valid) {
      sendError(res, 'Invalid or expired portal token', 401);
      return;
    }

    // Fetch minimal customer info for the UI greeting.
    try {
      const customer = await PortalService.getPortalCustomer(
        session.customerId!,
        session.tenantId!
      );
      sendSuccess(res, { valid: true, name: customer.name, email: customer.email });
    } catch {
      sendSuccess(res, { valid: true });
    }
  })
);

/**
 * GET /api/customer-portal/portal/me
 * Returns the customer's public profile.
 */
router.get(
  '/portal/me',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;

    try {
      const customer = await PortalService.getPortalCustomer(customerId, tenantId);
      sendSuccess(res, customer);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode ?? 404);
    }
  })
);

/**
 * GET /api/customer-portal/portal/summary
 * Returns dashboard summary: open invoices, amounts owed, overdue, quotes, etc.
 */
router.get(
  '/portal/summary',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;

    const summary = await PortalService.getPortalSummary(customerId, tenantId);
    sendSuccess(res, summary);
  })
);

/**
 * GET /api/customer-portal/portal/invoices
 * Query: status (SENT|OVERDUE|PAID), page, limit
 */
router.get(
  '/portal/invoices',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;

    const statusSchema = z.enum(['SENT', 'OVERDUE', 'PAID']).optional();
    const statusParsed = statusSchema.safeParse(req.query.status);

    const page  = req.query.page  ? parseInt(req.query.page  as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const result = await PortalService.getPortalInvoices(customerId, tenantId, {
      status: statusParsed.success ? statusParsed.data : undefined,
      page,
      limit,
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

/**
 * GET /api/customer-portal/portal/invoices/:id/pdf
 * Streams the invoice PDF to the browser.
 */
router.get(
  '/portal/invoices/:id/pdf',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;
    const invoiceId  = req.params.id;

    try {
      const pdfBuffer = await PortalService.getPortalInvoicePDF(invoiceId, customerId, tenantId);

      res.set('Content-Type',        'application/pdf');
      res.set('Content-Disposition', `inline; filename="invoice-${invoiceId}.pdf"`);
      res.set('Content-Length',      String(pdfBuffer.length));
      res.send(pdfBuffer);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode ?? 500);
    }
  })
);

/**
 * GET /api/customer-portal/portal/quotes
 * Returns SENT and ACCEPTED quotes for the portal customer.
 */
router.get(
  '/portal/quotes',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;

    const quotes = await PortalService.getPortalQuotes(customerId, tenantId);
    sendSuccess(res, quotes);
  })
);

/**
 * POST /api/customer-portal/portal/quotes/:id/accept
 * Customer accepts a SENT quote.
 */
router.post(
  '/portal/quotes/:id/accept',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;
    const quoteId    = req.params.id;

    try {
      const updated = await PortalService.acceptPortalQuote(quoteId, customerId, tenantId);
      sendSuccess(res, updated);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode ?? 400);
    }
  })
);

/**
 * POST /api/customer-portal/portal/quotes/:id/reject
 * Customer rejects a SENT quote.
 */
router.post(
  '/portal/quotes/:id/reject',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;
    const quoteId    = req.params.id;

    try {
      const updated = await PortalService.rejectPortalQuote(quoteId, customerId, tenantId);
      sendSuccess(res, updated);
    } catch (err: any) {
      sendError(res, err.message, err.statusCode ?? 400);
    }
  })
);

/**
 * GET /api/customer-portal/portal/payments
 * Returns payment history for the portal customer.
 */
router.get(
  '/portal/payments',
  portalAuth as any,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).portalCustomerId as string;
    const tenantId   = (req as any).portalTenantId  as string;

    const payments = await PortalService.getPortalPayments(customerId, tenantId);
    sendSuccess(res, payments);
  })
);

// ─── Authenticated middleware (applied to all routes below) ──────────────────

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Admin routes (JWT required) ─────────────────────────────────────────────

/**
 * POST /api/customer-portal/magic-link
 * Body: { email: string }
 * Sends a magic-link email to the customer with this email address.
 * Requires ACCOUNTANT role or higher.
 */
router.post(
  '/magic-link',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      email: z.string().email('כתובת דוא"ל לא תקינה'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors.map(e => e.message).join(', '));
      return;
    }

    const result = await PortalService.sendMagicLink(
      req.user.tenantId,
      parsed.data.email
    );

    if (!result.sent) {
      sendError(res, result.message, 404);
      return;
    }

    sendSuccess(res, result);
  })
);

/**
 * GET /api/customer-portal/sessions
 * Lists all active (non-revoked, non-expired) portal sessions for this tenant.
 * Requires ADMIN role or higher.
 */
router.get(
  '/sessions',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sessions = await PortalService.listActiveSessions(req.user.tenantId);
    sendSuccess(res, sessions);
  })
);

/**
 * DELETE /api/customer-portal/sessions/:id
 * Immediately revokes the specified portal session.
 * Requires ADMIN role or higher.
 */
router.delete(
  '/sessions/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await PortalService.revokeSession(req.params.id, req.user.tenantId);
      sendSuccess(res, { revoked: true, sessionId: req.params.id });
    } catch (err: any) {
      sendError(res, err.message, err.statusCode ?? 400);
    }
  })
);

export default router;
