import { prisma } from '../../config/database';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RevenueTrendPoint {
  month: string; // "2026-01"
  revenue: number;
  invoiceCount: number;
}

export interface CustomerProfitability {
  customerId: string;
  customerName: string;
  revenue: number;
  invoiceCount: number;
  lastInvoiceDate: Date | null;
}

export interface ProductProfitability {
  productId: string;
  productName: string;
  sku: string;
  totalRevenue: number;
  totalQty: number;
  avgPrice: number;
}

export interface KPISummary {
  period: string;
  revenue: number;
  revenueGrowth: number;
  newCustomers: number;
  activeCustomers: number;
  totalInvoices: number;
  paidInvoices: number;
  overdueAmount: number;
  avgInvoiceValue: number;
  topCustomer: { name: string; revenue: number } | null;
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
}

export interface SalesByEmployee {
  userId: string;
  name: string;
  revenue: number;
  invoiceCount: number;
}

export interface InvoiceStatusBreakdown {
  status: string;
  count: number;
  totalAmount: number;
}

export interface PaymentTimePoint {
  month: string;
  avgDaysToPayment: number;
  minDays: number;
  maxDays: number;
}

export interface ExpenseByCategory {
  category: string;
  total: number;
  count: number;
}

// ─── Helper: period date bounds ───────────────────────────────────────────────

function getPeriodBounds(period: 'this_month' | 'last_month' | 'this_year' | 'last_year'): {
  start: Date;
  end: Date;
  compareStart: Date;
  compareEnd: Date;
  label: string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  if (period === 'this_month') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    // Compare to same month last year
    const compareStart = new Date(y - 1, m, 1);
    const compareEnd = new Date(y - 1, m + 1, 0, 23, 59, 59, 999);
    return { start, end, compareStart, compareEnd, label: `${y}-${String(m + 1).padStart(2, '0')}` };
  }

  if (period === 'last_month') {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    const start = new Date(ly, lm, 1);
    const end = new Date(ly, lm + 1, 0, 23, 59, 59, 999);
    const compareStart = new Date(ly - 1, lm, 1);
    const compareEnd = new Date(ly - 1, lm + 1, 0, 23, 59, 59, 999);
    return { start, end, compareStart, compareEnd, label: `${ly}-${String(lm + 1).padStart(2, '0')}` };
  }

  if (period === 'this_year') {
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    const compareStart = new Date(y - 1, 0, 1);
    const compareEnd = new Date(y - 1, 11, 31, 23, 59, 59, 999);
    return { start, end, compareStart, compareEnd, label: String(y) };
  }

  // last_year
  const start = new Date(y - 1, 0, 1);
  const end = new Date(y - 1, 11, 31, 23, 59, 59, 999);
  const compareStart = new Date(y - 2, 0, 1);
  const compareEnd = new Date(y - 2, 11, 31, 23, 59, 59, 999);
  return { start, end, compareStart, compareEnd, label: String(y - 1) };
}

// ─── Revenue Trend ────────────────────────────────────────────────────────────

/**
 * Monthly revenue for the last N months.
 * Revenue = sum of total on PAID (and PARTIAL via payments) invoices grouped by issue month.
 * We use invoice.total for PAID invoices and invoice.total for PARTIAL — keeping it simple
 * and consistent with the dashboard pattern.
 */
