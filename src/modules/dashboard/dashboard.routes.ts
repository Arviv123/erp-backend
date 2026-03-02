import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

/**
 * DASHBOARD & ANALYTICS
 * Aggregated KPIs for the main dashboard.
 */

// GET /dashboard — main KPI summary (requires at least EMPLOYEE role)
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user.tenantId;
  const now      = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [
    // Revenue this month (posted invoices)
    revenueResult,
    // Outstanding AR (invoices not yet paid)
    outstandingInvoices,
    // Overdue invoices
    overdueInvoices,
    // Total active employees
    activeEmployees,
    // Low stock products
    lowStockItems,
    // Top customers by invoice total
    topCustomers,
    // Open bills (AP)
    openBills,
    // Recent transactions
    recentTransactions,
    // Expense reports pending approval
    pendingExpenses,
  ] = await Promise.all([

    // Revenue: sum of PAID invoices this month
    prisma.invoicePayment.aggregate({
      where: {
        tenantId,
        date: { gte: monthStart, lte: monthEnd },
        invoice: { status: { in: ['PAID'] } },
      },
      _sum: { amount: true },
    }),

    // Outstanding AR: invoices SENT or OVERDUE
    prisma.invoice.aggregate({
      where:  { tenantId, status: { in: ['SENT', 'OVERDUE'] } },
      _sum:   { total: true },
      _count: { id: true },
    }),

    // Overdue invoices
    prisma.invoice.count({
      where: { tenantId, status: 'OVERDUE' },
    }),

    // Active employees
    prisma.employee.count({
      where: { tenantId, isActive: true },
    }),

    // Low stock: where quantity <= reorderPoint
    prisma.stockLevel.count({
      where: {
        tenantId,
        reorderPoint: { not: null },
        quantity: { lte: prisma.stockLevel.fields.reorderPoint as any },
      },
    }).catch(() => 0), // Fallback if complex query fails

    // Top 5 customers by revenue
    prisma.invoice.groupBy({
      by:      ['customerId'],
      where:   { tenantId, status: { in: ['PAID', 'SENT'] } },
      _sum:    { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take:    5,
    }),

    // Open bills (AP)
    prisma.bill.aggregate({
      where: { tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] } },
      _sum:  { total: true },
      _count: { id: true },
    }),

    // Recent 10 transactions
    prisma.transaction.findMany({
      where:   { tenantId },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select: { id: true, date: true, reference: true, description: true, totalAmount: true, status: true, sourceType: true },
    }),

    // Pending expense reports
    prisma.expenseReport.count({
      where: { tenantId, status: 'SUBMITTED' },
    }),
  ]);

  // Enrich top customers with names
  const customerIds = topCustomers.map(c => c.customerId);
  const customers   = await prisma.customer.findMany({
    where:  { id: { in: customerIds } },
    select: { id: true, name: true },
  });
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c.name]));

  // Simple low stock query fallback
  const lowStock = await prisma.stockLevel.findMany({
    where: { tenantId, reorderPoint: { not: null } },
    include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } },
  }).then(levels => levels.filter(l => l.reorderPoint && Number(l.quantity) <= Number(l.reorderPoint)));

  sendSuccess(res, {
    asOf: now.toISOString(),
    revenue: {
      thisMonth: Number(revenueResult._sum.amount ?? 0),
    },
    accountsReceivable: {
      outstanding: Number(outstandingInvoices._sum.total ?? 0),
      count:       outstandingInvoices._count.id,
      overdueCount: overdueInvoices,
    },
    accountsPayable: {
      outstanding: Number(openBills._sum.total ?? 0),
      count:       openBills._count.id,
    },
    employees: {
      active: activeEmployees,
    },
    inventory: {
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.slice(0, 10).map(l => ({
        productName: l.product.name,
        sku:         l.product.sku,
        warehouse:   l.warehouse.name,
        quantity:    Number(l.quantity),
        reorderPoint: Number(l.reorderPoint),
      })),
    },
    topCustomers: topCustomers.map(c => ({
      customerId: c.customerId,
      name:       customerMap[c.customerId] ?? 'Unknown',
      total:      Number(c._sum.total ?? 0),
    })),
    recentActivity: recentTransactions,
    pendingExpenseApprovals: pendingExpenses,
  });
}));

// GET /dashboard/financials — P&L summary for current month (ACCOUNTANT+)
router.get('/financials', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user.tenantId;
  const now      = new Date();

  // Current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = now;

  // YTD
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  // Revenue accounts (type = REVENUE)
  // Expense accounts (type = EXPENSE)
  const accounts = await prisma.account.findMany({
    where: { tenantId, isActive: true, type: { in: ['REVENUE', 'EXPENSE'] } },
  });

  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE');
  const expenseAccounts = accounts.filter(a => a.type === 'EXPENSE');

  async function sumAccountNet(accountIds: string[], from: Date, to: Date): Promise<number> {
    if (accountIds.length === 0) return 0;
    const [dr, cr] = await Promise.all([
      prisma.transactionLine.aggregate({
        where: { debitAccountId: { in: accountIds }, transaction: { tenantId, status: 'POSTED', date: { gte: from, lte: to } } },
        _sum:  { amount: true },
      }),
      prisma.transactionLine.aggregate({
        where: { creditAccountId: { in: accountIds }, transaction: { tenantId, status: 'POSTED', date: { gte: from, lte: to } } },
        _sum:  { amount: true },
      }),
    ]);
    return Number(cr._sum.amount ?? 0) - Number(dr._sum.amount ?? 0);
  }

  const revenueIds = revenueAccounts.map(a => a.id);
  const expenseIds = expenseAccounts.map(a => a.id);

  const [revenueMonth, expenseMonth, revenueYtd, expenseYtd] = await Promise.all([
    sumAccountNet(revenueIds, monthStart, monthEnd),
    sumAccountNet(expenseIds, monthStart, monthEnd),
    sumAccountNet(revenueIds, ytdStart,   monthEnd),
    sumAccountNet(expenseIds, ytdStart,   monthEnd),
  ]);

  sendSuccess(res, {
    period: {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      year:  now.getFullYear(),
    },
    thisMonth: {
      revenue:    revenueMonth,
      expenses:   expenseMonth,
      netIncome:  revenueMonth - expenseMonth,
    },
    yearToDate: {
      revenue:    revenueYtd,
      expenses:   expenseYtd,
      netIncome:  revenueYtd - expenseYtd,
    },
  });
}));

// GET /dashboard/payroll — payroll summary (HR_MANAGER+)
router.get('/payroll', requireMinRole('HR_MANAGER') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user.tenantId;
  const year     = new Date().getFullYear();

  const runs = await prisma.payrollRun.findMany({
    where:   { tenantId, period: { startsWith: String(year) } },
    orderBy: { period: 'desc' },
  });

  const ytdGross     = runs.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.totalGross), 0);
  const ytdNet       = runs.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.totalNet), 0);
  const ytdTax       = runs.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.totalTax), 0);
  const ytdNI        = runs.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.totalNI), 0);
  const ytdPension   = runs.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.totalPension), 0);

  const lastRun = runs[0];

  sendSuccess(res, {
    year,
    ytd: { gross: ytdGross, net: ytdNet, tax: ytdTax, nationalInsurance: ytdNI, pension: ytdPension },
    lastRun: lastRun ? {
      period:     lastRun.period,
      status:     lastRun.status,
      totalGross: Number(lastRun.totalGross),
      totalNet:   Number(lastRun.totalNet),
    } : null,
    runsCount: runs.length,
  });
}));

export default router;
