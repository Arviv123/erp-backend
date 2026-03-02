import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';
import * as PayrollService from './payroll.service';

const router = Router();

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// POST /payroll/run
router.post(
  '/run',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      sendError(res, 'period must be YYYY-MM format');
      return;
    }

    try {
      const run = await PayrollService.runPayroll(
        req.user.tenantId,
        parsed.data.period,
        req.user.userId
      );
      sendSuccess(res, run, 201);
    } catch (err: any) {
      sendError(res, err.message);
    }
  }
);

// GET /payroll/runs
router.get('/runs', async (req: AuthenticatedRequest, res: Response) => {
  const runs = await prisma.payrollRun.findMany({
    where:   { tenantId: req.user.tenantId },
    orderBy: { period: 'desc' },
    include: { _count: { select: { payslips: true } } },
  });
  sendSuccess(res, runs);
});

// GET /payroll/runs/:id/payslips
router.get('/runs/:id/payslips', async (req: AuthenticatedRequest, res: Response) => {
  const run = await prisma.payrollRun.findUnique({
    where:   { id: req.params.id },
    include: {
      payslips: {
        include: {
          employee: { select: { firstName: true, lastName: true, idNumber: true } },
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

// POST /payroll/runs/:id/approve
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

// POST /payroll/runs/:id/paid
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

// GET /payroll/payslips/:id
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

// GET /payroll/preview/:employeeId  (calculate without saving)
router.get(
  '/preview/:employeeId',
  requireMinRole('HR_MANAGER') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preview = await PayrollService.previewEmployeePayslip(
        req.params.employeeId,
        req.user.tenantId
      );
      sendSuccess(res, preview);
    } catch (err: any) {
      sendError(res, err.message, 404);
    }
  }
);

export default router;