export async function getRevenueTrend(
  tenantId: string,
  months: number = 12,
): Promise<RevenueTrendPoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // Fetch all PAID/PARTIAL invoices in the window
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ['PAID', 'SENT', 'OVERDUE'] },
      date: { gte: start },
      deletedAt: null,
    },
    select: {
      id: true,
      date: true,
      total: true,
      status: true,
    },
  });

  // Also fetch PAID invoices that may have paidAt in the window even if invoice.date is earlier
  const paidPayments = await prisma.invoicePayment.findMany({
    where: {
      tenantId,
      date: { gte: start },
    },
    select: {
      amount: true,
      date: true,
      invoice: { select: { status: true } },
    },
  });

  // Build month buckets
  const buckets: Map<string, { revenue: number; invoiceCount: number }> = new Map();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { revenue: 0, invoiceCount: 0 });
  }

  // Sum payments per month (actual cash received)
  for (const p of paidPayments) {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (buckets.has(key)) {
      const b = buckets.get(key)!;
      b.revenue += Number(p.amount);
    }
  }

  // Count invoices per month (by issue date) for invoiceCount
  const invoiceMonthCount: Map<string, Set<string>> = new Map();
  for (const inv of invoices) {
    const d = new Date(inv.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!invoiceMonthCount.has(key)) invoiceMonthCount.set(key, new Set());
    invoiceMonthCount.get(key)!.add(inv.id);
  }

  // Merge invoice counts into buckets
  for (const [key, ids] of invoiceMonthCount.entries()) {
    if (buckets.has(key)) {
      buckets.get(key)!.invoiceCount = ids.size;
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));
}

// ─── Profitability by Customer ────────────────────────────────────────────────

export async function getProfitabilityByCustomer(
  tenantId: string,
  filters: { from?: Date; to?: Date; limit?: number } = {},
): Promise<CustomerProfitability[]> {
  const { from, to, limit = 10 } = filters;

  const dateFilter = buildDateFilter(from, to);

  // Group invoices by customer
  const grouped = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: {
      tenantId,
      status: { in: ['PAID', 'SENT', 'OVERDUE'] },
      deletedAt: null,
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    _sum: { total: true },
    _count: { id: true },
    _max: { date: true },
    orderBy: { _sum: { total: 'desc' } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const customerIds = grouped.map(g => g.customerId);
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true },
  });
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c.name]));

  return grouped.map(g => ({
    customerId: g.customerId,
    customerName: customerMap[g.customerId] ?? 'Unknown',
    revenue: Number(g._sum.total ?? 0),
    invoiceCount: g._count.id,
    lastInvoiceDate: g._max.date,
  }));
}

// ─── Profitability by Product ─────────────────────────────────────────────────

export async function getProfitabilityByProduct(
  tenantId: string,
  filters: { from?: Date; to?: Date; limit?: number } = {},
): Promise<ProductProfitability[]> {
  const { from, to, limit = 10 } = filters;
  const dateFilter = buildDateFilter(from, to);

  // Fetch invoice lines where invoice is PAID
  // We join via invoice → invoiceLines → product
  const lines = await prisma.invoiceLine.findMany({
    where: {
      productId: { not: null },
      invoice: {
        tenantId,
        status: { in: ['PAID', 'SENT'] },
        deletedAt: null,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
    },
    select: {
      productId: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      product: { select: { name: true, sku: true } },
    },
  });

  // Aggregate by product
  const productMap: Map<
    string,
    { name: string; sku: string; totalRevenue: number; totalQty: number; count: number }
  > = new Map();

  for (const line of lines) {
    if (!line.productId || !line.product) continue;
    const id = line.productId;
    const existing = productMap.get(id) ?? {
      name: line.product.name,
      sku: line.product.sku,
      totalRevenue: 0,
      totalQty: 0,
      count: 0,
    };
    existing.totalRevenue += Number(line.lineTotal);
    existing.totalQty += Number(line.quantity);
    existing.count += 1;
    productMap.set(id, existing);
  }

  return Array.from(productMap.entries())
    .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit)
    .map(([productId, data]) => ({
      productId,
      productName: data.name,
      sku: data.sku,
      totalRevenue: data.totalRevenue,
      totalQty: data.totalQty,
      avgPrice: data.totalQty > 0 ? data.totalRevenue / data.totalQty : 0,
    }));
}

// ─── KPI Summary ──────────────────────────────────────────────────────────────

