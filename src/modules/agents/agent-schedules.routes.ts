import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { decryptKey } from './encryption';
import { streamProvider, PROVIDERS, ChatMessage } from './providers';
import { getSystemPrompt } from './prompts';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ── Helper: compute nextRunAt from a cron expression ─────────────────────────
function computeNextRunAt(cronExpression: string): Date | null {
  try {
    // Dynamically require cron-parser so the file doesn't crash if it's absent
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseExpression } = require('cron-parser') as {
      parseExpression: (expr: string, opts?: object) => { next(): { toDate(): Date } };
    };
    const interval = parseExpression(cronExpression, { utc: true });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

// ── Validation schema ─────────────────────────────────────────────────────────
const scheduleSchema = z.object({
  name:           z.string().min(1).max(100),
  description:    z.string().optional(),
  cronExpression: z.string().min(5),
  agentProfileId: z.string().optional().nullable(),
  taskPrompt:     z.string().min(1),
  domain:         z.string().default('general'),
  provider:       z.string().optional().nullable(),
  model:          z.string().optional().nullable(),
  isEnabled:      z.boolean().default(true),
});

const scheduleUpdateSchema = scheduleSchema.partial();

// ── GET /agents/schedules ─────────────────────────────────────────────────────
// List all schedules for the tenant, including agentProfile and last run summary.
router.get(
  '/schedules',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schedules = await prisma.agentSchedule.findMany({
      where:   withTenant(req, {}),
      orderBy: { createdAt: 'desc' },
      include: {
        agentProfile: {
          select: { id: true, name: true, icon: true, color: true },
        },
        runs: {
          orderBy: { startedAt: 'desc' },
          take:    1,
          select: {
            id:          true,
            status:      true,
            startedAt:   true,
            completedAt: true,
            tokensUsed:  true,
            error:       true,
          },
        },
      },
    });

    // Flatten the last run out of the array for convenience
    const result = schedules.map((s) => ({
      ...s,
      lastRun: s.runs[0] ?? null,
      runs:    undefined,
    }));

    sendSuccess(res, result);
  })
);

// ── POST /agents/schedules ────────────────────────────────────────────────────
// Create a new schedule.
router.post(
  '/schedules',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.message, 400);

    const { agentProfileId, ...rest } = parsed.data;

    // Verify agentProfile belongs to tenant if provided
    if (agentProfileId) {
      const profile = await prisma.agentProfile.findFirst({
        where: withTenant(req, { id: agentProfileId }),
      });
      if (!profile) return sendError(res, 'Agent profile not found', 404);
    }

    const nextRunAt = computeNextRunAt(rest.cronExpression);

    const schedule = await prisma.agentSchedule.create({
      data: {
        tenantId:       req.user.tenantId,
        agentProfileId: agentProfileId ?? null,
        nextRunAt,
        ...rest,
      },
    });

    sendSuccess(res, schedule, 201);
  })
);

// ── PATCH /agents/schedules/:id ───────────────────────────────────────────────
// Update a schedule (partial update).
router.patch(
  '/schedules/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = scheduleUpdateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.message, 400);

    const existing = await prisma.agentSchedule.findFirst({
      where: withTenant(req, { id: req.params['id'] }),
    });
    if (!existing) return sendError(res, 'Schedule not found', 404);

    const { agentProfileId, ...rest } = parsed.data;

    // Verify agentProfile belongs to tenant if provided
    if (agentProfileId) {
      const profile = await prisma.agentProfile.findFirst({
        where: withTenant(req, { id: agentProfileId }),
      });
      if (!profile) return sendError(res, 'Agent profile not found', 404);
    }

    // Recalculate nextRunAt if cronExpression changed
    const cronExpression = rest.cronExpression ?? existing.cronExpression;
    const nextRunAt =
      rest.cronExpression ? computeNextRunAt(cronExpression) : undefined;

    const updateData: Record<string, unknown> = { ...rest };
    if (agentProfileId !== undefined) updateData['agentProfileId'] = agentProfileId;
    if (nextRunAt !== undefined)      updateData['nextRunAt']      = nextRunAt;

    const updated = await prisma.agentSchedule.update({
      where: { id: req.params['id'] },
      data:  updateData,
    });

    sendSuccess(res, updated);
  })
);

// ── DELETE /agents/schedules/:id ─────────────────────────────────────────────
// Delete a schedule (and its runs via cascade).
router.delete(
  '/schedules/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.agentSchedule.findFirst({
      where: withTenant(req, { id: req.params['id'] }),
    });
    if (!existing) return sendError(res, 'Schedule not found', 404);

    await prisma.agentSchedule.delete({ where: { id: req.params['id'] } });
    sendSuccess(res, { deleted: true });
  })
);

