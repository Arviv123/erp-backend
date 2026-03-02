import { prisma } from '../../config/database';

/**
 * BUDGET SERVICE
 * Manages annual budgets and budget-vs-actual comparisons.
 */

// ─── Budget vs Actual ─────────────────────────────────────────────

export async function getBudgetVsActual(budgetId: string, tenantId: string) {
  const budget = await prisma.budget.findUnique({
    where:   { id: budgetId },
    include: {
      lines: {
        include: { budget: { select: { year: true } } },
      },
    },
  });

  if (!budget || budget.tenantId !== tenantId) throw new Error('Budget not found');

  // Date range for the budget year
  const from = new Date(budget.year, 0, 1);   // Jan 1
  const to   = new Date(budget.year, 11, 31, 23, 59, 59); // Dec 31

  // Fetch actual account balances for all budgeted accounts in this period
  const accountIds = budget.lines.map(l => l.accountId);

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, tenantId },
    select: { id: true, code: true, name: true, type: true },
  });

  const rows = await Promise.all(
    budget.lines.map(async (line) => {
      const acc = accounts.find(a => a.id === line.accountId);

      // Sum debits and credits for this account within the budget year
      const [debitResult, creditResult] = await Promise.all([
        prisma.transactionLine.aggregate({
          where: {
            debitAccountId: line.accountId,
            transaction:    { tenantId, status: 'POSTED', date: { gte: from, lte: to } },
          },
          _sum: { amount: true },
        }),
        prisma.transactionLine.aggregate({
          where: {
            creditAccountId: line.accountId,
            transaction:     { tenantId, status: 'POSTED', date: { gte: from, lte: to } },
          },
          _sum: { amount: true },
        }),
      ]);

      const totalDebits  = Number(debitResult._sum.amount  ?? 0);
      const totalCredits = Number(creditResult._sum.amount ?? 0);
      // Net balance: for EXPENSE accounts, debit increases the balance
      const actual = totalDebits - totalCredits;
      const budgetAmount = Number(line.amount);
      const variance = budgetAmount - actual;
      const variancePct = budgetAmount > 0 ? (variance / budgetAmount) * 100 : 0;

      return {
        accountId:    line.accountId,
        accountCode:  acc?.code  ?? '?',
        accountName:  acc?.name  ?? '?',
        accountType:  acc?.type  ?? '?',
        budget:       budgetAmount,
        actual,
        variance,
        variancePct:  Math.round(variancePct * 100) / 100,
        notes:        line.notes,
      };
    })
  );

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalBudget - totalActual;

  return {
    budget: {
      id:     budget.id,
      name:   budget.name,
      year:   budget.year,
      status: budget.status,
    },
    rows,
    totals: { totalBudget, totalActual, totalVariance },
  };
}

// ─── Clone Budget to New Year ─────────────────────────────────────

export async function cloneBudget(
  sourceBudgetId: string,
  tenantId:       string,
  newYear:        number,
  newName:        string,
  createdBy:      string
) {
  const source = await prisma.budget.findUnique({
    where:   { id: sourceBudgetId },
    include: { lines: true },
  });
  if (!source || source.tenantId !== tenantId) throw new Error('Source budget not found');

  const totalBudget = source.lines.reduce((s, l) => s + Number(l.amount), 0);

  return prisma.budget.create({
    data: {
      tenantId,
      name:        newName,
      year:        newYear,
      status:      'DRAFT',
      totalBudget,
      notes:       `שוכפל מ: ${source.name} (${source.year})`,
      createdBy,
      lines: {
        create: source.lines.map(l => ({
          accountId: l.accountId,
          amount:    l.amount,
          notes:     l.notes,
        })),
      },
    },
    include: { lines: true },
  });
}
