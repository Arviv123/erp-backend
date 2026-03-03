import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';
import * as PayrollService from './payroll.service';
import { PAYROLL_CONSTANTS_2026 } from './payroll.engine';

const router = Router();

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Adjustment schema ─────────────────────────────────────────────
const adjustmentSchema = z.object({
  overtime125Hours:     z.number().min(0).default(0),
  overtime150Hours:     z.number().min(0).default(0),
  travelWorkDays:       z.number().min(0).max(31).default(21),
  includeRecuperation:  z.boolean().default(false),
  bonusAmount:          z.number().min(0).default(0),
  manualDeduction:      z.number().min(0).default(0),
  partialMonthDays:     z.number().min(0).optional(),
  totalWorkDaysInMonth: z.number().min(0).optional(),
}).partial();

// ─── POST /payroll/run ─────────────────────────────────────────────
router.post(
  '/run',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      period:      z.string().regex(/^\d{4}-\d{2}$/),
      adjustments: z.record(z.string(), adjustmentSchema).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'period must be YYYY-MM format; adjustments must be a map of employeeId → adjustment');
      return;
    }

    try {
      const run = await PayrollService.runPayroll(
        req.user.tenantId,
        parsed.data.period,
        req.user.userId,
        (parsed.data.adjustments ?? {}) as any
      );
      sendSuccess(res, run, 201);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// ─── GET /payroll/runs ─────────────────────────────────────────────
router.get('/runs', async (req: AuthenticatedRequest, res: Response) => {
  const runs = await prisma.payrollRun.findMany({
    where:   { tenantId: req.user.tenantId },
    orderBy: { period: 'desc' },
    include: { _count: { select: { payslips: true } } },
  });
  sendSuccess(res, runs);
});

// ─── GET /payroll/runs/:id/payslips ───────────────────────────────
router.get('/runs/:id/payslips', async (req: AuthenticatedRequest, res: Response) => {
  const run = await prisma.payrollRun.findUnique({
    where:   { id: req.params.id },
    include: {
      payslips: {
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, idNumber: true,
              jobTitle: true, department: true,
            },
          },
        },
      },
    },
  });

  if (!run || run.tenantId !== req.user.tenantId) {
    sendError(res, 'Payroll run not found', 404);
    return;
  }

  sendSuccess(res, run);
});

// ─── POST /payroll/runs/:id/approve ───────────────────────────────
router.post(
  '/runs/:id/approve',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await PayrollService.approvePayrollRun(
        req.params.id,
        req.user.tenantId,
        req.user.userId
      );
      sendSuccess(res, run);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// ─── POST /payroll/runs/:id/paid ──────────────────────────────────
router.post(
  '/runs/:id/paid',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await PayrollService.markPayrollPaid(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, run);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// ─── GET /payroll/payslips  (list all for tenant, optional filters) ─
router.get('/payslips', async (req: AuthenticatedRequest, res: Response) => {
  const { period, runId, search } = req.query as Record<string, string | undefined>;

  const payslips = await prisma.payslip.findMany({
    where: {
      tenantId: req.user.tenantId,
      ...(runId  ? { payrollRunId: runId }  : {}),
      ...(period ? { period }               : {}),
      ...(search ? {
        employee: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName:  { contains: search, mode: 'insensitive' } },
            { idNumber:  { contains: search, mode: 'insensitive' } },
          ],
        },
      } : {}),
    },
    include: {
      employee: { select: { firstName: true, lastName: true, idNumber: true, jobTitle: true } },
      payrollRun: { select: { status: true, period: true } },
    },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });

  sendSuccess(res, payslips);
});

// ─── GET /payroll/payslips/:id ────────────────────────────────────
router.get('/payslips/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payslip = await PayrollService.getPayslip(
      req.params.id,
      req.user.tenantId
    );
    sendSuccess(res, payslip);
  } catch (err: any) {
    sendError(res, err.message, 404);
  }
});

// ─── GET /payroll/preview/:employeeId ─────────────────────────────
router.get(
  '/preview/:employeeId',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Optional query params for simulation
      const adj = {
        overtime125Hours:    req.query.ot125    ? Number(req.query.ot125)    : undefined,
        overtime150Hours:    req.query.ot150    ? Number(req.query.ot150)    : undefined,
        travelWorkDays:      req.query.travel   ? Number(req.query.travel)   : undefined,
        includeRecuperation: req.query.recup === 'true',
        bonusAmount:         req.query.bonus    ? Number(req.query.bonus)    : undefined,
      };
      const preview = await PayrollService.previewEmployeePayslip(
        req.params.employeeId,
        req.user.tenantId,
        adj
      );
      sendSuccess(res, preview);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  }
);

