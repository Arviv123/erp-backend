/**
 * receipts.routes.ts
 *
 * Express router for the Receipts (קבלות) module.
 *
 * Routes:
 *   GET    /receipts              — list receipts
 *   GET    /receipts/stats        — stats by payment method
 *   GET    /receipts/:id          — single receipt
 *   POST   /receipts              — create receipt
 *   POST   /receipts/:id/cancel   — cancel receipt (ADMIN+)
 *   GET    /receipts/:id/pdf      — download PDF
 *   POST   /receipts/:id/email    — email receipt (ACCOUNTANT+)
 *   POST   /receipts/:id/print    — queue print job (SALESPERSON+)
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { AuthenticatedRequest } from '../../shared/types';
import { prisma } from '../../config/database';
import * as ReceiptsService from './receipts.service';

const router = Router();

// Apply auth + tenant isolation to all routes
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ───────────────────────────────────────────────────────

const PaymentMethodEntrySchema = z.object({
  method:      z.enum(['CASH', 'CHECK', 'BANK_TRANSFER', 'CREDIT_CARD', 'OTHER']),
  amount:      z.number().positive('Amount must be positive'),
  reference:   z.string().optional(),
  last4:       z.string().max(4).optional(),
  bankName:    z.string().optional(),
  checkNumber: z.string().optional(),
});

const CreateReceiptSchema = z.object({
  customerId:     z.string().cuid().optional(),
  receiptDate:    z.string().datetime().optional(),
  paymentMethods: z.array(PaymentMethodEntrySchema).min(1, 'At least one payment method is required'),
  invoiceIds:     z.array(z.string().cuid()).optional(),
  paymentIds:     z.array(z.string().cuid()).optional(),
  terminalTxId:   z.string().optional(),
  branchId:       z.string().cuid().optional(),
  notes:          z.string().optional(),
});

const CancelSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

const EmailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const PrintSchema = z.object({
  printerId: z.string().cuid().optional(),
  copies:    z.number().int().min(1).max(10).default(1),
});

// ─── GET /receipts ─────────────────────────────────────────────────────────────

router.get(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      customerId, branchId, status, from, to, search,
      page = '1', pageSize = '25',
    } = req.query;

    const result = await ReceiptsService.listReceipts(req.user.tenantId, {
      customerId: customerId as string | undefined,
      branchId:   branchId   as string | undefined,
      status:     status     as any,
      from:       from       as string | undefined,
      to:         to         as string | undefined,
      search:     search     as string | undefined,
      page:       parseInt(page     as string, 10),
      pageSize:   parseInt(pageSize as string, 10),
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.pageSize,
    });
  }),
);

// ─── GET /receipts/stats ───────────────────────────────────────────────────────

router.get(
  '/stats',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query;
    const stats = await ReceiptsService.getReceiptStats(
      req.user.tenantId,
      from as string | undefined,
      to   as string | undefined,
    );
    sendSuccess(res, stats);
  }),
);

// ─── GET /receipts/:id ─────────────────────────────────────────────────────────

router.get(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const receipt = await ReceiptsService.getReceipt(req.user.tenantId, req.params.id);
    sendSuccess(res, receipt);
  }),
);

// ─── POST /receipts ────────────────────────────────────────────────────────────

router.post(
  '/',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateReceiptSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const { receiptDate, ...rest } = parsed.data;

    const receipt = await ReceiptsService.createReceipt(
      req.user.tenantId,
      req.user.userId,
      {
        ...rest,
        receiptDate: receiptDate ? new Date(receiptDate) : undefined,
      },
    );

    sendSuccess(res, receipt, 201);
  }),
);

// ─── POST /receipts/:id/cancel ─────────────────────────────────────────────────

router.post(
  '/:id/cancel',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CancelSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const receipt = await ReceiptsService.cancelReceipt(
      req.user.tenantId,
      req.params.id,
      req.user.userId,
      parsed.data.reason,
    );

    sendSuccess(res, receipt);
  }),
);

// ─── GET /receipts/:id/pdf ─────────────────────────────────────────────────────

router.get(
  '/:id/pdf',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const pdfBuffer = await ReceiptsService.generateReceiptPDF(
      req.user.tenantId,
      req.params.id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  }),
);

// ─── POST /receipts/:id/email ──────────────────────────────────────────────────

router.post(
  '/:id/email',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = EmailSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    await ReceiptsService.emailReceipt(
      req.user.tenantId,
      req.params.id,
      parsed.data.email,
    );

    sendSuccess(res, { success: true, message: 'קבלה נשלחה בדוא"ל' });
  }),
);

// ─── POST /receipts/:id/print ──────────────────────────────────────────────────

router.post(
  '/:id/print',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = PrintSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    // Verify receipt belongs to this tenant
    const receipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
    });
    if (!receipt || receipt.tenantId !== req.user.tenantId) {
      sendError(res, 'Receipt not found', 404);
      return;
    }

    // Validate printer if provided
    if (parsed.data.printerId) {
      const printer = await prisma.printer.findUnique({ where: { id: parsed.data.printerId } });
      if (!printer || printer.tenantId !== req.user.tenantId) {
        sendError(res, 'Printer not found', 404);
        return;
      }
    }

    // Create a PrintJob record
    const printJob = await prisma.printJob.create({
      data: {
        tenantId:     req.user.tenantId,
        printerId:    parsed.data.printerId,
        documentType: 'RECEIPT',
        documentId:   req.params.id,
        copies:       parsed.data.copies,
        status:       'QUEUED',
        createdBy:    req.user.userId,
      },
    });

    // Link the print job to the receipt
    await prisma.receipt.update({
      where: { id: req.params.id },
      data: {
        printJobId: printJob.id,
        status:     receipt.status === 'ISSUED' ? 'PRINTED' : receipt.status,
      },
    });

    sendSuccess(res, { printJobId: printJob.id, status: 'QUEUED' }, 201);
  }),
);

export default router;