export async function getKPISummary(
  tenantId: string,
  period: 'this_month' | 'last_month' | 'this_year' | 'last_year' = 'this_month',
): Promise<KPISummary> {
  const { start, end, compareStart, compareEnd, label } = getPeriodBounds(period);

  const [
    // Revenue: sum of payments received in period
    revenueResult,
    // Compare revenue (same period prior year/month)
    compareRevenueResult,
    // New customers created in period
    newCustomersCount,
    // Active customers (with an invoice in period)
    activeCustomersRaw,
    // Total invoices issued in period
    totalInvoicesResult,
    // Paid invoices in period
    paidInvoicesResult,
    // Overdue invoice amounts (all time open)
    overdueResult,
    // All invoices in period for avg calculation
    avgInvoiceResult,
    // Top customer by revenue in period (groupBy)
    topCustomerRaw,
    // Cash: latest balance from bank statement lines
    cashResult,
    // AR: SENT + OVERDUE invoice totals
    arResult,
    // AP: open bills
    apResult,
  ] = await Promise.all([
    // Revenue = payments received in the period
    prisma.invoicePayment.aggregate({
      where: { tenantId, date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),

    prisma.invoicePayment.aggregate({
      where: { tenantId, date: { gte: compareStart, lte: compareEnd } },
      _sum: { amount: true },
    }),

    prisma.customer.count({
      where: { tenantId, createdAt: { gte: start, lte: end } },
    }),

    prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        tenantId,
        date: { gte: start, lte: end },
        deletedAt: null,
      },
      _count: { id: true },
    }),

    prisma.invoice.aggregate({
      where: {
        tenantId,
        date: { gte: start, lte: end },
        deletedAt: null,
      },
      _count: { id: true },
    }),

    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: 'PAID',
        date: { gte: start, lte: end },
        deletedAt: null,
      },
      _count: { id: true },
    }),

    prisma.invoice.aggregate({
      where: { tenantId, status: 'OVERDUE', deletedAt: null },
      _sum: { total: true },
    }),

    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: { in: ['PAID', 'SENT'] },
        date: { gte: start, lte: end },
        deletedAt: null,
      },
      _avg: { total: true },
    }),

    prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        tenantId,
        status: { in: ['PAID', 'SENT'] },
        date: { gte: start, lte: end },
        deletedAt: null,
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 1,
    }),

    // Cash balance: sum of last balance per bank account
    // We use the most recent BankStatementLine balance per account
    prisma.bankStatementLine.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
      distinct: ['bankAccountId'],
      select: { balance: true },
    }),

    // AR: total of SENT + OVERDUE invoices
    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: { in: ['SENT', 'OVERDUE'] },
        deletedAt: null,
      },
      _sum: { total: true },
    }),

    // AP: open bills
    prisma.bill.aggregate({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      _sum: { total: true },
    }),
  ]);

  const revenue = Number(revenueResult._sum.amount ?? 0);
  const compareRevenue = Number(compareRevenueResult._sum.amount ?? 0);
  const revenueGrowth =
    compareRevenue === 0 ? 0 : ((revenue - compareRevenue) / compareRevenue) * 100;

  const cashBalance = cashResult.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);

  // Top customer name resolution
  let topCustomer: { name: string; revenue: number } | null = null;
  if (topCustomerRaw.length > 0) {
    const tc = topCustomerRaw[0];
    const cust = await prisma.customer.findUnique({
      where: { id: tc.customerId },
      select: { name: true },
    });
    topCustomer = {
      name: cust?.name ?? 'Unknown',
      revenue: Number(tc._sum.total ?? 0),
    };
  }

  return {
    period: label,
    revenue,
    revenueGrowth: Math.round(revenueGrowth * 100) / 100,
    newCustomers: newCustomersCount,
    activeCustomers: activeCustomersRaw.length,
    totalInvoices: totalInvoicesResult._count.id,
    paidInvoices: paidInvoicesResult._count.id,
    overdueAmount: Number(overdueResult._sum.total ?? 0),
    avgInvoiceValue: Number(avgInvoiceResult._avg.total ?? 0),
    topCustomer,
    cashBalance,
    accountsReceivable: Number(arResult._sum.total ?? 0),
    accountsPayable: Number(apResult._sum.total ?? 0),
  };
}

// ─── Sales by Employee ────────────────────────────────────────────────────────

