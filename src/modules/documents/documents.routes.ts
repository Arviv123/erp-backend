import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { DocumentType, DocumentStatus } from '@prisma/client';
import * as InvoiceService from '../invoices/invoices.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Helpers ──────────────────────────────────────────────────────

const PREFIX: Record<DocumentType, string> = {
  QUOTE:         'QUO',
  DELIVERY_NOTE: 'DN',
  RECEIPT:       'RCP',
  PROFORMA:      'PRF',
  CREDIT_NOTE:   'CN',
};

async function generateDocNumber(tenantId: string, type: DocumentType): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.document.count({ where: { tenantId, type } });
  const seq = String(count + 1).padStart(4, '0');
  return `${PREFIX[type]}-${year}-${seq}`;
}

function calcLineTotals(line: {
  quantity: number; unitPrice: number; discountPercent?: number; vatRate?: number;
}) {
  const vatRate = line.vatRate ?? 0.18;
  const gross = line.quantity * line.unitPrice;
  const discountPct = line.discountPercent ?? 0;
  const discountAmt = Math.round(gross * discountPct / 100 * 100) / 100;
  const lineTotal = Math.round((gross - discountAmt) * 100) / 100;
  return { vatRate, discountAmount: discountAmt, lineTotal };
}

// ─── Schemas ──────────────────────────────────────────────────────

const DocLineSchema = z.object({
  description:     z.string().min(1),
  sku:             z.string().optional(),
  barcode:         z.string().optional(),
  unit:            z.string().optional(),
  quantity:        z.number().positive(),
  unitPrice:       z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  vatRate:         z.number().min(0).max(1).default(0.18),
  notes:           z.string().optional(),
});

const CreateDocSchema = z.object({
  type:            z.nativeEnum(DocumentType),
  customerId:      z.string().cuid().optional(),
  date:            z.string(),
  validUntil:      z.string().optional(),
  reference:       z.string().optional(),
  notes:           z.string().optional(),
  internalNotes:   z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  lines:           z.array(DocLineSchema).min(1),
});

const UpdateDocSchema = z.object({
  customerId:      z.string().cuid().optional().nullable(),
  date:            z.string().optional(),
  validUntil:      z.string().optional().nullable(),
  reference:       z.string().optional().nullable(),
  notes:           z.string().optional().nullable(),
  internalNotes:   z.string().optional().nullable(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  lines:           z.array(DocLineSchema).min(1).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────

// GET /documents — list with optional ?type= filter
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { type, status, customerId, q, page = '1', limit = '50' } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { tenantId: req.user!.tenantId };
  if (type)       where.type = type;
  if (status)     where.status = status;
  if (customerId) where.customerId = customerId;
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { reference: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [docs, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: { customer: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip, take: Number(limit),
    }),
    prisma.document.count({ where }),
  ]);

  sendSuccess(res, { data: docs, total, page: Number(page), limit: Number(limit) });
}));

// POST /documents — create
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const body = CreateDocSchema.safeParse(req.body);
  if (!body.success) return sendError(res, body.error.message, 400);

  const { type, customerId, date, validUntil, reference, notes, internalNotes, discountPercent, lines } = body.data;

  // Calculate line totals
  const processedLines = lines.map((line, idx) => {
    const calc = calcLineTotals(line);
    return { ...line, ...calc, sortOrder: idx };
  });

  const subtotal = processedLines.reduce((s, l) => s + l.lineTotal, 0);
  const overallDiscPct = discountPercent ?? 0;
  const overallDiscAmt = Math.round(subtotal * overallDiscPct / 100 * 100) / 100;
  const subtotalAfterDisc = subtotal - overallDiscAmt;
  const avgVatRate = processedLines[0]?.vatRate ?? 0.18;
  const vatAmount = Math.round(subtotalAfterDisc * avgVatRate * 100) / 100;
  const total = Math.round((subtotalAfterDisc + vatAmount) * 100) / 100;

  const number = await generateDocNumber(req.user!.tenantId, type);

  const doc = await prisma.document.create({
    data: {
      tenantId:       req.user!.tenantId,
      customerId:     customerId ?? null,
      type,
      number,
      date:           new Date(date),
      validUntil:     validUntil ? new Date(validUntil) : null,
      reference:      reference ?? null,
      notes:          notes ?? null,
      internalNotes:  internalNotes ?? null,
      subtotal:       Math.round(subtotal * 100) / 100,
      discountPercent: overallDiscPct,
      discountAmount:  overallDiscAmt,
      vatAmount,
      total,
      createdBy:      req.user!.userId,
      lines: {
        create: processedLines.map(l => ({
          description: l.description, sku: l.sku, barcode: l.barcode, unit: l.unit,
          quantity: l.quantity, unitPrice: l.unitPrice,
          discountPercent: l.discountPercent, discountAmount: l.discountAmount,
          vatRate: l.vatRate, lineTotal: l.lineTotal,
          sortOrder: l.sortOrder, notes: l.notes,
        })),
      },
    },
    include: { lines: true, customer: { select: { id: true, name: true } } },
  });

  res.status(201).json({ success: true, data: doc });
}));

