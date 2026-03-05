import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// POST /attendance/clock-in
router.post('/clock-in', async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    employeeId:  z.string().cuid(),
    gpsLocation: z.object({ lat: z.number(), lng: z.number() }).optional(),
    notes:       z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Verify employee belongs to this tenant
  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee || employee.tenantId !== req.user.tenantId) {
    sendError(res, 'Employee not found', 404);
    return;
  }

  // Check if already clocked in today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingLog = await prisma.attendanceLog.findFirst({
    where: {
      tenantId:   req.user.tenantId,
      employeeId: parsed.data.employeeId,
      date:       today,
      clockOut:   null,
    },
  });

  if (existingLog) {
    sendError(res, 'Employee already clocked in today without clocking out');
    return;
  }

  // ── חוק שעות עבודה ומנוחה: מקסימום 10 שעות ביום ──────────────────
  const MAX_DAILY_HOURS = 10;
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const todayLogs = await prisma.attendanceLog.findMany({
    where: {
      employeeId: parsed.data.employeeId,
      tenantId:   req.user.tenantId,
      date:       { gte: today, lte: endOfDay },
      clockOut:   { not: null },
    },
  });

  const hoursWorkedToday = todayLogs.reduce((sum, l) => {
    if (l.clockOut) return sum + (new Date(l.clockOut).getTime() - new Date(l.clockIn).getTime()) / 3_600_000;
    return sum;
  }, 0);

  if (hoursWorkedToday >= MAX_DAILY_HOURS) {
    res.status(400).json({
      success: false,
      error: `Daily working hours limit reached (${Math.round(hoursWorkedToday * 10) / 10}h / max ${MAX_DAILY_HOURS}h — חוק שעות עבודה ומנוחה)`,
      hoursWorkedToday: Math.round(hoursWorkedToday * 10) / 10,
      maxDailyHours: MAX_DAILY_HOURS,
    });
    return;
  }

  // ── מנוחה מינימלית בין משמרות: 8 שעות ─────────────────────────────
  const MIN_REST_HOURS = 8;
  const lastLog = await prisma.attendanceLog.findFirst({
    where: { employeeId: parsed.data.employeeId, tenantId: req.user.tenantId, clockOut: { not: null } },
    orderBy: { clockOut: 'desc' },
  });

  if (lastLog?.clockOut) {
    const hoursSinceLastOut = (Date.now() - new Date(lastLog.clockOut).getTime()) / 3_600_000;
    if (hoursSinceLastOut < MIN_REST_HOURS) {
      res.status(400).json({
        success: false,
        error: `Minimum 8-hour rest required between shifts (Israeli Working Hours Law). Last shift ended ${Math.round(hoursSinceLastOut * 10) / 10}h ago.`,
        hoursSinceLastShift: Math.round(hoursSinceLastOut * 10) / 10,
        minRestHours: MIN_REST_HOURS,
      });
      return;
    }
  }

  const log = await prisma.attendanceLog.create({
    data: {
      tenantId:    req.user.tenantId,
      employeeId:  parsed.data.employeeId,
      date:        today,
      clockIn:     new Date(),
      gpsLocation: parsed.data.gpsLocation,
      ipAddress:   req.ip,
      notes:       parsed.data.notes,
    },
  });

  sendSuccess(res, log, 201);
});

// POST /attendance/clock-out
router.post('/clock-out', async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    employeeId:   z.string().cuid(),
    breakMinutes: z.number().min(0).default(0),
    notes:        z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const log = await prisma.attendanceLog.findFirst({
    where: {
      tenantId:   req.user.tenantId,
      employeeId: parsed.data.employeeId,
      date:       today,
      clockOut:   null,
    },
  });

  if (!log) {
    sendError(res, 'No open attendance record found for today');
    return;
  }

  const now     = new Date();
  const clockOut = now;

  // Calculate worked hours
  const workedMs      = clockOut.getTime() - log.clockIn.getTime();
  const workedMinutes = Math.floor(workedMs / 60_000) - parsed.data.breakMinutes;

  const updated = await prisma.attendanceLog.update({
    where: { id: log.id },
    data:  {
      clockOut,
      breakMinutes: parsed.data.breakMinutes,
      notes:        parsed.data.notes ?? log.notes,
    },
  });

  sendSuccess(res, { ...updated, workedMinutes });
});

// GET /attendance/my-summary?month=2026-03 — own attendance for logged-in employee
router.get('/my-summary', async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user || !(user as any).employeeId) {
    sendSuccess(res, { daysWorked: 0, totalHours: 0, logs: [] }); return;
  }
  const empId = (user as any).employeeId as string;
  const month = req.query.month as string;
  let startDate: Date, endDate: Date;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    startDate = new Date(y, m - 1, 1);
    endDate   = new Date(y, m,     0, 23, 59, 59);
  } else {
    const n = new Date();
    startDate = new Date(n.getFullYear(), n.getMonth(), 1);
    endDate   = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59);
  }
  const logs = await prisma.attendanceLog.findMany({
    where: { tenantId: req.user.tenantId, employeeId: empId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  });
  const totalMinutes = logs.reduce((sum, log) => {
    if (!log.clockOut) return sum;
    return sum + (log.clockOut.getTime() - log.clockIn.getTime()) / 60_000 - log.breakMinutes;
  }, 0);
  sendSuccess(res, {
    employeeId:   empId, month,
    daysWorked:   logs.filter(l => l.clockOut).length,
    totalHours:   Math.round((totalMinutes / 60) * 100) / 100,
    totalMinutes: Math.round(totalMinutes),
    logs,
  });
});

// GET /attendance  (manager view)
router.get(
  '/',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { employeeId, from, to, page = '1', pageSize = '50' } = req.query;

    const where = withTenant(req, {
      ...(employeeId ? { employeeId: employeeId as string } : {}),
      ...(from || to ? {
        date: {
          gte: from ? new Date(from as string) : undefined,
          lte: to   ? new Date(to   as string) : undefined,
        },
      } : {}),
    });

    const [items, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where,
        include: {
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
        skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take:    parseInt(pageSize as string),
      }),
      prisma.attendanceLog.count({ where }),
    ]);

    sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
  }
);

// GET /attendance/summary/:employeeId?month=2026-03
router.get('/summary/:employeeId', async (req: AuthenticatedRequest, res: Response) => {
  const month = req.query.month as string;

  let startDate: Date, endDate: Date;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    startDate = new Date(y, m - 1, 1);
    endDate   = new Date(y, m,     0, 23, 59, 59);
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const logs = await prisma.attendanceLog.findMany({
    where: {
      tenantId:   req.user.tenantId,
      employeeId: req.params.employeeId,
      date:       { gte: startDate, lte: endDate },
    },
    orderBy: { date: 'asc' },
  });

  const totalMinutes = logs.reduce((sum, log) => {
    if (!log.clockOut) return sum;
    const worked = (log.clockOut.getTime() - log.clockIn.getTime()) / 60_000;
    return sum + worked - log.breakMinutes;
  }, 0);

  sendSuccess(res, {
    employeeId:    req.params.employeeId,
    month:         month ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    daysWorked:    logs.filter(l => l.clockOut).length,
    totalHours:    Math.round((totalMinutes / 60) * 100) / 100,
    totalMinutes:  Math.round(totalMinutes),
    logs,
  });
});

export default router;
