import { Router, Response } from 'express';
import { ImportEntityType, ImportJobStatus } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  listImportJobs,
  getImportJob,
  importCustomers,
  importProducts,
  importEmployees,
  importVendors,
  getImportTemplate,
} from './bulk-import.service';

const router = Router();

// ── Auth + tenant isolation on every route ────────────────────────────────────
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─────────────────────────────────────────────────────────────────────────────
// GET /bulk-import/jobs
// List import jobs for the current tenant (paginated, filterable).
// Accessible to all authenticated + tenant-isolated users (read-only).
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/jobs',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { entityType, status, page = '1', limit = '20' } = req.query;
    const tenantId = withTenant(req).tenantId as string;

    const filters = {
      ...(entityType ? { entityType: entityType as ImportEntityType } : {}),
      ...(status     ? { status: status as ImportJobStatus }         : {}),
      page:  parseInt(page  as string, 10),
      limit: parseInt(limit as string, 10),
    };

    const result = await listImportJobs(tenantId, filters);
    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /bulk-import/jobs/:id
// Get a single job with full error list.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/jobs/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    try {
      const job = await getImportJob(req.params.id, tenantId);
      sendSuccess(res, job);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'Import job not found') {
        sendError(res, 'Import job not found', 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /bulk-import/template/:entityType
// Download a sample CSV template for the given entity type.
// No role restriction — useful for all users preparing an import.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/template/:entityType',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { entityType } = req.params;
    try {
      const csv = getImportTemplate(entityType);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="template-${entityType.toLowerCase()}.csv"`,
      );
      res.status(200).send(csv);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      sendError(res, msg, 400);
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /bulk-import/customers
// Body: { csvContent: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/customers',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { csvContent } = req.body as { csvContent?: string };
    if (!csvContent || typeof csvContent !== 'string') {
      sendError(res, 'csvContent (string) is required in the request body', 400);
      return;
    }

    const tenantId  = withTenant(req).tenantId as string;
    const createdBy = req.user.userId;
    const result    = await importCustomers(tenantId, csvContent, createdBy);
    sendSuccess(res, result, 201);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /bulk-import/products
// Body: { csvContent: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/products',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { csvContent } = req.body as { csvContent?: string };
    if (!csvContent || typeof csvContent !== 'string') {
      sendError(res, 'csvContent (string) is required in the request body', 400);
      return;
    }

    const tenantId  = withTenant(req).tenantId as string;
    const createdBy = req.user.userId;
    const result    = await importProducts(tenantId, csvContent, createdBy);
    sendSuccess(res, result, 201);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /bulk-import/employees
// Body: { csvContent: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/employees',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { csvContent } = req.body as { csvContent?: string };
    if (!csvContent || typeof csvContent !== 'string') {
      sendError(res, 'csvContent (string) is required in the request body', 400);
      return;
    }

    const tenantId  = withTenant(req).tenantId as string;
    const createdBy = req.user.userId;
    const result    = await importEmployees(tenantId, csvContent, createdBy);
    sendSuccess(res, result, 201);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /bulk-import/vendors
// Body: { csvContent: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/vendors',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { csvContent } = req.body as { csvContent?: string };
    if (!csvContent || typeof csvContent !== 'string') {
      sendError(res, 'csvContent (string) is required in the request body', 400);
      return;
    }

    const tenantId  = withTenant(req).tenantId as string;
    const createdBy = req.user.userId;
    const result    = await importVendors(tenantId, csvContent, createdBy);
    sendSuccess(res, result, 201);
  }),
);

export default router;