// ─── GET /payroll/reports/monthly/:period  (for 102 form) ─────────
router.get(
  '/reports/monthly/:period',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!/^\d{4}-\d{2}$/.test(req.params.period)) {
      sendError(res, 'Period must be YYYY-MM');
      return;
    }
    try {
      const report = await PayrollService.getMonthlyReport(
        req.user.tenantId,
        req.params.period
      );
      sendSuccess(res, report);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  }
);

// ─── PATCH /payroll/payslips/:id  (edit payslip — DRAFT only) ─────
router.patch(
  '/payslips/:id',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    try {
      const updated = await PayrollService.editPayslip(
        req.params.id,
        req.user.tenantId,
        parsed.data as any
      );
      sendSuccess(res, updated);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ─── DELETE /payroll/runs/:id  (delete DRAFT run) ─────────────────
router.delete(
  '/runs/:id',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await PayrollService.deletePayrollRun(
        req.params.id,
        req.user.tenantId
      );
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ─── GET /payroll/runs/:id/bank-export  (CSV for bank payment) ────
router.get(
  '/runs/:id/bank-export',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
      if (!run || run.tenantId !== req.user.tenantId) { sendError(res, 'Run not found', 404); return; }

      const csv = await PayrollService.generateBankExport(req.params.id, req.user.tenantId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="salary-${run.period}.csv"`);
      res.send(csv);
    } catch (err: any) {
      sendError(res, err.message, 400);
    }
  }
);

// ─── GET /payroll/reports/annual/:year  (Form 126 — annual summary) ─
router.get(
  '/reports/annual/:year',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const year = Number(req.params.year);
    if (!year || year < 2000 || year > 2100) {
      sendError(res, 'Year must be a valid 4-digit year (e.g. 2025)');
      return;
    }
    try {
      const report = await PayrollService.getAnnualReport(req.user.tenantId, year);
      sendSuccess(res, report);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  }
);

// ─── GET /payroll/my-payslips — own payslips for logged-in employee ─
router.get('/my-payslips', async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user || !(user as any).employeeId) { sendSuccess(res, []); return; }
  const payslips = await prisma.payslip.findMany({
    where:   { tenantId: req.user.tenantId, employeeId: (user as any).employeeId },
    include: { payrollRun: { select: { period: true, status: true } } },
    orderBy: { period: 'desc' },
  });
  sendSuccess(res, payslips);
});

// ─── GET /payroll/attendance-for-payroll/:empId?month=YYYY-MM ──────
router.get(
  '/attendance-for-payroll/:employeeId',
  requireMinRole('PAYROLL_ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month as string)) {
      sendError(res, 'month (YYYY-MM) is required'); return;
    }
    const [y, m] = (month as string).split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to   = new Date(y, m,     0, 23, 59, 59);

    const emp = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

    const logs = await prisma.attendanceLog.findMany({
      where: { tenantId: req.user.tenantId, employeeId: req.params.employeeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    let stdH = 0, ot125 = 0, ot150 = 0;
    for (const log of logs) {
      if (!log.clockOut) continue;
      const w = (log.clockOut.getTime() - log.clockIn.getTime()) / 3_600_000 - log.breakMinutes / 60;
      if (w <= 8)       stdH += w;
      else if (w <= 10) { stdH += 8; ot125 += w - 8; }
      else              { stdH += 8; ot125 += 2; ot150 += w - 10; }
    }

    sendSuccess(res, {
      employeeId:    req.params.employeeId,
      period:        month,
      daysWorked:    logs.filter(l => l.clockOut).length,
      travelDays:    logs.filter(l => l.clockOut).length,
      standardHours: Math.round(stdH   * 100) / 100,
      ot125Hours:    Math.round(ot125  * 100) / 100,
      ot150Hours:    Math.round(ot150  * 100) / 100,
    });
  }
);

// ─── GET /payroll/constants  (2026 tax rates reference) ───────────
router.get('/constants', async (_req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, PAYROLL_CONSTANTS_2026);
});

export default router;
