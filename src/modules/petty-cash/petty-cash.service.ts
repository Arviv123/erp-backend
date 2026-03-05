import { prisma } from '../../config/database';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Petty Cash Fund Management ──────────────────────────────────────────────

export async function listPettyCashes(tenantId: string) {
  return prisma.pettyCash.findMany({
    where:   { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPettyCash(
  tenantId: string,
  data: {
    name:        string;
    maxBalance?: number;
    custodianId?: string;
  }
) {
  return prisma.pettyCash.create({
    data: {
      tenantId,
      name:        data.name,
      balance:     0,
      maxBalance:  data.maxBalance ?? 500,
      currency:    'ILS',
      custodianId: data.custodianId,
      isActive:    true,
    },
  });
}

export async function getPettyCash(id: string, tenantId: string) {
  const fund = await prisma.pettyCash.findUnique({
    where:   { id },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take:    20,
      },
    },
  });

  if (!fund || fund.tenantId !== tenantId) return null;
  return fund;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function addTransaction(
  tenantId: string,
  userId: string,
  data: {
    pettyCashId:  string;
    type:         'WITHDRAWAL' | 'DEPOSIT' | 'REPLENISHMENT';
    amount:       number;
    description:  string;
    category?:    string;
    receiptUrl?:  string;
    glAccountId?: string;
  }
) {
  if (data.amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const amount = round2(data.amount);

  return prisma.$transaction(async (tx) => {
    // Fetch and verify ownership of the fund
    const fund = await tx.pettyCash.findUnique({
      where: { id: data.pettyCashId },
    });

    if (!fund || fund.tenantId !== tenantId) {
      throw new Error('קופה קטנה לא נמצאה');
    }

    if (!fund.isActive) {
      throw new Error('קופה קטנה אינה פעילה');
    }

    const currentBalance = round2(Number(fund.balance));

    // Calculate new balance
    let newBalance: number;
    if (data.type === 'WITHDRAWAL') {
      newBalance = round2(currentBalance - amount);
      if (newBalance < 0) {
        throw new Error(
          `יתרה לא מספקת. יתרה נוכחית: ${currentBalance} ₪, ביקש: ${amount} ₪`
        );
      }
    } else {
      // DEPOSIT and REPLENISHMENT both increase the balance
      newBalance = round2(currentBalance + amount);
    }

    // Create the transaction record with the running balance
    const pettyCashTx = await tx.pettyCashTransaction.create({
      data: {
        tenantId,
        pettyCashId: data.pettyCashId,
        type:        data.type,
        amount,
        description: data.description,
        category:    data.category,
        receiptUrl:  data.receiptUrl,
        balance:     newBalance,
        glAccountId: data.glAccountId,
        createdBy:   userId,
      },
    });

    // Update the fund's running balance
    await tx.pettyCash.update({
      where: { id: data.pettyCashId },
      data:  { balance: newBalance },
    });

    return pettyCashTx;
  });
}

// ─── List Transactions ───────────────────────────────────────────────────────

export async function listTransactions(
  tenantId:    string,
  pettyCashId: string,
  filters: {
    from?:  string;
    to?:    string;
    type?:  string;
    page?:  number;
    limit?: number;
  }
) {
  const page  = filters.page  ?? 1;
  const limit = filters.limit ?? 25;
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = { tenantId, pettyCashId };

  if (filters.type) {
    where['type'] = filters.type;
  }

  if (filters.from || filters.to) {
    where['createdAt'] = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.pettyCashTransaction.findMany({
      where:   where as any,
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.pettyCashTransaction.count({ where: where as any }),
  ]);

  return { items, total, page, limit };
}

// ─── Monthly Reconciliation Report ───────────────────────────────────────────

/**
 * Returns a reconciliation report for the given month.
 * @param month  Format: "2026-03"
 */
export async function getReconciliationReport(
  tenantId:    string,
  pettyCashId: string,
  month:       string
) {
  // Parse month bounds
  const parts = month.split('-');
  const year  = parseInt(parts[0], 10);
  const mon   = parseInt(parts[1], 10);

  const startOfMonth = new Date(year, mon - 1, 1);
  const endOfMonth   = new Date(year, mon, 0, 23, 59, 59, 999);

  // Verify fund ownership
  const fund = await prisma.pettyCash.findUnique({ where: { id: pettyCashId } });
  if (!fund || fund.tenantId !== tenantId) return null;

  // Fetch all transactions in the requested month
  const transactions = await prisma.pettyCashTransaction.findMany({
    where: {
      tenantId,
      pettyCashId,
      createdAt: { gte: startOfMonth, lte: endOfMonth },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Opening balance = the balance on the most recent transaction BEFORE this month
  const txBeforeMonth = await prisma.pettyCashTransaction.findFirst({
    where: {
      tenantId,
      pettyCashId,
      createdAt: { lt: startOfMonth },
    },
    orderBy: { createdAt: 'desc' },
  });

  const openingBalance = txBeforeMonth ? round2(Number(txBeforeMonth.balance)) : 0;

  // Aggregate by type
  const totals = { DEPOSIT: 0, WITHDRAWAL: 0, REPLENISHMENT: 0 };
  for (const tx of transactions) {
    const amt = round2(Number(tx.amount));
    if (tx.type === 'DEPOSIT')       totals.DEPOSIT       += amt;
    if (tx.type === 'WITHDRAWAL')    totals.WITHDRAWAL    += amt;
    if (tx.type === 'REPLENISHMENT') totals.REPLENISHMENT += amt;
  }

  const closingBalance = transactions.length > 0
    ? round2(Number(transactions[transactions.length - 1].balance))
    : openingBalance;

  return {
    fund: {
      id:         fund.id,
      name:       fund.name,
      currency:   fund.currency,
      maxBalance: round2(Number(fund.maxBalance)),
      isActive:   fund.isActive,
    },
    period:           month,
    openingBalance,
    deposits:         round2(totals.DEPOSIT),
    withdrawals:      round2(totals.WITHDRAWAL),
    replenishments:   round2(totals.REPLENISHMENT),
    closingBalance,
    transactionCount: transactions.length,
    transactions,
  };
}
