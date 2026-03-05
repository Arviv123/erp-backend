import { z } from 'zod';
import { BillingCycle, ContractStatus } from '@prisma/client';
import { prisma } from '../../config/database';

// ─── Zod Schemas ──────────────────────────────────────────────────

const ContractLineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitPrice:   z.number().nonnegative(),
  productId:   z.string().optional(),
});

export const CreateContractSchema = z.object({
  customerId:   z.string(),
  title:        z.string().min(1),
  startDate:    z.string().datetime(),
  endDate:      z.string().datetime().optional(),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).default('MONTHLY'),
  vatRate:      z.number().default(17),
  totalValue:   z.number().optional(),
  notes:        z.string().optional(),
  lines:        z.array(ContractLineSchema).min(1),
});

export const UpdateContractSchema = z.object({
  title:        z.string().min(1).optional(),
  startDate:    z.string().datetime().optional(),
  endDate:      z.string().datetime().optional(),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  vatRate:      z.number().optional(),
  totalValue:   z.number().optional(),
  notes:        z.string().optional(),
  lines:        z.array(ContractLineSchema).min(1).optional(),
});

export const TerminateContractSchema = z.object({
  reason: z.string().optional(),
});

export type CreateContractInput  = z.infer<typeof CreateContractSchema>;
export type UpdateContractInput  = z.infer<typeof UpdateContractSchema>;
export type TerminateContractInput = z.infer<typeof TerminateContractSchema>;

// ─── Helpers ──────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Advance a date by one billing cycle.
 */
