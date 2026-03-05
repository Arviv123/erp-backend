import { prisma } from '../../config/database';
import { createTransaction } from '../accounting/accounting.service';

// ─── Types ────────────────────────────────────────────────────────

export interface ListBatchFilters {
  status?: string;
  from?: string;
  to?: string;
}

export interface BatchItemInput {
  vendorId: string;
  billId?: string;
  amount: number;
  bankAccount?: string;
  bankName?: string;
  reference?: string;
}

export interface CreateBatchInput {
  name: string;
  dueDate: string; // ISO date
  items: BatchItemInput[];
}

// ─── List Payment Batches ─────────────────────────────────────────

export async function listPaymentBatches(
  tenantId: string,
  filters: ListBatchFilters = {},
) {
  const where: any = { tenantId };

  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.from || filters.to) {
    where.dueDate = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  return prisma.paymentBatch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { items: true } },
    },
  });
}

// ─── Create Payment Batch ─────────────────────────────────────────

export async function createPaymentBatch(
  tenantId: string,
  userId: string,
  data: CreateBatchInput,
) {
  // Validate that all vendors exist and belong to this tenant
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
  const dueDate = new Date(data.dueDate);

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
              // Auto-fill bank details from vendor if not provided
              bankAccount: item.bankAccount ?? vendor.bankAccountNumber ?? null,
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
            vendor: {
              select: { id: true, name: true, bankAccountNumber: true, bankName: true },
            },
          },
        },
      },
    });

    return batch;
  });
}

// ─── Get Batch with Items ─────────────────────────────────────────

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

// ─── Approve Batch (DRAFT → APPROVED) ────────────────────────────

export async function approvePaymentBatch(id: string, tenantId: string) {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
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
    throw new Error(
      `Batch must be in DRAFT status to approve (current: ${batch.status})`,
    );
  }
  if (batch.items.length === 0) {
    throw new Error('Cannot approve an empty batch');
  }

  // Require bank account on every item before approving
  const missingBank = batch.items.filter((i) => !i.bankAccount);
  if (missingBank.length > 0) {
    const names = missingBank
      .map((i) => i.vendor?.name ?? i.vendorId)
      .join(', ');
    throw new Error(
      `The following items are missing a bank account: ${names}`,
    );
  }

  return prisma.paymentBatch.update({
    where: { id },
    data: { status: 'APPROVED' },
    include: { items: true },
  });
}

// ─── Export Batch as Israeli Bank Transfer CSV ────────────────────
// Israeli bank CSV format:
// "מספר שורה,שם נמען,מספר חשבון,שם בנק,סכום,תאריך ערך,אסמכתא"

export async function exportBatchToCSV(
  id: string,
  tenantId: string,
): Promise<string> {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          vendor: {
            select: { id: true, name: true, bankBranch: true },
          },
        },
      },
    },
  });

  if (!batch || batch.tenantId !== tenantId) {
    throw new Error('Payment batch not found');
  }
  if (batch.status !== 'APPROVED' && batch.status !== 'EXPORTED' && batch.status !== 'PROCESSED') {
    throw new Error('Only APPROVED batches can be exported');
  }

  const valueDate = formatDate(batch.dueDate);
  const header = 'מספר שורה,שם נמען,מספר חשבון,שם בנק,סכום,תאריך ערך,אסמכתא';

  const rows = batch.items.map((item, index) =>
    [
      String(index + 1),
      csvField(item.vendor?.name ?? ''),
      csvField(item.bankAccount ?? ''),
      csvField(item.bankName ?? ''),
      Number(item.amount).toFixed(2),
      valueDate,
      csvField(item.reference ?? `BATCH-${id.slice(-8)}-${String(index + 1).padStart(3, '0')}`),
    ].join(','),
  );

  // Mark batch as exported
  await prisma.paymentBatch.update({
    where: { id },
    data: { status: 'EXPORTED', exportedAt: new Date() },
  });

  return [header, ...rows].join('\n');
}

// ─── Export Batch in MASAV Format (Israeli ACH) ───────────────────
// MASAV (מסב) is the Israeli interbank clearing system.
//
// Record layout (fixed-width):
//   Header  "1" + sender_account(9) + DDMMYYYY(8) + batch_id(8)  + spaces
//   Detail  "2" + bank(3) + branch(3) + account(9) + amount_agorot(10)
//           + beneficiary_name(16) + reference(10) + spaces
//   Footer  "9" + record_count(6) + total_agorot(12) + spaces

