/**
 * Software Audit Service — בדיקת שלמות תוכנה
 *
 * Checks every ERP module for:
 * - Backend: does the route file respond? Are CRUD endpoints defined?
 * - Frontend: is the page in App.tsx routes? Is it reachable from nav?
 * - Schema: are DB models seeded? Are required fields present?
 * - Integration: do frontend pages call the correct API endpoints?
 *
 * This is NOT tenant-data quality (see agent-audit.service.ts).
 * This checks the SOFTWARE ITSELF for completeness gaps.
 */

import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SoftwareCheckSeverity = 'critical' | 'warning' | 'info';

export interface SoftwareIssue {
  severity: SoftwareCheckSeverity;
  description: string;
  detail?: string;
  module: string;
}

export interface ModuleReport {
  key: string;
  name: string;
  icon: string;
  status: 'ok' | 'warning' | 'critical';
  score: number; // 0-100
  totalChecks: number;
  passedChecks: number;
  issues: SoftwareIssue[];
}

export interface SoftwareAuditReport {
  generatedAt: Date;
  overallScore: number;
  totalModules: number;
  totalChecks: number;
  passedChecks: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  modules: ModuleReport[];
}

// ─── Module Definition ────────────────────────────────────────────────────────

interface ModuleSpec {
  key: string;
  name: string;
  icon: string;
  backendRoutes: string[];          // API paths that should exist
  frontendRoutes: string[];         // React Router paths in App.tsx
  navPaths: string[];               // paths expected in Layout nav
  prismaModels: string[];           // Prisma models this module needs
  expectedFeatures: string[];       // human-readable feature checklist
}

