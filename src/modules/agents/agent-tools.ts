import { prisma } from '../../config/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LowStockProduct {
  productId: string;
  sku: string;
  name: string;
  warehouseName: string;
  quantity: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  deficit: number;
}

export interface OverdueInvoice {
  id: string;
  number: string;
  customerName: string;
  total: number;
  dueDate: string;
  daysOverdue: number;
}

export interface UnpaidBill {
  id: string;
  number: string;
  vendorName: string;
  total: number;
  dueDate: string;
  daysUntilDue: number;
  isOverdue: boolean;
}

export interface PendingLeave {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  submittedDaysAgo: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalAmount: number;
}

export interface SalesSummary {
  currentMonth: { invoiceCount: number; totalAmount: number };
  lastMonth: { invoiceCount: number; totalAmount: number };
  growthPercent: number | null;
}

export interface StaleQuote {
  id: string;
  number: string;
  customerName: string;
  total: number;
  issueDate: string;
  daysOpen: number;
  status: string;
}

export interface CashFlowSummary {
  inflow: number;   // sum of PAID invoices last 30 days
  outflow: number;  // sum of PAID bills last 30 days
  netCashFlow: number;
  period: string;
}

export interface AttendanceAnomaly {
  employeeId: string;
  employeeName: string;
  absenceCount: number;
}

export interface PayrollCostSummary {
  payslipCount: number;
  totalGross: number;
  totalNet: number;
  totalEmployerCost: number;
  period: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

// ─── Tool Functions ───────────────────────────────────────────────────────────

/**
 * Returns products whose total stock is below their reorder point.
 */
export async function getLowStockProducts(tenantId: string): Promise<LowStockProduct[]> {
  const stockLevels = await prisma.stockLevel.findMany({
    where: {
      tenantId,
      reorderPoint: { not: null },
    },
    include: {
      product: { select: { id: true, sku: true, name: true, isService: true } },
      warehouse: { select: { name: true } },
    },
  });

  const results: LowStockProduct[] = [];
  for (const sl of stockLevels) {
    if (sl.product.isService) continue;
    const qty = Number(sl.quantity);
    const rp = Number(sl.reorderPoint!);
    if (qty < rp) {
      results.push({
        productId: sl.productId,
        sku: sl.product.sku,
        name: sl.product.name,
        warehouseName: sl.warehouse.name,
        quantity: qty,
        reorderPoint: rp,
        reorderQuantity: sl.reorderQuantity !== null ? Number(sl.reorderQuantity) : null,
        deficit: rp - qty,
      });
    }
  }
  return results.sort((a, b) => b.deficit - a.deficit);
}

/**
 * Returns invoices past their due date that are not PAID or CANCELLED.
 */
export async function getOverdueInvoices(tenantId: string): Promise<OverdueInvoice[]> {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      dueDate: { lt: now },
      status: { notIn: ['PAID', 'CANCELLED'] },
    },
    include: {
      customer: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  return invoices.map(inv => ({
    id: inv.id,
    number: inv.number,
    customerName: inv.customer.name,
    total: Number(inv.total),
    dueDate: inv.dueDate.toISOString().slice(0, 10),
    daysOverdue: daysBetween(inv.dueDate, now),
  }));
}

/**
 * Returns bills that are not PAID (includes overdue and upcoming).
 */
export async function getUnpaidBills(tenantId: string): Promise<UnpaidBill[]> {
  const now = new Date();
  const bills = await prisma.bill.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { not: 'PAID' },
    },
    include: {
      vendor: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  return bills.map(bill => {
    const daysUntilDue = daysBetween(now, bill.dueDate);
    return {
      id: bill.id,
      number: bill.number,
      vendorName: bill.vendor.name,
      total: Number(bill.total),
      dueDate: bill.dueDate.toISOString().slice(0, 10),
      daysUntilDue,
      isOverdue: bill.dueDate < now,
    };
  });
}

/**
 * Returns employees with pending (not yet decided) leave requests.
 */
export async function getPendingLeaves(tenantId: string): Promise<PendingLeave[]> {
  const now = new Date();
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      tenantId,
      status: 'PENDING',
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return leaves.map(lr => ({
    id: lr.id,
    employeeName: `${lr.employee.firstName} ${lr.employee.lastName}`,
    leaveType: lr.leaveType.name,
    startDate: lr.startDate.toISOString().slice(0, 10),
    endDate: lr.endDate.toISOString().slice(0, 10),
    totalDays: lr.totalDays,
    submittedDaysAgo: daysBetween(lr.createdAt, now),
  }));
}

/**
 * Returns the top 5 customers by total invoice amount in the last 90 days.
 */
export async function getTopCustomers(tenantId: string): Promise<TopCustomer[]> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      date: { gte: since },
    },
    select: {
      customerId: true,
      total: true,
      customer: { select: { name: true } },
    },
  });

  const map = new Map<string, { name: string; count: number; total: number }>();
  for (const inv of invoices) {
    const entry = map.get(inv.customerId) ?? { name: inv.customer.name, count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(inv.total);
    map.set(inv.customerId, entry);
  }

  return Array.from(map.entries())
    .map(([customerId, v]) => ({
      customerId,
      customerName: v.name,
      invoiceCount: v.count,
      totalAmount: Math.round(v.total * 100) / 100,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);
}

/**
 * Returns a sales summary comparing the current month to the previous month.
 */
export async function getSalesSummary(tenantId: string): Promise<SalesSummary> {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfLastMonth(now);
  const lastMonthEnd = endOfLastMonth(now);

  const [currentInvoices, lastInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        date: { gte: thisMonthStart },
      },
      select: { total: true },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        date: { gte: lastMonthStart, lte: lastMonthEnd },
      },
      select: { total: true },
    }),
  ]);

  const currentTotal = currentInvoices.reduce((s, i) => s + Number(i.total), 0);
  const lastTotal = lastInvoices.reduce((s, i) => s + Number(i.total), 0);
  const growthPercent = lastTotal > 0
    ? Math.round(((currentTotal - lastTotal) / lastTotal) * 10000) / 100
    : null;

  return {
    currentMonth: { invoiceCount: currentInvoices.length, totalAmount: Math.round(currentTotal * 100) / 100 },
    lastMonth: { invoiceCount: lastInvoices.length, totalAmount: Math.round(lastTotal * 100) / 100 },
    growthPercent,
  };
}