function advanceBillingDate(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from);

  switch (cycle) {
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Auto-generate contract number CT-{YYYY}-{seq:04} within a transaction.
 */
async function generateContractNumber(
  tenantId: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await tx.contract.count({ where: { tenantId } });
  const seq   = String(count + 1).padStart(4, '0');
  return `CT-${year}-${seq}`;
}

/**
 * Auto-generate contract-invoice number CI-{YYYY}-{seq:04} within a transaction.
 */
async function generateCINumber(
  tenantId: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await tx.invoice.count({ where: { tenantId } });
  const seq   = String(count + 1).padStart(4, '0');
  return `CI-${year}-${seq}`;
}

// ─── List ─────────────────────────────────────────────────────────

export interface ListContractFilters {
  status?:     ContractStatus;
  customerId?: string;
  page?:       number;
  limit?:      number;
}

export async function listContracts(tenantId: string, filters: ListContractFilters = {}) {
  const { status, customerId, page = 1, limit = 25 } = filters;

  const where = {
    tenantId,
    ...(status     ? { status }     : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        lines:    true,
      },
      orderBy: { nextBillingDate: 'asc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.contract.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ─── Get Single ───────────────────────────────────────────────────

export async function getContract(id: string, tenantId: string) {
  const record = await prisma.contract.findUnique({
    where:   { id },
    include: {
      customer: true,
      lines: {
        include: {
          product: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!record || record.tenantId !== tenantId) {
    throw new Error('Contract not found');
  }

  return record;
}

// ─── Create ───────────────────────────────────────────────────────

export async function createContract(tenantId: string, data: CreateContractInput) {
  // Validate customer belongs to this tenant
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  const startDate = new Date(data.startDate);
  const endDate   = data.endDate ? new Date(data.endDate) : null;

  // Validate endDate > startDate
  if (endDate && endDate <= startDate) {
    throw new Error('endDate must be after startDate');
  }

  const billingCycle = data.billingCycle as BillingCycle;

  // nextBillingDate = startDate (first billing on start date)
  const nextBillingDate = new Date(startDate);
  nextBillingDate.setHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {
    const number = await generateContractNumber(tenantId, tx);

    return tx.contract.create({
      data: {
        tenantId,
        customerId:     data.customerId,
        number,
        title:          data.title,
        status:         'DRAFT',
        startDate,
        endDate:        endDate ?? undefined,
        billingCycle,
        nextBillingDate,
        vatRate:        data.vatRate,
        totalValue:     data.totalValue ?? undefined,
        notes:          data.notes,
        lines: {
          create: data.lines.map(l => ({
            description: l.description,
            quantity:    l.quantity,
            unitPrice:   l.unitPrice,
            lineTotal:   round2(l.quantity * l.unitPrice),
            productId:   l.productId,
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines:    true,
      },
    });
  });
}

// ─── Update ───────────────────────────────────────────────────────

export async function updateContract(
  id: string,
  tenantId: string,
  data: UpdateContractInput
) {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Contract not found');
  }
  if (existing.status !== 'DRAFT' && existing.status !== 'PAUSED') {
    throw new Error('Only DRAFT or PAUSED contracts can be edited');
  }

  // Validate endDate > startDate if both are present or one changes
  if (data.startDate || data.endDate) {
    const startDate = data.startDate ? new Date(data.startDate) : existing.startDate;
    const endDate   = data.endDate
      ? new Date(data.endDate)
      : (existing.endDate ?? null);

    if (endDate && endDate <= startDate) {
      throw new Error('endDate must be after startDate');
    }
  }

  return prisma.$transaction(async (tx) => {
    // Replace lines if provided
    if (data.lines) {
      await tx.contractLine.deleteMany({ where: { contractId: id } });
      await tx.contractLine.createMany({
        data: data.lines.map(l => ({
          contractId:  id,
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          lineTotal:   round2(l.quantity * l.unitPrice),
          productId:   l.productId,
        })),
      });
    }

    return tx.contract.update({
      where: { id },
      data: {
        ...(data.title        !== undefined ? { title:        data.title }                          : {}),
        ...(data.startDate    !== undefined ? { startDate:    new Date(data.startDate) }            : {}),
        ...(data.endDate      !== undefined ? { endDate:      new Date(data.endDate) }              : {}),
        ...(data.billingCycle !== undefined ? { billingCycle: data.billingCycle as BillingCycle }   : {}),
        ...(data.vatRate      !== undefined ? { vatRate:      data.vatRate }                        : {}),
        ...(data.totalValue   !== undefined ? { totalValue:   data.totalValue }                     : {}),
        ...(data.notes        !== undefined ? { notes:        data.notes }                          : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines:    true,
      },
    });
  });
}

// ─── Status Transitions ───────────────────────────────────────────

export async function activateContract(id: string, tenantId: string) {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Contract not found');
  }
  if (existing.status !== 'DRAFT') {
    throw new Error('Only DRAFT contracts can be activated');
  }

  return prisma.contract.update({
    where: { id },
    data:  { status: 'ACTIVE' },
  });
}

export async function pauseContract(id: string, tenantId: string) {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Contract not found');
  }
  if (existing.status !== 'ACTIVE') {
    throw new Error('Only ACTIVE contracts can be paused');
  }

  return prisma.contract.update({
    where: { id },
    data:  { status: 'PAUSED' },
  });
}

export async function resumeContract(id: string, tenantId: string) {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Contract not found');
  }
  if (existing.status !== 'PAUSED') {
    throw new Error('Only PAUSED contracts can be resumed');
  }

  return prisma.contract.update({
    where: { id },
    data:  { status: 'ACTIVE' },
  });
}

export async function terminateContract(
  id: string,
  tenantId: string,
  data: TerminateContractInput
) {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Contract not found');
  }
  if (existing.status === 'TERMINATED') {
    throw new Error('Contract is already terminated');
  }

  return prisma.contract.update({
    where: { id },
    data: {
      status:  'TERMINATED',
      endDate: new Date(),
      ...(data.reason ? { notes: data.reason } : {}),
    },
  });
}

// ─── Check Expired Contracts ──────────────────────────────────────

export async function checkExpiredContracts(tenantId?: string): Promise<{ updated: number }> {
  const now = new Date();

  const result = await prisma.contract.updateMany({
    where: {
      status:  'ACTIVE',
      endDate: { lt: now },
      ...(tenantId ? { tenantId } : {}),
    },
    data: { status: 'EXPIRED' },
  });

  return { updated: result.count };
}

// ─── Generate Contract Invoices ───────────────────────────────────

export interface GenerateContractInvoicesResult {
  created: string[];
  errors:  string[];
}

export async function generateContractInvoices(
  tenantId?: string
): Promise<GenerateContractInvoicesResult> {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // include everything due today

  // Find all ACTIVE contracts whose nextBillingDate is <= today
  const due = await prisma.contract.findMany({
    where: {
      status:          'ACTIVE',
      nextBillingDate: { lte: today },
      ...(tenantId ? { tenantId } : {}),
    },
    include: { lines: true },
  });

  const created: string[] = [];
  const errors:  string[] = [];

  for (const contract of due) {
    try {
      const invoiceId = await prisma.$transaction(async (tx) => {
        // ── 1. Calculate totals ──────────────────────────────────
        const vatRate = Number(contract.vatRate) / 100; // e.g. 17 → 0.17

        const processedLines = contract.lines.map((l, idx) => {
          const qty       = Number(l.quantity);
          const price     = Number(l.unitPrice);
          const lineTotal = round2(qty * price);
          return { ...l, qty, price, lineTotal, sortOrder: idx };
        });

        const subtotal  = round2(processedLines.reduce((s, l) => s + l.lineTotal, 0));
        const vatAmount = round2(subtotal * vatRate);
        const total     = round2(subtotal + vatAmount);

        // ── 2. Generate invoice number ───────────────────────────
        const number = await generateCINumber(contract.tenantId, tx);

        const billingDate = new Date();
        billingDate.setHours(0, 0, 0, 0);

        const dueDate = new Date(billingDate);
        dueDate.setDate(dueDate.getDate() + 30);

        // ── 3. Create invoice ────────────────────────────────────
        const invoice = await tx.invoice.create({
          data: {
            tenantId:   contract.tenantId,
            customerId: contract.customerId,
            number,
            date:       billingDate,
            dueDate,
            status:     'DRAFT',
            subtotal,
            vatAmount,
            total,
            notes:      contract.notes ?? undefined,
            reference:  contract.number, // link back to contract number
            createdBy:  'system',
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

        // ── 4. Advance nextBillingDate ───────────────────────────
        const billingCycle   = contract.billingCycle;
        const newBillingDate = advanceBillingDate(contract.nextBillingDate, billingCycle);

        // ── 5. Check if new billing date > endDate → EXPIRED ────
        let newStatus: ContractStatus = 'ACTIVE';
        if (contract.endDate && newBillingDate > contract.endDate) {
          newStatus = 'EXPIRED';
        }

        await tx.contract.update({
          where: { id: contract.id },
          data: {
            nextBillingDate: newBillingDate,
            status:          newStatus,
          },
        });

        return invoice.id;
      });

      created.push(invoiceId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Contract ${contract.number}: ${message}`);
    }
  }

  return { created, errors };
}

// ─── Renewal Report ───────────────────────────────────────────────

export interface ContractRenewalItem {
  contractId:    string;
  number:        string;
  title:         string;
  customerName:  string;
  endDate:       Date;
  daysRemaining: number;
  totalValue:    number | null;
}

export async function getContractRenewalReport(
  tenantId: string,
  daysAhead: number = 30
): Promise<ContractRenewalItem[]> {
  const now    = new Date();
  now.setHours(0, 0, 0, 0);

  const future = new Date(now);
  future.setDate(future.getDate() + daysAhead);
  future.setHours(23, 59, 59, 999);

  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status:  'ACTIVE',
      endDate: {
        gte: now,
        lte: future,
      },
    },
    include: {
      customer: { select: { name: true } },
    },
    orderBy: { endDate: 'asc' },
  });

  return contracts.map(c => {
    const msPerDay     = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((c.endDate!.getTime() - now.getTime()) / msPerDay);

    return {
      contractId:    c.id,
      number:        c.number,
      title:         c.title,
      customerName:  c.customer.name,
      endDate:       c.endDate!,
      daysRemaining,
      totalValue:    c.totalValue !== null ? Number(c.totalValue) : null,
    };
  });
}

// ─── Contract Value Summary ───────────────────────────────────────

export interface ContractValueSummary {
  activeContracts:   number;
  totalMonthlyValue: number;
  totalAnnualValue:  number;
  expiringIn30Days:  number;
  expiringIn90Days:  number;
}

export async function getContractValueSummary(tenantId: string): Promise<ContractValueSummary> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const in30  = new Date(now); in30.setDate(in30.getDate() + 30);
  const in90  = new Date(now); in90.setDate(in90.getDate() + 90);

  // Fetch all active contracts with lines
  const activeContracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
    },
    include: { lines: true },
  });

  let totalMonthlyValue = 0;

  for (const contract of activeContracts) {
    // Sum of all contract lines (before VAT)
    const linesTotal = contract.lines.reduce(
      (sum, l) => sum + Number(l.lineTotal),
      0
    );

    // Normalize to monthly value
    switch (contract.billingCycle) {
      case 'MONTHLY':
        totalMonthlyValue += linesTotal;
        break;
      case 'QUARTERLY':
        totalMonthlyValue += linesTotal / 3;
        break;
      case 'YEARLY':
        totalMonthlyValue += linesTotal / 12;
        break;
    }
  }

  const totalAnnualValue = round2(totalMonthlyValue * 12);
  totalMonthlyValue      = round2(totalMonthlyValue);

  // Count expiring contracts
  const expiringIn30Days = activeContracts.filter(
    c => c.endDate && c.endDate >= now && c.endDate <= in30
  ).length;

  const expiringIn90Days = activeContracts.filter(
    c => c.endDate && c.endDate >= now && c.endDate <= in90
  ).length;

  return {
    activeContracts:   activeContracts.length,
    totalMonthlyValue,
    totalAnnualValue,
    expiringIn30Days,
    expiringIn90Days,
  };
}
