import { prisma } from '../../config/database';
import { createTransaction } from '../accounting/accounting.service';

// ─── List Payment Batches ─────────────────────────────────────────

export async function listPaymentBatches(
  tenantId: string,
  filters?: { status?: string },
) {
  const where: any = { tenantId };
  if (filters?.status) {
    where.status = filters.status;
  }

  return prisma.paymentBatch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { items: true } },
    },
  });
}

// ─── Get Single Batch (with items + vendor) ───────────────────────

export async function getPaymentBatch(id: string, tenantId: string) {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              bankAccountNumber: true,
              bankName: true,
              bankBranch: true,
            },
          },
        },
      },
    },
  });

  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }

  return batch;
}

// ─── Create Payment Batch ─────────────────────────────────────────

export interface CreateBatchInput {
  name: string;
  dueDate: Date | string;
  items: Array<{
    vendorId: string;
    billId?: string;
    amount: number;
    bankAccount?: string;
    bankName?: string;
    reference?: string;
  }>;
}

export async function createPaymentBatch(
  data: CreateBatchInput,
  tenantId: string,
  userId: string,
): Promise<any> {
  const dueDate =
    typeof data.dueDate === 'string' ? new Date(data.dueDate) : data.dueDate;

  // Validate all vendors exist and belong to this tenant
  const vendorIds = [...new Set(data.items.map((i) => i.vendorId))];
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: vendorIds }, tenantId },
    select: {
      id: true,
      name: true,
      bankAccountNumber: true,
      bankName: true,
    },
  });

  if (vendors.length !== vendorIds.length) {
    throw new Error('One or more vendors not found for this tenant');
  }

  const vendorMap = new Map(vendors.map((v) => [v.id, v]));

  // Validate bill IDs if provided
  const billIds = data.items.map((i) => i.billId).filter(Boolean) as string[];
  if (billIds.length > 0) {
    const bills = await prisma.bill.findMany({
      where: { id: { in: billIds }, tenantId },
      select: { id: true },
    });
    if (bills.length !== billIds.length) {
      throw new Error('One or more bills not found for this tenant');
    }
  }

  const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);
  const itemCount = data.items.length;

  return prisma.$transaction(async (tx) => {
    const batch = await tx.paymentBatch.create({
      data: {
        tenantId,
        name: data.name,
        dueDate,
        totalAmount,
        itemCount,
        createdBy: userId,
        status: 'DRAFT',
        items: {
          create: data.items.map((item) => {
            const vendor = vendorMap.get(item.vendorId)!;
            return {
              vendorId: item.vendorId,
              billId: item.billId ?? null,
              amount: item.amount,
              // Auto-fill bank account from vendor if not provided
              bankAccount:
                item.bankAccount ?? vendor.bankAccountNumber ?? null,
              bankName: item.bankName ?? vendor.bankName ?? null,
              reference: item.reference ?? null,
              status: 'PENDING',
            };
          }),
        },
      },
      include: {
        items: {
          include: {
            vendor: { select: { id: true, name: true } },
          },
        },
      },
    });

    return batch;
  });
}

// ─── Add Item to Batch ────────────────────────────────────────────