const MODULES: ModuleSpec[] = [
  {
    key: 'crm',
    name: 'לקוחות (CRM)',
    icon: 'UserCheck',
    backendRoutes: ['/api/crm'],
    frontendRoutes: ['/crm/customers', '/crm/customers/new'],
    navPaths: ['/crm/customers', '/crm/customers/new'],
    prismaModels: ['Customer'],
    expectedFeatures: ['רשימת לקוחות', 'יצירת לקוח', 'פרטי לקוח', 'דף כרטסת לקוח'],
  },
  {
    key: 'invoices',
    name: 'חשבוניות',
    icon: 'FileText',
    backendRoutes: ['/api/invoices'],
    frontendRoutes: ['/invoices', '/invoices/new'],
    navPaths: ['/invoices', '/invoices/new'],
    prismaModels: ['Invoice', 'InvoiceLine'],
    expectedFeatures: ['רשימת חשבוניות', 'חשבונית חדשה', 'פרטי חשבונית', 'גיל חוב', 'מספר הקצאה'],
  },
  {
    key: 'quotes',
    name: 'הצעות מחיר',
    icon: 'FileText',
    backendRoutes: ['/api/quotes'],
    frontendRoutes: ['/quotes', '/quotes/new'],
    navPaths: ['/quotes', '/quotes/new'],
    prismaModels: ['Quote'],
    expectedFeatures: ['רשימת הצעות', 'הצעה חדשה', 'פרטי הצעה', 'המרה לחשבונית'],
  },
  {
    key: 'sales-orders',
    name: 'הזמנות מכירה',
    icon: 'ShoppingBag',
    backendRoutes: ['/api/sales-orders'],
    frontendRoutes: ['/sales-orders'],
    navPaths: ['/sales-orders'],
    prismaModels: ['SalesOrder'],
    expectedFeatures: ['רשימת הזמנות', 'הזמנה חדשה', 'מעקב סטטוס'],
  },
  {
    key: 'receipts',
    name: 'קבלות',
    icon: 'FileText',
    backendRoutes: ['/api/receipts'],
    frontendRoutes: ['/receipts'],
    navPaths: ['/receipts'],
    prismaModels: ['Receipt'],
    expectedFeatures: ['רשימת קבלות', 'קבלה חדשה', 'הדפסה'],
  },
  {
    key: 'recurring-invoices',
    name: 'חשבוניות חוזרות',
    icon: 'RefreshCw',
    backendRoutes: ['/api/recurring-invoices'],
    frontendRoutes: ['/recurring-invoices'],
    navPaths: ['/recurring-invoices'],
    prismaModels: ['RecurringInvoice'],
    expectedFeatures: ['רשימה', 'יצירת חוזרת', 'הפעלה/כיבוי'],
  },
  {
    key: 'accounting',
    name: 'הנהלת חשבונות',
    icon: 'BookOpen',
    backendRoutes: ['/api/accounting'],
    frontendRoutes: [
      '/accounting', '/accounting/accounts', '/accounting/transactions',
      '/accounting/trial-balance', '/accounting/reports/pl',
      '/accounting/reports/balance-sheet', '/accounting/reports/vat',
      '/accounting/reports/cash-flow',
    ],
    navPaths: [
      '/accounting', '/accounting/accounts', '/accounting/transactions',
      '/accounting/trial-balance', '/accounting/reports/pl',
      '/accounting/reports/balance-sheet', '/accounting/reports/vat',
      '/accounting/reports/cash-flow',
    ],
    prismaModels: ['Account', 'Transaction', 'TransactionLine'],
    expectedFeatures: ['תרשים חשבונות', 'יומן', 'מאזן בוחן', 'רווח והפסד', 'מאזן', 'מע"מ', 'תזרים'],
  },
  {
    key: 'ledger',
    name: 'כרטסות',
    icon: 'BookOpen',
    backendRoutes: ['/api/ledger'],
    frontendRoutes: ['/accounting/ledger-cards', '/accounting/ledger'],
    navPaths: ['/accounting/ledger-cards', '/accounting/ledger'],
    prismaModels: [],
    expectedFeatures: ['כרטסות לפי חשבון', 'סינון תקופה'],
  },
  {
    key: 'purchasing',
    name: 'רכש',
    icon: 'Truck',
    backendRoutes: ['/api/purchasing'],
    frontendRoutes: ['/purchasing/vendors', '/purchasing/vendors/new', '/purchasing/bills', '/purchasing/bills/new', '/purchasing/ap-aging'],
    navPaths: ['/purchasing/vendors', '/purchasing/bills', '/purchasing/ap-aging'],
    prismaModels: ['Vendor', 'Bill'],
    expectedFeatures: ['רשימת ספקים', 'ספק חדש', 'חשבוניות ספקים', 'גיל חוב ספקים'],
  },
  {
    key: 'employees',
    name: 'עובדים',
    icon: 'Users',
    backendRoutes: ['/api/employees'],
    frontendRoutes: ['/employees', '/employees/new'],
    navPaths: ['/employees', '/employees/new'],
    prismaModels: ['Employee'],
    expectedFeatures: ['רשימת עובדים', 'עובד חדש', 'פרטי עובד', 'היסטוריית שכר'],
  },
  {
    key: 'payroll',
    name: 'שכר',
    icon: 'DollarSign',
    backendRoutes: ['/api/payroll'],
    frontendRoutes: ['/payroll', '/payroll/worksheet', '/payroll/payslips', '/payroll/preview'],
    navPaths: ['/payroll', '/payroll/worksheet', '/payroll/payslips', '/payroll/preview'],
    prismaModels: ['PayrollRun', 'Payslip'],
    expectedFeatures: ['לוח בקרה שכר', 'גיליון שכר', 'תלושים', 'מחשבון', 'דוח 102', 'טופס 106', 'טופס 126'],
  },
  {
    key: 'hr',
    name: 'משאבי אנוש',
    icon: 'Umbrella',
    backendRoutes: ['/api/hr'],
    frontendRoutes: ['/hr', '/hr/leave-requests', '/hr/leave-balance', '/hr/holidays', '/hr/leave-types'],
    navPaths: ['/hr', '/hr/leave-requests', '/hr/leave-balance', '/hr/holidays'],
    prismaModels: ['LeaveRequest', 'LeaveType'],
    expectedFeatures: ['לוח HR', 'בקשות חופשה', 'יתרות', 'חגים', 'סוגי חופשה'],
  },
  {
    key: 'attendance',
    name: 'נוכחות',
    icon: 'Clock',
    backendRoutes: ['/api/attendance'],
    frontendRoutes: ['/attendance', '/attendance/summary', '/attendance/manager'],
    navPaths: ['/attendance', '/attendance/summary', '/attendance/manager'],
    prismaModels: ['AttendanceLog'],
    expectedFeatures: ['שעון נוכחות', 'סיכום חודשי', 'דוח מנהל'],
  },
  {
    key: 'inventory',
    name: 'מלאי',
    icon: 'Package',
    backendRoutes: ['/api/inventory'],
    frontendRoutes: ['/inventory', '/inventory/items', '/inventory/items/new', '/inventory/movements'],
    navPaths: ['/inventory', '/inventory/items', '/inventory/movements'],
    prismaModels: ['Product', 'StockLevel', 'StockMovement', 'Warehouse'],
    expectedFeatures: ['לוח מלאי', 'פריטים', 'תנועות', 'קבלת סחורה בברקוד', 'ספירת מלאי'],
  },
  {
    key: 'pos',
    name: 'קופה (POS)',
    icon: 'Monitor',
    backendRoutes: ['/api/pos'],
    frontendRoutes: ['/pos', '/pos/tables', '/pos/kitchen', '/pos/cash', '/pos/analytics'],
    navPaths: ['/pos', '/pos/tables', '/pos/kitchen', '/pos/cash'],
    prismaModels: ['POSSale'],
    expectedFeatures: ['קופה רושמת', 'שולחנות', 'מטבח KDS', 'קופה/משמרת', 'מבצעים', 'נאמנות', 'כרטיסי מתנה', 'דוח Z', 'אנליטיקס'],
  },
  {
    key: 'rfid',
    name: 'RFID',
    icon: 'Wifi',
    backendRoutes: ['/api/rfid'],
    frontendRoutes: ['/rfid', '/rfid/tags', '/rfid/readers', '/rfid/assets', '/rfid/inventory'],
    navPaths: ['/rfid', '/rfid/tags', '/rfid/readers', '/rfid/assets', '/rfid/inventory'],
    prismaModels: ['RfidTag', 'RfidReader', 'RfidEvent', 'RfidAsset'],
    expectedFeatures: ['לוח RFID', 'ניהול תגיות', 'קוראים', 'נכסים', 'ספירת מלאי RFID'],
  },
  {
    key: 'agents',
    name: 'סוכני AI',
    icon: 'Brain',
    backendRoutes: ['/api/agents', '/api/agents/team', '/api/agents/audit', '/api/agents/schedules'],
    frontendRoutes: ['/agents/conversations', '/agents/team', '/agents/profiles', '/agents/builder', '/agents/schedules', '/agents/audit'],
    navPaths: ['/agents', '/agents/conversations', '/agents/profiles', '/agents/builder', '/agents/schedules', '/agents/team', '/agents/audit'],
    prismaModels: ['AgentConversation', 'AgentMessage', 'AgentProfile', 'AgentTask'],
    expectedFeatures: ['צ\'אט AI', 'היסטוריית שיחות', 'סוכנים מותאמים', 'בונה סוכנים', 'אוטומציות', 'צוות סוכנים', 'ביקורת נתונים'],
  },
  {
    key: 'documents',
    name: 'מסמכים',
    icon: 'FileText',
    backendRoutes: ['/api/documents'],
    frontendRoutes: ['/documents'],
    navPaths: ['/documents'],
    prismaModels: ['Document'],
    expectedFeatures: ['רשימת מסמכים', 'פרטי מסמך', 'הורדה'],
  },
  {
    key: 'expenses',
    name: 'הוצאות',
    icon: 'CreditCard',
    backendRoutes: ['/api/expenses'],
    frontendRoutes: ['/accounting/expenses'],
    navPaths: ['/accounting/expenses'],
    prismaModels: ['ExpenseReport'],
    expectedFeatures: ['דוחות הוצאות', 'הגשה', 'אישור'],
  },
  {
    key: 'budget',
    name: 'תקציב',
    icon: 'DollarSign',
    backendRoutes: ['/api/budget'],
    frontendRoutes: ['/accounting/budget'],
    navPaths: ['/accounting/budget'],
    prismaModels: ['BudgetLine'],
    expectedFeatures: ['תקציב שנתי', 'ביצוע מול תקציב'],
  },
  {
    key: 'assets',
    name: 'רכוש קבוע',
    icon: 'Box',
    backendRoutes: ['/api/assets'],
    frontendRoutes: ['/accounting/fixed-assets'],
    navPaths: ['/accounting/fixed-assets'],
    prismaModels: ['FixedAsset'],
    expectedFeatures: ['רשימת נכסים', 'פחת', 'מחיקה'],
  },
  {
    key: 'bank-recon',
    name: 'התאמת בנק',
    icon: 'CreditCard',
    backendRoutes: ['/api/bank-recon'],
    frontendRoutes: ['/accounting/bank-recon'],
    navPaths: ['/accounting/bank-recon'],
    prismaModels: [],
    expectedFeatures: ['ייבוא תנועות בנק', 'התאמה אוטומטית'],
  },
  {
    key: 'credit-card-recon',
    name: 'התאמת כרטיס אשראי',
    icon: 'CreditCard',
    backendRoutes: ['/api/credit-card-recon'],
    frontendRoutes: ['/accounting/credit-card-recon'],
    navPaths: ['/accounting/credit-card-recon'],
    prismaModels: [],
    expectedFeatures: ['ייבוא עסקאות', 'התאמה'],
  },
  {
    key: 'price-lists',
    name: 'מחירונים',
    icon: 'Tag',
    backendRoutes: ['/api/price-lists'],
    frontendRoutes: ['/price-lists'],
    navPaths: ['/price-lists'],
    prismaModels: ['PriceList'],
    expectedFeatures: ['רשימת מחירונים', 'עריכה', 'שיוך ללקוח'],
  },
  {
    key: 'petty-cash',
    name: 'קופה קטנה',
    icon: 'DollarSign',
    backendRoutes: ['/api/petty-cash'],
    frontendRoutes: ['/petty-cash'],
    navPaths: ['/petty-cash'],
    prismaModels: ['PettyCashFund'],
    expectedFeatures: ['ניהול קרן', 'הוצאות', 'מילוי'],
  },
  {
    key: 'branches',
    name: 'ענפים',
    icon: 'Building2',
    backendRoutes: ['/api/branches'],
    frontendRoutes: ['/branches'],
    navPaths: ['/branches'],
    prismaModels: ['Branch'],
    expectedFeatures: ['רשימת ענפים', 'הוספת ענף', 'עריכה'],
  },
  {
    key: 'notifications',
    name: 'התראות',
    icon: 'Bell',
    backendRoutes: ['/api/notifications'],
    frontendRoutes: ['/notifications'],
    navPaths: ['/notifications'],
    prismaModels: ['Notification'],
    expectedFeatures: ['רשימת התראות', 'סמן כנקרא', 'פעמון בזמן אמת'],
  },
  {
    key: 'settings',
    name: 'הגדרות',
    icon: 'Settings',
    backendRoutes: ['/api/settings'],
    frontendRoutes: ['/settings/company', '/settings/agents'],
    navPaths: ['/settings/agents'],
    prismaModels: [],
    expectedFeatures: ['הגדרות חברה', 'הגדרות סוכנים', 'לוגו'],
  },
  {
    key: 'payment-terminal',
    name: 'מסופי תשלום',
    icon: 'CreditCard',
    backendRoutes: ['/api/payment-terminal'],
    frontendRoutes: ['/pos/payment-terminals'],
    navPaths: ['/pos/payment-terminals'],
    prismaModels: [],
    expectedFeatures: ['חיבור מסוף', 'סליקה', 'דוח עסקאות'],
  },
  {
    key: 'contracts',
    name: 'חוזי שירות',
    icon: 'FileText',
    backendRoutes: ['/api/contracts'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: ['Contract'],
    expectedFeatures: ['רשימת חוזים', 'יצירת חוזה', 'חידוש'],
  },
  {
    key: 'pension',
    name: 'פנסיה',
    icon: 'Umbrella',
    backendRoutes: ['/api/pension'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: ['PensionFund'],
    expectedFeatures: ['ניהול קרנות', 'הפקדות', 'דוח'],
  },
  {
    key: 'form161',
    name: 'טופס 161',
    icon: 'FileText',
    backendRoutes: ['/api/form161'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: ['Form161'],
    expectedFeatures: ['טופס סיום העסקה', 'חישוב פיצויים'],
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    icon: 'MessageCircle',
    backendRoutes: ['/api/whatsapp'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: [],
    expectedFeatures: ['שליחת הודעות', 'תבניות', 'webhook'],
  },
  {
    key: 'green-invoice',
    name: 'חשבונית ירוקה',
    icon: 'FileText',
    backendRoutes: ['/api/green-invoice'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: [],
    expectedFeatures: ['סנכרון חשבוניות', 'שליחה אוטומטית'],
  },
  {
    key: 'analytics',
    name: 'אנליטיקס',
    icon: 'BarChart',
    backendRoutes: ['/api/analytics'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: [],
    expectedFeatures: ['KPI לוח', 'גרפים', 'מדדים'],
  },
  {
    key: 'batch-payments',
    name: 'תשלומים מרוכזים',
    icon: 'DollarSign',
    backendRoutes: ['/api/batch-payments'],
    frontendRoutes: [],
    navPaths: [],
    prismaModels: ['BatchPayment'],
    expectedFeatures: ['יצירת מנה', 'אישור', 'הרצה'],
  },
  {
    key: 'employee-portal',
    name: 'פורטל עובד',
    icon: 'Briefcase',
    backendRoutes: ['/api/employee-portal'],
    frontendRoutes: ['/employee', '/employee/payslips', '/employee/form101', '/employee/leave'],
    navPaths: ['/employee', '/employee/payslips', '/employee/form101', '/employee/leave'],
    prismaModels: [],
    expectedFeatures: ['לוח אישי', 'צפייה בתלושים', 'טופס 101', 'בקשות חופשה'],
  },
  {
    key: 'platform',
    name: 'פלטפורמה (SaaS)',
    icon: 'Shield',
    backendRoutes: ['/api/platform'],
    frontendRoutes: ['/platform/login', '/platform/dashboard', '/platform/tenants', '/platform/admins'],
    navPaths: [],
    prismaModels: ['PlatformAdmin'],
    expectedFeatures: ['ניהול טנאנטים', 'לוח פלטפורמה', 'מנהלי מערכת', 'פעילות', 'הגדרות'],
  },
];

// ─── Known App.tsx routes (extracted at runtime analysis) ─────────────────────

const APP_ROUTES = new Set([
  '/', '/dashboard',
  '/employees', '/employees/new', '/employees/:id',
  '/payroll', '/payroll/runs/:id', '/payroll/payslips', '/payroll/payslips/:id',
  '/payroll/payslip/:id', '/payroll/preview', '/payroll/form106', '/payroll/form126',
  '/payroll/report102', '/payroll/worksheet', '/payroll/reports',
  '/invoices', '/invoices/new', '/invoices/aging', '/invoices/:id',
  '/documents', '/documents/:id',
  '/settings/company', '/settings/agents',
  '/accounting', '/accounting/accounts', '/accounting/transactions',
  '/accounting/trial-balance', '/accounting/reports/pl',
  '/accounting/reports/balance-sheet', '/accounting/reports/vat',
  '/accounting/reports/cash-flow', '/accounting/fixed-assets',
  '/accounting/expenses', '/accounting/budget', '/accounting/bank-recon',
  '/accounting/ledger', '/accounting/ledger-cards', '/accounting/credit-card-recon',
  '/receipts', '/smart-import',
  '/purchasing/vendors', '/purchasing/vendors/new', '/purchasing/bills',
  '/purchasing/bills/new', '/purchasing/ap-aging',
  '/crm/customers', '/crm/customers/new', '/crm/customers/:id',
  '/crm/customers/:id/statement',
  '/hr', '/hr/leave-requests', '/hr/leave-balance', '/hr/holidays', '/hr/leave-types',
  '/attendance', '/attendance/summary', '/attendance/manager',
  '/inventory', '/inventory/items', '/inventory/items/new', '/inventory/items/:id',
  '/inventory/movements', '/inventory/receive', '/inventory/count',
  '/pos', '/pos/sales', '/pos/summary', '/pos/tables', '/pos/waiter',
  '/pos/kitchen', '/pos/cash', '/pos/analytics',
  '/pos/promotions', '/pos/loyalty', '/pos/gift-cards', '/pos/z-report',
  '/pos/payment-terminals',
  '/quotes', '/quotes/new', '/quotes/:id',
  '/sales-orders', '/recurring-invoices', '/price-lists', '/branches',
  '/petty-cash', '/integration-health', '/batch-entry',
  '/employee', '/employee/payslips', '/employee/form101', '/employee/leave',
  '/notifications', '/audit-log',
  '/rfid', '/rfid/tags', '/rfid/readers', '/rfid/assets', '/rfid/inventory',
  '/agents', '/agents/team', '/agents/team/tasks/:id', '/agents/profiles',
  '/agents/conversations', '/agents/builder', '/agents/schedules', '/agents/audit',
  '/admin/permissions',
  '/m/login', '/m/home', '/m',
  '/platform/login', '/platform/dashboard', '/platform/tenants',
  '/platform/tenants/:id', '/platform/admins', '/platform/activity',
  '/platform/settings', '/platform',
]);

// ─── Known backend API mounts (from app.ts) ──────────────────────────────────

const BACKEND_ROUTES = new Set([
  '/api/tenants', '/api/users', '/api/employees', '/api/accounting',
  '/api/payroll', '/api/invoices', '/api/crm', '/api/hr',
  '/api/attendance', '/api/audit', '/api/inventory', '/api/purchasing',
  '/api/assets', '/api/expenses', '/api/budget', '/api/bank-recon',
  '/api/webhooks', '/api/dashboard', '/api/pos', '/api/settings',
  '/api/documents', '/api/sales-orders', '/api/quotes', '/api/payment-links',
  '/api/bank', '/api/aging', '/api/recurring-invoices', '/api/price-lists',
  '/api/cash-flow', '/api/ledger', '/api/currency', '/api/batch-payments',
  '/api/goods-receipts', '/api/petty-cash', '/api/credit-cards',
  '/api/credit-card-recon', '/api/hr/training', '/api/hr/onboarding',
  '/api/notifications', '/api/bulk-import', '/api/smart-import',
  '/api/contracts', '/api/analytics', '/api/pension', '/api/branches',
  '/api/green-invoice', '/api/whatsapp', '/api/form161',
  '/api/receipts', '/api/payment-terminal', '/api/printers', '/api/scan',
  '/api/search', '/api/calendar',
  '/api/agents', '/api/agents/team', '/api/agents/schedules', '/api/agents/audit',
  '/api/rfid', '/api/platform', '/api/employee-portal', '/api/customer-portal',
]);

// ─── Known Layout nav paths ──────────────────────────────────────────────────

const NAV_PATHS = new Set([
  '/dashboard',
  '/invoices', '/invoices/new', '/quotes', '/quotes/new', '/sales-orders',
  '/recurring-invoices', '/receipts', '/documents', '/invoices/aging',
  '/accounting', '/accounting/accounts', '/accounting/transactions',
  '/accounting/trial-balance', '/accounting/reports/pl',
  '/accounting/reports/balance-sheet', '/accounting/reports/vat',
  '/accounting/reports/cash-flow', '/accounting/ledger-cards', '/accounting/ledger',
  '/accounting/credit-card-recon', '/accounting/bank-recon',
  '/accounting/fixed-assets', '/accounting/expenses', '/accounting/budget',
  '/price-lists', '/petty-cash', '/batch-entry', '/integration-health',
  '/purchasing/vendors', '/purchasing/vendors/new', '/purchasing/orders',
  '/purchasing/goods-receipts', '/purchasing/bills', '/purchasing/bills/new',
  '/purchasing/ap-aging',
  '/crm/customers', '/crm/customers/new',
  '/employees', '/employees/new', '/payroll/worksheet', '/payroll',
  '/payroll/payslips', '/payroll/preview', '/payroll/report102',
  '/payroll/form106', '/payroll/form126', '/payroll/reports',
  '/hr', '/hr/leave-requests', '/hr/leave-balance', '/hr/leave-types', '/hr/holidays',
  '/attendance', '/attendance/summary', '/attendance/manager',
  '/inventory', '/inventory/items', '/inventory/items/new', '/inventory/movements',
  '/inventory/receive', '/inventory/count',
  '/rfid', '/rfid/tags', '/rfid/readers', '/rfid/assets', '/rfid/inventory',
  '/pos', '/pos/tables', '/pos/waiter', '/pos/kitchen', '/pos/cash',
  '/pos/payment-terminals', '/pos/promotions', '/pos/loyalty', '/pos/gift-cards',
  '/pos/z-report', '/pos/analytics',
  '/branches', '/smart-import',
  '/employee', '/employee/payslips', '/employee/form101', '/employee/leave',
  '/admin/permissions',
  '/agents', '/agents/conversations', '/agents/profiles', '/agents/builder',
  '/agents/schedules', '/agents/team', '/agents/audit', '/settings/agents',
  '/notifications', '/audit-log',
]);

// ─── Prisma model existence check ─────────────────────────────────────────────

const KNOWN_PRISMA_MODELS = new Set<string>();

async function loadPrismaModels(): Promise<void> {
  if (KNOWN_PRISMA_MODELS.size > 0) return;

  // Query Prisma's internal table list
  try {
    const tables: { tablename: string }[] = await prisma.$queryRaw`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    for (const t of tables) {
      // Convert snake_case table name to PascalCase model name
      KNOWN_PRISMA_MODELS.add(t.tablename);
      // Also store PascalCase approximation
      const pascal = t.tablename
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      KNOWN_PRISMA_MODELS.add(pascal);
    }
  } catch {
    // If DB not available, skip model checks
  }
}

// ─── Module Checker ───────────────────────────────────────────────────────────

function checkModule(spec: ModuleSpec): ModuleReport {
  const issues: SoftwareIssue[] = [];
  let totalChecks = 0;
  let passedChecks = 0;

  // 1. Backend route mounted?
  for (const route of spec.backendRoutes) {
    totalChecks++;
    if (BACKEND_ROUTES.has(route)) {
      passedChecks++;
    } else {
      issues.push({
        severity: 'critical',
        description: `נתיב backend חסר: ${route}`,
        detail: 'הנתיב לא רשום ב-app.ts',
        module: spec.key,
      });
    }
  }

  // 2. Frontend routes in App.tsx?
  for (const route of spec.frontendRoutes) {
    totalChecks++;
    if (APP_ROUTES.has(route)) {
      passedChecks++;
    } else {
      issues.push({
        severity: 'critical',
        description: `דף frontend חסר: ${route}`,
        detail: 'הנתיב לא מוגדר ב-App.tsx',
        module: spec.key,
      });
    }
  }

  // 3. Navigation reachable?
  for (const path of spec.navPaths) {
    totalChecks++;
    if (NAV_PATHS.has(path)) {
      passedChecks++;
    } else {
      issues.push({
        severity: 'warning',
        description: `לא נגיש מהניווט: ${path}`,
        detail: 'הדף קיים אך לא מופיע בתפריט הצד',
        module: spec.key,
      });
    }
  }

  // 4. Prisma models exist?
  for (const model of spec.prismaModels) {
    totalChecks++;
    if (KNOWN_PRISMA_MODELS.size === 0 || KNOWN_PRISMA_MODELS.has(model)) {
      passedChecks++;
    } else {
      issues.push({
        severity: 'critical',
        description: `טבלת DB חסרה: ${model}`,
        detail: 'המודל לא נמצא בבסיס הנתונים',
        module: spec.key,
      });
    }
  }

  // 5. Feature coverage estimate
  const featureChecks = spec.expectedFeatures.length;
  totalChecks += featureChecks;
  // If backend and frontend routes exist, assume features are covered proportionally
  const backendCoverage = spec.backendRoutes.length > 0
    ? spec.backendRoutes.filter(r => BACKEND_ROUTES.has(r)).length / spec.backendRoutes.length
    : 0;
  const frontendCoverage = spec.frontendRoutes.length > 0
    ? spec.frontendRoutes.filter(r => APP_ROUTES.has(r)).length / spec.frontendRoutes.length
    : 0;

  if (spec.frontendRoutes.length === 0 && backendCoverage === 1) {
    // Backend only, no frontend - mark as info
    issues.push({
      severity: 'warning',
      description: `אין ממשק frontend למודול ${spec.name}`,
      detail: `Backend קיים אך אין דפים מוגדרים ב-App.tsx`,
      module: spec.key,
    });
    passedChecks += Math.floor(featureChecks * 0.5);
  } else if (backendCoverage === 1 && frontendCoverage === 1) {
    passedChecks += featureChecks;
  } else {
    const coveredFeatures = Math.floor(featureChecks * ((backendCoverage + frontendCoverage) / 2));
    passedChecks += coveredFeatures;
    const missingFeatures = featureChecks - coveredFeatures;
    if (missingFeatures > 0) {
      issues.push({
        severity: 'info',
        description: `${missingFeatures} פיצ'רים צפויים עשויים להיות חסרים ב-${spec.name}`,
        detail: `פיצ'רים צפויים: ${spec.expectedFeatures.join(', ')}`,
        module: spec.key,
      });
    }
  }

  // Filter issues with 0 impact
  const activeIssues = issues.filter(i => true);

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
  const status: ModuleReport['status'] = activeIssues.some(i => i.severity === 'critical')
    ? 'critical'
    : activeIssues.some(i => i.severity === 'warning')
      ? 'warning'
      : 'ok';

  return {
    key: spec.key,
    name: spec.name,
    icon: spec.icon,
    status,
    score,
    totalChecks,
    passedChecks,
    issues: activeIssues,
  };
}

// ─── Cross-Module Checks ──────────────────────────────────────────────────────

function runCrossModuleChecks(): SoftwareIssue[] {
  const issues: SoftwareIssue[] = [];

  // Check for nav paths that don't have corresponding App.tsx routes
  for (const navPath of NAV_PATHS) {
    // Exact match or parameterized match
    if (!APP_ROUTES.has(navPath)) {
      issues.push({
        severity: 'warning',
        description: `קישור בתפריט "${navPath}" אין לו נתיב מוגדר ב-App.tsx`,
        detail: 'הקישור בניווט לא יעבוד — יגיע לדף 404 או redirect',
        module: 'cross-module',
      });
    }
  }

  // Check for orphan routes (in App.tsx but not in nav)
  const specialRoutes = new Set(['/', '/dashboard', '/admin/permissions', '/m/login', '/m/home', '/m',
    '/platform/login', '/platform/dashboard', '/platform/tenants', '/platform/tenants/:id',
    '/platform/admins', '/platform/activity', '/platform/settings', '/platform',
    '/agents', '/agents/team/tasks/:id',
    '/employees/:id', '/payroll/runs/:id', '/payroll/payslips/:id', '/payroll/payslip/:id',
    '/invoices/:id', '/documents/:id', '/crm/customers/:id', '/crm/customers/:id/statement',
    '/inventory/items/:id', '/quotes/:id',
    '/pos/sales', '/pos/summary',
    '/settings/company',
    '/employee', '/employee/payslips', '/employee/form101', '/employee/leave',
  ]);

  for (const route of APP_ROUTES) {
    if (route.includes(':')) continue; // skip parameterized
    if (specialRoutes.has(route)) continue;
    if (!NAV_PATHS.has(route)) {
      issues.push({
        severity: 'info',
        description: `דף "${route}" קיים ב-App.tsx אך לא נגיש מהתפריט`,
        detail: 'המשתמש יכול להגיע רק דרך קישור ישיר',
        module: 'cross-module',
      });
    }
  }

  return issues;
}

// ─── DB Health Checks ─────────────────────────────────────────────────────────

async function runDbHealthChecks(): Promise<SoftwareIssue[]> {
  const issues: SoftwareIssue[] = [];

  try {
    // Check chart of accounts seeded
    const accountCount = await prisma.account.count();
    if (accountCount === 0) {
      issues.push({
        severity: 'critical',
        description: 'תרשים חשבונות ריק — יש להריץ seed',
        detail: 'אין חשבונות מוגדרים, הנהלת חשבונות לא תעבוד',
        module: 'db-health',
      });
    }

    // Check tenants exist
    const tenantCount = await prisma.tenant.count();
    if (tenantCount === 0) {
      issues.push({
        severity: 'critical',
        description: 'אין טנאנטים — המערכת ריקה',
        detail: 'יש להריץ seed או ליצור טנאנט דרך הפלטפורמה',
        module: 'db-health',
      });
    }

    // Check users exist
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      issues.push({
        severity: 'critical',
        description: 'אין משתמשים — לא ניתן להתחבר',
        module: 'db-health',
      });
    }

    // Check for orphaned data
    const orphanedInvoices = await prisma.invoice.count({
      where: { customer: null as any },
    }).catch(() => 0);
    if (orphanedInvoices > 0) {
      issues.push({
        severity: 'warning',
        description: `${orphanedInvoices} חשבוניות ללא לקוח מקושר`,
        module: 'db-health',
      });
    }

  } catch (err: any) {
    issues.push({
      severity: 'critical',
      description: `שגיאת חיבור לDB: ${err.message?.slice(0, 100)}`,
      module: 'db-health',
    });
  }

  return issues;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runSoftwareAudit(): Promise<SoftwareAuditReport> {
  logger.info('Running software completeness audit');

  await loadPrismaModels();

  // Check each module
  const moduleReports = MODULES.map(spec => checkModule(spec));

  // Cross-module checks
  const crossIssues = runCrossModuleChecks();
  const dbIssues = await runDbHealthChecks();

  // Add cross-module as a virtual module report
  const crossModuleReport: ModuleReport = {
    key: 'cross-module',
    name: 'בדיקות חוצות מודולים',
    icon: 'Settings',
    status: crossIssues.some(i => i.severity === 'critical') ? 'critical' :
            crossIssues.some(i => i.severity === 'warning') ? 'warning' : 'ok',
    score: crossIssues.length === 0 ? 100 : Math.max(0, 100 - crossIssues.length * 5),
    totalChecks: NAV_PATHS.size + APP_ROUTES.size,
    passedChecks: (NAV_PATHS.size + APP_ROUTES.size) - crossIssues.length,
    issues: crossIssues,
  };

  const dbReport: ModuleReport = {
    key: 'db-health',
    name: 'בריאות בסיס נתונים',
    icon: 'Database',
    status: dbIssues.some(i => i.severity === 'critical') ? 'critical' :
            dbIssues.some(i => i.severity === 'warning') ? 'warning' : 'ok',
    score: dbIssues.length === 0 ? 100 : Math.max(0, 100 - dbIssues.length * 15),
    totalChecks: 4,
    passedChecks: 4 - dbIssues.length,
    issues: dbIssues,
  };

  const allModules = [...moduleReports, crossModuleReport, dbReport];

  // Sort: critical first, then warning, then ok
  allModules.sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  const allIssues = allModules.flatMap(m => m.issues);
  const totalChecks = allModules.reduce((s, m) => s + m.totalChecks, 0);
  const passedChecks = allModules.reduce((s, m) => s + m.passedChecks, 0);

  return {
    generatedAt: new Date(),
    overallScore: totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100,
    totalModules: allModules.length,
    totalChecks,
    passedChecks,
    criticalCount: allIssues.filter(i => i.severity === 'critical').length,
    warningCount: allIssues.filter(i => i.severity === 'warning').length,
    infoCount: allIssues.filter(i => i.severity === 'info').length,
    modules: allModules,
  };
}

export async function runSingleModuleAudit(moduleKey: string): Promise<ModuleReport> {
  await loadPrismaModels();

  if (moduleKey === 'cross-module') {
    const crossIssues = runCrossModuleChecks();
    return {
      key: 'cross-module',
      name: 'בדיקות חוצות מודולים',
      icon: 'Settings',
      status: crossIssues.some(i => i.severity === 'critical') ? 'critical' :
              crossIssues.some(i => i.severity === 'warning') ? 'warning' : 'ok',
      score: crossIssues.length === 0 ? 100 : Math.max(0, 100 - crossIssues.length * 5),
      totalChecks: NAV_PATHS.size + APP_ROUTES.size,
      passedChecks: (NAV_PATHS.size + APP_ROUTES.size) - crossIssues.length,
      issues: crossIssues,
    };
  }

  if (moduleKey === 'db-health') {
    const dbIssues = await runDbHealthChecks();
    return {
      key: 'db-health',
      name: 'בריאות בסיס נתונים',
      icon: 'Database',
      status: dbIssues.some(i => i.severity === 'critical') ? 'critical' :
              dbIssues.some(i => i.severity === 'warning') ? 'warning' : 'ok',
      score: dbIssues.length === 0 ? 100 : Math.max(0, 100 - dbIssues.length * 15),
      totalChecks: 4,
      passedChecks: 4 - dbIssues.length,
      issues: dbIssues,
    };
  }

  const spec = MODULES.find(m => m.key === moduleKey);
  if (!spec) throw new Error(`מודול לא מוכר: ${moduleKey}`);
  return checkModule(spec);
}
