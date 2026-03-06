import { Router, Request, Response } from 'express';
import { z } from 'zod';
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

// ── POST /agents/:domain/chat  (SSE streaming) ───────────────────────────────
router.post(
  '/:domain/chat',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { domain } = req.params as { domain: string };
    const schema = z.object({
      message: z.string().min(1),
      conversationId: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.message, 400);

    const { message, conversationId, provider: reqProvider, model: reqModel } = parsed.data;

    // Find an active API key — prefer requested provider, else first active
    const keyQuery = reqProvider
      ? { provider: reqProvider }
      : {};
    const keyRecord = await prisma.agentApiKey.findFirst({
      where: withTenant(req, { ...keyQuery, isActive: true }),
      orderBy: { createdAt: 'desc' },
    });
    if (!keyRecord) {
      return sendError(res, 'לא הוגדר מפתח API. עבור להגדרות ← סוכני AI', 400);
    }

    const provider = keyRecord.provider;
    const model = reqModel ?? PROVIDERS[provider]?.models[0]?.id ?? 'gpt-4o-mini';
    let plainKey: string;
    try { plainKey = decryptKey(keyRecord.keyEncrypted); }
    catch { return sendError(res, 'Failed to decrypt key', 500); }

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
          tenantId: req.user.tenantId,
          userId: req.user.userId,
          domain,
          provider,
          model,
          title: message.slice(0, 60),
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

    await streamProvider(provider, plainKey, model, getSystemPrompt(domain), history, {
      onChunk: (text) => {
        fullResponse += text;
        sendEvent({ type: 'chunk', content: text });
      },
      onDone: async (tokens) => {
        tokenCount = tokens;
        // Save assistant message
        await prisma.agentMessage.create({
          data: {
            conversationId: conversation!.id,
            role: 'assistant',
            content: fullResponse,
            tokensUsed: tokenCount,
          },
        });
        sendEvent({ type: 'done', conversationId: conversation!.id, tokensUsed: tokenCount });
        res.end();
      },
      onError: (err) => {
        sendEvent({ type: 'error', message: err.message });
        res.end();
      },
    });
  })
);

// ── GET /agents/conversations ─────────────────────────────────────────────────
router.get('/conversations', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { domain, page = '1', pageSize = '20' } = req.query;
  const where = withTenant(req, {
    userId: req.user.userId,
    ...(domain ? { domain: domain as string } : {}),
  });
  const [items, total] = await Promise.all([
    prisma.agentConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take: parseInt(pageSize as string),
      select: {
        id: true, domain: true, title: true, provider: true, model: true,
        createdAt: true, updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.agentConversation.count({ where }),
  ]);
  sendSuccess(res, items, 200, { total });
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
