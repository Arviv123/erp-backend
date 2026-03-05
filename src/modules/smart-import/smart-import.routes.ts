import { Router, Response } from 'express';
import { z } from 'zod';
import { SmartImportSourceType, SmartImportEntityType, SmartImportStatus } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  createImportJob,
  listImportJobs,
  getImportJob,
  deleteImportJob,
  retryImportJob,
  analyzeImportJob,
  confirmMapping,
  executeImport,
  getTemplate,
} from './smart-import.service';

const router = Router();

// ── Auth + tenant isolation on every route ────────────────────────────────────
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createJobSchema = z.object({
  name:             z.string().min(1, 'name is required'),
  sourceType:       z.nativeEnum(SmartImportSourceType),
  entityType:       z.nativeEnum(SmartImportEntityType),
  rawData:          z.string().min(1, 'rawData is required'),
  originalFilename: z.string().optional(),
});

const confirmMappingSchema = z.object({
  fieldMapping: z.record(z.string(), z.string()),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /smart-import
// Create a new import job.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parse = createJobSchema.safeParse(req.body);
    if (!parse.success) {
      sendError(res, parse.error.errors.map(e => e.message).join(', '), 400);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;
    const userId   = req.user.userId;

    const job = await createImportJob(tenantId, userId, parse.data);
    sendSuccess(res, job, 201);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /smart-import/:id/analyze
// Parse the raw file and get AI field mapping suggestions.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/analyze',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const jobId    = req.params.id;

    try {
      const result = await analyzeImportJob(tenantId, jobId);
      sendSuccess(res, result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /smart-import/:id/confirm-mapping
// Save the confirmed field mapping and set status to MAPPED.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/confirm-mapping',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parse = confirmMappingSchema.safeParse(req.body);
    if (!parse.success) {
      sendError(res, parse.error.errors.map(e => e.message).join(', '), 400);
      return;
    }

    const tenantId = withTenant(req).tenantId as string;
    const jobId    = req.params.id;

    try {
      await confirmMapping(tenantId, jobId, parse.data.fieldMapping);
      const job = await getImportJob(tenantId, jobId);
      sendSuccess(res, job);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /smart-import/:id/execute
// Execute the import using the confirmed mapping.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/execute',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const userId   = req.user.userId;
    const jobId    = req.params.id;

    try {
      // Validate job exists
      const job = await getImportJob(tenantId, jobId);

      if (job.status !== SmartImportStatus.MAPPED && job.status !== SmartImportStatus.PENDING) {
        sendError(res, `Cannot execute job in status "${job.status}". Must be MAPPED or PENDING.`, 409);
        return;
      }

      // Execute asynchronously — respond immediately with job info
      void executeImport(jobId, tenantId, userId);

      const updatedJob = await getImportJob(tenantId, jobId);
      sendSuccess(res, { message: 'Import started', job: updatedJob });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /smart-import
// List all import jobs for the tenant.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    const { entityType, status, sourceType, page = '1', limit = '20' } = req.query;

    const filters = {
      ...(entityType  ? { entityType:  entityType  as SmartImportEntityType  } : {}),
      ...(status      ? { status:      status      as SmartImportStatus      } : {}),
      ...(sourceType  ? { sourceType:  sourceType  as SmartImportSourceType  } : {}),
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
// GET /smart-import/:id
// Get a single import job with full details (including validation errors).
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    try {
      const job = await getImportJob(tenantId, req.params.id);
      sendSuccess(res, job);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /smart-import/:id
// Delete an import job.
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;

    try {
      await deleteImportJob(tenantId, req.params.id);
      sendSuccess(res, { deleted: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /smart-import/:id/retry
// Reset a failed job to PENDING and re-execute.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/retry',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = withTenant(req).tenantId as string;
    const userId   = req.user.userId;

    try {
      await retryImportJob(tenantId, req.params.id, userId);
      const job = await getImportJob(tenantId, req.params.id);
      sendSuccess(res, job);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('not found')) {
        sendError(res, msg, 404);
        return;
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /smart-import/templates/:entityType/:sourceType
// Return example CSV/text template headers for the given entity + source combo.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/templates/:entityType/:sourceType',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { entityType, sourceType } = req.params;

    // Validate enums
    if (!Object.values(SmartImportEntityType).includes(entityType as SmartImportEntityType)) {
      sendError(res, `Invalid entityType: ${entityType}. Valid: ${Object.values(SmartImportEntityType).join(', ')}`, 400);
      return;
    }
    if (!Object.values(SmartImportSourceType).includes(sourceType as SmartImportSourceType)) {
      sendError(res, `Invalid sourceType: ${sourceType}. Valid: ${Object.values(SmartImportSourceType).join(', ')}`, 400);
      return;
    }

    const csv = getTemplate(
      entityType as SmartImportEntityType,
      sourceType as SmartImportSourceType,
    );

    const isCSV = !csv.startsWith('#');
    if (isCSV) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="template-${entityType.toLowerCase()}-${sourceType.toLowerCase()}.csv"`,
      );
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    res.status(200).send(csv);
  }),
);

export default router;
