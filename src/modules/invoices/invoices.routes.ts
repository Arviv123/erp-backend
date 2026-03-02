import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as InvoiceService from './invoices.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const InvoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitPrice:   z.number().positive(),
  vatRate:     z.number().min(0).max(1).default(0.18),
});

const CreateInvoiceSchema = z.object({
  customerId:   z.string().cuid(),
  date:         z.string().datetime(),
  dueDate:      z.string().datetime(),
  notes:        z.string().optional(),
  paymentTerms: z.string().optional(),
  lines:        z.array(InvoiceLineSchema).min(1),
});

// POST /invoices
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const invoice = await InvoiceService.createInvoice({
      ...parsed.data,
      date:      new Date(parsed.data.date),
      dueDate:   new Date(parsed.data.dueDate),
      tenantId:  req.user.tenantId,
      createdBy: req.user.userId,
    });

    sendSuccess(res, invoice, 201);
  })
);

// GET /invoices
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, customerId, from, to, page = '1', pageSize = '25' } = req.query;

    const where = withTenant(req, {
      ...(status     ? { status:     status as any }     : {}),
      ...(customerId ? { customerId: customerId as string } : {}),
      ...(from || to ? { date: { gte: from ? new Date(from as string) : undefined, lte: to ? new Date(to as string) : undefined } } : {}),
    });

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          _count: { select: { lines: true, payments: true } },
        },
        orderBy: { date: 'desc' },
        skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take:    parseInt(pageSize as string),
      }),
      prisma.invoice.count({ where }),
    ]);

    sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
  })
);

// GET /invoices/aging
router.get(
  '/aging',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const aging = await InvoiceService.getInvoiceAging(req.user.tenantId);
    sendSuccess(res, aging);
  })
);

// GET /invoices/:id
router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await prisma.invoice.findUnique({
      where:   { id: req.params.id },
      include: {
        customer: true,
        lines:    { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { date: 'desc' } },
      },
    });

    if (!invoice || invoice.tenantId !== req.user.tenantId) {
      sendError(res, 'Invoice not found', 404);
      return;
    }
    sendSuccess(res, invoice);
  })
);

// POST /invoices/:id/send
router.post(
  '/:id/send',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice || invoice.tenantId !== req.user.tenantId) { sendError(res, 'Invoice not found', 404); return; }
    if (invoice.status !== 'DRAFT') { sendError(res, 'Only DRAFT invoices can be sent'); return; }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data:  { status: 'SENT', sentAt: new Date() },
    });
    sendSuccess(res, updated);
  })
);

// POST /invoices/:id/pay
router.post(
  '/:id/pay',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      amount:    z.number().positive(),
      method:    z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'OTHER']),
      date:      z.string().datetime(),
      reference: z.string().optional(),
      notes:     z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const payment = await InvoiceService.recordPayment({
      invoiceId: req.params.id,
      tenantId:  req.user.tenantId,
      ...parsed.data,
      date:      new Date(parsed.data.date),
      method:    parsed.data.method as any,
      createdBy: req.user.userId,
    });

    sendSuccess(res, payment, 201);
  })
);

// POST /invoices/:id/cancel
router.post(
  '/:id/cancel',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await InvoiceService.cancelInvoice(
      req.params.id,
      req.user.tenantId,
      req.user.userId
    );
    sendSuccess(res, invoice);
  })
);

// POST /invoices/update-overdue  (cron-like trigger)
router.post(
  '/update-overdue',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await InvoiceService.updateOverdueInvoices(req.user.tenantId);
    sendSuccess(res, { updated: count, message: `${count} invoices marked as overdue` });
  })
);

export default router;
