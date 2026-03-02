import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Expense Reports ──────────────────────────────────────────────

const ExpenseLineSchema = z.object({
  date:        z.string().datetime(),
  category:    z.string().min(1), // נסיעות / ארוחות / ציוד / אחר
  description: z.string().min(1),
  amount:      z.number().positive(),
  vatAmount:   z.number().min(0).default(0),
  receiptUrl:  z.string().url().optional(),
  accountId:   z.string().cuid().optional(),
  notes:       z.string().optional(),
});

// GET /expenses — list my reports (or all for admin/accountant)
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, employeeId, page = '1', pageSize = '25' } = req.query;
  const isPrivileged = ['ADMIN', 'HR_MANAGER', 'ACCOUNTANT'].includes(req.user.role);

  // Non-privileged users can only see their own expense reports
  let targetEmployeeId = employeeId as string | undefined;
  if (!isPrivileged) {
    const emp = await prisma.employee.findFirst({ where: { tenantId: req.user.tenantId, userId: req.user.userId } });
    targetEmployeeId = emp?.id;
    if (!targetEmployeeId) { sendSuccess(res, []); return; }
  }

  const where = withTenant(req, {
    ...(status           ? { status: status as any }                   : {}),
    ...(targetEmployeeId ? { employeeId: targetEmployeeId }            : {}),
  });

  const [items, total] = await Promise.all([
    prisma.expenseReport.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true } }, _count: { select: { expenses: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
    }),
    prisma.expenseReport.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
}));

// GET /expenses/:id
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findUnique({
    where:   { id: req.params.id },
    include: { expenses: { orderBy: { date: 'asc' } }, employee: { select: { firstName: true, lastName: true } } },
  });
  if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Expense report not found', 404); return; }
  sendSuccess(res, report);
}));

// POST /expenses — create new report with lines
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    title:    z.string().min(1),
    period:   z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
    notes:    z.string().optional(),
    expenses: z.array(ExpenseLineSchema).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  // Find employee linked to this user
  const employee = await prisma.employee.findFirst({
    where: { tenantId: req.user.tenantId, userId: req.user.userId },
  });
  if (!employee) { sendError(res, 'No employee profile linked to this user', 403); return; }

  const totalAmount = parsed.data.expenses.reduce((s, e) => s + e.amount, 0);

  const report = await prisma.expenseReport.create({
    data: {
      tenantId:   req.user.tenantId,
      employeeId: employee.id,
      title:      parsed.data.title,
      period:     parsed.data.period,
      notes:      parsed.data.notes,
      status:     'DRAFT',
      totalAmount,
      expenses: {
        create: parsed.data.expenses.map(e => ({
          tenantId:   req.user.tenantId,
          date:       new Date(e.date),
          category:   e.category,
          description: e.description,
          amount:     e.amount,
          vatAmount:  e.vatAmount,
          receiptUrl: e.receiptUrl,
          accountId:  e.accountId,
          notes:      e.notes,
        })),
      },
    },
    include: { expenses: true },
  });
  sendSuccess(res, report, 201);
}));

// POST /expenses/:id/expenses — add line to existing report
router.post('/:id/expenses', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
  if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Report not found', 404); return; }
  if (!['DRAFT'].includes(report.status)) { sendError(res, 'Cannot add expenses to a submitted report', 400); return; }

  const parsed = ExpenseLineSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const expense = await prisma.expense.create({
    data: {
      reportId:    req.params.id,
      tenantId:    req.user.tenantId,
      date:        new Date(parsed.data.date),
      category:    parsed.data.category,
      description: parsed.data.description,
      amount:      parsed.data.amount,
      vatAmount:   parsed.data.vatAmount,
      receiptUrl:  parsed.data.receiptUrl,
      accountId:   parsed.data.accountId,
      notes:       parsed.data.notes,
    },
  });

  // Recalculate report total
  const allExpenses = await prisma.expense.findMany({ where: { reportId: req.params.id } });
  const newTotal = allExpenses.reduce((s, e) => s + Number(e.amount), 0);
  await prisma.expenseReport.update({ where: { id: req.params.id }, data: { totalAmount: newTotal } });

  sendSuccess(res, expense, 201);
}));

