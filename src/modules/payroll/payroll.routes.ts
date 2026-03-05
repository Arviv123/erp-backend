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
import { generatePayslipPDF } from './payslip.pdf.service';
import { generateForm102Excel } from './form102.service';
import { generateForm106PDF } from './form106.service';
import { sendPayslipEmail } from '../../services/email.service';

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

// ─── GET /payroll/runs/:id/masav-export  (MASAV Israeli bank format) ─
/**
 * Returns a fixed-width MASAV file (Israeli Interbank Clearing Center).
 * Required query params:
 *   institutionCode — 3-digit employer MASAV code (from originating bank)
 *   bankCode        — 3-digit originating bank code
 *   branchCode      — originating branch number
 *   accountNumber   — originating account number
 * Optional:
 *   valueDate       — payment date YYYY-MM-DD (default: today)
 *   seq             — file sequence number (default: 1)
 */
router.get(
  '/runs/:id/masav-export',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { institutionCode, bankCode, branchCode, accountNumber, valueDate, seq } =
        req.query as Record<string, string | undefined>;

      if (!institutionCode || !bankCode || !branchCode || !accountNumber) {
        sendError(res, 'Required: institutionCode, bankCode, branchCode, accountNumber');
        return;
      }

      const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
      if (!run || run.tenantId !== req.user.tenantId) { sendError(res, 'Run not found', 404); return; }

      const buf = await PayrollService.generateMasavExport(req.params.id, req.user.tenantId, {
        institutionCode,
        bankCode,
        branchCode,
        accountNumber,
        sequenceNumber: seq ? Number(seq) : 1,
        valueDate:      valueDate ? new Date(valueDate) : undefined,
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="masav-salary-${run.period}.txt"`);
      res.send(buf);
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
    const half = (['H1', 'H2', 'FULL'].includes(req.query.half as string)
      ? req.query.half as 'H1' | 'H2' | 'FULL'
      : 'FULL');
    try {
      const report = await PayrollService.getAnnualReport(req.user.tenantId, year, half);
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
  requireMinRole('ACCOUNTANT') as any,
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

// ═══════════════════════════════════════════════════════════════════
// ─── REPORT GENERATOR ─────────────────────────────────────────────
// GET /payroll/reports/generate?type=...&period=...&year=...&department=...
// Types: monthly-summary | employee-cost | department | annual-employee | pension | tax | miluim
// ═══════════════════════════════════════════════════════════════════

router.get(
  '/reports/generate',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { type, period, year, department, employeeId } = req.query as Record<string, string>;

    try {
      switch (type) {

        // ── 1. monthly-summary — all payslips for a period ────────
        case 'monthly-summary': {
          if (!period) { sendError(res, 'period required (YYYY-MM)'); return; }
          const run = await prisma.payrollRun.findFirst({
            where: { tenantId: req.user.tenantId, period },
            include: {
              payslips: {
                include: {
                  employee: { select: { firstName: true, lastName: true, department: true, idNumber: true, jobTitle: true } },
                },
              },
            },
          });
          if (!run) { sendError(res, 'No payroll run found for this period', 404); return; }
          const rows = run.payslips.map(p => ({
            שם:           `${p.employee.firstName} ${p.employee.lastName}`,
            'ת.ז.':        p.employee.idNumber,
            מחלקה:        p.employee.department,
            תפקיד:        p.employee.jobTitle,
            ברוטו:        Number(p.grossSalary),
            'מס הכנסה':   Number(p.incomeTax),
            'ביטוח לאומי':Number(p.nationalInsurance),
            'ביטוח בריאות':Number(p.healthInsurance),
            'פנסיה עובד': Number(p.pensionEmployee),
            'קרן השתלמות':Number(p.trainingFundEmployee),
            נטו:          Number(p.netSalary),
            'עלות מעסיק': Number(p.totalEmployerCost),
          }));
          const totals = {
            שם: 'סה"כ', 'ת.ז.': '', מחלקה: '', תפקיד: '',
            ברוטו: rows.reduce((s,r)=>s+r.ברוטו,0),
            'מס הכנסה': rows.reduce((s,r)=>s+r['מס הכנסה'],0),
            'ביטוח לאומי': rows.reduce((s,r)=>s+r['ביטוח לאומי'],0),
            'ביטוח בריאות': rows.reduce((s,r)=>s+r['ביטוח בריאות'],0),
            'פנסיה עובד': rows.reduce((s,r)=>s+r['פנסיה עובד'],0),
            'קרן השתלמות': rows.reduce((s,r)=>s+r['קרן השתלמות'],0),
            נטו: rows.reduce((s,r)=>s+r.נטו,0),
            'עלות מעסיק': rows.reduce((s,r)=>s+r['עלות מעסיק'],0),
          };
          sendSuccess(res, { title: `דוח שכר חודשי — ${period}`, period, status: run.status, rows, totals });
          return;
        }

        // ── 2. employee-cost — full employer cost per employee ────
        case 'employee-cost': {
          if (!period) { sendError(res, 'period required (YYYY-MM)'); return; }
          const run = await prisma.payrollRun.findFirst({
            where: { tenantId: req.user.tenantId, period },
            include: { payslips: { include: { employee: { select: { firstName: true, lastName: true, department: true, idNumber: true } } } } },
          });
          if (!run) { sendError(res, 'No payroll run for this period', 404); return; }
          const rows = run.payslips.map(p => ({
            שם:              `${p.employee.firstName} ${p.employee.lastName}`,
            'ת.ז.':           p.employee.idNumber,
            מחלקה:           p.employee.department,
            'שכר ברוטו':     Number(p.grossSalary),
            'פנסיה מעסיק':   Number(p.pensionEmployer),
            פיצויים:         Number(p.severancePay),
            'ב.ל. מעסיק':    Number(p.niEmployer),
            'קרן השתלמות מ.':Number(p.trainingFundEmployer),
            'עלות כוללת':    Number(p.totalEmployerCost),
            'עלות לשעה':     Number(p.totalEmployerCost) > 0 ? Math.round(Number(p.totalEmployerCost) / 182) : 0,
          }));
          sendSuccess(res, { title: `דוח עלות עובד — ${period}`, period, rows });
          return;
        }

        // ── 3. department — breakdown by department ───────────────
        case 'department': {
          if (!period) { sendError(res, 'period required (YYYY-MM)'); return; }
          const run = await prisma.payrollRun.findFirst({
            where: { tenantId: req.user.tenantId, period },
            include: { payslips: { include: { employee: { select: { firstName:true, lastName:true, department:true } } } } },
          });
          if (!run) { sendError(res, 'No payroll run for this period', 404); return; }
          const deptMap: Record<string,{count:number;gross:number;net:number;cost:number}> = {};
          for (const p of run.payslips) {
            const dept = p.employee.department || 'לא מוגדר';
            if (!deptMap[dept]) deptMap[dept] = { count:0, gross:0, net:0, cost:0 };
            deptMap[dept].count++;
            deptMap[dept].gross += Number(p.grossSalary);
            deptMap[dept].net   += Number(p.netSalary);
            deptMap[dept].cost  += Number(p.totalEmployerCost);
          }
          const rows = Object.entries(deptMap).map(([dept,d])=>({
            מחלקה: dept, עובדים: d.count,
            'ברוטו סה"כ': d.gross,
            'נטו סה"כ': d.net,
            'עלות מעסיק': d.cost,
            'ממוצע ברוטו': Math.round(d.gross/d.count),
          })).sort((a,b)=>b['עלות מעסיק']-a['עלות מעסיק']);
          sendSuccess(res, { title: `דוח לפי מחלקה — ${period}`, period, rows });
          return;
        }

        // ── 4. annual-employee — all months for one employee ──────
        case 'annual-employee': {
          const y = year ? Number(year) : new Date().getFullYear();
          const where: any = { tenantId: req.user.tenantId, period: { startsWith: String(y) } };
          if (employeeId) where.employeeId = employeeId;
          const payslips = await prisma.payslip.findMany({
            where,
            include: {
              employee: { select: { firstName:true, lastName:true, department:true } },
              payrollRun: { select: { period:true, status:true } },
            },
            orderBy: { period: 'asc' },
          });
          const rows = payslips.map(p => ({
            תקופה:        p.payrollRun?.period ?? p.period,
            עובד:         `${p.employee.firstName} ${p.employee.lastName}`,
            מחלקה:        p.employee.department,
            ברוטו:        Number(p.grossSalary),
            'מס הכנסה':   Number(p.incomeTax),
            'ביטוח לאומי':Number(p.nationalInsurance),
            נטו:          Number(p.netSalary),
            'עלות מעסיק': Number(p.totalEmployerCost),
            סטטוס:        p.payrollRun?.status ?? '—',
          }));
          sendSuccess(res, { title: `דוח שנתי לעובד — ${y}`, year: y, rows });
          return;
        }

        // ── 5. pension — pension contributions ────────────────────
        case 'pension': {
          if (!period) { sendError(res, 'period required (YYYY-MM)'); return; }
          const run = await prisma.payrollRun.findFirst({
            where: { tenantId: req.user.tenantId, period },
            include: {
              payslips: {
                include: {
                  employee: { select: { firstName:true, lastName:true, idNumber:true, pensionFund:true, pensionEmployee:true, pensionEmployer:true, severancePay:true } },
                },
              },
            },
          });
          if (!run) { sendError(res, 'No payroll run for this period', 404); return; }
          const rows = run.payslips.map(p => ({
            שם:             `${p.employee.firstName} ${p.employee.lastName}`,
            'ת.ז.':          p.employee.idNumber,
            'קרן פנסיה':    p.employee.pensionFund ?? 'לא מוגדר',
            'ברוטו לפנסיה': Number(p.grossSalary),
            '% עובד':       Number(p.employee.pensionEmployee),
            '% מעסיק':      Number(p.employee.pensionEmployer),
            '% פיצויים':    Number(p.employee.severancePay),
            'פנסיה עובד':   Number(p.pensionEmployee),
            'פנסיה מעסיק':  Number(p.pensionEmployer),
            פיצויים:        Number(p.severancePay),
            'סה"כ לקרן':    Number(p.pensionEmployee)+Number(p.pensionEmployer)+Number(p.severancePay),
          }));
          const totals = {
            שם:'סה"כ', 'ת.ז.':'', 'קרן פנסיה':'', 'ברוטו לפנסיה':rows.reduce((s,r)=>s+r['ברוטו לפנסיה'],0),
            '% עובד':0,'% מעסיק':0,'% פיצויים':0,
            'פנסיה עובד':rows.reduce((s,r)=>s+r['פנסיה עובד'],0),
            'פנסיה מעסיק':rows.reduce((s,r)=>s+r['פנסיה מעסיק'],0),
            פיצויים:rows.reduce((s,r)=>s+r.פיצויים,0),
            'סה"כ לקרן':rows.reduce((s,r)=>s+r['סה"כ לקרן'],0),
          };
          sendSuccess(res, { title: `דוח פנסיה — ${period}`, period, rows, totals });
          return;
        }

        // ── 6. tax — income tax & NI summary ─────────────────────
        case 'tax': {
          if (!period) { sendError(res, 'period required (YYYY-MM)'); return; }
          const run = await prisma.payrollRun.findFirst({
            where: { tenantId: req.user.tenantId, period },
            include: { payslips: { include: { employee: { select: { firstName:true,lastName:true,idNumber:true,taxCredits:true } } } } },
          });
          if (!run) { sendError(res, 'No payroll run for this period', 404); return; }
          const rows = run.payslips.map(p => ({
            שם:             `${p.employee.firstName} ${p.employee.lastName}`,
            'ת.ז.':          p.employee.idNumber,
            'הכנסה חייבת':  Number(p.taxableIncome),
            'נק. זיכוי':    Number(p.employee.taxCredits),
            'ערך נק. זיכוי':Number(p.employee.taxCredits)*248,
            'מס הכנסה':     Number(p.incomeTax),
            'ב.ל. עובד':    Number(p.nationalInsurance),
            'ביטוח בריאות': Number(p.healthInsurance),
            'ב.ל. מעסיק':   Number(p.niEmployer),
            'סה"כ מסים':    Number(p.incomeTax)+Number(p.nationalInsurance)+Number(p.healthInsurance),
          }));
          const totals = {
            שם:'סה"כ','ת.ז.':'','הכנסה חייבת':rows.reduce((s,r)=>s+r['הכנסה חייבת'],0),
            'נק. זיכוי':0,'ערך נק. זיכוי':0,
            'מס הכנסה':rows.reduce((s,r)=>s+r['מס הכנסה'],0),
            'ב.ל. עובד':rows.reduce((s,r)=>s+r['ב.ל. עובד'],0),
            'ביטוח בריאות':rows.reduce((s,r)=>s+r['ביטוח בריאות'],0),
            'ב.ל. מעסיק':rows.reduce((s,r)=>s+r['ב.ל. מעסיק'],0),
            'סה"כ מסים':rows.reduce((s,r)=>s+r['סה"כ מסים'],0),
          };
          sendSuccess(res, { title: `דוח מסים — ${period}`, period, rows, totals });
          return;
        }

        // ── 7. multi-period — compare several months ──────────────
        case 'multi-period': {
          const y = year ? Number(year) : new Date().getFullYear();
          const runs = await prisma.payrollRun.findMany({
            where: { tenantId: req.user.tenantId, period: { startsWith: String(y) } },
            orderBy: { period: 'asc' },
          });
          const rows = runs.map(r => ({
            תקופה:         r.period,
            סטטוס:         r.status,
            'ברוטו כולל':  Number(r.totalGross),
            'נטו כולל':    Number(r.totalNet),
            'מס הכנסה':    Number(r.totalTax),
            'ב.ל.':        Number(r.totalNI),
            'פנסיה':       Number(r.totalPension),
          }));
          sendSuccess(res, { title: `השוואה חודשית — ${y}`, year: y, rows });
          return;
        }

        default:
          sendError(res, `Unknown report type: ${type}. Valid: monthly-summary, employee-cost, department, annual-employee, pension, tax, multi-period`);
      }
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ─── GET /payroll/termination-calc/:employeeId ────────────────────
// Calculates severance + notice + vacation payout on termination
router.get(
  '/termination-calc/:employeeId',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { terminationDate } = req.query as { terminationDate?: string };
    const termDate = terminationDate ? new Date(terminationDate) : new Date();

    const emp = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!emp || emp.tenantId !== req.user.tenantId) { sendError(res, 'Employee not found', 404); return; }

    const startDate    = new Date(emp.startDate);
    const grossSalary  = Number(emp.grossSalary);
    const dailyRate    = grossSalary / 30;
    const hourlyRate   = grossSalary / 182;

    // Seniority in months and years
    const totalMonths  = (termDate.getFullYear()-startDate.getFullYear())*12 + (termDate.getMonth()-startDate.getMonth());
    const totalYears   = totalMonths / 12;

    // Severance pay (פיצויי פיטורים) — 1 month per year (pro-rata)
    const severancePay = grossSalary * Math.max(0, totalYears);

    // Notice period (הודעה מוקדמת) — by seniority per Israeli law
    let noticeDays = 0;
    if (totalMonths < 6)  noticeDays = totalMonths;      // 1 day per month in first 6 months
    else if (totalMonths < 12) noticeDays = 6 + Math.floor((totalMonths-6)*0.5);
    else noticeDays = 30;  // max 30 days after 1 year

    // Vacation payout — days × daily rate (average 90-day)
    // Vacation accrual: 14 days/year for first 5 years, 16 for 6-10, 18 for 11+
    const vacDaysPerYear = totalYears >= 11 ? 18 : totalYears >= 6 ? 16 : 14;
    const accrued = Math.floor(vacDaysPerYear * totalYears);
    // Get used vacation from leave requests
    const yr = termDate.getFullYear();
    const usedLeave = await prisma.leaveRequest.aggregate({
      where: { employeeId: emp.id, status: 'APPROVED', leaveType: { name: { contains: 'חופשה' } } as any },
      _sum: { totalDays: true },
    });
    const usedVacationDays = usedLeave._sum.totalDays ?? 0;
    const remainingVacation = Math.max(0, accrued - Number(usedVacationDays));
    const vacationPayout = remainingVacation * dailyRate;

    // Recuperation (הבראה) payout on termination
    const recupDays = totalYears >= 10 ? 10 : totalYears >= 4 ? Math.floor(5 + (totalYears-4)) : Math.floor(totalYears * 5/4);
    const recupPayout = recupDays * 438; // 2026 rate

    // Sick leave balance (accrual 18/year, max 90)
    const sickAccrued = Math.min(90, Math.floor(18 * totalYears));

    sendSuccess(res, {
      employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, startDate: emp.startDate },
      terminationDate: termDate.toISOString(),
      seniority: { totalMonths, totalYears: Math.round(totalYears*100)/100 },
      calculation: {
        grossSalary, dailyRate: Math.round(dailyRate*100)/100,
        severancePay:    Math.round(severancePay),
        noticeDays,      noticePay:   Math.round(noticeDays * dailyRate),
        vacationBalance: remainingVacation, vacationPayout: Math.round(vacationPayout),
        recupDays,       recupPayout: Math.round(recupPayout),
        sickLeaveBalance: sickAccrued,
        totalLiability:  Math.round(severancePay + noticeDays*dailyRate + vacationPayout + recupPayout),
      },
    });
  }
);

// ─── GET /payroll/payslips/:id/pdf ────────────────────────────────
// Download a payslip as a PDF. Also fires an async email to the employee.
router.get(
  '/payslips/:id/pdf',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payslip = await prisma.payslip.findFirst({
        where:   { id: req.params.id, tenantId: req.user.tenantId },
        include: { employee: { include: { user: true } } },
      });

      if (!payslip) { sendError(res, 'Payslip not found', 404); return; }

      const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });

      const emp     = payslip.employee;
      const bd      = (payslip.breakdown as any) ?? {};
      const name    = `${emp.firstName} ${emp.lastName}`;

      const pdfBuffer = generatePayslipPDF({
        payslip: {
          id:                         payslip.id,
          period:                     payslip.period,
          grossSalary:                Number(payslip.grossSalary),
          netSalary:                  Number(payslip.netSalary),
          incomeTax:                  Number(payslip.incomeTax),
          nationalInsuranceEmployee:  Number(payslip.nationalInsurance),
          nationalInsuranceEmployer:  Number(payslip.niEmployer),
          healthInsurance:            Number(payslip.healthInsurance),
          pensionEmployee:            Number(payslip.pensionEmployee),
          pensionEmployer:            Number(payslip.pensionEmployer),
          trainingFundEmployee:       Number(payslip.trainingFundEmployee),
          trainingFundEmployer:       Number(payslip.trainingFundEmployer),
          sickDays:                   payslip.sickDays ?? 0,
          vacationDays:               bd.vacationAccruedDays ?? 0,
          recuperationPay:            bd.recuperationPay  ?? 0,
          recuperationDays:           (payslip as any).recuperationDays ?? bd.recuperationDays ?? 0,
          overtimePay:                bd.overtimePay125 != null
                                        ? (Number(bd.overtimePay125 ?? 0) + Number(bd.overtimePay150 ?? 0))
                                        : ((payslip as any).overtimePay ?? 0),
          overtimeHours:              bd.adjustments?.overtime125Hours != null
                                        ? (Number(bd.adjustments.overtime125Hours ?? 0) + Number(bd.adjustments.overtime150Hours ?? 0))
                                        : ((payslip as any).overtimeHours ?? 0),
          baseSalary:                 bd.baseSalary ?? Number(payslip.grossSalary),
        },
        employeeName:     name,
        employeeId:       emp.id,
        idNumber:         emp.idNumber,
        jobTitle:         emp.jobTitle,
        department:       emp.department,
        companyName:      tenant?.name ?? 'החברה',
        companyVatNumber: tenant?.vatNumber ?? tenant?.businessNumber,
      });

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="payslip-${payslip.period}.pdf"`);
      res.send(pdfBuffer);

      // Fire-and-forget email (do not await)
      const userEmail = (emp as any).user?.email;
      if (userEmail) {
        const [yr, mo] = payslip.period.split('-').map(Number);
        sendPayslipEmail({
          to:           userEmail,
          employeeName: name,
          month:        mo,
          year:         yr,
          netSalary:    Number(payslip.netSalary),
          pdfBuffer,
        }).catch(() => {});
      }
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ─── POST /payroll/payslips/:id/send-email ─────────────────────
// Explicitly send a payslip PDF via email to the employee.
router.post(
  '/payslips/:id/send-email',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payslip = await prisma.payslip.findFirst({
        where:   { id: req.params.id, tenantId: req.user.tenantId },
        include: { employee: { include: { user: true } } },
      });

      if (!payslip) { sendError(res, 'Payslip not found', 404); return; }

      const emp    = payslip.employee;
      const email  = (emp as any).user?.email;
      if (!email) { sendError(res, 'Employee has no linked user email', 400); return; }

      const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
      const bd     = (payslip.breakdown as any) ?? {};
      const name   = `${emp.firstName} ${emp.lastName}`;

      const pdfBuffer = generatePayslipPDF({
        payslip: {
          id:                         payslip.id,
          period:                     payslip.period,
          grossSalary:                Number(payslip.grossSalary),
          netSalary:                  Number(payslip.netSalary),
          incomeTax:                  Number(payslip.incomeTax),
          nationalInsuranceEmployee:  Number(payslip.nationalInsurance),
          nationalInsuranceEmployer:  Number(payslip.niEmployer),
          healthInsurance:            Number(payslip.healthInsurance),
          pensionEmployee:            Number(payslip.pensionEmployee),
          pensionEmployer:            Number(payslip.pensionEmployer),
          trainingFundEmployee:       Number(payslip.trainingFundEmployee),
          trainingFundEmployer:       Number(payslip.trainingFundEmployer),
          sickDays:                   payslip.sickDays ?? 0,
          vacationDays:               bd.vacationAccruedDays ?? 0,
          recuperationPay:            bd.recuperationPay ?? 0,
          recuperationDays:           (payslip as any).recuperationDays ?? bd.recuperationDays ?? 0,
          overtimePay:                bd.overtimePay125 != null
                                        ? (Number(bd.overtimePay125 ?? 0) + Number(bd.overtimePay150 ?? 0))
                                        : ((payslip as any).overtimePay ?? 0),
          overtimeHours:              bd.adjustments?.overtime125Hours != null
                                        ? (Number(bd.adjustments.overtime125Hours ?? 0) + Number(bd.adjustments.overtime150Hours ?? 0))
                                        : ((payslip as any).overtimeHours ?? 0),
          baseSalary:                 bd.baseSalary ?? Number(payslip.grossSalary),
        },
        employeeName:     name,
        employeeId:       emp.id,
        idNumber:         emp.idNumber,
        jobTitle:         emp.jobTitle,
        department:       emp.department,
        companyName:      tenant?.name ?? 'החברה',
        companyVatNumber: tenant?.vatNumber ?? tenant?.businessNumber,
      });

      const [yr, mo] = payslip.period.split('-').map(Number);
      await sendPayslipEmail({
        to:           email,
        employeeName: name,
        month:        mo,
        year:         yr,
        netSalary:    Number(payslip.netSalary),
        pdfBuffer,
      });

      sendSuccess(res, { success: true, message: 'תלוש שכר נשלח בדוא"ל', to: email });
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ─── GET /payroll/reports/form102 ─────────────────────────────
// Download Form 102 (monthly employer report) as XLSX.
router.get(
  '/reports/form102',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const { period } = req.query as Record<string, string | undefined>;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      sendError(res, 'period is required and must be in YYYY-MM format'); return;
    }

    try {
      const buf = await generateForm102Excel(req.user.tenantId, period, prisma);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="form102-${period}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

// ─── GET /payroll/reports/form106/:employeeId ─────────────────
// Download Form 106 (annual wage certificate) as PDF.
router.get(
  '/reports/form106/:employeeId',
  requireMinRole('ACCOUNTANT') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Verify employee belongs to this tenant
    const emp = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!emp || emp.tenantId !== req.user.tenantId) {
      sendError(res, 'Employee not found', 404); return;
    }

    try {
      const buf = await generateForm106PDF(req.params.employeeId, year, prisma);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="form106-${req.params.employeeId}-${year}.pdf"`);
      res.send(buf);
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  }
);

export default router;
