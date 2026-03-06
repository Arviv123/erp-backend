import 'dotenv/config';
import * as Sentry from '@sentry/node';

// ─── Sentry Error Monitoring ───────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

// Logging
import { logger } from './config/logger';
import { prisma } from './config/database';

// Routes — Core
import tenantsRouter    from './modules/tenants/tenants.routes';
import usersRouter      from './modules/users/users.routes';
import employeesRouter  from './modules/employees/employees.routes';
import accountingRouter from './modules/accounting/accounting.routes';
import payrollRouter    from './modules/payroll/payroll.routes';
import invoicesRouter   from './modules/invoices/invoices.routes';
import crmRouter        from './modules/crm/crm.routes';
import hrRouter         from './modules/hr/leave.routes';
import attendanceRouter from './modules/attendance/attendance.routes';
import auditRouter      from './modules/audit/audit.routes';

// Routes — Platform (SaaS owner layer)
import platformRouter   from './modules/platform/platform.routes';

// Routes — Employee Self-Service Portal
import employeePortalRouter from './modules/employee-portal/employee-portal.routes';

// Routes — Customer Self-Service Portal
import customerPortalRouter from './modules/customer-portal/customer-portal.routes';

// Routes — Phase 4 (Sales & Documents)
import salesOrdersRouter  from './modules/sales-orders/sales-orders.routes';
import quotesRouter        from './modules/quotes/quotes.routes';
import bulkImportRouter    from './modules/bulk-import/bulk-import.routes';
import smartImportRouter   from './modules/smart-import/smart-import.routes';
import paymentLinksRouter  from './modules/payment-links/payment-links.routes';

// Routes — Phase 3 (Advanced Modules)
import inventoryRouter  from './modules/inventory/inventory.routes';
import purchasingRouter from './modules/purchasing/purchasing.routes';
import assetsRouter     from './modules/assets/assets.routes';
import expensesRouter   from './modules/expenses/expenses.routes';
import budgetRouter     from './modules/budget/budget.routes';
import bankReconRouter  from './modules/accounting/bank-recon.routes';
import webhooksRouter   from './modules/webhooks/webhooks.routes';
import dashboardRouter  from './modules/dashboard/dashboard.routes';
import posRouter        from './modules/pos/pos.routes';
import settingsRouter   from './modules/settings/settings.routes';
import documentsRouter  from './modules/documents/documents.routes';
import bankImportRouter    from './modules/bank/bank-import.routes';
import agingRouter         from './modules/accounting/aging.routes';
import priceListsRouter    from './modules/price-lists/price-lists.routes';

// Routes — Recurring Invoices
import recurringInvoicesRouter from './modules/recurring-invoices/recurring-invoices.routes';

// Routes — Contracts (חוזי שירות)
import contractsRouter from './modules/contracts/contracts.routes';

// Routes — Form 161 (Termination + Severance Tax — טופס 161)
import form161Router from './modules/form161/form161.routes';

// Routes — Pension Fund Management
import pensionRouter from './modules/pension/pension.routes';

// Routes — Analytics KPI
import analyticsRouter from './modules/analytics/analytics.routes';

// Routes — Green Invoice (חשבונית ירוקה) Integration
import greenInvoiceRouter from './modules/green-invoice/green-invoice.routes';

// Routes — WhatsApp Business API
import whatsAppRouter from './modules/whatsapp/whatsapp.routes';

// Routes — Phase 5 (Multi-Branch)
import branchesRouter from './modules/branches/branches.routes';

// Routes — Payment Terminals (מסופני אשראי)
import paymentTerminalRouter from './modules/payment-terminal/payment-terminal.routes';

// Routes — Barcode Scanner & Fast Search
import scanRouter from './modules/scan/scan.routes';

// Routes — Global Search
import searchRouter from './modules/search/search.routes';

// Routes — Phase 6 (Printers — מדפסות + תור הדפסה)
import printersRouter from './modules/printers/printers.routes';

// Routes — POS Phase 2 (Promotions, Loyalty, Gift Cards, Z-Report)
import posPhase2Router from './modules/pos/pos-phase2.routes';

// Routes — POS Complete (Table Management, Delivery Orders, Kitchen Display)
import posTablesRouter from './modules/pos/pos-tables.routes';

