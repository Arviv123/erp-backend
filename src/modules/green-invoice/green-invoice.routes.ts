/**
 * green-invoice.routes.ts
 *
 * Routes for the Green Invoice (חשבונית ירוקה) integration module.
 * Mounted at: /api/green-invoice
 *
 * GET  /submissions                        — list all submissions (paginated)
 * POST /submit/:invoiceId                  — submit invoice to Green Invoice (ACCOUNTANT+)
 * GET  /submission/:invoiceId              — get submission status for an invoice
 * POST /submission/:submissionId/retry     — retry a failed submission (ACCOUNTANT+)
 * GET  /submission/:submissionId/download  — download signed PDF (streams)
 * POST /test-connection                    — test API credentials (ADMIN+)
 */

import { Router, Response } from 'express';
import { GreenInvoiceStatus } from '@prisma/client';
import { authenticate }          from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole }          from '../../middleware/rbac';
import { AuthenticatedRequest }    from '../../shared/types';
import { sendSuccess, sendError }  from '../../shared/utils/response';
import { asyncHandler }            from '../../shared/utils/asyncHandler';
import * as GreenInvoiceService    from './green-invoice.service';

const router = Router();

// All routes require authentication and tenant isolation
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Guard: return 503 when API credentials are not configured ────────────────

function checkConfigured(res: Response): boolean {
  if (
    !process.env.GREEN_INVOICE_API_KEY ||
    !process.env.GREEN_INVOICE_API_SECRET
  ) {
    res.status(503).json({ success: false, error: 'Green Invoice not configured' });
    return false;
  }
  return true;
}

// ─── GET /submissions ─────────────────────────────────────────────────────────
// List all submissions for the tenant with optional filtering and pagination.
router.get(
  '/submissions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!checkConfigured(res)) return;

    const {
      status,
      from,
      to,
      page  = '1',
      limit = '25',
    } = req.query;

    const filters: Parameters<typeof GreenInvoiceService.listSubmissions>[1] = {
      page:  parseInt(page  as string, 10),
      limit: parseInt(limit as string, 10),
    };

    if (status && Object.values(GreenInvoiceStatus).includes(status as GreenInvoiceStatus)) {
      filters.status = status as GreenInvoiceStatus;
    }
    if (from) filters.from = new Date(from as string);
    if (to)   filters.to   = new Date(to   as string);

    const result = await GreenInvoiceService.listSubmissions(
      req.user.tenantId,
      filters
    );

    sendSuccess(res, result.items, 200, {
      total: result.total,
      page:  result.page,
      pageSize: result.limit,
    });
  })
);

// ─── POST /submit/:invoiceId ──────────────────────────────────────────────────
// Submit an ERP invoice to Green Invoice. Requires ACCOUNTANT role or higher.
router.post(
  '/submit/:invoiceId',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!checkConfigured(res)) return;

    const { invoiceId } = req.params;

    try {
      const submission = await GreenInvoiceService.submitInvoice(
        req.user.tenantId,
        invoiceId
      );
      const statusCode = submission.status === GreenInvoiceStatus.ACCEPTED ? 201 : 200;
      sendSuccess(res, submission, statusCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already submitted')) {
        sendError(res, msg, 409);
        return;
      }
      if (msg.includes('not found') || msg.includes('Invoice not found')) {
        sendError(res, msg, 404);
        return;
      }
      sendError(res, msg, 500);
    }
  })
);

// ─── GET /submission/:invoiceId ───────────────────────────────────────────────
// Get the submission status for a given invoice (looked up by invoiceId).
router.get(
  '/submission/:invoiceId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!checkConfigured(res)) return;

    const submission = await GreenInvoiceService.getSubmissionStatus(
      req.params.invoiceId,
      req.user.tenantId
    );

    if (!submission) {
      sendError(res, 'No submission found for this invoice', 404);
      return;
    }

    sendSuccess(res, submission);
  })
);

// ─── POST /submission/:submissionId/retry ─────────────────────────────────────
// Retry a REJECTED or ERROR submission. Requires ACCOUNTANT role or higher.
router.post(
  '/submission/:submissionId/retry',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!checkConfigured(res)) return;

    const { submissionId } = req.params;

    try {
      const submission = await GreenInvoiceService.retrySubmission(
        submissionId,
        req.user.tenantId
      );
      sendSuccess(res, submission);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      if (msg.includes('Maximum retry') || msg.includes('Cannot retry')) {
        sendError(res, msg, 422);
        return;
      }
      sendError(res, msg, 500);
    }
  })
);

// ─── GET /submission/:submissionId/download ───────────────────────────────────
// Download the signed PDF document from Green Invoice. Streams the PDF buffer.
router.get(
  '/submission/:submissionId/download',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!checkConfigured(res)) return;

    const { submissionId } = req.params;

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await GreenInvoiceService.getSignedDocument(
        submissionId,
        req.user.tenantId
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      if (msg.includes('only available') || msg.includes('No document ID')) {
        sendError(res, msg, 422);
        return;
      }
      sendError(res, msg, 500);
      return;
    }

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="green-invoice-${submissionId}.pdf"`);
    res.set('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  })
);

// ─── POST /test-connection ────────────────────────────────────────────────────
// Test Green Invoice API credentials. Requires ADMIN role or higher.
router.post(
  '/test-connection',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Note: test-connection is permitted even when creds are missing — it reports the problem.
    const result = await GreenInvoiceService.testConnection(req.user.tenantId);

    if (!result.connected) {
      // Return 503 but still a structured response so the client can display the message
      res.status(503).json({ success: false, data: result });
      return;
    }

    sendSuccess(res, result);
  })
);

export default router;
