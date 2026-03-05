import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  getRevenueTrend,
  getProfitabilityByCustomer,
  getProfitabilityByProduct,
  getKPISummary,
  getSalesByEmployee,
  getInvoiceStatusBreakdown,
  getPaymentTimeAnalysis,
  getExpensesByCategory,
  exportKPIReport,
} from './analytics.service';

const router = Router();

// ─── Global Middleware ────────────────────────────────────────────────────────
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// Minimum role: MANAGER is not in the hierarchy — use ACCOUNTANT as the minimum
// (covers ACCOUNTANT, ADMIN, SUPER_ADMIN; HR_MANAGER and SALESPERSON are below ACCOUNTANT)
// Per spec: "minimum role = MANAGER or ACCOUNTANT" — ACCOUNTANT is the applicable role in this schema
const requireAnalyticsRole = requireMinRole('ACCOUNTANT') as any;

// ─── Helper: parse optional ISO date string ───────────────────────────────────
function parseDate(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── GET /api/analytics/kpi ───────────────────────────────────────────────────
// KPI summary for a given period
// ?period=this_month|last_month|this_year|last_year
router.get(
  '/kpi',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const periodRaw = req.query.period as string | undefined;
    const validPeriods = ['this_month', 'last_month', 'this_year', 'last_year'] as const;
    type ValidPeriod = typeof validPeriods[number];

    const period: ValidPeriod =
      periodRaw && (validPeriods as readonly string[]).includes(periodRaw)
        ? (periodRaw as ValidPeriod)
        : 'this_month';

    const data = await getKPISummary(tenantId, period);
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/revenue-trend ────────────────────────────────────────
// Monthly revenue trend
// ?months=12
router.get(
  '/revenue-trend',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const months = Math.min(60, Math.max(1, parseInt(String(req.query.months ?? '12'), 10) || 12));

    const data = await getRevenueTrend(tenantId, months);
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/by-customer ──────────────────────────────────────────
// Profitability by customer
// ?from=ISO&to=ISO&limit=10
router.get(
  '/by-customer',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));

    const data = await getProfitabilityByCustomer(tenantId, { from, to, limit });
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/by-product ───────────────────────────────────────────
// Profitability by product
// ?from=ISO&to=ISO&limit=10
router.get(
  '/by-product',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));

    const data = await getProfitabilityByProduct(tenantId, { from, to, limit });
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/by-employee ──────────────────────────────────────────
// Sales / revenue by employee (invoice creator)
// ?from=ISO&to=ISO
router.get(
  '/by-employee',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const data = await getSalesByEmployee(tenantId, { from, to });
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/invoice-status ───────────────────────────────────────
// Invoice status breakdown for a period
// ?period=this_month  (or "2026-03" YYYY-MM format)
router.get(
  '/invoice-status',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const period = String(req.query.period ?? 'this_month');

    const data = await getInvoiceStatusBreakdown(tenantId, period);
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/payment-time ─────────────────────────────────────────
// Average days to payment per month
// ?months=6
router.get(
  '/payment-time',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const months = Math.min(60, Math.max(1, parseInt(String(req.query.months ?? '6'), 10) || 6));

    const data = await getPaymentTimeAnalysis(tenantId, months);
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/expenses ─────────────────────────────────────────────
// Expense breakdown by category
// ?from=ISO&to=ISO
router.get(
  '/expenses',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const data = await getExpensesByCategory(tenantId, { from, to });
    sendSuccess(res, data);
  }),
);

// ─── GET /api/analytics/export ───────────────────────────────────────────────
// Download comprehensive XLSX KPI report
// ?year=2026
router.get(
  '/export',
  requireAnalyticsRole,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.user;
    const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10) || new Date().getFullYear();

    if (year < 2000 || year > 2100) {
      sendError(res, 'Invalid year parameter', 400);
      return;
    }

    const buffer = await exportKPIReport(tenantId, year);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kpi-report-${year}.xlsx"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }),
);

export default router;