// POST /expenses/:id/submit — submit for approval
router.post('/:id/submit', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
  if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Report not found', 404); return; }
  if (report.status !== 'DRAFT') { sendError(res, 'Only DRAFT reports can be submitted', 400); return; }

  const updated = await prisma.expenseReport.update({
    where: { id: req.params.id },
    data:  { status: 'SUBMITTED' },
  });
  sendSuccess(res, updated);
}));

// POST /expenses/:id/approve — HR/Admin approves
router.post('/:id/approve', requireMinRole('HR_MANAGER') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
  if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Report not found', 404); return; }
  if (report.status !== 'SUBMITTED') { sendError(res, 'Only SUBMITTED reports can be approved', 400); return; }

  const updated = await prisma.expenseReport.update({
    where: { id: req.params.id },
    data:  { status: 'APPROVED', approvedBy: req.user.userId, approvedAt: new Date() },
  });
  sendSuccess(res, updated);
}));

// POST /expenses/:id/reject — HR/Admin rejects
router.post('/:id/reject', requireMinRole('HR_MANAGER') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ reason: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
  if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Report not found', 404); return; }
  if (report.status !== 'SUBMITTED') { sendError(res, 'Only SUBMITTED reports can be rejected', 400); return; }

  const updated = await prisma.expenseReport.update({
    where: { id: req.params.id },
    data:  { status: 'REJECTED', rejectedReason: parsed.data.reason },
  });
  sendSuccess(res, updated);
}));

// POST /expenses/:id/pay — mark as reimbursed (Accountant)
router.post('/:id/pay', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.expenseReport.findUnique({
    where:   { id: req.params.id },
    include: { expenses: true },
  });
  if (!report || report.tenantId !== req.user.tenantId) { sendError(res, 'Report not found', 404); return; }
  if (report.status !== 'APPROVED') { sendError(res, 'Only APPROVED reports can be paid', 400); return; }

  // Try to post GL entry
  // DR: Expense accounts (by accountId or default general expenses)
  // CR: Bank (1200) or Employee Payable
  try {
    const bankAcc = await prisma.account.findFirst({
      where: { tenantId: req.user.tenantId, code: '1200', isActive: true },
    });

    if (bankAcc) {
      const expenseLines = report.expenses;
      const glLines = await Promise.all(expenseLines.map(async (exp) => {
        let expenseAccountId = exp.accountId;
        if (!expenseAccountId) {
          const defaultExpAcc = await prisma.account.findFirst({
            where: { tenantId: req.user.tenantId, code: '6300', isActive: true },
          });
          expenseAccountId = defaultExpAcc?.id ?? null;
        }
        return expenseAccountId ? {
          debitAccountId:  expenseAccountId,
          creditAccountId: bankAcc.id,
          amount:          Number(exp.amount),
          description:     exp.description,
          sortOrder:       0,
        } : null;
      }));

      const validLines = glLines.filter(Boolean) as any[];
      if (validLines.length > 0) {
        await prisma.transaction.create({
          data: {
            tenantId:    req.user.tenantId,
            date:        new Date(),
            reference:   `EXP-${report.id.slice(-8)}`,
            description: `תשלום דו"ח הוצאות: ${report.title}`,
            sourceType:  'EXPENSE',
            sourceId:    report.id,
            totalAmount: Number(report.totalAmount),
            status:      'POSTED',
            postedAt:    new Date(),
            createdBy:   req.user.userId,
            lines:       { create: validLines },
          },
        });
      }
    }
  } catch { /* GL posting failure is non-blocking */ }

  const updated = await prisma.expenseReport.update({
    where: { id: req.params.id },
    data:  { status: 'PAID', paidAt: new Date() },
  });
  sendSuccess(res, updated);
}));

// ─── Analytics ────────────────────────────────────────────────────

router.get('/reports/summary', requireMinRole('HR_MANAGER') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { year = new Date().getFullYear().toString() } = req.query;

  const reports = await prisma.expenseReport.findMany({
    where:   withTenant(req, { period: { startsWith: year as string } }),
    include: { employee: { select: { firstName: true, lastName: true } }, expenses: { select: { category: true, amount: true } } },
  });

  const byStatus = reports.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + Number(r.totalAmount);
    return acc;
  }, {} as Record<string, number>);

  const byCategory = reports.flatMap(r => r.expenses).reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {} as Record<string, number>);

  const total = reports.reduce((s, r) => s + Number(r.totalAmount), 0);

  sendSuccess(res, { total, byStatus, byCategory, count: reports.length });
}));

export default router;