// Routes — POS Cash Drawer, Cashier Shifts, Analytics
import posCashRouter from './modules/pos/pos-cash.routes';

// Routes — POS Config (Quick Buttons, Variants, Combos, Receipt Templates, Returns)
import posConfigRouter from './modules/pos/pos-config.routes';

// Routes — Holiday Calendar
import calendarRouter from './modules/calendar/calendar.routes';

// Routes — AI Agents
import agentsRouter from './modules/agents/agents.routes';
import agentTeamRouter from './modules/agents/agent-team.routes';

// Routes — RFID
import rfidRouter from './modules/rfid/rfid.routes';

// Routes — Cash Flow Forecast
import cashFlowForecastRouter from './modules/accounting/cash-flow-forecast.routes';

// Routes — Ledger Cards (כרטסות)
import ledgerRouter from './modules/ledger/ledger.routes';

// Routes — Multi-Currency / Exchange Rates
import currencyRouter from './modules/currency/currency.routes';

// Routes — Receipts (קבלות)
import receiptsRouter from './modules/receipts/receipts.routes';

// Routes — Notifications
import notificationsRouter from './modules/notifications/notifications.routes';

// Routes — Phase 2 (Financial Operations & HR)
import batchPaymentsRouter from './modules/batch-payments/batch-payments.routes';
import goodsReceiptRouter  from './modules/purchasing/goods-receipt.routes';
import pettyCashRouter     from './modules/petty-cash/petty-cash.routes';
import creditCardsRouter      from './modules/credit-cards/credit-cards.routes';
import creditCardReconRouter  from './modules/credit-card-recon/credit-card-recon.routes';
import trainingRouter         from './modules/hr/training.routes';
import onboardingRouter    from './modules/hr/onboarding.routes';

// Swagger
import { swaggerSpec } from './config/swagger';

const app  = express();
const PORT = process.env.PORT ?? 3000;

// ─── Security ─────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // disable CSP for Swagger UI
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);

// Security: wildcard + credentials is forbidden by browsers and is a CORS vulnerability.
// If wildcard is configured, disable credentials so the policy remains valid.
const isWildcard = allowedOrigins.includes('*');
if (isWildcard && process.env.NODE_ENV === 'production') {
  logger.warn('WARNING: ALLOWED_ORIGINS=* in production disables credentials. Set explicit origins for security.');
}

app.use(cors({
  origin: isWildcard ? true : (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server / mobile
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
  },
  credentials: !isWildcard, // never send credentials with wildcard
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 86400,
}));

// ─── Rate Limiting ────────────────────────────────────────────────
app.use('/api/users/auth', rateLimit({
  windowMs: 15 * 60 * 1_000,
  max:      20,
  message:  { success: false, error: 'Too many login attempts, please try again later' },
}));

app.use('/api', rateLimit({
  windowMs: 60 * 1_000,
  max:      300,
}));

// ─── Body Parser ──────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ─── Request Logger ───────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { ip: req.ip, query: req.query });
  next();
});

// ─── Health Check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV ?? 'development',
  });
});

// ─── DB Health Check (for debugging) ──────────────────────────────
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ status: 'error', db: 'disconnected', detail: msg });
  }
});


// ─── Swagger Docs ─────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ERP API Docs',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// ─── Platform Routes (SaaS owner — no tenant isolation) ───────────
app.use('/api/platform', platformRouter);

// ─── Employee Self-Service Portal ─────────────────────────────────
app.use('/api/employee-portal', employeePortalRouter);

// ─── Customer Self-Service Portal ─────────────────────────────────
app.use('/api/customer-portal', customerPortalRouter);