// ── POST /agents/schedules/:id/run ───────────────────────────────────────────
// Manually trigger a run for the schedule right now.
router.post(
  '/schedules/:id/run',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // 1. Load the schedule (tenant-scoped)
    const schedule = await prisma.agentSchedule.findFirst({
      where: withTenant(req, { id: req.params['id'] }),
    });
    if (!schedule) return sendError(res, 'Schedule not found', 404);

    // 2. Create a run record with status "running"
    const run = await prisma.agentScheduleRun.create({
      data: {
        scheduleId: schedule.id,
        tenantId:   schedule.tenantId,
        status:     'running',
        startedAt:  new Date(),
      },
    });

    // Helper: mark run as failed and update schedule stats
    const failRun = async (errorMessage: string) => {
      const now = new Date();
      await prisma.agentScheduleRun.update({
        where: { id: run.id },
        data: {
          status:      'failed',
          error:       errorMessage,
          completedAt: now,
        },
      });
      await prisma.agentSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt:     now,
          lastRunStatus: 'failed',
          lastRunError:  errorMessage,
          runCount:      { increment: 1 },
          nextRunAt:     computeNextRunAt(schedule.cronExpression),
        },
      });
    };

    // 3. Find an active AgentApiKey — prefer schedule's provider, else any active
    const keyQuery = schedule.provider ? { provider: schedule.provider } : {};
    const keyRecord = await prisma.agentApiKey.findFirst({
      where:   withTenant(req, { ...keyQuery, isActive: true }),
      orderBy: { createdAt: 'desc' },
    });

    if (!keyRecord) {
      await failRun('No active API key found for provider');
      const failedRun = await prisma.agentScheduleRun.findUnique({ where: { id: run.id } });
      return sendError(res, 'No active API key found. Configure one in Settings → AI Agents.', 400);
    }

    // Decrypt key
    let plainKey: string;
    try {
      plainKey = decryptKey(keyRecord.keyEncrypted);
    } catch (e) {
      await failRun('Failed to decrypt API key');
      return sendError(res, 'Failed to decrypt API key', 500);
    }

    // 4. Load agentProfile if set
    let agentProfile: { systemPrompt: string } | null = null;
    if (schedule.agentProfileId) {
      agentProfile = await prisma.agentProfile.findFirst({
        where:  { id: schedule.agentProfileId, tenantId: schedule.tenantId },
        select: { systemPrompt: true },
      });
    }

    // 5. Build system prompt
    const systemPrompt = agentProfile?.systemPrompt ?? getSystemPrompt(schedule.domain);

    // 6. Call the LLM (non-streaming — Anthropic SDK directly)
    try {
      const provider = keyRecord.provider;
      let responseText = '';
      let tokensUsed   = 0;

      if (provider === 'anthropic') {
        // Use Anthropic SDK directly (non-streaming)
        const anthropic = new Anthropic({ apiKey: plainKey });
        const msg = await anthropic.messages.create({
          model:      schedule.model ?? 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: schedule.taskPrompt }],
        });
        responseText = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
        tokensUsed   = msg.usage.input_tokens + msg.usage.output_tokens;
      } else {
        // For non-Anthropic providers, use the streamProvider wrapper with accumulation
        const history: ChatMessage[] = [{ role: 'user', content: schedule.taskPrompt }];
        let accumulated = '';
        let accTokens   = 0;
        await new Promise<void>((resolve, reject) => {
          streamProvider(
            provider,
            plainKey,
            schedule.model ?? PROVIDERS[provider]?.models[0]?.id ?? 'gpt-4o-mini',
            systemPrompt,
            history,
            {
              onChunk: (text) => { accumulated += text; },
              onDone:  (tokens) => { accTokens = tokens; resolve(); },
              onError: (err)   => reject(err),
            }
          );
        });
        responseText = accumulated;
        tokensUsed   = accTokens;
      }

      // 7. Update the run with success
      const now = new Date();
      const updatedRun = await prisma.agentScheduleRun.update({
        where: { id: run.id },
        data: {
          status:      'success',
          response:    responseText,
          tokensUsed,
          completedAt: now,
        },
      });

      // 8. Update the schedule: lastRunAt, lastRunStatus, runCount, nextRunAt
      await prisma.agentSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt:     now,
          lastRunStatus: 'success',
          lastRunError:  null,
          runCount:      { increment: 1 },
          nextRunAt:     computeNextRunAt(schedule.cronExpression),
        },
      });

      // 9. Return the run object
      sendSuccess(res, updatedRun, 201);
    } catch (err: any) {
      const errorMessage = err?.message ?? 'Unknown error during LLM call';
      await failRun(errorMessage);
      const failedRun = await prisma.agentScheduleRun.findUnique({ where: { id: run.id } });
      return sendError(res, `LLM call failed: ${errorMessage}`, 500);
    }
  })
);

// ── GET /agents/schedules/:id/runs ───────────────────────────────────────────
// List the last 20 runs for a schedule (paginated).
router.get(
  '/schedules/:id/runs',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schedule = await prisma.agentSchedule.findFirst({
      where: withTenant(req, { id: req.params['id'] }),
      select: { id: true },
    });
    if (!schedule) return sendError(res, 'Schedule not found', 404);

    const page     = parseInt((req.query['page']     as string) ?? '1', 10);
    const pageSize = parseInt((req.query['pageSize'] as string) ?? '20', 10);
    const take     = Math.min(pageSize, 100);
    const skip     = (page - 1) * take;

    const [runs, total] = await Promise.all([
      prisma.agentScheduleRun.findMany({
        where:   { scheduleId: schedule.id, tenantId: req.user.tenantId },
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      prisma.agentScheduleRun.count({
        where: { scheduleId: schedule.id, tenantId: req.user.tenantId },
      }),
    ]);

    sendSuccess(res, runs, 200, { total, page, pageSize: take });
  })
);

export default router;
