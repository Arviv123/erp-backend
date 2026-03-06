import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { encryptKey, decryptKey } from './encryption';
import { streamProvider, PROVIDERS, ChatMessage } from './providers';
import { getSystemPrompt } from './prompts';
import { ALL_TOOLS, executeTool } from './agent-tool-executor';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ── GET /agents/providers ─────────────────────────────────────────────────────
router.get('/providers', (_req: Request, res: Response) => {
  const list = Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    models: p.models,
  }));
  sendSuccess(res, list);
});

// ── GET /agents/keys ──────────────────────────────────────────────────────────
router.get('/keys', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const keys = await prisma.agentApiKey.findMany({
    where: withTenant(req, {}),
    orderBy: { createdAt: 'desc' },
    select: { id: true, provider: true, label: true, isActive: true, createdAt: true },
  });
  sendSuccess(res, keys);
}));

// ── POST /agents/keys ─────────────────────────────────────────────────────────
router.post(
  '/keys',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      provider: z.enum(['anthropic', 'openai', 'gemini', 'grok']),
      apiKey: z.string().min(10),
      label: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.message, 400);

    const { provider, apiKey, label } = parsed.data;
    const keyEncrypted = encryptKey(apiKey);

    const saved = await prisma.agentApiKey.upsert({
      where: { tenantId_provider: { tenantId: req.user.tenantId, provider } },
      create: { tenantId: req.user.tenantId, provider, keyEncrypted, label: label ?? provider, isActive: true },
      update: { keyEncrypted, label: label ?? provider, isActive: true, updatedAt: new Date() },
      select: { id: true, provider: true, label: true, isActive: true, createdAt: true },
    });
    sendSuccess(res, saved, 201);
  })
);

// ── DELETE /agents/keys/:id ───────────────────────────────────────────────────
router.delete(
  '/keys/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await prisma.agentApiKey.deleteMany({
      where: withTenant(req, { id: req.params['id'] }),
    });
    sendSuccess(res, { deleted: true });
  })
);

// ── POST /agents/keys/:id/test ────────────────────────────────────────────────
router.post(
  '/keys/:id/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const keyRecord = await prisma.agentApiKey.findFirst({
      where: withTenant(req, { id: req.params['id'], isActive: true }),
    });
    if (!keyRecord) return sendError(res, 'Key not found', 404);

    let plainKey: string;
    try { plainKey = decryptKey(keyRecord.keyEncrypted); }
    catch { return sendError(res, 'Failed to decrypt key', 500); }

    // Send a minimal test message
    let ok = false;
    let errMsg = '';
    await new Promise<void>(resolve => {
      streamProvider(
        keyRecord.provider, plainKey,
        PROVIDERS[keyRecord.provider]?.models[0]?.id ?? 'gpt-4o-mini',
        'You are a helpful assistant.',
        [{ role: 'user', content: 'Reply with just the word: OK' }],
        {
          onChunk: () => { ok = true; },
          onDone: () => resolve(),
          onError: (e) => { errMsg = e.message; resolve(); },
        }
      );
    });

    if (ok || !errMsg) sendSuccess(res, { ok: true, provider: keyRecord.provider });
    else sendError(res, `Connection failed: ${errMsg}`, 400);
  })
);

// ─── Agent Profiles CRUD ─────────────────────────────────────────────────────

// GET /agents/profiles
router.get('/profiles', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const profiles = await prisma.agentProfile.findMany({
    where: withTenant(req, {}),
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  sendSuccess(res, profiles);
}));

// GET /agents/tools — list all available tools
router.get('/tools', (_req: Request, res: Response) => {
  sendSuccess(res, ALL_TOOLS.map(t => ({ name: t.name, description: t.description })));
});

// POST /agents/profiles
router.post('/profiles', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:         z.string().min(1).max(80),
    description:  z.string().optional(),
    systemPrompt: z.string().min(1),
    domain:       z.string().default('general'),
    provider:     z.string().optional(),
    model:        z.string().optional(),
    icon:         z.string().optional(),
    color:        z.string().optional(),
    isDefault:    z.boolean().default(false),
    enabledTools: z.array(z.string()).default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const profile = await prisma.agentProfile.create({
    data: { tenantId: req.user.tenantId, ...parsed.data },
  });
  sendSuccess(res, profile, 201);
}));

