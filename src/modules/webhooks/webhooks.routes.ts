import { Router, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as WebhooksService from './webhooks.service';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const ALLOWED_EVENTS = [
  'invoice.created', 'invoice.paid', 'invoice.overdue',
  'payroll.approved', 'payroll.paid',
  'employee.created', 'employee.salary_changed',
  'bill.created', 'bill.paid',
  'purchase_order.received',
  'expense.approved',
  '*', // wildcard - all events
];

// ─── Webhooks CRUD ────────────────────────────────────────────────

router.get('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const webhooks = await prisma.webhook.findMany({
    where:   withTenant(req),
    include: { _count: { select: { deliveries: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Never expose secret in list view
  sendSuccess(res, webhooks.map(({ secret: _s, ...wh }) => wh));
}));

router.post('/', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:   z.string().min(1),
    url:    z.string().url(),
    events: z.array(z.string()).min(1).refine(
      evts => evts.every(e => ALLOWED_EVENTS.includes(e)),
      { message: `Events must be one of: ${ALLOWED_EVENTS.join(', ')}` }
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const secret = randomBytes(32).toString('hex');

  const webhook = await prisma.webhook.create({
    data: {
      tenantId: req.user.tenantId,
      name:     parsed.data.name,
      url:      parsed.data.url,
      secret,
      events:   parsed.data.events,
      isActive: true,
    },
  });

  // Return the secret only on creation
  sendSuccess(res, { ...webhook, secretPreview: secret }, 201);
}));

router.patch('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:     z.string().min(1).optional(),
    url:      z.string().url().optional(),
    events:   z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Webhook not found', 404); return; }

  const updated = await prisma.webhook.update({
    where: { id: req.params.id },
    data:  parsed.data,
  });
  sendSuccess(res, { ...updated, secret: undefined });
}));

router.delete('/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Webhook not found', 404); return; }
  await prisma.webhook.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Webhook deleted' });
}));

// ─── Rotate Secret ────────────────────────────────────────────────

router.post('/:id/rotate-secret', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Webhook not found', 404); return; }

  const newSecret = randomBytes(32).toString('hex');
  await prisma.webhook.update({ where: { id: req.params.id }, data: { secret: newSecret, failureCount: 0 } });
  sendSuccess(res, { newSecret }); // Show only on rotation
}));

// ─── Deliveries ────────────────────────────────────────────────────

router.get('/:id/deliveries', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Webhook not found', 404); return; }

  const { page = '1', pageSize = '25' } = req.query;
  const [items, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where:   { webhookId: req.params.id },
      orderBy: { createdAt: 'desc' },
      skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take:    parseInt(pageSize as string),
    }),
    prisma.webhookDelivery.count({ where: { webhookId: req.params.id } }),
  ]);
  sendSuccess(res, items, 200, { total });
}));

// POST /webhooks/deliveries/:id/retry
router.post('/deliveries/:id/retry', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await WebhooksService.retryDelivery(req.params.id, req.user.tenantId);
  sendSuccess(res, result);
}));

// ─── Test Webhook ─────────────────────────────────────────────────

router.post('/:id/test', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) { sendError(res, 'Webhook not found', 404); return; }

  await WebhooksService.dispatchEvent(req.user.tenantId, 'test.ping', {
    message: 'This is a test event from your ERP system',
    webhookId: req.params.id,
  });

  sendSuccess(res, { message: 'Test event dispatched' });
}));

export default router;
