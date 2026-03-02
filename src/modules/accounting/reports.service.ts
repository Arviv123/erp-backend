import { prisma } from '../../config/database';

/**
 * FINANCIAL REPORTS SERVICE
 * P&L, Balance Sheet, VAT (מע"מ) report
 */

// ─── Profit & Loss ────────────────────────────────────────────────

export async function getProfitAndLoss(
  tenantId: string,
  from: Date,
  to: Date
) {
  const accounts = await prisma.account.findMany({
    where:   { tenantId, type: { in: ['REVENUE', 'EXPENSE'] }, isActive: true },
    orderBy: { code: 'asc' },
  });

  const accountIds = accounts.map(a => a.id);

  // Get all posted lines in this period
  const lines = await prisma.transactionLine.findMany({
    where: {
      transaction: {
        tenantId,
        status: 'POSTED',
        date:   { gte: from, lte: to },
      },
      OR: [
        { debitAccountId:  { in: accountIds } },
        { creditAccountId: { in: accountIds } },
      ],
    },
    include: { transaction: { select: { date: true } } },
  });

  // Build balance per account
  const balanceMap = new Map<string, number>();
  for (const line of lines) {
    const debitAcc  = balanceMap.get(line.debitAccountId)  ?? 0;
    const creditAcc = balanceMap.get(line.creditAccountId) ?? 0;
    balanceMap.set(line.debitAccountId,  debitAcc  + Number(line.amount));
    balanceMap.set(line.creditAccountId, creditAcc - Number(line.amount));
  }

  const revenues: Array<{ code: string; name: string; balance: number }> = [];
  const expenses: Array<{ code: string; name: string; balance: number }> = [];

  for (const acc of accounts) {
    const raw = balanceMap.get(acc.id) ?? 0;
    // Revenue: credit-nature → positive is credit balance (negate debit-offset)
    const balance = acc.type === 'REVENUE' ? -raw : raw;

    if (balance === 0) continue;

    if (acc.type === 'REVENUE') revenues.push({ code: acc.code, name: acc.name, balance });
    else                        expenses.push({ code: acc.code, name: acc.name, balance });
  }

  const totalRevenue = revenues.reduce((s, a) => s + a.balance, 0);
  const totalExpense = expenses.reduce((s, a) => s + a.balance, 0);
  const netProfit    = totalRevenue - totalExpense;

  return {
    period: { from, to },
    revenues,
    expenses,
    totalRevenue: round2(totalRevenue),
    totalExpense: round2(totalExpense),
    netProfit:    round2(netProfit),
    isProfitable: netProfit >= 0,
  };
}

// ─── Balance Sheet ────────────────────────────────────────────────

export async function getBalanceSheet(tenantId: string, asOf: Date) {
  const accounts = await prisma.account.findMany({
    where:   { tenantId, type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, isActive: true },
    orderBy: { code: 'asc' },
  });

  const results = await Promise.all(
    accounts.map(async (acc) => {
      const [debitSum, creditSum] = await Promise.all([
        prisma.transactionLine.aggregate({
          where: {
            debitAccountId: acc.id,
            transaction: { tenantId, status: 'POSTED', date: { lte: asOf } },
          },
          _sum: { amount: true },
        }),
        prisma.transactionLine.aggregate({
          where: {
            creditAccountId: acc.id,
            transaction: { tenantId, status: 'POSTED', date: { lte: asOf } },
          },
          _sum: { amount: true },
        }),
      ]);

      const debits  = Number(debitSum._sum.amount  ?? 0);
      const credits = Number(creditSum._sum.amount ?? 0);
      // Assets: debit-nature (debits increase balance)
      // Liabilities/Equity: credit-nature
      const balance = acc.type === 'ASSET'
        ? debits - credits
        : credits - debits;

      return { code: acc.code, name: acc.name, type: acc.type, balance: round2(balance) };
    })
  );

  const assets      = results.filter(a => a.type === 'ASSET'     && a.balance !== 0);
  const liabilities = results.filter(a => a.type === 'LIABILITY'  && a.balance !== 0);
  const equity      = results.filter(a => a.type === 'EQUITY'     && a.balance !== 0);

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.balance, 0);
  const isBalanced       = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  return {
    asOf,
    assets,      totalAssets:      round2(totalAssets),
    liabilities, totalLiabilities: round2(totalLiabilities),
    equity,      totalEquity:      round2(totalEquity),
    isBalanced,
    checksum:     round2(totalAssets - totalLiabilities - totalEquity),
  };
}

// ─── VAT Report (דו"ח מע"מ - טופס 83) ────────────────────────────

export async function getVatReport(tenantId: string, period: string) {
  // period = "2026-02" (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Period must be YYYY-MM');
  }

  const [y, m] = period.split('-').map(Number);
  const from   = new Date(y, m - 1, 1);
  const to     = new Date(y, m,     0, 23, 59, 59);

  // Sales invoices in period (עסקאות)
  const salesInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ['SENT', 'PAID'] },
      date:   { gte: from, lte: to },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });

  // VAT Account (3200) balance = VAT collected
  const vatAccount = await prisma.account.findFirst({
    where: { tenantId, code: '3200' },
  });

  const vatInputAccount = await prisma.account.findFirst({
    where: { tenantId, code: '1600' },
  });

  const salesTotals = salesInvoices.reduce(
    (acc, inv) => ({
      subtotal:  acc.subtotal  + Number(inv.subtotal),
      vatAmount: acc.vatAmount + Number(inv.vatAmount),
      total:     acc.total     + Number(inv.total),
    }),
    { subtotal: 0, vatAmount: 0, total: 0 }
  );

  return {
    period,
    reportDate: new Date(),
    // עסקאות (Output VAT)
    sales: {
      invoices:       salesInvoices.length,
      subtotal:       round2(salesTotals.subtotal),
      vatCollected:   round2(salesTotals.vatAmount),
      total:          round2(salesTotals.total),
      breakdown:      salesInvoices.map(inv => ({
        date:       inv.date,
        number:     inv.number,
        customer:   inv.customer.name,
        subtotal:   Number(inv.subtotal),
        vat:        Number(inv.vatAmount),
        total:      Number(inv.total),
      })),
    },
    // Note: תשומות (Input VAT from purchases) requires purchase/expense module
    summary: {
      vatCollected:   round2(salesTotals.vatAmount),
      vatPaid:        0, // Will be populated when purchase module exists
      vatDue:         round2(salesTotals.vatAmount), // vatCollected - vatPaid
    },
  };
}

// ─── Utility ──────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
