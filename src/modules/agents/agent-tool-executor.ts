/**
 * Agent Tool Executor
 * Defines all available ERP tools and executes them against the Prisma DB.
 * Used by the agentic chat loop when the LLM calls a tool.
 */

import { prisma } from '../../config/database';
import Anthropic from '@anthropic-ai/sdk';

// ─── Tool Definitions (Anthropic format) ─────────────────────────────────────

export const ALL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_erp',
    description: 'חפש בכל המערכת — לקוחות, חשבוניות, מוצרים, עובדים ועוד',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:  { type: 'string', description: 'מחרוזת החיפוש' },
        types:  { type: 'string', description: 'סוגי רשומות: all | invoices | customers | products | employees | vendors' },
        limit:  { type: 'number', description: 'מספר תוצאות מקסימלי (ברירת מחדל 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_customers',
    description: 'קבל רשימת לקוחות עם אפשרות חיפוש',
    input_schema: {
      type: 'object' as const,
      properties: {
        search:   { type: 'string', description: 'שם או ח.פ לחיפוש' },
        pageSize: { type: 'number', description: 'כמות תוצאות (ברירת מחדל 20)' },
      },
    },
  },
  {
    name: 'get_customer',
    description: 'קבל פרטי לקוח ספציפי לפי ID',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'מזהה הלקוח' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'get_invoices',
    description: 'קבל רשימת חשבוניות. ניתן לסנן לפי לקוח, סטטוס, תאריכים',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'ID לקוח לסינון' },
        status:     { type: 'string', description: 'DRAFT | SENT | PAID | OVERDUE | CANCELLED' },
        from:       { type: 'string', description: 'תאריך התחלה YYYY-MM-DD' },
        to:         { type: 'string', description: 'תאריך סיום YYYY-MM-DD' },
        pageSize:   { type: 'number' },
      },
    },
  },
  {
    name: 'get_invoice',
    description: 'קבל פרטי חשבונית ספציפית לפי ID',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoiceId: { type: 'string' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'get_stock_levels',
    description: 'קבל רמות מלאי של מוצרים',
    input_schema: {
      type: 'object' as const,
      properties: {
        search:      { type: 'string', description: 'שם מוצר או ברקוד' },
        lowStockOnly:{ type: 'boolean', description: 'הצג רק מוצרים עם מלאי נמוך' },
        warehouseId: { type: 'string', description: 'ID מחסן ספציפי' },
        pageSize:    { type: 'number' },
      },
    },
  },
  {
    name: 'get_products',
    description: 'קבל רשימת מוצרים מקטלוג',
    input_schema: {
      type: 'object' as const,
      properties: {
        search:   { type: 'string' },
        category: { type: 'string' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'get_employees',
    description: 'קבל רשימת עובדים',
    input_schema: {
      type: 'object' as const,
      properties: {
        search:   { type: 'string', description: 'שם, ת.ז, מחלקה' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'get_trial_balance',
    description: 'קבל מאזן בוחן לתאריך ספציפי',
    input_schema: {
      type: 'object' as const,
      properties: {
        asOf: { type: 'string', description: 'תאריך YYYY-MM-DD (ברירת מחדל: היום)' },
      },
    },
  },
  {
    name: 'get_profit_loss',
    description: 'קבל דוח רווח והפסד לתקופה',
    input_schema: {
      type: 'object' as const,
      properties: {
        from: { type: 'string', description: 'תאריך התחלה YYYY-MM-DD' },
        to:   { type: 'string', description: 'תאריך סיום YYYY-MM-DD' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_overdue_invoices',
    description: 'קבל חשבוניות שלא שולמו ועברה מועד פירעון',
    input_schema: {
      type: 'object' as const,
      properties: {
        daysOverdue: { type: 'number', description: 'מינימום ימים באיחור (ברירת מחדל 0)' },
      },
    },
  },
  {
    name: 'get_low_stock_products',
    description: 'קבל מוצרים שמתחת לנקודת ההזמנה המינימלית',
    input_schema: {
      type: 'object' as const,
      properties: {
        warehouseId: { type: 'string' },
      },
    },
  },
  {
    name: 'get_vendors',
    description: 'קבל רשימת ספקים',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'get_sales_orders',
    description: 'קבל רשימת הזמנות מכירה',
    input_schema: {
      type: 'object' as const,
      properties: {
        status:   { type: 'string', description: 'DRAFT | CONFIRMED | SHIPPED | DELIVERED | CANCELLED' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'get_cash_flow_forecast',
    description: 'קבל תחזית תזרים מזומנים לתקופה הקרובה',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'כמות ימים קדימה (ברירת מחדל 30)' },
      },
    },
  },
  {
    name: 'get_hr_summary',
    description: 'קבל סיכום HR — עובדים פעילים, היעדרויות, חופשות ממתינות',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_payroll_runs',
    description: 'קבל הרצות שכר',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number' },
        month: { type: 'number' },
      },
    },
  },
];

// Tool categories for the builder UI
export const TOOL_CATEGORIES = [
  {
    key: 'crm',
    label: '👥 לקוחות ומכירות',
    tools: ['search_erp', 'get_customers', 'get_customer', 'get_invoices', 'get_invoice', 'get_overdue_invoices', 'get_sales_orders'],
  },
  {
    key: 'inventory',
    label: '📦 מלאי ורכש',
    tools: ['get_stock_levels', 'get_products', 'get_low_stock_products', 'get_vendors'],
  },
  {
    key: 'finance',
    label: '💰 כספים וחשבונאות',
    tools: ['get_trial_balance', 'get_profit_loss', 'get_cash_flow_forecast'],
  },
  {
    key: 'hr',
    label: '👤 משאבי אנוש',
    tools: ['get_employees', 'get_hr_summary', 'get_payroll_runs'],
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  tenantId: string,
): Promise<unknown> {
  switch (toolName) {

    case 'search_erp': {
      const q = input.query as string;
      const limit = (input.limit as number) ?? 10;
      if (!q || q.trim().length < 1) return { results: [] };
      const [customers, invoices, products, employees] = await Promise.all([
        prisma.customer.findMany({
          where: { tenantId, OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ]},
          take: 5, select: { id: true, name: true, email: true, phone: true },
        }),
        prisma.invoice.findMany({
          where: { tenantId, OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
          ]},
          take: 5,
          select: { id: true, number: true, total: true, status: true, customer: { select: { name: true } } },
        }),
        prisma.product.findMany({
          where: { tenantId, OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ]},
          take: 5, select: { id: true, name: true, sku: true, sellingPrice: true },
        }),
        prisma.employee.findMany({
          where: { tenantId, OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ]},
          take: 5, select: { id: true, firstName: true, lastName: true, jobTitle: true },
        }),
      ]);
      return { customers, invoices, products, employees };
    }

    case 'get_customers': {
      const search = input.search as string | undefined;
      const take = Math.min((input.pageSize as number) ?? 20, 50);
      return prisma.customer.findMany({
        where: { tenantId, ...(search ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { businessId: { contains: search, mode: 'insensitive' } },
        ]} : {}) },
        take,
        select: { id: true, name: true, email: true, phone: true, address: true, businessId: true, createdAt: true },
        orderBy: { name: 'asc' },
      });
    }

    case 'get_customer': {
      return prisma.customer.findFirst({
        where: { tenantId, id: input.customerId as string },
        include: {
          invoices: { take: 10, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, total: true, status: true, dueDate: true } },
        },
      });
    }

    case 'get_invoices': {
      const take = Math.min((input.pageSize as number) ?? 20, 50);
      return prisma.invoice.findMany({
        where: {
          tenantId,
          ...(input.customerId ? { customerId: input.customerId as string } : {}),
          ...(input.status     ? { status: input.status as any } : {}),
          ...(input.from || input.to ? { issueDate: {
            ...(input.from ? { gte: new Date(input.from as string) } : {}),
            ...(input.to   ? { lte: new Date(input.to   as string) } : {}),
          }} : {}),
        },
        take,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } } },
      });
    }

    case 'get_invoice': {
      return prisma.invoice.findFirst({
        where: { tenantId, id: input.invoiceId as string },
        include: { customer: { select: { name: true } }, lines: true },
      });
    }

    case 'get_stock_levels': {
      const search = input.search as string | undefined;
      const take   = Math.min((input.pageSize as number) ?? 30, 100);
      const levels = await prisma.stockLevel.findMany({
        where: {
          tenantId,
          ...(input.warehouseId ? { warehouseId: input.warehouseId as string } : {}),
          product: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
        },
        take,
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { quantity: 'asc' },
      });
      if (input.lowStockOnly) {
        return levels.filter(l => l.reorderPoint != null && Number(l.quantity) <= Number(l.reorderPoint));
      }
      return levels;
    }

    case 'get_products': {
      const search = input.search as string | undefined;
      const take   = Math.min((input.pageSize as number) ?? 30, 100);
      return prisma.product.findMany({
        where: { tenantId, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
        take,
        select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true, barcode: true, category: true },
        orderBy: { name: 'asc' },
      });
    }

    case 'get_employees': {
      const search = input.search as string | undefined;
      const take   = Math.min((input.pageSize as number) ?? 30, 100);
      return prisma.employee.findMany({
        where: {
          tenantId,
          ...(search ? { OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName:  { contains: search, mode: 'insensitive' } },
            { jobTitle:  { contains: search, mode: 'insensitive' } },
          ]} : {}),
        },
        take,
        select: { id: true, firstName: true, lastName: true, jobTitle: true, department: true, grossSalary: true, startDate: true },
        orderBy: { lastName: 'asc' },
      });
    }

    case 'get_trial_balance': {
      const asOf = input.asOf ? new Date(input.asOf as string) : new Date();
      const accounts = await prisma.account.findMany({
        where: { tenantId },
        include: {
          debitLines: {
            where: { transaction: { date: { lte: asOf }, deletedAt: null } },
            select: { amount: true },
          },
          creditLines: {
            where: { transaction: { date: { lte: asOf }, deletedAt: null } },
            select: { amount: true },
          },
        },
      });
      return accounts.map(a => ({
        code: a.code, name: a.name, type: a.type,
        totalDebits:  a.debitLines.reduce((s, l)  => s + Number(l.amount), 0),
        totalCredits: a.creditLines.reduce((s, l) => s + Number(l.amount), 0),
      })).filter(a => a.totalDebits > 0 || a.totalCredits > 0);
    }

    case 'get_profit_loss': {
      const from = new Date(input.from as string);
      const to   = new Date(input.to   as string);
      const accounts = await prisma.account.findMany({
        where: { tenantId, type: { in: ['REVENUE', 'EXPENSE'] as any } },
        include: {
          debitLines: {
            where: { transaction: { date: { gte: from, lte: to }, deletedAt: null } },
            select: { amount: true },
          },
          creditLines: {
            where: { transaction: { date: { gte: from, lte: to }, deletedAt: null } },
            select: { amount: true },
          },
        },
      });
      let revenue = 0, expenses = 0;
      for (const acc of accounts) {
        const debits  = acc.debitLines.reduce((s, l)  => s + Number(l.amount), 0);
        const credits = acc.creditLines.reduce((s, l) => s + Number(l.amount), 0);
        if (acc.type === 'REVENUE') revenue  += credits - debits;
        if (acc.type === 'EXPENSE') expenses += debits  - credits;
      }
      return { from, to, revenue, expenses, netProfit: revenue - expenses };
    }

    case 'get_overdue_invoices': {
      const daysOverdue = (input.daysOverdue as number) ?? 0;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOverdue);
      return prisma.invoice.findMany({
        where: { tenantId, status: { in: ['SENT', 'OVERDUE'] }, dueDate: { lt: cutoff } },
        include: { customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 50,
      });
    }

    case 'get_low_stock_products': {
      const levels = await prisma.stockLevel.findMany({
        where: {
          tenantId,
          ...(input.warehouseId ? { warehouseId: input.warehouseId as string } : {}),
        },
        include: { product: { select: { name: true, sku: true } } },
      });
      return levels
        .filter(l => l.reorderPoint != null && Number(l.quantity) <= Number(l.reorderPoint))
        .map(l => ({
          productId: l.productId,
          name: l.product.name,
          sku:  l.product.sku,
          currentQty:   Number(l.quantity),
          reorderPoint: Number(l.reorderPoint),
          deficit: Number(l.reorderPoint) - Number(l.quantity),
        }));
    }

    case 'get_vendors': {
      const search = input.search as string | undefined;
      const take   = Math.min((input.pageSize as number) ?? 30, 100);
      return prisma.vendor.findMany({
        where: { tenantId, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
        take,
        select: { id: true, name: true, email: true, phone: true, vatNumber: true },
        orderBy: { name: 'asc' },
      });
    }

    case 'get_sales_orders': {
      const take = Math.min((input.pageSize as number) ?? 30, 100);
      return prisma.salesOrder.findMany({
        where: { tenantId, ...(input.status ? { status: input.status as any } : {}) },
        take,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } } },
      });
    }

    case 'get_cash_flow_forecast': {
      const days = (input.days as number) ?? 30;
      const to   = new Date(); to.setDate(to.getDate() + days);
      const [arInvoices, apBills] = await Promise.all([
        prisma.invoice.findMany({
          where: { tenantId, status: { in: ['SENT', 'OVERDUE'] as any }, dueDate: { lte: to } },
          select: { dueDate: true, total: true },
        }),
        prisma.bill.findMany({
          where: { tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] as any }, dueDate: { lte: to } },
          select: { dueDate: true, total: true },
        }),
      ]);
      const arTotal = arInvoices.reduce((s, i) => s + Number(i.total), 0);
      const apTotal = apBills.reduce((s, b) => s + Number(b.total), 0);
      return { days, expectedInflow: arTotal, expectedOutflow: apTotal, netCashFlow: arTotal - apTotal };
    }

    case 'get_hr_summary': {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [totalEmployees, pendingLeaves, activeAttendance] = await Promise.all([
        prisma.employee.count({ where: { tenantId, isActive: true } }),
        prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
        prisma.attendanceLog.count({ where: { tenantId, clockIn: { gte: today }, clockOut: null } }),
      ]);
      return { totalEmployees, pendingLeaves, currentlyInOffice: activeAttendance };
    }

    case 'get_payroll_runs': {
      // period format: "2025-01" (YYYY-MM)
      let periodFilter: string | undefined;
      if (input.year && input.month) {
        periodFilter = `${input.year}-${String(input.month).padStart(2, '0')}`;
      } else if (input.year) {
        periodFilter = String(input.year);
      }
      return prisma.payrollRun.findMany({
        where: {
          tenantId,
          ...(periodFilter ? { period: { startsWith: periodFilter } } : {}),
        },
        orderBy: { period: 'desc' },
        take: 12,
        select: { id: true, period: true, status: true, totalGross: true, totalNet: true, totalTax: true },
      });
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
