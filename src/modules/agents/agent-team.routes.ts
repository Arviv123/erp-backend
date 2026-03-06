import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { AGENT_DEFINITIONS, runAgent, runCoordinator, AgentType } from './agent-team.service';

const router = Router();

// All routes below /api/agents/team require authentication and tenant isolation,
// except GET /agents which only lists definitions (still needs auth for consistency).
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ── GET /api/agents/team/agents ───────────────────────────────────────────────
// Returns the static list of agent definitions (no DB call needed).
router.get(
  '/agents',
  (_req: Request, res: Response) => {
    sendSuccess(res, AGENT_DEFINITIONS);
  },
);

// ── GET /api/agents/team/tasks ────────────────────────────────────────────────
// List AgentTasks for the current tenant with optional filters and pagination.
// Query params:
//   ?agentType=inventory|finance|sales|hr|purchasing|coordinator
//   ?limit=20   (default 20, max 100)
//   ?page=1
router.get(
  '/tasks',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      agentType: z.string().optional(),
      page:      z.coerce.number().int().min(1).default(1),
      limit:     z.coerce.number().int().min(1).max(100).default(20),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return sendError(res, parsed.error.message, 400);

    const { agentType, page, limit } = parsed.data;

    const where = withTenant(req, {
      ...(agentType ? { agentType } : {}),
    });

    const [tasks, total] = await Promise.all([
      prisma.agentTask.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          agentType: true,
          status: true,
          summary: true,
          findings: true,
          triggeredBy: true,
          provider: true,
          tokensUsed: true,
          startedAt: true,
          completedAt: true,
          error: true,
        },
      }),
      prisma.agentTask.count({ where }),
    ]);

    sendSuccess(res, tasks, 200, { total, page, pageSize: limit });
  }),
);

// ── GET /api/agents/team/tasks/:id ───────────────────────────────────────────
// Get a single AgentTask by ID (scoped to the current tenant).
router.get(
  '/tasks/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const task = await prisma.agentTask.findFirst({
      where: withTenant(req, { id: req.params['id'] }),
    });

    if (!task) return sendError(res, 'משימת סוכן לא נמצאה', 404);

    sendSuccess(res, task);
  }),
);

// ── POST /api/agents/team/run ─────────────────────────────────────────────────
// Run the coordinator agent, which internally runs all 5 specialist agents
// in parallel and then produces an executive summary.
router.post(
  '/run',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await runCoordinator(req.user.tenantId, req.user.userId);
      sendSuccess(res, result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'שגיאה בהפעלת הסוכנים';
      sendError(res, message, 500);
    }
  }),
);

// ── POST /api/agents/team/:agentType/run ──────────────────────────────────────
// Run a single specialist agent by type.
// Valid types: inventory | finance | sales | hr | purchasing
// Body (optional):
//   { provider?: string }
router.post(
  '/:agentType/run',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const VALID_TYPES: AgentType[] = ['inventory', 'finance', 'sales', 'hr', 'purchasing', 'coordinator'];
    const agentType = req.params['agentType'] as AgentType;

    if (!VALID_TYPES.includes(agentType)) {
      return sendError(
        res,
        `סוג סוכן לא חוקי. אפשרויות: ${VALID_TYPES.join(', ')}`,
        400,
      );
    }

    // If someone POSTs to /coordinator/run route, redirect to the coordinator flow
    if (agentType === 'coordinator') {
      try {
        const result = await runCoordinator(req.user.tenantId, req.user.userId);
        return sendSuccess(res, result, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'שגיאה בהפעלת הסוכן המתאם';
        return sendError(res, message, 500);
      }
    }

    const bodySchema = z.object({
      provider: z.string().optional(),
    });
    const bodyParsed = bodySchema.safeParse(req.body);
    const provider = bodyParsed.success ? bodyParsed.data.provider : undefined;

    try {
      const result = await runAgent(req.user.tenantId, agentType, req.user.userId, provider);
      sendSuccess(res, result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : `שגיאה בהפעלת סוכן ${agentType}`;
      sendError(res, message, 500);
    }
  }),
);

// ── DELETE /api/agents/team/tasks/:id ────────────────────────────────────────
// Delete an AgentTask record. ADMIN role required.
router.delete(
  '/tasks/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await prisma.agentTask.deleteMany({
      where: withTenant(req, { id: req.params['id'] }),
    });

    if (deleted.count === 0) return sendError(res, 'משימת סוכן לא נמצאה', 404);

    sendSuccess(res, { deleted: true, id: req.params['id'] });
  }),
);

export default router;