/**
 * Returns quotes in SENT status that were issued more than 14 days ago without being converted.
 */
export async function getStaleQuotes(tenantId: string): Promise<StaleQuote[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const now = new Date();

  const quotes = await prisma.quote.findMany({
    where: {
      tenantId,
      status: { in: ['SENT', 'DRAFT'] },
      issueDate: { lte: cutoff },
    },
    include: {
      customer: { select: { name: true } },
    },
    orderBy: { issueDate: 'asc' },
  });

  return quotes.map(q => ({
    id: q.id,
    number: q.number,
    customerName: q.customer.name,
    total: Number(q.total),
    issueDate: q.issueDate.toISOString().slice(0, 10),
    daysOpen: daysBetween(q.issueDate, now),
    status: q.status,
  }));
}

/**
 * Returns cash position: sum of PAID invoices minus sum of PAID bills for the last 30 days.
 */
export async function getCashFlowSummary(tenantId: string): Promise<CashFlowSummary> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [paidInvoices, paidBills] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'PAID',
        paidAt: { gte: since },
      },
      select: { total: true },
    }),
    prisma.bill.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'PAID',
        paidAt: { gte: since },
      },
      select: { total: true },
    }),
  ]);

  const inflow = paidInvoices.reduce((s, i) => s + Number(i.total), 0);
  const outflow = paidBills.reduce((s, b) => s + Number(b.total), 0);

  return {
    inflow: Math.round(inflow * 100) / 100,
    outflow: Math.round(outflow * 100) / 100,
    netCashFlow: Math.round((inflow - outflow) * 100) / 100,
    period: 'last_30_days',
  };
}

/**
 * Returns employees with more than 3 days without any attendance log in the last 30 days.
 * An "absence" is a calendar working day (Mon-Fri) with no clockIn record.
 */
export async function getAttendanceAnomalies(tenantId: string): Promise<AttendanceAnomaly[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  // Fetch all attendance logs in the period grouped by employee
  const logs = await prisma.attendanceLog.findMany({
    where: {
      tenantId,
      clockIn: { gte: since },
    },
    select: { employeeId: true, date: true },
  });

  // Count distinct working days per employee
  const presentDays = new Map<string, Set<string>>();
  for (const log of logs) {
    const key = log.employeeId;
    if (!presentDays.has(key)) presentDays.set(key, new Set());
    presentDays.get(key)!.add(log.date.toISOString().slice(0, 10));
  }

  // Count working days (Mon–Fri) in the last 30 days
  let workdayCount = 0;
  const cursor = new Date(since);
  while (cursor <= new Date()) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) workdayCount++; // Mon=1 … Fri=5
    cursor.setDate(cursor.getDate() + 1);
  }

  // Get all active employees for this tenant
  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });

  const anomalies: AttendanceAnomaly[] = [];
  for (const emp of employees) {
    const present = presentDays.get(emp.id)?.size ?? 0;
    const absences = workdayCount - present;
    if (absences > 3) {
      anomalies.push({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        absenceCount: absences,
      });
    }
  }

  return anomalies.sort((a, b) => b.absenceCount - a.absenceCount);
}

/**
 * Returns total payroll cost for payslips created this calendar month.
 */
export async function getPayrollCostSummary(tenantId: string): Promise<PayrollCostSummary> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const periodLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const payslips = await prisma.payslip.findMany({
    where: {
      tenantId,
      deletedAt: null,
      createdAt: { gte: monthStart },
    },
    select: {
      grossSalary: true,
      netSalary: true,
      totalEmployerCost: true,
    },
  });

  const totalGross = payslips.reduce((s, p) => s + Number(p.grossSalary), 0);
  const totalNet = payslips.reduce((s, p) => s + Number(p.netSalary), 0);
  const totalEmployerCost = payslips.reduce((s, p) => s + Number(p.totalEmployerCost), 0);

  return {
    payslipCount: payslips.length,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
    period: periodLabel,
  };
}