export async function addItemToBatch(
  batchId: string,
  tenantId: string,
  item: {
    vendorId: string;
    billId?: string;
    amount: number;
    bankAccount?: string;
    bankName?: string;
    reference?: string;
  },
): Promise<any> {
  const batch = await prisma.paymentBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }
  if (batch.status !== 'DRAFT') {
    throw new Error('Items can only be added to DRAFT batches');
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: item.vendorId },
    select: { id: true, bankAccountNumber: true, bankName: true, tenantId: true },
  });
  if (!vendor || vendor.tenantId !== tenantId) {
    throw new Error('Vendor not found');
  }

  if (item.billId) {
    const bill = await prisma.bill.findUnique({ where: { id: item.billId } });
    if (!bill || bill.tenantId !== tenantId) {
      throw new Error('Bill not found');
    }
  }

  return prisma.$transaction(async (tx) => {
    const newItem = await tx.paymentBatchItem.create({
      data: {
        batchId,
        vendorId: item.vendorId,
        billId: item.billId ?? null,
        amount: item.amount,
        bankAccount: item.bankAccount ?? vendor.bankAccountNumber ?? null,
        bankName: item.bankName ?? vendor.bankName ?? null,
        reference: item.reference ?? null,
        status: 'PENDING',
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });

    // Recalculate batch totals
    const aggregate = await tx.paymentBatchItem.aggregate({
      where: { batchId },
      _sum: { amount: true },
      _count: { id: true },
    });

    await tx.paymentBatch.update({
      where: { id: batchId },
      data: {
        totalAmount: Number(aggregate._sum.amount ?? 0),
        itemCount: aggregate._count.id,
      },
    });

    return newItem;
  });
}

// ─── Remove Item from Batch ───────────────────────────────────────

export async function removeItemFromBatch(
  batchId: string,
  itemId: string,
  tenantId: string,
): Promise<void> {
  const batch = await prisma.paymentBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }
  if (batch.status !== 'DRAFT') {
    throw new Error('Items can only be removed from DRAFT batches');
  }

  const item = await prisma.paymentBatchItem.findUnique({ where: { id: itemId } });
  if (!item || item.batchId !== batchId) {
    throw new Error('Item not found in this batch');
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentBatchItem.delete({ where: { id: itemId } });

    const aggregate = await tx.paymentBatchItem.aggregate({
      where: { batchId },
      _sum: { amount: true },
      _count: { id: true },
    });

    await tx.paymentBatch.update({
      where: { id: batchId },
      data: {
        totalAmount: Number(aggregate._sum.amount ?? 0),
        itemCount: aggregate._count.id,
      },
    });
  });
}

// ─── Approve Batch ────────────────────────────────────────────────

export async function approveBatch(batchId: string, tenantId: string): Promise<any> {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        include: { vendor: { select: { name: true } } },
      },
    },
  });

  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }
  if (batch.status !== 'DRAFT') {
    throw new Error(`Batch must be in DRAFT status to approve (current: ${batch.status})`);
  }
  if (batch.items.length === 0) {
    throw new Error('Cannot approve an empty batch');
  }

  // Validate all items have a bank account
  const missingBank = batch.items.filter((i) => !i.bankAccount);
  if (missingBank.length > 0) {
    const names = missingBank.map((i) => i.vendor?.name ?? i.vendorId).join(', ');
    throw new Error(
      `The following items are missing a bank account and cannot be approved: ${names}`,
    );
  }

  return prisma.paymentBatch.update({
    where: { id: batchId },
    data: { status: 'APPROVED' },
    include: { items: true },
  });
}

// ─── Export Batch to CSV ──────────────────────────────────────────

export async function exportBatchToCSV(
  batchId: string,
  tenantId: string,
): Promise<string> {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        include: { vendor: { select: { id: true, name: true } } },
      },
    },
  });

  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }
  if (batch.status !== 'APPROVED' && batch.status !== 'PROCESSED') {
    throw new Error('Only APPROVED or PROCESSED batches can be exported');
  }

  const csv = generateBankTransferCSV(batch.items, batch.dueDate);

  // Mark as exported
  await prisma.paymentBatch.update({
    where: { id: batchId },
    data: { exportedAt: new Date() },
  });

  return csv;
}

// ─── Mark Batch Processed ─────────────────────────────────────────

