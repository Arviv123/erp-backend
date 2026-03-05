import { z } from 'zod';
import { RecurrenceFrequency, RecurringStatus } from '@prisma/client';
import { prisma } from '../../config/database';

// ─── Zod Schemas ─────────────────────────────────────────────────

const RecurringInvoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitPrice:   z.number().positive(),
  productId:   z.string().optional(),
});

export const CreateRecurringInvoiceSchema = z.object({
  customerId:  z.string(),
  title:       z.string().min(1),
  frequency:   z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  nextRunDate: z.string().datetime().optional(), // defaults to today
  endDate:     z.string().datetime().optional(),
  dayOfMonth:  z.number().min(1).max(31).optional(),
  vatRate:     z.number().default(17),
  notes:       z.string().optional(),
  lines:       z.array(RecurringInvoiceLineSchema).min(1),
});

export const UpdateRecurringInvoiceSchema = z.object({
  title:       z.string().min(1).optional(),
  frequency:   z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  nextRunDate: z.string().datetime().optional(),
  endDate:     z.string().datetime().optional(),
  dayOfMonth:  z.number().min(1).max(31).optional(),
  vatRate:     z.number().optional(),
  notes:       z.string().optional(),
  lines:       z.array(RecurringInvoiceLineSchema).min(1).optional(),
});

export type CreateRecurringInvoiceInput = z.infer<typeof CreateRecurringInvoiceSchema>;
export type UpdateRecurringInvoiceInput = z.infer<typeof UpdateRecurringInvoiceSchema>;

// ─── Helpers ─────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute the initial nextRunDate for a new RecurringInvoice.
 * DAILY → today; all others → next occurrence after today.
 */
function computeInitialNextRunDate(
  frequency: RecurrenceFrequency,
  dayOfMonth?: number | null
): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (frequency === 'DAILY') {
    return today;
  }

  return computeNextRunDate(frequency, today, dayOfMonth ?? null);
}

/**
 * Given the current run date, compute the NEXT run date based on frequency.
 */
function computeNextRunDate(
  frequency: RecurrenceFrequency,
  fromDate: Date,
  dayOfMonth: number | null
): Date {
  const next = new Date(fromDate);

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;

    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;

    case 'MONTHLY': {
      if (dayOfMonth !== null) {
        // Advance one month, then set the target day
        next.setMonth(next.getMonth() + 1);
        // Clamp to last valid day of the new month
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, lastDay));
      } else {
        next.setDate(next.getDate() + 30);
      }
      break;
    }

    case 'QUARTERLY':
      next.setDate(next.getDate() + 90);
      break;

    case 'YEARLY':
      next.setDate(next.getDate() + 365);
      break;
  }

  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Generate an RI-based invoice number: RI-{year}-{seq:04}.
 * Uses the current invoice count for the tenant as the sequence base.
 */
async function generateRINumber(tenantId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.invoice.count({ where: { tenantId } });
  const seq   = String(count + 1).padStart(4, '0');
  return `RI-${year}-${seq}`;
}

// ─── List ─────────────────────────────────────────────────────────

export interface ListFilters {
  status?:     RecurringStatus;
  customerId?: string;
  page?:       number;
  limit?:      number;
}