export async function getSalesByEmployee(
  tenantId: string,
  filters: { from?: Date; to?: Date } = {},
): Promise<SalesByEmployee[]> {
  const { from, to } = filters;
  const dateFilter = buildDateFilter(from, to);

  // Group invoices by createdBy (userId)
  const grouped = await prisma.invoice.groupBy({
    by: ['createdBy'],
    where: {
      tenantId,
      status: { in: ['PAID', 'SENT'] },
      deletedAt: null,
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    _sum: { total: true },
    _count: { id: true },
    orderBy: { _sum: { total: 'desc' } },
  });

  if (grouped.length === 0) return [];

  const userIds = grouped.map(g => g.createdBy);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const userMap = Object.fromEntries(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

  return grouped.map(g => ({
    userId: g.createdBy,
    name: userMap[g.createdBy] ?? g.createdBy,
    revenue: Number(g._sum.total ?? 0),
    invoiceCount: g._count.id,
  }));
}

// ─── Invoice Status Breakdown ─────────────────────────────────────────────────

export async function getInvoiceStatusBreakdown(
  tenantId: string,
  period: string = 'this_month',
): Promise<InvoiceStatusBreakdown[]> {
  // Parse period as a month string "YYYY-MM" or keyword
  let start: Date;
  let end: Date;

  if (period === 'this_month' || period === 'last_month' || period === 'this_year' || period === 'last_year') {
    const bounds = getPeriodBounds(period as any);
    start = bounds.start;
    end = bounds.end;
  } else if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, mo] = period.split('-').map(Number);
    start = new Date(y, mo - 1, 1);
    end = new Date(y, mo, 0, 23, 59, 59, 999);
  } else {
    // Default: current month
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const grouped = await prisma.invoice.groupBy({
    by: ['status'],
    where: {
      tenantId,
      date: { gte: start, lte: end },
      deletedAt: null,
    },
    _count: { id: true },
    _sum: { total: true },
  });

  return grouped.map(g => ({
    status: g.status,
    count: g._count.id,
    totalAmount: Number(g._sum.total ?? 0),
  }));
}

// ─── Payment Time Analysis ────────────────────────────────────────────────────

export async function getPaymentTimeAnalysis(
  tenantId: string,
  months: number = 6,
): Promise<PaymentTimePoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // Fetch PAID invoices with their issue date and paidAt
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: 'PAID',
      paidAt: { not: null, gte: start },
      deletedAt: null,
    },
    select: {
      date: true,
      paidAt: true,
    },
  });

  // Group by month of paidAt and calculate days
  const buckets: Map<string, number[]> = new Map();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, []);
  }

  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const paidAt = new Date(inv.paidAt);
    const key = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) continue;

    const issuedAt = new Date(inv.date);
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(0, Math.round((paidAt.getTime() - issuedAt.getTime()) / msPerDay));
    buckets.get(key)!.push(days);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, days]) => {
      if (days.length === 0) {
        return { month, avgDaysToPayment: 0, minDays: 0, maxDays: 0 };
      }
      const avg = days.reduce((s, d) => s + d, 0) / days.length;
      return {
        month,
        avgDaysToPayment: Math.round(avg * 10) / 10,
        minDays: Math.min(...days),
        maxDays: Math.max(...days),
      };
    });
}

// ─── Expenses by Category ─────────────────────────────────────────────────────

export async function getExpensesByCategory(
  tenantId: string,
  filters: { from?: Date; to?: Date } = {},
): Promise<ExpenseByCategory[]> {
  const { from, to } = filters;
  const dateFilter = buildDateFilter(from, to);

  // Use individual Expense rows (linked through ExpenseReport)
  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    select: {
      category: true,
      amount: true,
    },
  });

  // Aggregate by category
  const catMap: Map<string, { total: number; count: number }> = new Map();
  for (const e of expenses) {
    const cat = e.category || 'אחר';
    const existing = catMap.get(cat) ?? { total: 0, count: 0 };
    existing.total += Number(e.amount);
    existing.count += 1;
    catMap.set(cat, existing);
  }

  return Array.from(catMap.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([category, data]) => ({ category, total: data.total, count: data.count }));
}

// ─── Excel Export ─────────────────────────────────────────────────────────────