// PATCH /agents/profiles/:id
router.patch('/profiles/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:         z.string().min(1).max(80).optional(),
    description:  z.string().optional(),
    systemPrompt: z.string().min(1).optional(),
    domain:       z.string().optional(),
    provider:     z.string().optional(),
    model:        z.string().optional(),
    icon:         z.string().optional(),
    color:        z.string().optional(),
    isDefault:    z.boolean().optional(),
    enabledTools: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const existing = await prisma.agentProfile.findFirst({
    where: withTenant(req, { id: req.params['id'] }),
  });
  if (!existing) return sendError(res, 'Profile not found', 404);

  const updated = await prisma.agentProfile.update({
    where: { id: req.params['id'] },
    data: parsed.data,
  });
  sendSuccess(res, updated);
}));

// DELETE /agents/profiles/:id
router.delete('/profiles/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.agentProfile.findFirst({
    where: withTenant(req, { id: req.params['id'] }),
  });
  if (!existing) return sendError(res, 'Profile not found', 404);
  await prisma.agentProfile.delete({ where: { id: req.params['id'] } });
  sendSuccess(res, { deleted: true });
}));

// ── POST /agents/:domain/chat  (SSE streaming) ───────────────────────────────
router.post(
  '/:domain/chat',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { domain } = req.params as { domain: string };
    const schema = z.object({
      message:        z.string().min(1),
      conversationId: z.string().optional(),
      agentProfileId: z.string().optional(),
      provider:       z.string().optional(),
      model:          z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.message, 400);

    const { message, conversationId, agentProfileId, provider: reqProvider, model: reqModel } = parsed.data;

    // Load agent profile if provided
    let agentProfile: { systemPrompt: string; provider?: string | null; model?: string | null; enabledTools?: string[] } | null = null;
    if (agentProfileId) {
      agentProfile = await prisma.agentProfile.findFirst({
        where: withTenant(req, { id: agentProfileId }),
        select: { systemPrompt: true, provider: true, model: true, enabledTools: true },
      });
    }

    // Find an active API key — prefer profile/request provider, else first active
    const preferredProvider = reqProvider ?? agentProfile?.provider ?? undefined;
    const keyQuery = preferredProvider ? { provider: preferredProvider } : {};
    const keyRecord = await prisma.agentApiKey.findFirst({
      where: withTenant(req, { ...keyQuery, isActive: true }),
      orderBy: { createdAt: 'desc' },
    });
    if (!keyRecord) {
      return sendError(res, 'לא הוגדר מפתח API. עבור להגדרות ← סוכני AI', 400);
    }

    const provider = keyRecord.provider;
    const model = reqModel ?? agentProfile?.model ?? PROVIDERS[provider]?.models[0]?.id ?? 'gpt-4o-mini';
    let plainKey: string;
    try { plainKey = decryptKey(keyRecord.keyEncrypted); }
    catch { return sendError(res, 'Failed to decrypt key', 500); }

    // System prompt: profile's custom prompt overrides default
    const systemPrompt = agentProfile?.systemPrompt ?? getSystemPrompt(domain);

    // Load or create conversation
    let conversation = conversationId
      ? await prisma.agentConversation.findFirst({
          where: withTenant(req, { id: conversationId }),
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.agentConversation.create({
        data: {
          tenantId:       req.user.tenantId,
          userId:         req.user.userId,
          domain,
          provider,
          model,
          title:          message.slice(0, 60),
          agentProfileId: agentProfileId ?? null,
        },
        include: { messages: true },
      }) as any;
    }

    // Build messages history
    const history: ChatMessage[] = (conversation as any).messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: message });

    // Save user message
    await prisma.agentMessage.create({
      data: {
        conversationId: conversation!.id,
        role: 'user',
        content: message,
      },
    });

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Conversation-Id', conversation!.id);
    res.flushHeaders();

    const sendEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let fullResponse = '';
    let tokenCount = 0;

    // ── Determine if this agent has tools enabled (Anthropic only for tool_use) ──
    const profileTools = agentProfile?.enabledTools ?? [];
    const canUseTools  = provider === 'anthropic' && profileTools.length > 0;
    const activeTools  = canUseTools
      ? ALL_TOOLS.filter(t => profileTools.includes(t.name))
      : [];

    if (canUseTools && activeTools.length > 0) {
      // ── Agentic loop with Tool Use (Anthropic only) ───────────────────────────
      try {
        const anthropic = new Anthropic({ apiKey: plainKey });
        const anthropicMessages: Anthropic.MessageParam[] = history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        let loopMessages = [...anthropicMessages];
        let totalTokens  = 0;
        const MAX_LOOPS  = 8;

        for (let loop = 0; loop < MAX_LOOPS; loop++) {
          const response = await anthropic.messages.create({
            model:      model.startsWith('claude') ? model : 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            system:     systemPrompt,
            tools:      activeTools,
            messages:   loopMessages,
          });

          totalTokens += response.usage.input_tokens + response.usage.output_tokens;

          if (response.stop_reason === 'end_turn') {
            // Final text response
            const textBlock = response.content.find(b => b.type === 'text');
            fullResponse    = textBlock?.type === 'text' ? textBlock.text : '';
            sendEvent({ type: 'chunk', content: fullResponse });
            break;
          }

          if (response.stop_reason === 'tool_use') {
            // Collect all tool calls in this response
            const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
            const textBlocks    = response.content.filter(b => b.type === 'text');

            // Stream any text that accompanied tool calls
            for (const tb of textBlocks) {
              if (tb.type === 'text' && tb.text) {
                sendEvent({ type: 'chunk', content: tb.text });
                fullResponse += tb.text;
              }
            }

            // Add assistant message with tool_use blocks
            loopMessages.push({ role: 'assistant', content: response.content });

            // Execute each tool and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const toolUse of toolUseBlocks) {
              if (toolUse.type !== 'tool_use') continue;
              sendEvent({ type: 'tool_call', toolName: toolUse.name, toolInput: toolUse.input });
              try {
                const result = await executeTool(
                  toolUse.name,
                  toolUse.input as Record<string, any>,
                  req.user.tenantId,
                );
                const resultStr = JSON.stringify(result, null, 2);
                sendEvent({ type: 'tool_result', toolName: toolUse.name, result: result });
                toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultStr });
              } catch (toolErr: any) {
                toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `Error: ${toolErr.message}`, is_error: true });
              }
            }

            // Add tool results as user message
            loopMessages.push({ role: 'user', content: toolResults });
          } else {
            // Unexpected stop reason
            break;
          }
        }

        tokenCount = totalTokens;
        await prisma.agentMessage.create({
          data: { conversationId: conversation!.id, role: 'assistant', content: fullResponse, tokensUsed: tokenCount },
        });
        sendEvent({ type: 'done', conversationId: conversation!.id, tokensUsed: tokenCount });
        res.end();
      } catch (err: any) {
        sendEvent({ type: 'error', message: err.message });
        res.end();
      }
    } else {
      // ── Standard streaming (no tools) ─────────────────────────────────────────
      await streamProvider(provider, plainKey, model, systemPrompt, history, {
        onChunk: (text) => {
          fullResponse += text;
          sendEvent({ type: 'chunk', content: text });
        },
        onDone: async (tokens) => {
          tokenCount = tokens;
          await prisma.agentMessage.create({
            data: { conversationId: conversation!.id, role: 'assistant', content: fullResponse, tokensUsed: tokenCount },
          });
          sendEvent({ type: 'done', conversationId: conversation!.id, tokensUsed: tokenCount });
          res.end();
        },
        onError: (err) => {
          sendEvent({ type: 'error', message: err.message });
          res.end();
        },
      });
    }
  })
);