export async function listRecurringInvoices(tenantId: string, filters: ListFilters = {}) {
  const { status, customerId, page = 1, limit = 25 } = filters;

  const where = {
    tenantId,
    ...(status     ? { status }     : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.recurringInvoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        lines:    true,
      },
      orderBy: { nextRunDate: 'asc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.recurringInvoice.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ─── Get Single ───────────────────────────────────────────────────

export async function getRecurringInvoice(id: string, tenantId: string) {
  const record = await prisma.recurringInvoice.findUnique({
    where:   { id },
    include: {
      customer: true,
      lines:    true,
    },
  });

  if (!record || record.tenantId !== tenantId) {
    throw new Error('Recurring invoice not found');
  }

  return record;
}

// ─── Create ───────────────────────────────────────────────────────

export async function createRecurringInvoice(
  tenantId: string,
  data: CreateRecurringInvoiceInput
) {
  // Verify customer belongs to this tenant
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  const frequency  = data.frequency as RecurrenceFrequency;
  const dayOfMonth = data.dayOfMonth ?? null;

  // nextRunDate: caller-supplied or auto-computed
  const nextRunDate = data.nextRunDate
    ? new Date(data.nextRunDate)
    : computeInitialNextRunDate(frequency, dayOfMonth);

  const endDate = data.endDate ? new Date(data.endDate) : null;

  return prisma.recurringInvoice.create({
    data: {
      tenantId,
      customerId:  data.customerId,
      title:       data.title,
      frequency,
      nextRunDate,
      endDate:     endDate ?? undefined,
      dayOfMonth:  dayOfMonth ?? undefined,
      vatRate:     data.vatRate,
      notes:       data.notes,
      status:      'ACTIVE',
      lines: {
        create: data.lines.map(l => ({
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          productId:   l.productId,
        })),
      },
    },
    include: {
      customer: { select: { id: true, name: true } },
      lines:    true,
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────

export async function updateRecurringInvoice(
  id: string,
  tenantId: string,
  data: UpdateRecurringInvoiceInput
) {
  const existing = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Recurring invoice not found');
  }
  if (existing.status === 'CANCELLED') {
    throw new Error('Cannot update a cancelled recurring invoice');
  }

  return prisma.$transaction(async (tx) => {
    // If lines are provided, replace them entirely
    if (data.lines) {
      await tx.recurringInvoiceLine.deleteMany({ where: { recurringInvoiceId: id } });
      await tx.recurringInvoiceLine.createMany({
        data: data.lines.map(l => ({
          recurringInvoiceId: id,
          description:        l.description,
          quantity:           l.quantity,
          unitPrice:          l.unitPrice,
          productId:          l.productId,
        })),
      });
    }

    return tx.recurringInvoice.update({
      where: { id },
      data: {
        ...(data.title       !== undefined ? { title:       data.title }                        : {}),
        ...(data.frequency   !== undefined ? { frequency:   data.frequency as RecurrenceFrequency } : {}),
        ...(data.nextRunDate !== undefined ? { nextRunDate: new Date(data.nextRunDate) }         : {}),
        ...(data.endDate     !== undefined ? { endDate:     new Date(data.endDate) }             : {}),
        ...(data.dayOfMonth  !== undefined ? { dayOfMonth:  data.dayOfMonth }                   : {}),
        ...(data.vatRate     !== undefined ? { vatRate:     data.vatRate }                       : {}),
        ...(data.notes       !== undefined ? { notes:       data.notes }                        : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines:    true,
      },
    });
  });
}

// ─── Pause / Resume / Cancel ──────────────────────────────────────

export async function pauseRecurringInvoice(id: string, tenantId: string) {
  const existing = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Recurring invoice not found');
  }
  if (existing.status !== 'ACTIVE') {
    throw new Error('Only ACTIVE recurring invoices can be paused');
  }

  return prisma.recurringInvoice.update({
    where: { id },
    data:  { status: 'PAUSED' },
  });
}

export async function resumeRecurringInvoice(id: string, tenantId: string) {
  const existing = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Recurring invoice not found');
  }
  if (existing.status !== 'PAUSED') {
    throw new Error('Only PAUSED recurring invoices can be resumed');
  }

  return prisma.recurringInvoice.update({
    where: { id },
    data:  { status: 'ACTIVE' },
  });
}

export async function cancelRecurringInvoice(id: string, tenantId: string) {
  const existing = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Recurring invoice not found');
  }
  if (existing.status === 'CANCELLED') {
    throw new Error('Recurring invoice is already cancelled');
  }

  return prisma.recurringInvoice.update({
    where: { id },
    data:  { status: 'CANCELLED' },
  });
}

// ─── Generate Due Invoices ────────────────────────────────────────

export interface GenerateResult {
  created:  string[];   // invoice IDs
  errors:   Array<{ recurringId: string; error: string }>;
  total:    number;
}

export async function generateDueInvoices(tenantId?: string): Promise<GenerateResult> {
  const now = new Date();
  now.setHours(23, 59, 59, 999); // include everything due today

  // Find all ACTIVE recurring invoices whose nextRunDate is <= now
  const due = await prisma.recurringInvoice.findMany({
    where: {
      status:      'ACTIVE',
      nextRunDate: { lte: now },
      ...(tenantId ? { tenantId } : {}),
    },
    include: { lines: true },
  });

  const created: string[]                              = [];
  const errors:  Array<{ recurringId: string; error: string }> = [];

  for (const rec of due) {
    try {
      const invoiceId = await prisma.$transaction(async (tx) => {
        // ── 1. Calculate totals ──────────────────────────────────
        const vatRate = Number(rec.vatRate) / 100; // e.g. 17 → 0.17

        const processedLines = rec.lines.map((l, idx) => {
          const qty       = Number(l.quantity);
          const price     = Number(l.unitPrice);
          const lineTotal = round2(qty * price);
          return { ...l, qty, price, lineTotal, sortOrder: idx };
        });

        const subtotal  = round2(processedLines.reduce((s, l) => s + l.lineTotal, 0));
        const vatAmount = round2(subtotal * vatRate);
        const total     = round2(subtotal + vatAmount);

        // ── 2. Generate invoice number ───────────────────────────
        // Count within this transaction to avoid collisions
        const count  = await tx.invoice.count({ where: { tenantId: rec.tenantId } });
        const year   = new Date().getFullYear();
        const seq    = String(count + 1).padStart(4, '0');
        const number = `RI-${year}-${seq}`;

        const today   = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);

        // ── 3. Create the invoice ────────────────────────────────
        const invoice = await tx.invoice.create({
          data: {
            tenantId:    rec.tenantId,
            customerId:  rec.customerId,
            number,
            date:        today,
            dueDate,
            status:      'DRAFT',
            subtotal,
            vatAmount,
            total,
            notes:       rec.notes ?? undefined,
            createdBy:   'system', // generated by recurring engine
            lines: {
              create: processedLines.map(l => ({
                description: l.description,
                quantity:    l.qty,
                unitPrice:   l.price,
                vatRate:     vatRate,
                lineTotal:   l.lineTotal,
                sortOrder:   l.sortOrder,
                productId:   l.productId ?? undefined,
              })),
            },
          },
        });

        // ── 4. Advance nextRunDate ───────────────────────────────
        const frequency  = rec.frequency;
        const dayOfMonth = rec.dayOfMonth;
        const newNextRun = computeNextRunDate(frequency, rec.nextRunDate, dayOfMonth);

        // ── 5. Check if we've passed the endDate ─────────────────
        let newStatus: RecurringStatus = 'ACTIVE';
        if (rec.endDate && newNextRun > rec.endDate) {
          newStatus = 'COMPLETED';
        }

        await tx.recurringInvoice.update({
          where: { id: rec.id },
          data: {
            nextRunDate: newNextRun,
            status:      newStatus,
          },
        });

        return invoice.id;
      });

      created.push(invoiceId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ recurringId: rec.id, error: message });
    }
  }

  return { created, errors, total: due.length };
}

// ─── Preview Next 12 Occurrences ──────────────────────────────────

export interface OccurrencePreview {
  occurrence:  number;
  date:        Date;
  subtotal:    number;
  vatAmount:   number;
  total:       number;
}

export async function getRecurringInvoicePreview(
  id: string,
  tenantId: string
): Promise<OccurrencePreview[]> {
  const rec = await prisma.recurringInvoice.findUnique({
    where:   { id },
    include: { lines: true },
  });

  if (!rec || rec.tenantId !== tenantId) {
    throw new Error('Recurring invoice not found');
  }

  const vatRate   = Number(rec.vatRate) / 100;
  const subtotal  = round2(rec.lines.reduce((s, l) => s + round2(Number(l.quantity) * Number(l.unitPrice)), 0));
  const vatAmount = round2(subtotal * vatRate);
  const total     = round2(subtotal + vatAmount);

  const occurrences: OccurrencePreview[] = [];
  let current = new Date(rec.nextRunDate);

  for (let i = 0; i < 12; i++) {
    // Stop if past endDate
    if (rec.endDate && current > rec.endDate) break;

    occurrences.push({
      occurrence: i + 1,
      date:       new Date(current),
      subtotal,
      vatAmount,
      total,
    });

    current = computeNextRunDate(rec.frequency, current, rec.dayOfMonth);
  }

  return occurrences;
}