export async function exportKPIReport(tenantId: string, year: number): Promise<Buffer> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // Gather all data in parallel
  const [kpiSummary, revenueTrend, topCustomers, topProducts] = await Promise.all([
    getKPISummary(tenantId, 'this_year'),
    getRevenueTrend(tenantId, 12),
    getProfitabilityByCustomer(tenantId, { from: yearStart, to: yearEnd, limit: 20 }),
    getProfitabilityByProduct(tenantId, { from: yearStart, to: yearEnd, limit: 20 }),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: KPI Summary (תקציר KPI) ────────────────────────────
  const kpiData = [
    ['מדד', 'ערך'],
    ['תקופה', kpiSummary.period],
    ['הכנסות (ש"ח)', kpiSummary.revenue],
    ['צמיחת הכנסות (%)', kpiSummary.revenueGrowth],
    ['לקוחות חדשים', kpiSummary.newCustomers],
    ['לקוחות פעילים', kpiSummary.activeCustomers],
    ['סה"כ חשבוניות', kpiSummary.totalInvoices],
    ['חשבוניות ששולמו', kpiSummary.paidInvoices],
    ['חשבוניות פגות תוקף (ש"ח)', kpiSummary.overdueAmount],
    ['ממוצע חשבונית (ש"ח)', Math.round(kpiSummary.avgInvoiceValue)],
    ['לקוח מוביל', kpiSummary.topCustomer ? kpiSummary.topCustomer.name : '—'],
    ['הכנסה לקוח מוביל (ש"ח)', kpiSummary.topCustomer ? kpiSummary.topCustomer.revenue : 0],
    ['יתרת קופה (ש"ח)', kpiSummary.cashBalance],
    ['חייבים (ש"ח)', kpiSummary.accountsReceivable],
    ['זכאים (ש"ח)', kpiSummary.accountsPayable],
  ];
  const wsKPI = XLSX.utils.aoa_to_sheet(kpiData);
  wsKPI['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsKPI, 'תקציר KPI');

  // ── Sheet 2: Revenue Trend (מגמות הכנסות) ───────────────────────
  const revenueHeader = ['חודש', 'הכנסות (ש"ח)', 'מספר חשבוניות'];
  const revenueRows = revenueTrend.map(r => [r.month, r.revenue, r.invoiceCount]);
  const wsRevenue = XLSX.utils.aoa_to_sheet([revenueHeader, ...revenueRows]);
  wsRevenue['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRevenue, 'מגמות הכנסות');

  // ── Sheet 3: Top Customers (לקוחות מובילים) ─────────────────────
  const custHeader = ['מזהה לקוח', 'שם לקוח', 'הכנסות (ש"ח)', 'מספר חשבוניות', 'חשבונית אחרונה'];
  const custRows = topCustomers.map(c => [
    c.customerId,
    c.customerName,
    c.revenue,
    c.invoiceCount,
    c.lastInvoiceDate ? new Date(c.lastInvoiceDate).toLocaleDateString('he-IL') : '—',
  ]);
  const wsCust = XLSX.utils.aoa_to_sheet([custHeader, ...custRows]);
  wsCust['!cols'] = [{ wch: 28 }, { wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsCust, 'לקוחות מובילים');

  // ── Sheet 4: Top Products (מוצרים מובילים) ──────────────────────
  const prodHeader = ['מזהה מוצר', 'שם מוצר', 'מק"ט', 'הכנסות (ש"ח)', 'כמות כוללת', 'מחיר ממוצע (ש"ח)'];
  const prodRows = topProducts.map(p => [
    p.productId,
    p.productName,
    p.sku,
    Math.round(p.totalRevenue * 100) / 100,
    Math.round(p.totalQty * 1000) / 1000,
    Math.round(p.avgPrice * 100) / 100,
  ]);
  const wsProd = XLSX.utils.aoa_to_sheet([prodHeader, ...prodRows]);
  wsProd['!cols'] = [{ wch: 28 }, { wch: 25 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsProd, 'מוצרים מובילים');

  // Write to Buffer
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(xlsxBuffer);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function buildDateFilter(
  from?: Date,
  to?: Date,
): { gte?: Date; lte?: Date } | null {
  if (!from && !to) return null;
  const filter: { gte?: Date; lte?: Date } = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}
