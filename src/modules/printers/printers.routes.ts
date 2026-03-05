import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import * as PrintersService from './printers.service';
import {
  PrintDocumentType,
  PrintJobStatus,
  PrinterType,
  PrinterConnectionType,
} from '@prisma/client';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ──────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ──────────────────────────────────────────────────────────────────────────────

const CreatePrinterSchema = z.object({
  name:             z.string().min(1),
  printerType:      z.nativeEnum(PrinterType),
  connectionType:   z.nativeEnum(PrinterConnectionType),
  ipAddress:        z.string().ip().optional(),
  port:             z.number().int().min(1).max(65535).optional(),
  usbPath:          z.string().optional(),
  paperWidth:       z.number().int().refine(v => v === 58 || v === 80, { message: 'paperWidth must be 58 or 80' }).optional(),
  isDefault:        z.boolean().optional(),
  branchId:         z.string().cuid().optional(),
  canPrintReceipts: z.boolean().optional(),
  canPrintInvoices: z.boolean().optional(),
  canPrintDelivery: z.boolean().optional(),
  canPrintBarcodes: z.boolean().optional(),
  canPrintLabels:   z.boolean().optional(),
});

const QueuePrintJobSchema = z.object({
  printerId:    z.string().cuid().optional(),
  documentType: z.nativeEnum(PrintDocumentType),
  documentId:   z.string().optional(),
  copies:       z.number().int().min(1).max(99).optional(),
  priority:     z.number().int().min(1).max(10).optional(),
  payload:      z.unknown().optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Printer Routes
// ──────────────────────────────────────────────────────────────────────────────

// GET /printers
router.get(
  '/printers',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;
    const printers = await PrintersService.listPrinters(req.user.tenantId, branchId);
    sendSuccess(res, printers);
  })
);

// POST /printers
router.post(
  '/printers',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreatePrinterSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const printer = await PrintersService.createPrinter(
      req.user.tenantId,
      req.user.userId,
      parsed.data
    );
    sendSuccess(res, printer, 201);
  })
);

// GET /printers/:id
router.get(
  '/printers/:id',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const printer = await PrintersService.getPrinter(req.user.tenantId, req.params.id);
    sendSuccess(res, printer);
  })
);

// PUT /printers/:id
router.put(
  '/printers/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreatePrinterSchema.partial().safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const printer = await PrintersService.updatePrinter(
      req.user.tenantId,
      req.params.id,
      parsed.data
    );
    sendSuccess(res, printer);
  })
);

// DELETE /printers/:id  — soft deactivate
router.delete(
  '/printers/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await PrintersService.deactivatePrinter(req.user.tenantId, req.params.id);
    sendSuccess(res, { message: 'Printer deactivated' });
  })
);

// POST /printers/:id/test
router.post(
  '/printers/:id/test',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await PrintersService.testPrinterConnection(
      req.user.tenantId,
      req.params.id
    );
    sendSuccess(res, result);
  })
);

// GET /printers/:id/status
router.get(
  '/printers/:id/status',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const status = await PrintersService.getPrinterStatus(
      req.user.tenantId,
      req.params.id
    );
    sendSuccess(res, status);
  })
);

// ──────────────────────────────────────────────────────────────────────────────
// Print Job Routes
// ──────────────────────────────────────────────────────────────────────────────

// POST /jobs
router.post(
  '/jobs',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = QueuePrintJobSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const job = await PrintersService.queuePrintJob(
      req.user.tenantId,
      req.user.userId,
      {
        printerId:    parsed.data.printerId,
        documentType: parsed.data.documentType,
        documentId:   parsed.data.documentId,
        copies:       parsed.data.copies,
        priority:     parsed.data.priority,
        payload:      parsed.data.payload,
      }
    );
    sendSuccess(res, job, 201);
  })
);

// GET /jobs
router.get(
  '/jobs',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      printerId,
      documentType,
      status,
      from,
      to,
      page = '1',
      pageSize = '25',
    } = req.query;

    const result = await PrintersService.listPrintJobs(req.user.tenantId, {
      printerId:    printerId    as string | undefined,
      documentType: documentType as PrintDocumentType | undefined,
      status:       status       as PrintJobStatus | undefined,
      from:         from         as string | undefined,
      to:           to           as string | undefined,
      page:         parseInt(page     as string, 10),
      pageSize:     parseInt(pageSize as string, 10),
    });

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.pageSize,
    });
  })
);

// GET /jobs/:id
router.get(
  '/jobs/:id',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const job = await PrintersService.getPrintJob(req.user.tenantId, req.params.id);
    sendSuccess(res, job);
  })
);

// DELETE /jobs/:id  — cancel
router.delete(
  '/jobs/:id',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await PrintersService.cancelPrintJob(req.user.tenantId, req.params.id);
    sendSuccess(res, { message: 'Print job cancelled' });
  })
);

// POST /jobs/:id/retry
router.post(
  '/jobs/:id/retry',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await PrintersService.retryPrintJob(req.user.tenantId, req.params.id);
    sendSuccess(res, { message: 'Print job queued for retry' });
  })
);

// GET /jobs/:id/payload  — returns raw ESC/POS binary for client-side printing
router.get(
  '/jobs/:id/payload',
  requireMinRole('SALESPERSON') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    const buffer = await PrintersService.getPayload(req.user.tenantId, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="print-job-${id}.bin"`);
    res.send(buffer);
  })
);

export default router;
