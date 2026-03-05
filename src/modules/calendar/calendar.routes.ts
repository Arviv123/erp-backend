// ============================================================
// Holiday Calendar Routes
// Base: /api/calendar
// ============================================================

import { Router, Response } from 'express';
import { authenticate }                        from '../../middleware/auth';
import { enforceTenantIsolation }              from '../../middleware/tenant';
import { requireMinRole }                      from '../../middleware/rbac';
import { AuthenticatedRequest }                from '../../shared/types/index';
import { sendSuccess, sendError }              from '../../shared/utils/response';
import { asyncHandler }                        from '../../shared/utils/asyncHandler';
import {
  getHolidays,
  getHolidaysInRange,
  isHoliday,
  getWorkingDays,
  getNextWorkingDay,
  getCalendarForMonth,
  getTenantCalendarSettings,
  updateTenantCalendarSettings,
  HolidayOptions,
  CalendarSettings,
} from './calendar.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Helper: parse boolean query param ───────────────────────────────────────

function parseBool(val: unknown, defaultVal: boolean): boolean {
  if (val === undefined || val === null) return defaultVal;
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return defaultVal;
}

function buildOptions(query: Record<string, unknown>, defaults: HolidayOptions = {}): HolidayOptions {
  return {
    jewish:               parseBool(query['jewish'],   defaults.jewish   ?? true),
    gregorian:            parseBool(query['gregorian'], defaults.gregorian ?? false),
    muslim:               parseBool(query['muslim'],    defaults.muslim    ?? false),
    includeMinorHolidays: parseBool(query['minor'],     defaults.includeMinorHolidays ?? false),
  };
}

// ─── GET /holidays ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/holidays:
 *   get:
 *     summary: Get all holidays for a given year
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Gregorian year (defaults to current year)
 *       - in: query
 *         name: jewish
 *         schema: { type: boolean }
 *       - in: query
 *         name: gregorian
 *         schema: { type: boolean }
 *       - in: query
 *         name: muslim
 *         schema: { type: boolean }
 *       - in: query
 *         name: minor
 *         schema: { type: boolean }
 *         description: Include minor holidays (Lag BaOmer, Tu BiShvat, etc.)
 *     responses:
 *       200:
 *         description: List of holidays
 */
router.get(
  '/holidays',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const year = parseInt(String(req.query['year'] ?? new Date().getFullYear()), 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return sendError(res, 'Invalid year parameter (2000-2100)', 400);
    }
    const options = buildOptions(req.query as Record<string, unknown>);
    const holidays = await getHolidays(year, options);
    sendSuccess(res, { year, count: holidays.length, holidays });
  }),
);

// ─── GET /range ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/range:
 *   get:
 *     summary: Get holidays in a date range
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date }
 */
router.get(
  '/range',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      return sendError(res, 'from and to query parameters are required (YYYY-MM-DD)', 400);
    }
    const fromDate = new Date(from + 'T00:00:00Z');
    const toDate   = new Date(to   + 'T00:00:00Z');
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return sendError(res, 'Invalid date format — use YYYY-MM-DD', 400);
    }
    if (fromDate > toDate) {
      return sendError(res, '"from" must be before "to"', 400);
    }
    const options  = buildOptions(req.query as Record<string, unknown>);
    const holidays = await getHolidaysInRange(fromDate, toDate, options);
    sendSuccess(res, { from, to, count: holidays.length, holidays });
  }),
);

// ─── GET /is-holiday/:date ────────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/is-holiday/{date}:
 *   get:
 *     summary: Check if a specific date is a holiday
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Date in YYYY-MM-DD format
 */
router.get(
  '/is-holiday/:date',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { date } = req.params as { date: string };
    const dateObj  = new Date(date + 'T00:00:00Z');
    if (isNaN(dateObj.getTime())) {
      return sendError(res, 'Invalid date format — use YYYY-MM-DD', 400);
    }
    const options  = buildOptions(req.query as Record<string, unknown>, { includeMinorHolidays: true });
    const result   = await isHoliday(dateObj, options);
    sendSuccess(res, { date, isHoliday: result });
  }),
);

// ─── GET /working-days ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/working-days:
 *   get:
 *     summary: Count working days between two dates
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date }
 */
router.get(
  '/working-days',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      return sendError(res, 'from and to query parameters are required (YYYY-MM-DD)', 400);
    }
    const fromDate = new Date(from + 'T00:00:00Z');
    const toDate   = new Date(to   + 'T00:00:00Z');
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return sendError(res, 'Invalid date format — use YYYY-MM-DD', 400);
    }
    if (fromDate > toDate) {
      return sendError(res, '"from" must be before "to"', 400);
    }
    const options      = buildOptions(req.query as Record<string, unknown>);
    const workingDays  = await getWorkingDays(fromDate, toDate, options);
    sendSuccess(res, { from, to, workingDays });
  }),
);

// ─── GET /month/:year/:month ──────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/month/{year}/{month}:
 *   get:
 *     summary: Get full month calendar with holiday annotations
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 */
router.get(
  '/month/:year/:month',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const year  = parseInt(req.params['year']  ?? '', 10);
    const month = parseInt(req.params['month'] ?? '', 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return sendError(res, 'Invalid year or month parameter', 400);
    }
    const tenantId = req.user.tenantId;
    const calendar = await getCalendarForMonth(tenantId, year, month);
    sendSuccess(res, calendar);
  }),
);

// ─── GET /settings ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/settings:
 *   get:
 *     summary: Get tenant calendar settings
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/settings',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const settings = await getTenantCalendarSettings(req.user.tenantId);
    sendSuccess(res, settings);
  }),
);

// ─── PUT /settings ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/settings:
 *   put:
 *     summary: Update tenant calendar settings (ADMIN+)
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jewish:               { type: boolean }
 *               gregorian:            { type: boolean }
 *               muslim:               { type: boolean }
 *               includeMinorHolidays: { type: boolean }
 *               locale:               { type: string, enum: [he, en] }
 */
router.put(
  '/settings',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as Partial<CalendarSettings>;
    const updated = await updateTenantCalendarSettings(req.user.tenantId, body);
    sendSuccess(res, updated);
  }),
);

// ─── GET /next-working-day/:date ──────────────────────────────────────────────
/**
 * @swagger
 * /api/calendar/next-working-day/{date}:
 *   get:
 *     summary: Get the next working day after a given date
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 */
router.get(
  '/next-working-day/:date',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { date } = req.params as { date: string };
    const dateObj  = new Date(date + 'T00:00:00Z');
    if (isNaN(dateObj.getTime())) {
      return sendError(res, 'Invalid date format — use YYYY-MM-DD', 400);
    }
    const options  = buildOptions(req.query as Record<string, unknown>);
    const nextDay  = await getNextWorkingDay(dateObj, options);
    sendSuccess(res, {
      inputDate:      date,
      nextWorkingDay: nextDay.toISOString().slice(0, 10),
    });
  }),
);

export default router;