export async function markBatchProcessed(
  batchId: string,
  tenantId: string,
): Promise<any> {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        include: {
          vendor: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }
  if (batch.status !== 'APPROVED') {
    throw new Error(`Batch must be in APPROVED status to mark as processed (current: ${batch.status})`);
  }

  // Resolve GL accounts once (AP = 3100, Bank = 1200)
  const [apAccount, bankAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId, code: '3100' } }),
    prisma.account.findFirst({ where: { tenantId, code: '1200' } }),
  ]);

  const processedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Mark every item as PROCESSED
    await tx.paymentBatchItem.updateMany({
      where: { batchId },
      data: { status: 'PROCESSED' },
    });

    // For each item: create BillPayment + update Bill status + GL entry
    for (const item of batch.items) {
      if (item.billId) {
        const bill = await tx.bill.findUnique({
          where: { id: item.billId },
          select: { id: true, total: true, status: true, number: true },
        });

        if (bill && bill.status !== 'CANCELLED') {
          // Create BillPayment record
          const payment = await tx.billPayment.create({
            data: {
              billId: item.billId,
              tenantId,
              amount: item.amount,
              method: 'BANK_TRANSFER',
              date: processedAt,
              reference: item.reference ?? `BATCH-${batchId.slice(-8)}`,
              createdBy: batch.createdBy,
            },
          });

          // Recalculate how much has been paid on this bill
          const totalPaid = await tx.billPayment.aggregate({
            where: { billId: item.billId },
            _sum: { amount: true },
          });

          const paid = Number(totalPaid._sum.amount ?? 0);
          const newStatus =
            paid >= Number(bill.total) ? 'PAID' : 'PARTIALLY_PAID';

          await tx.bill.update({
            where: { id: item.billId },
            data: {
              status: newStatus as any,
              paidAt: newStatus === 'PAID' ? processedAt : undefined,
            },
          });

          // Create GL journal entry: DR Accounts Payable, CR Bank
          if (apAccount && bankAccount) {
            await createTransaction({
              tenantId,
              date: processedAt,
              reference: `BATCH-${batchId.slice(-8)}-${bill.number}`,
              description: `תשלום אצווה לספק ${item.vendor?.name ?? item.vendorId}`,
              sourceType: 'BILL_PAYMENT',
              sourceId: payment.id,
              createdBy: batch.createdBy,
              lines: [
                {
                  debitAccountId: apAccount.id,
                  creditAccountId: bankAccount.id,
                  amount: Number(item.amount),
                  description: `תשלום לספק ${item.vendor?.name ?? item.vendorId}`,
                },
              ],
            });
          }
        }
      } else {
        // No associated bill — still post a GL entry if accounts are available
        if (apAccount && bankAccount) {
          await createTransaction({
            tenantId,
            date: processedAt,
            reference: `BATCH-${batchId.slice(-8)}-${item.id.slice(-8)}`,
            description: `תשלום אצווה לספק ${item.vendor?.name ?? item.vendorId}`,
            sourceType: 'BILL_PAYMENT',
            sourceId: item.id,
            createdBy: batch.createdBy,
            lines: [
              {
                debitAccountId: apAccount.id,
                creditAccountId: bankAccount.id,
                amount: Number(item.amount),
                description: `תשלום לספק ${item.vendor?.name ?? item.vendorId}`,
              },
            ],
          });
        }
      }
    }

    // Promote batch status
    return tx.paymentBatch.update({
      where: { id: batchId },
      data: { status: 'PROCESSED' },
      include: { items: true },
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────

function generateBankTransferCSV(items: any[], dueDate: Date): string {
  const header = 'שם מוטב,מספר חשבון,שם בנק,סכום,אסמכתא,תאריך ביצוע';

  const rows = items.map((item) =>
    [
      escapeCsvField(item.vendor?.name ?? ''),
      escapeCsvField(item.bankAccount ?? ''),
      escapeCsvField(item.bankName ?? ''),
      Number(item.amount).toFixed(2),
      escapeCsvField(item.reference ?? item.id.slice(-8)),
      formatDate(dueDate),
    ].join(','),
  );

  return [header, ...rows].join('\n');
}

function escapeCsvField(value: string): string {
  // Wrap in quotes if the field contains a comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
