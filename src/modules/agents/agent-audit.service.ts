/**
 * Agent Audit Service
 * Runs rule-based completeness and quality checks across all ERP modules.
 */

import { prisma } from '../../config/database';

export type AuditSeverity = 'critical' | 'warning' | 'info';

export interface AuditIssue {
  severity: AuditSeverity;
  description: string;
  count: number;
  path?: string;
}

export interface AuditCategory {
  key: string;
  name: string;
  icon: string;
  status: 'ok' | 'warning' | 'critical';
  issueCount: number;
  issues: AuditIssue[];
  checkedAt: Date;
}

export interface AuditReport {
  tenantId: string;
  generatedAt: Date;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  categories: AuditCategory[];
}

function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d;
}

function categoryStatus(issues: AuditIssue[]): AuditCategory['status'] {
  if (issues.some(i => i.severity === 'critical' && i.count > 0)) return 'critical';
  if (issues.some(i => i.severity === 'warning'  && i.count > 0)) return 'warning';
  return 'ok';
}

// ─── Category Audits ─────────────────────────────────────────────────────────

async function auditCRM(tenantId: string): Promise<AuditCategory> {
  const [noEmail, noPhone, noBusinessId, staleLeads, noInvoice12m] = await Promise.all([
    prisma.customer.count({ where: { tenantId, email: null } }),
    prisma.customer.count({ where: { tenantId, phone: null } }),
    prisma.customer.count({ where: { tenantId, businessId: null } }),
    prisma.customer.count({ where: { tenantId, status: 'LEAD', updatedAt: { lt: daysAgo(90) } } }),
    prisma.customer.count({
      where: { tenantId, status: { not: 'LEAD' }, invoices: { none: { createdAt: { gte: daysAgo(365) } } } },
    }),
  ]);

  const issues: AuditIssue[] = ([
    { severity: 'warning' as const,  description: 'לקוחות ללא כתובת מייל',           count: noEmail,      path: '/crm' },
    { severity: 'info'    as const,  description: 'לקוחות ללא מספר טלפון',           count: noPhone,      path: '/crm' },
    { severity: 'info'    as const,  description: 'לקוחות ללא ח.פ / ת.ז',            count: noBusinessId, path: '/crm' },
    { severity: 'warning' as const,  description: 'לידים ללא עדכון מזה 90 יום',      count: staleLeads,   path: '/crm' },
    { severity: 'info'    as const,  description: 'לקוחות פעילים ללא חשבונית שנה',   count: noInvoice12m, path: '/crm' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'crm', name: 'לקוחות (CRM)', icon: 'Users', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditInvoices(tenantId: string): Promise<AuditCategory> {
  const [overdue, staleDraft, noPaymentTerms, highValueOverdue] = await Promise.all([
    prisma.invoice.count({
      where: { tenantId, status: { in: ['SENT', 'OVERDUE'] as any }, dueDate: { lt: new Date() }, deletedAt: null },
    }),
    prisma.invoice.count({ where: { tenantId, status: 'DRAFT', createdAt: { lt: daysAgo(7) }, deletedAt: null } }),
    prisma.invoice.count({ where: { tenantId, paymentTerms: null, deletedAt: null } }),
    prisma.invoice.count({
      where: { tenantId, status: { in: ['SENT', 'OVERDUE'] as any }, total: { gt: 10000 }, dueDate: { lt: new Date() }, deletedAt: null },
    }),
  ]);

  const issues: AuditIssue[] = ([
    { severity: 'critical' as const, description: 'חשבוניות פגות תוקף (לא שולמו)',           count: overdue,          path: '/invoices' },
    { severity: 'critical' as const, description: 'חשבוניות גדולות (>10,000₪) פגות תוקף',   count: highValueOverdue, path: '/invoices' },
    { severity: 'warning'  as const, description: 'טיוטות חשבוניות ישנות מ-7 ימים',          count: staleDraft,       path: '/invoices' },
    { severity: 'info'     as const, description: 'חשבוניות ללא תנאי תשלום',                 count: noPaymentTerms,   path: '/invoices' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'invoices', name: 'חשבוניות', icon: 'FileText', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditInventory(tenantId: string): Promise<AuditCategory> {
  const [zeroStock, lowStock] = await Promise.all([
    prisma.stockLevel.count({ where: { tenantId, quantity: { lte: 0 } } }),
    prisma.stockLevel.count({
      where: {
        tenantId,
        reorderPoint: { not: null },
        quantity: { gt: 0 },
        // Can't compare two columns in Prisma directly; use raw-ish approach via JS post-filter
      },
    }).then(async () => {
      // Fetch stock levels with reorderPoint set and filter in JS
      const levels = await prisma.stockLevel.findMany({
        where: { tenantId, reorderPoint: { not: null } },
        select: { quantity: true, reorderPoint: true },
        take: 5000,
      });
      return levels.filter(l => Number(l.quantity) < Number(l.reorderPoint)).length;
    }),
  ]);

  const [noBarcode, noCategory, noCostPrice, inactiveWithStock] = await Promise.all([
    prisma.product.count({ where: { tenantId, barcode: null } }),
    prisma.product.count({ where: { tenantId, category: null } }),
    prisma.product.count({ where: { tenantId, costPrice: { lte: 0 } } }),
    prisma.product.count({
      where: { tenantId, isActive: false, stockLevels: { some: { quantity: { gt: 0 } } } },
    }),
  ]);

  const issues: AuditIssue[] = ([
    { severity: 'critical' as const, description: 'מוצרים מתחת לנקודת ההזמנה',             count: lowStock,          path: '/inventory' },
    { severity: 'critical' as const, description: 'מוצרים עם מלאי אפס או שלילי',           count: zeroStock,         path: '/inventory' },
    { severity: 'critical' as const, description: 'מוצרים לא פעילים עם מלאי קיים',         count: inactiveWithStock, path: '/inventory' },
    { severity: 'warning'  as const, description: 'מוצרים ללא ברקוד',                      count: noBarcode,         path: '/inventory' },
    { severity: 'warning'  as const, description: 'מוצרים ללא קטגוריה',                    count: noCategory,        path: '/inventory' },
    { severity: 'warning'  as const, description: 'מוצרים ללא מחיר עלות',                  count: noCostPrice,       path: '/inventory' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'inventory', name: 'מלאי ומוצרים', icon: 'Package', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditAccounting(tenantId: string): Promise<AuditCategory> {
  const [draftTransactions, draftOld, unlinkedInvoices] = await Promise.all([
    prisma.transaction.count({ where: { tenantId, status: 'DRAFT', deletedAt: null } }),
    prisma.transaction.count({ where: { tenantId, status: 'DRAFT', createdAt: { lt: daysAgo(3) }, deletedAt: null } }),
    prisma.invoice.count({
      where: { tenantId, status: { in: ['SENT', 'PAID'] as any }, journalTransactionId: null, deletedAt: null },
    }),
  ]);

  const issues: AuditIssue[] = ([
    { severity: 'critical' as const, description: 'תנועות חשבונאיות בטיוטה (לא נרשמו)',     count: draftTransactions, path: '/accounting' },
    { severity: 'critical' as const, description: 'תנועות ישנות מ-3 ימים עדיין בטיוטה',     count: draftOld,          path: '/accounting' },
    { severity: 'warning'  as const, description: 'חשבוניות שנשלחו ללא רישום בהנה"ח',       count: unlinkedInvoices,  path: '/accounting' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'accounting', name: 'הנהלת חשבונות', icon: 'BookOpen', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditHR(tenantId: string): Promise<AuditCategory> {
  const [noPhone, pendingLeaves, endedStillActive, zeroTaxCredits] = await Promise.all([
    prisma.employee.count({ where: { tenantId, isActive: true, phone: '' } }),
    prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING', createdAt: { lt: daysAgo(5) } } }),
    prisma.employee.count({ where: { tenantId, isActive: true, endDate: { lte: new Date() } } }),
    prisma.employee.count({ where: { tenantId, isActive: true, taxCredits: { lte: 0 } } }),
  ]);

  // Employees without bank account (bankAccount is JSON — check if null)
  const noBankAccount = await prisma.employee.count({
    where: { tenantId, isActive: true, bankAccount: { equals: null as any } },
  }).catch(() => 0);

  const issues: AuditIssue[] = ([
    { severity: 'critical' as const, description: 'עובדים פעילים שתאריך סיום עבר',    count: endedStillActive, path: '/employees' },
    { severity: 'critical' as const, description: 'עובדים ללא פרטי חשבון בנק',        count: noBankAccount,    path: '/employees' },
    { severity: 'warning'  as const, description: 'בקשות חופשה ממתינות מזה +5 ימים',  count: pendingLeaves,    path: '/hr' },
    { severity: 'warning'  as const, description: 'עובדים ללא נקודות זיכוי מס',        count: zeroTaxCredits,   path: '/employees' },
    { severity: 'info'     as const, description: 'עובדים ללא מספר טלפון',             count: noPhone,          path: '/employees' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'hr', name: 'משאבי אנוש', icon: 'Users', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditPayroll(tenantId: string): Promise<AuditCategory> {
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const prevPeriod = today.getMonth() === 0
    ? `${today.getFullYear() - 1}-12`
    : `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;

  const [currentRun, prevRun, approvedUnpaid] = await Promise.all([
    prisma.payrollRun.findFirst({ where: { tenantId, period: currentPeriod } }),
    prisma.payrollRun.findFirst({ where: { tenantId, period: prevPeriod } }),
    prisma.payrollRun.count({ where: { tenantId, status: 'APPROVED', paidAt: null } }),
  ]);

  const issues: AuditIssue[] = [];
  if (today.getDate() >= 15 && !currentRun) {
    issues.push({ severity: 'critical', description: `שכר חודש ${currentPeriod} טרם הופק`, count: 1, path: '/payroll' });
  }
  if (prevRun && prevRun.status === 'DRAFT') {
    issues.push({ severity: 'critical', description: `שכר חודש ${prevPeriod} בטיוטה — לא אושר`, count: 1, path: '/payroll' });
  }
  if (approvedUnpaid > 0) {
    issues.push({ severity: 'warning', description: 'הרצות שכר מאושרות שטרם שולמו', count: approvedUnpaid, path: '/payroll' });
  }

  return { key: 'payroll', name: 'שכר', icon: 'DollarSign', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditAttendance(tenantId: string): Promise<AuditCategory> {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday); yesterdayEnd.setHours(23, 59, 59, 999);

  const missingCheckout = await prisma.attendanceLog.count({
    where: { tenantId, clockIn: { gte: yesterday, lte: yesterdayEnd }, clockOut: null },
  });

  const issues: AuditIssue[] = ([
    { severity: 'warning' as const, description: 'עובדים שלא שכחו לצאת מהשיפט (אתמול)', count: missingCheckout, path: '/attendance' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'attendance', name: 'נוכחות', icon: 'Clock', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditPurchasing(tenantId: string): Promise<AuditCategory> {
  const [overdueBills, noEmail, noVatNumber] = await Promise.all([
    prisma.bill.count({
      where: { tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID'] as any }, dueDate: { lt: new Date() } },
    }),
    prisma.vendor.count({ where: { tenantId, email: null } }),
    prisma.vendor.count({ where: { tenantId, vatNumber: null } }),
  ]);

  const unreceivedPOs = await prisma.purchaseOrder.count({
    where: { tenantId, status: { in: ['APPROVED'] as any }, expectedDate: { lt: daysAgo(30) } },
  }).catch(() => 0);

  const issues: AuditIssue[] = ([
    { severity: 'critical' as const, description: 'חשבוניות ספק פגות תוקף',               count: overdueBills,   path: '/purchasing' },
    { severity: 'warning'  as const, description: 'הזמנות רכש שלא התקבלו מזה 30 יום',    count: unreceivedPOs,  path: '/purchasing' },
    { severity: 'warning'  as const, description: 'ספקים ללא מייל',                       count: noEmail,        path: '/purchasing' },
    { severity: 'info'     as const, description: 'ספקים ללא ח.פ',                        count: noVatNumber,    path: '/purchasing' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'purchasing', name: 'רכש וספקים', icon: 'ShoppingBag', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditRFID(tenantId: string): Promise<AuditCategory> {
  const issues: AuditIssue[] = [];
  try {
    const [lostTags, unassigned, stale] = await Promise.all([
      prisma.rfidTag.count({ where: { tenantId, status: 'LOST' } }),
      prisma.rfidTag.count({ where: { tenantId, productId: null, assetId: null, employeeId: null } }),
      prisma.rfidTag.count({ where: { tenantId, status: 'ACTIVE', lastSeenAt: { lt: daysAgo(7) } } }),
    ]);
    if (lostTags > 0)    issues.push({ severity: 'critical', description: 'תגיות RFID מסומנות כאבודות',       count: lostTags,   path: '/rfid' });
    if (unassigned > 0)  issues.push({ severity: 'warning',  description: 'תגיות RFID לא מוקצות לפריט/נכס', count: unassigned, path: '/rfid' });
    if (stale > 0)       issues.push({ severity: 'warning',  description: 'תגיות RFID לא נראו מזה 7 ימים',  count: stale,      path: '/rfid' });
  } catch {
    // RFID module might not have data yet — ok to skip
  }

  return { key: 'rfid', name: 'RFID', icon: 'Radio', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

async function auditCRM2(tenantId: string): Promise<AuditCategory> {
  // CRM activities and deals
  const [staleDeal, noActivity90d] = await Promise.all([
    prisma.deal.count({ where: { tenantId, stage: { not: 'CLOSED_WON' }, updatedAt: { lt: daysAgo(60) } } }).catch(() => 0),
    prisma.customer.count({
      where: {
        tenantId,
        status: { not: 'LEAD' },
        activities: { none: { createdAt: { gte: daysAgo(90) } } },
      },
    }).catch(() => 0),
  ]);

  const issues: AuditIssue[] = ([
    { severity: 'warning' as const, description: 'עסקאות ללא עדכון מזה 60 יום',          count: staleDeal,     path: '/crm' },
    { severity: 'info'    as const, description: 'לקוחות ללא פעילות מזה 90 יום',          count: noActivity90d, path: '/crm' },
  ] as AuditIssue[]).filter(i => i.count > 0);

  return { key: 'crm_activity', name: 'פעילות CRM', icon: 'Activity', status: categoryStatus(issues), issueCount: issues.length, issues, checkedAt: new Date() };
}

// ─── Main Audit Runner ────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, (t: string) => Promise<AuditCategory>> = {
  crm:        auditCRM,
  invoices:   auditInvoices,
  inventory:  auditInventory,
  accounting: auditAccounting,
  hr:         auditHR,
  payroll:    auditPayroll,
  attendance: auditAttendance,
  purchasing: auditPurchasing,
  rfid:       auditRFID,
  crm_activity: auditCRM2,
};

export async function runFullAudit(tenantId: string): Promise<AuditReport> {
  const categories = await Promise.all(
    Object.values(CATEGORY_MAP).map(fn => fn(tenantId))
  );

  const allIssues     = categories.flatMap(c => c.issues);
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const warningCount  = allIssues.filter(i => i.severity === 'warning').length;

  // Sort: critical first, then warning, then ok
  categories.sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  return { tenantId, generatedAt: new Date(), totalIssues: allIssues.length, criticalCount, warningCount, categories };
}

export async function runCategoryAudit(tenantId: string, category: string): Promise<AuditCategory> {
  const fn = CATEGORY_MAP[category];
  if (!fn) throw new Error(`Unknown audit category: ${category}`);
  return fn(tenantId);
}