// ── GET /agents/conversations ─────────────────────────────────────────────────
router.get('/conversations', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { domain, page = '1', pageSize = '30', search } = req.query;
  const where = withTenant(req, {
    userId: req.user.userId,
    ...(domain ? { domain: domain as string } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search as string, mode: 'insensitive' } },
        { messages: { some: { content: { contains: search as string, mode: 'insensitive' } } } },
      ],
    } : {}),
  });
  const [items, total] = await Promise.all([
    prisma.agentConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
      select: {
        id: true, domain: true, title: true, provider: true, model: true,
        agentProfileId: true,
        agentProfile: { select: { name: true, icon: true, color: true } },
        createdAt: true, updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.agentConversation.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total });
}));

// ── PATCH /agents/conversations/:id  (rename) ────────────────────────────────
router.patch('/conversations/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { title } = req.body;
  if (typeof title !== 'string' || !title.trim()) return sendError(res, 'title required', 400);
  const conv = await prisma.agentConversation.findFirst({
    where: withTenant(req, { id: req.params['id'], userId: req.user.userId }),
  });
  if (!conv) return sendError(res, 'Not found', 404);
  const updated = await prisma.agentConversation.update({
    where: { id: req.params['id'] },
    data: { title: title.trim() },
  });
  sendSuccess(res, updated);
}));

// ── GET /agents/conversations/:id ─────────────────────────────────────────────
router.get('/conversations/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const conv = await prisma.agentConversation.findFirst({
    where: withTenant(req, { id: req.params['id'], userId: req.user.userId }),
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conv) return sendError(res, 'Conversation not found', 404);
  sendSuccess(res, conv);
}));

// ── DELETE /agents/conversations/:id ──────────────────────────────────────────
router.delete('/conversations/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await prisma.agentConversation.deleteMany({
    where: withTenant(req, { id: req.params['id'], userId: req.user.userId }),
  });
  sendSuccess(res, { deleted: true });
}));

export default router;
