import { Router, Response } from 'express';
import { authenticate }                       from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole }                     from '../../middleware/rbac';
import { AuthenticatedRequest }               from '../../shared/types';
import { sendSuccess, sendError }             from '../../shared/utils/response';
import { asyncHandler }                       from '../../shared/utils/asyncHandler';
import { ContractStatus }                     from '@prisma/client';
import {
  CreateContractSchema,
  UpdateContractSchema,
  TerminateContractSchema,
  listContracts,
  getContract,
  createContract,
  updateContract,
  activateContract,
  pauseContract,
  resumeContract,
  terminateContract,
  checkExpiredContracts,
  generateContractInvoices,
  getContractRenewalReport,
  getContractValueSummary,
} from './contracts.service';

const router = Router();

// Apply auth + tenant isolation to every route in this router
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET / — list contracts (paginated) ──────────────────────────
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, customerId, page = '1', limit = '25' } = req.query;
    const tenantId = withTenant(req).tenantId as string;

    const data = await listContracts(tenantId, {
      status:     status     ? (status     as ContractStatus) : undefined,
      customerId: customerId ? (customerId as string)         : undefined,
      page:       parseInt(page  as string, 10),
      limit:      parseInt(limit as string, 10),
    });

    sendSuccess(res, data.items, 200, {
      total:    data.total,
      page:     data.page,
      pageSize: data.limit,
    });
  })
);

// ─── POST / — create a contract ───────────────────────────────────
router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateContractSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await createContract(tenantId, parsed.data);
      sendSuccess(res, record, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Create failed';
      sendError(res, message);
    }
  })
);

// ─── GET /generate-invoices — run billing generation for this tenant
// MUST be declared BEFORE /:id to avoid route capture.
router.get(
  '/generate-invoices',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    // First mark any expired contracts
    await checkExpiredContracts(tenantId);

    const result = await generateContractInvoices(tenantId);
    sendSuccess(res, result);
  })
);

// ─── GET /renewal-report — contracts expiring soon (?days=30) ────
// MUST be declared BEFORE /:id to avoid route capture.
router.get(
  '/renewal-report',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId  = withTenant(req).tenantId as string;
    const daysParam = req.query.days as string | undefined;
    const days      = daysParam ? parseInt(daysParam, 10) : 30;

    const report = await getContractRenewalReport(tenantId, days);
    sendSuccess(res, report);
  })
);

// ─── GET /value-summary — portfolio summary ───────────────────────
// MUST be declared BEFORE /:id to avoid route capture.
router.get(
  '/value-summary',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const summary  = await getContractValueSummary(tenantId);
    sendSuccess(res, summary);
  })
);

// ─── GET /:id — get single contract ──────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await getContract(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch {
      sendError(res, 'Contract not found', 404);
    }
  })
);

// ─── PUT /:id — update contract ───────────────────────────────────
router.put(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = UpdateContractSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await updateContract(req.params.id, tenantId, parsed.data);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      sendError(res, message);
    }
  })
);

// ─── POST /:id/activate ───────────────────────────────────────────
router.post(
  '/:id/activate',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await activateContract(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Activate failed';
      sendError(res, message);
    }
  })
);

// ─── POST /:id/pause ──────────────────────────────────────────────
router.post(
  '/:id/pause',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await pauseContract(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pause failed';
      sendError(res, message);
    }
  })
);

// ─── POST /:id/resume ─────────────────────────────────────────────
router.post(
  '/:id/resume',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await resumeContract(req.params.id, tenantId);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resume failed';
      sendError(res, message);
    }
  })
);

// ─── POST /:id/terminate ─────────────────────────────────────────
router.post(
  '/:id/terminate',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = TerminateContractSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;

    try {
      const record = await terminateContract(req.params.id, tenantId, parsed.data);
      sendSuccess(res, record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terminate failed';
      sendError(res, message);
    }
  })
);

export default router;