export async function exportBatchToMASAV(
  id: string,
  tenantId: string,
): Promise<string> {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
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
  if (batch.status !== 'APPROVED' && batch.status !== 'EXPORTED' && batch.status !== 'PROCESSED') {
    throw new Error('Only APPROVED batches can be exported to MASAV');
  }

  const now = new Date();
  const dateStr = formatDateDMY(now); // DDMMYYYY

  // Header record
  const senderAccount = padRight('000000000', 9); // placeholder — tenant would configure
  const batchCode = padRight(id.slice(-8).toUpperCase(), 8);
  const headerLine = `1${senderAccount}${dateStr}${batchCode}`;

  // Detail records
  const detailLines: string[] = [];
  let totalAgorot = 0;

  for (const item of batch.items) {
    // Parse bank account — format: "bank_code-branch-account" or just account number
    const bankCode = masavBankCode(item.bankName ?? '');
    const branch = padLeft(
      item.vendor?.bankBranch ?? '000',
      3,
    );
    const account = padLeft(item.bankAccount ?? '000000000', 9);

    const amountNIS = Number(item.amount);
    const amountAgorot = Math.round(amountNIS * 100);
    totalAgorot += amountAgorot;

    const beneficiaryName = padRight(
      hebrewAsciiSafe(item.vendor?.name ?? ''),
      16,
    );
    const reference = padLeft(
      item.reference ?? id.slice(-8),
      10,
    );

    detailLines.push(
      `2${bankCode}${branch}${account}${padLeft(String(amountAgorot), 10)}${beneficiaryName}${reference}`,
    );
  }

  // Footer record
  const recordCount = padLeft(String(detailLines.length), 6);
  const totalStr = padLeft(String(totalAgorot), 12);
  const footerLine = `9${recordCount}${totalStr}`;

  // Mark batch as exported
  await prisma.paymentBatch.update({
    where: { id },
    data: { status: 'EXPORTED', exportedAt: new Date() },
  });

  return [headerLine, ...detailLines, footerLine].join('\n');
}

// ─── Mark Batch as Processed ──────────────────────────────────────
// Sets status to PROCESSED, creates BillPayment for each linked bill,
// updates bill statuses to PAID / PARTIALLY_PAID, and posts GL entries.

export async function markBatchProcessed(id: string, tenantId: string) {
  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
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
  if (batch.status !== 'APPROVED' && batch.status !== 'EXPORTED') {
    throw new Error(
      `Batch must be APPROVED or EXPORTED to mark as processed (current: ${batch.status})`,
    );
  }

  // Resolve GL accounts (AP = 3100, Bank = 1200)
  const [apAccount, bankGlAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId, code: '3100' } }),
    prisma.account.findFirst({ where: { tenantId, code: '1200' } }),
  ]);

  const processedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Mark all items PROCESSED
    await tx.paymentBatchItem.updateMany({
      where: { batchId: id },
      data: { status: 'PROCESSED' },
    });

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
              reference:
                item.reference ??
                `BATCH-${id.slice(-8)}`,
              createdBy: batch.createdBy,
            },
          });

          // Recalculate total paid on this bill
          const totalPaidAgg = await tx.billPayment.aggregate({
            where: { billId: item.billId },
            _sum: { amount: true },
          });
          const totalPaid = Number(totalPaidAgg._sum.amount ?? 0);
          const newStatus: string =
            totalPaid >= Number(bill.total) ? 'PAID' : 'PARTIALLY_PAID';

          await tx.bill.update({
            where: { id: item.billId },
            data: {
              status: newStatus as any,
              paidAt: newStatus === 'PAID' ? processedAt : undefined,
            },
          });

          // Post GL: DR Accounts Payable, CR Bank
          if (apAccount && bankGlAccount) {
            await createTransaction({
              tenantId,
              date: processedAt,
              reference: `BATCH-${id.slice(-8)}-${bill.number}`,
              description: `תשלום אצווה לספק ${item.vendor?.name ?? item.vendorId}`,
              sourceType: 'BILL_PAYMENT',
              sourceId: payment.id,
              createdBy: batch.createdBy,
              lines: [
                {
                  debitAccountId: apAccount.id,
                  creditAccountId: bankGlAccount.id,
                  amount: Number(item.amount),
                  description: `תשלום לספק ${item.vendor?.name ?? item.vendorId}`,
                },
              ],
            });
          }
        }
      } else {
        // No bill — still post GL if accounts available
        if (apAccount && bankGlAccount) {
          await createTransaction({
            tenantId,
            date: processedAt,
            reference: `BATCH-${id.slice(-8)}-${item.id.slice(-8)}`,
            description: `תשלום אצווה לספק ${item.vendor?.name ?? item.vendorId}`,
            sourceType: 'BILL_PAYMENT',
            sourceId: item.id,
            createdBy: batch.createdBy,
            lines: [
              {
                debitAccountId: apAccount.id,
                creditAccountId: bankGlAccount.id,
                amount: Number(item.amount),
                description: `תשלום לספק ${item.vendor?.name ?? item.vendorId}`,
              },
            ],
          });
        }
      }
    }

    return tx.paymentBatch.update({
      where: { id },
      data: { status: 'PROCESSED' },
      include: { items: true },
    });
  });
}

