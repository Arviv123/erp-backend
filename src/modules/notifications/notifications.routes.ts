/**
 * Notifications Router
 *
 * Mounted at: /api/notifications
 *
 * All routes require:
 *   - authenticate     — valid JWT
 *   - enforceTenantIsolation — active tenant
 *
 * User identity is taken from req.user (set by the auth middleware).
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { NotificationChannel, NotificationType } from '@prisma/client';

import * as NotificationsService from './notifications.service';

const router = Router();

// Apply auth and tenant guards to every route in this router
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Validation Schemas ────────────────────────────────────────────────────────

const CreateNotificationSchema = z.object({
  userId:  z.string().cuid().optional(),
  type:    z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel),
  title:   z.string().min(1).max(255),
  body:    z.string().min(1),
  data:    z.record(z.unknown()).optional(),
});

// ─── GET /api/notifications ────────────────────────────────────────────────────
// Get the authenticated user's notifications (paginated, filterable)
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const { isRead, type, page, limit } = req.query;

    const filters: NotificationsService.GetNotificationsFilters = {};

    if (isRead !== undefined) {
      filters.isRead = isRead === 'true';
    }
    if (type) {
      const parsed = NotificationType[type as keyof typeof NotificationType];
      if (!parsed) { sendError(res, `Invalid notification type: ${type}`); return; }
      filters.type = parsed;
    }
    if (page)  { filters.page  = parseInt(page  as string, 10); }
    if (limit) { filters.limit = parseInt(limit as string, 10); }

    const result = await NotificationsService.getNotifications(tenantId, userId, filters);

    sendSuccess(res, result.items, 200, {
      total:    result.total,
      page:     result.page,
      pageSize: result.limit,
    });
  })
);

// ─── GET /api/notifications/unread-count ──────────────────────────────────────
// Fast unread badge count — must be registered before /:id routes
router.get(
  '/unread-count',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const count = await NotificationsService.getUnreadCount(tenantId, userId);
    sendSuccess(res, { unreadCount: count });
  })
);

// ─── POST /api/notifications ───────────────────────────────────────────────────
// Create a notification programmatically (MANAGER+ only)
router.post(
  '/',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateNotificationSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const notification = await NotificationsService.createNotification(
      req.user.tenantId,
      parsed.data as NotificationsService.CreateNotificationInput
    );

    sendSuccess(res, notification, 201);
  })
);

// ─── PUT /api/notifications/read-all ──────────────────────────────────────────
// Mark all notifications as read for the current user
// Must be registered BEFORE /:id/read to avoid route collision
router.put(
  '/read-all',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const updatedCount = await NotificationsService.markAllAsRead(tenantId, userId);
    sendSuccess(res, { updated: updatedCount });
  })
);

// ─── PUT /api/notifications/:id/read ──────────────────────────────────────────
// Mark a single notification as read
router.put(
  '/:id/read',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const notification = await NotificationsService.markAsRead(
      req.params.id,
      tenantId,
      userId
    );

    if (!notification) {
      sendError(res, 'Notification not found', 404);
      return;
    }

    sendSuccess(res, notification);
  })
);

// ─── DELETE /api/notifications/:id ────────────────────────────────────────────
// Delete own notification
router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const deleted = await NotificationsService.deleteNotification(
      req.params.id,
      tenantId,
      userId
    );

    if (!deleted) {
      sendError(res, 'Notification not found', 404);
      return;
    }

    sendSuccess(res, { deleted: true });
  })
);

// ─── POST /api/notifications/run-checks ───────────────────────────────────────
// Trigger all alert checks for this tenant (ADMIN only)
router.post(
  '/run-checks',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await NotificationsService.runAlertChecks(req.user.tenantId);
    sendSuccess(res, result);
  })
);

// ─── POST /api/notifications/test ─────────────────────────────────────────────
// Send a test notification to the authenticated user
router.post(
  '/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;
    const userId   = (req as any).user?.id ?? req.user.userId;

    const notification = await NotificationsService.sendTestNotification(
      tenantId,
      userId
    );

    sendSuccess(res, notification, 201);
  })
);

export default router;