// ─── API Routes ─── Core ──────────────────────────────────────────
app.use('/api/tenants',    tenantsRouter);
app.use('/api/users',      usersRouter);
app.use('/api/employees',  employeesRouter);
app.use('/api/accounting', accountingRouter);
app.use('/api/payroll',    payrollRouter);
app.use('/api/invoices',   invoicesRouter);
app.use('/api/crm',        crmRouter);
app.use('/api/hr',         hrRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/audit',      auditRouter);

// ─── API Routes ─── Advanced ──────────────────────────────────────
app.use('/api/inventory',  inventoryRouter);
app.use('/api/purchasing', purchasingRouter);
app.use('/api/assets',     assetsRouter);
app.use('/api/expenses',   expensesRouter);
app.use('/api/budget',     budgetRouter);
app.use('/api/bank-recon', bankReconRouter);
app.use('/api/webhooks',   webhooksRouter);
app.use('/api/dashboard',  dashboardRouter);
app.use('/api/pos',        posRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/documents',  documentsRouter);
app.use('/api/sales-orders',   salesOrdersRouter);
app.use('/api/quotes',         quotesRouter);
app.use('/api/payment-links',  paymentLinksRouter);
app.use('/api/bank',         bankImportRouter);
app.use('/api/aging',               agingRouter);
app.use('/api/recurring-invoices',  recurringInvoicesRouter);
app.use('/api/price-lists',         priceListsRouter);
app.use('/api/cash-flow',           cashFlowForecastRouter);
app.use('/api/ledger',              ledgerRouter);
app.use('/api/currency',            currencyRouter);

// ─── API Routes ─── Phase 2 ───────────────────────────────────────
app.use('/api/batch-payments',  batchPaymentsRouter);
app.use('/api/goods-receipts',  goodsReceiptRouter);
app.use('/api/petty-cash',      pettyCashRouter);
app.use('/api/credit-cards',       creditCardsRouter);
app.use('/api/credit-card-recon',  creditCardReconRouter);
app.use('/api/hr/training',        trainingRouter);
app.use('/api/hr/onboarding',   onboardingRouter);
app.use('/api/notifications',   notificationsRouter);
app.use('/api/bulk-import',     bulkImportRouter);
app.use('/api/smart-import',    smartImportRouter);
app.use('/api/contracts',       contractsRouter);
app.use('/api/analytics',       analyticsRouter);
app.use('/api/pension',         pensionRouter);
app.use('/api/branches',        branchesRouter);
app.use('/api/green-invoice',   greenInvoiceRouter);
app.use('/api/whatsapp',        whatsAppRouter);
app.use('/api/form161',         form161Router);

// ─── API Routes ─── Phase 6 ───────────────────────────────────────
app.use('/api/receipts',         receiptsRouter);
app.use('/api/payment-terminal', paymentTerminalRouter);
app.use('/api/printers',        printersRouter);
app.use('/api/scan',            scanRouter);
app.use('/api/search',          searchRouter);
app.use('/api/calendar',        calendarRouter);

// ─── API Routes ─── POS Phase 2 ───────────────────────────────────
app.use('/api/pos', posPhase2Router);  // extends existing /api/pos prefix

// ─── API Routes ─── POS Complete (Tables, Orders, Kitchen) ─────────
app.use('/api/pos', posTablesRouter);  // extends existing /api/pos prefix

// ─── API Routes ─── POS Cash Drawer, Cashier Shifts, Analytics ─────
app.use('/api/pos', posCashRouter);    // extends existing /api/pos prefix

// ─── API Routes ─── POS Config (Buttons, Variants, Combos, Templates) ──────
app.use('/api/pos', posConfigRouter);  // extends existing /api/pos prefix

// ─── API Routes ─── AI Agents ─────────────────────────────────────
app.use('/api/agents',         agentsRouter);
app.use('/api/agents/team',    agentTeamRouter);

// ─── API Routes ─── RFID ──────────────────────────────────────────
app.use('/api/rfid',           rfidRouter);

// ─── Sentry Error Handler (must be before custom error handler) ────
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// ─── Global Error Handler ─────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = Math.random().toString(36).substring(2, 15);
  const isDev = process.env.NODE_ENV !== 'production';

  logger.error('Unhandled error', {
    correlationId,
    message: err.message,
    stack:   isDev ? err.stack : '[hidden in production]',
    method:  req.method,
    path:    req.path,
  });
  res.status(500).json({
    success: false,
    error:   isDev ? err.message : 'Internal server error',
    correlationId,
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`ERP Backend running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
  logger.info(`Swagger UI: http://localhost:${PORT}/api/docs`);
  logger.info(`Health:     http://localhost:${PORT}/health`);
});

export default app;
