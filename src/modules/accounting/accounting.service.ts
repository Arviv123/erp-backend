import { TransactionStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateTransactionInput, JournalEntry } from '../../shared/types';

/**
 * ACCOUNTING SERVICE - Double-Entry Bookkeeping Engine
 *
 * Rule: For every transaction, SUM(debits) must equal SUM(credits).
 * All writes happen inside a PostgreSQL transaction for full ACID compliance.
 */

// ─── Validation ──────────────────────────────────────────────────

function validateDoubleEntry(lines: JournalEntry[]): void {
  if (!lines || lines.length === 0) {
    throw new Error('Transaction must have at least one journal line');
  }

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  // Each line already carries one debit and one credit of equal amount.
  // We just ensure all amounts are positive.
  for (const line of lines) {
    if (line.amount <= 0) {
      throw new Error(`Amount must be positive: ${line.amount}`);
    }
    if (line.debitAccountId === line.creditAccountId) {
      throw new Error('Debit and Credit accounts cannot be the same');
    }
  }

  if (totalAmount <= 0) {
    throw new Error('Total transaction amount must be positive');
  }
}

// ─── Create Transaction (ACID) ────────────────────────────────────

export async function createTransaction(input: CreateTransactionInput) {
  validateDoubleEntry(input.lines);

  const totalAmount = input.lines.reduce((sum, l) => sum + l.amount, 0);

  // Verify all account IDs belong to this tenant
  const accountIds = [
    ...new Set(input.lines.flatMap(l => [l.debitAccountId, l.creditAccountId])),
  ];

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, tenantId: input.tenantId, isActive: true },
    select: { id: true },
  });

  if (accounts.length !== accountIds.length) {
    throw new Error('One or more accounts not found or inactive for this tenant');
  }

  // Single PostgreSQL transaction = ACID guarantee
  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        tenantId:    input.tenantId,
        date:        input.date,
        reference:   input.reference,
        description: input.description,
        sourceType:  input.sourceType,
        sourceId:    input.sourceId,
        totalAmount,
        createdBy:   input.createdBy,
        status:      'DRAFT',
        lines: {
          create: input.lines.map((line, idx) => ({
            debitAccountId:  line.debitAccountId,
            creditAccountId: line.creditAccountId,
            amount:          line.amount,
            description:     line.description,
            sortOrder:       idx,
          })),
        },
      },
      include: { lines: true },
    });

    return created;
  });

  return transaction;
}

// ─── Post Transaction (finalise) ─────────────────────────────────

export async function postTransaction(
  transactionId: string,
  tenantId: string
) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!tx || tx.tenantId !== tenantId) {
    throw new Error('Transaction not found');
  }
  if (tx.status !== 'DRAFT') {
    throw new Error(`Cannot post a transaction in status: ${tx.status}`);
  }

  return prisma.transaction.update({
    where: { id: transactionId },
    data:  { status: 'POSTED', postedAt: new Date() },
  });
}

// ─── Void Transaction ─────────────────────────────────────────────

export async function voidTransaction(
  transactionId: string,
  tenantId: string,
  userId: string
) {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: { lines: true },
  });

  if (!tx || tx.tenantId !== tenantId) {
    throw new Error('Transaction not found');
  }
  if (tx.status === 'VOID') {
    throw new Error('Transaction already voided');
  }

  // Create a reversing entry then void the original
  return prisma.$transaction(async (client) => {
    // Reverse journal entry (swap debit/credit)
    await client.transaction.create({
      data: {
        tenantId:    tenantId,
        date:        new Date(),
        reference:   `VOID-${tx.reference}`,
        description: `ביטול: ${tx.description}`,
        sourceType:  'VOID',
        sourceId:    tx.id,
        totalAmount: tx.totalAmount,
        status:      'POSTED',
        postedAt:    new Date(),
        createdBy:   userId,
        lines: {
          create: tx.lines.map((line, idx) => ({
            debitAccountId:  line.creditAccountId, // reversed
            creditAccountId: line.debitAccountId,  // reversed
            amount:          line.amount,
            description:     `ביטול: ${line.description ?? ''}`,
            sortOrder:       idx,
          })),
        },
      },
    });

    // Mark original as void
    return client.transaction.update({
      where: { id: transactionId },
      data:  { status: 'VOID' },
    });
  });
}

// ─── General Ledger (Account Balance) ────────────────────────────

export async function getAccountBalance(
  accountId: string,
  tenantId: string,
  asOfDate?: Date
) {
  const dateFilter = asOfDate ? { lte: asOfDate } : undefined;

  const [debitSum, creditSum] = await Promise.all([
    prisma.transactionLine.aggregate({
      where: {
        debitAccountId: accountId,
        transaction: {
          tenantId,
          status:  'POSTED',
          ...(dateFilter ? { date: dateFilter } : {}),
        },
      },
      _sum: { amount: true },
    }),
    prisma.transactionLine.aggregate({
      where: {
        creditAccountId: accountId,
        transaction: {
          tenantId,
          status:  'POSTED',
          ...(dateFilter ? { date: dateFilter } : {}),
        },
      },
      _sum: { amount: true },
    }),
  ]);

  const totalDebits  = Number(debitSum._sum.amount  ?? 0);
  const totalCredits = Number(creditSum._sum.amount ?? 0);

  return {
    accountId,
    totalDebits,
    totalCredits,
    balance: totalDebits - totalCredits, // positive = debit balance
  };
}

// ─── Trial Balance ────────────────────────────────────────────────

export async function getTrialBalance(tenantId: string, asOfDate?: Date) {
  const accounts = await prisma.account.findMany({
    where:   { tenantId, isActive: true },
    orderBy: { code: 'asc' },
  });

  const rows = await Promise.all(
    accounts.map(async (acc) => {
      const bal = await getAccountBalance(acc.id, tenantId, asOfDate);
      return { ...acc, ...bal };
    })
  );

  const totalDebits  = rows.reduce((s, r) => s + r.totalDebits,  0);
  const totalCredits = rows.reduce((s, r) => s + r.totalCredits, 0);
  const isBalanced   = Math.abs(totalDebits - totalCredits) < 0.01;

  return { rows, totalDebits, totalCredits, isBalanced };
}

// ─── List Transactions ────────────────────────────────────────────

export async function listTransactions(
  tenantId: string,
  filters: {
    status?: TransactionStatus;
    sourceType?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { status, sourceType, from, to, page = 1, pageSize = 50 } = filters;

  const where = {
    tenantId,
    ...(status     ? { status }                                : {}),
    ...(sourceType ? { sourceType }                            : {}),
    ...(from || to ? { date: { gte: from, lte: to } }         : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
      orderBy: { date: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page, pageSize };
}