// ─── Get Unpaid Bills for Batch Building ─────────────────────────
// Returns POSTED and PARTIALLY_PAID bills grouped by vendor,
// including vendor bank details.

export async function getUnpaidBillsForBatch(
  tenantId: string,
  filters?: { vendorId?: string; dueBy?: string },
) {
  const where: any = {
    tenantId,
    status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] },
    deletedAt: null,
  };

  if (filters?.vendorId) {
    where.vendorId = filters.vendorId;
  }
  if (filters?.dueBy) {
    where.dueDate = { lte: new Date(filters.dueBy) };
  }

  const bills = await prisma.bill.findMany({
    where,
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          bankAccountNumber: true,
          bankName: true,
          bankBranch: true,
          email: true,
        },
      },
      payments: {
        select: { amount: true },
      },
    },
    orderBy: [{ vendorId: 'asc' }, { dueDate: 'asc' }],
  });

  // Group by vendor and compute remaining balance per bill
  const grouped = new Map<
    string,
    {
      vendor: any;
      bills: any[];
      totalOutstanding: number;
    }
  >();

  for (const bill of bills) {
    const paidSoFar = bill.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const outstanding = Number(bill.total) - paidSoFar;

    const entry = grouped.get(bill.vendorId) ?? {
      vendor: bill.vendor,
      bills: [],
      totalOutstanding: 0,
    };

    entry.bills.push({
      id: bill.id,
      number: bill.number,
      vendorRef: bill.vendorRef,
      date: bill.date,
      dueDate: bill.dueDate,
      status: bill.status,
      total: Number(bill.total),
      paid: paidSoFar,
      outstanding,
    });

    entry.totalOutstanding += outstanding;
    grouped.set(bill.vendorId, entry);
  }

  return Array.from(grouped.values());
}

// ─── Internal Helpers ─────────────────────────────────────────────

/** Wrap a CSV field value in quotes if it contains commas, quotes, or newlines. */
function csvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Format a Date as DD/MM/YYYY (Israeli standard). */
function formatDate(d: Date): string {
  return (
    String(d.getDate()).padStart(2, '0') +
    '/' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '/' +
    String(d.getFullYear())
  );
}

/** Format a Date as DDMMYYYY (MASAV header). */
function formatDateDMY(d: Date): string {
  return (
    String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getFullYear())
  );
}

/** Pad a string with spaces on the right to fill `len` characters. */
function padRight(s: string, len: number): string {
  return s.slice(0, len).padEnd(len, ' ');
}

/** Pad a string with zeros (or spaces) on the left to fill `len` characters. */
function padLeft(s: string, len: number): string {
  return s.slice(-len).padStart(len, '0');
}

/**
 * Map a Hebrew bank name to its 3-digit MASAV bank code.
 * Defaults to '000' when the bank is not recognised.
 */
function masavBankCode(bankName: string): string {
  const lower = bankName.trim().toLowerCase();
  const mapping: Record<string, string> = {
    'בנק הפועלים': '012',
    'הפועלים': '012',
    poalim: '012',
    'בנק לאומי': '010',
    לאומי: '010',
    leumi: '010',
    'בנק דיסקונט': '011',
    דיסקונט: '011',
    discount: '011',
    'הבנק הבינלאומי': '031',
    בינלאומי: '031',
    'first international': '031',
    mizrahi: '020',
    'מזרחי טפחות': '020',
    'בנק מזרחי': '020',
    'bank hapoalim': '012',
    'bank leumi': '010',
    'israel discount bank': '011',
    'bank mizrahi': '020',
  };

  for (const [key, code] of Object.entries(mapping)) {
    if (lower.includes(key.toLowerCase())) {
      return code;
    }
  }
  return '000';
}

/**
 * Strip non-ASCII characters for MASAV fixed-width fields.
 * MASAV files traditionally use ASCII-compatible encoding;
 * for Hebrew send the raw UTF-8 bytes and let the bank handle them.
 * Here we just truncate to fit the field width.
 */
function hebrewAsciiSafe(s: string): string {
  // MASAV typically expects Hebrew in cp862 / ISO-8859-8.
  // We return UTF-8 as-is and rely on the bank's gateway to transcode.
  return s.replace(/\n/g, ' ');
}
