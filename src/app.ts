import 'dotenv/config';
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

// Swagger
import { swaggerSpec } from './config/swagger';

const app  = express();
const PORT = process.env.PORT ?? 3000;

// ─── Security ─────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // disable CSP for Swagger UI
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin:      allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true,
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

// ─── Global Error Handler ─────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    method:  req.method,
    path:    req.path,
  });
  res.status(500).json({ success: false, error: 'Internal server error' });
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