// GET /documents/:id — detail
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      customer: true,
    },
  });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  sendSuccess(res, doc);
}));

// PATCH /documents/:id — update (only DRAFT)
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  if (doc.status !== 'DRAFT') return sendError(res, 'Can only edit DRAFT documents', 400);

  const body = UpdateDocSchema.safeParse(req.body);
  if (!body.success) return sendError(res, body.error.message, 400);

  const { lines, discountPercent, ...rest } = body.data;

  let updateData: any = {};
  if (rest.customerId !== undefined) updateData.customerId = rest.customerId;
  if (rest.date !== undefined)       updateData.date = new Date(rest.date);
  if (rest.validUntil !== undefined) updateData.validUntil = rest.validUntil ? new Date(rest.validUntil) : null;
  if (rest.reference !== undefined)  updateData.reference = rest.reference;
  if (rest.notes !== undefined)      updateData.notes = rest.notes;
  if (rest.internalNotes !== undefined) updateData.internalNotes = rest.internalNotes;

  if (lines) {
    const processedLines = lines.map((line, idx) => {
      const calc = calcLineTotals(line);
      return { ...line, ...calc, sortOrder: idx };
    });
    const subtotal = processedLines.reduce((s, l) => s + l.lineTotal, 0);
    const overallDiscPct = discountPercent ?? 0;
    const overallDiscAmt = Math.round(subtotal * overallDiscPct / 100 * 100) / 100;
    const subtotalAfterDisc = subtotal - overallDiscAmt;
    const vatAmount = Math.round(subtotalAfterDisc * (processedLines[0]?.vatRate ?? 0.18) * 100) / 100;
    const total = Math.round((subtotalAfterDisc + vatAmount) * 100) / 100;

    updateData = { ...updateData, subtotal, discountPercent: overallDiscPct, discountAmount: overallDiscAmt, vatAmount, total };

    // Replace lines
    await prisma.documentLine.deleteMany({ where: { documentId: req.params.id } });
    await prisma.documentLine.createMany({
      data: processedLines.map(l => ({
        documentId: req.params.id,
        description: l.description, sku: l.sku, barcode: l.barcode, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice,
        discountPercent: l.discountPercent, discountAmount: l.discountAmount,
        vatRate: l.vatRate, lineTotal: l.lineTotal,
        sortOrder: l.sortOrder, notes: l.notes,
      })),
    });
  }

  const updated = await prisma.document.update({
    where: { id: req.params.id },
    data: updateData,
    include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true },
  });

  sendSuccess(res, updated);
}));

// POST /documents/:id/send — mark as SENT
router.post('/:id/send', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  if (doc.status !== 'DRAFT') return sendError(res, 'Document already sent', 400);

  const updated = await prisma.document.update({
    where: { id: req.params.id },
    data: { status: 'SENT', sentAt: new Date() },
  });
  sendSuccess(res, updated);
}));

// POST /documents/:id/accept — mark ACCEPTED (for quotes)
router.post('/:id/accept', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  const updated = await prisma.document.update({
    where: { id: req.params.id },
    data: { status: 'ACCEPTED' },
  });
  sendSuccess(res, updated);
}));

// POST /documents/:id/reject — mark REJECTED
router.post('/:id/reject', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  const updated = await prisma.document.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED' },
  });
  sendSuccess(res, updated);
}));

// POST /documents/:id/convert — convert quote/proforma to invoice
router.post('/:id/convert', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  if (doc.status === 'CONVERTED') return sendError(res, 'Already converted', 400);
  if (!doc.customerId) return sendError(res, 'Document has no customer — cannot convert', 400);

  const { dueDate } = req.body;

  const invoice = await InvoiceService.createInvoice({
    tenantId:  req.user!.tenantId,
    customerId: doc.customerId,
    date:       new Date(),
    dueDate:    dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 86400000),
    notes:      doc.notes ?? undefined,
    reference:  doc.number,
    createdBy:  req.user!.userId,
    lines: doc.lines.map(l => ({
      description:     l.description,
      sku:             l.sku ?? undefined,
      barcode:         l.barcode ?? undefined,
      unit:            l.unit ?? undefined,
      quantity:        Number(l.quantity),
      unitPrice:       Number(l.unitPrice),
      discountPercent: Number(l.discountPercent),
      vatRate:         Number(l.vatRate),
      notes:           l.notes ?? undefined,
    })),
    discountPercent: doc.discountPercent ? Number(doc.discountPercent) : undefined,
  });

  await prisma.document.update({
    where: { id: req.params.id },
    data:  { status: 'CONVERTED', convertedToInvoiceId: invoice.id },
  });

  sendSuccess(res, { invoice, document: doc });
}));

// DELETE /documents/:id — delete DRAFT
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.tenantId !== req.user!.tenantId) return sendError(res, 'Not found', 404);
  if (doc.status !== 'DRAFT') return sendError(res, 'Can only delete DRAFT documents', 400);

  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

export default router;
