import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

const CustomerSchema = z.object({
  name:       z.string().min(1),
  businessId: z.string().optional(),
  email:      z.string().email().optional(),
  phone:      z.string().optional(),
  address:    z.record(z.any()).optional(),
  type:       z.enum(['B2B', 'B2C', 'GOVERNMENT']).default('B2B'),
  status:     z.enum(['LEAD', 'ACTIVE', 'INACTIVE', 'BLOCKED']).default('LEAD'),
  assignedTo: z.string().optional(),
  metadata:   z.record(z.any()).default({}),  // JSONB - completely flexible
});

// GET /crm/customers
router.get('/customers', async (req: AuthenticatedRequest, res: Response) => {
  const { status, type, page = '1', pageSize = '25', search } = req.query;

  const where = withTenant(req, {
    ...(status ? { status: status as any } : {}),
    ...(type   ? { type:   type   as any } : {}),
    ...(search ? {
      OR: [
        { name:  { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
      ],
    } : {}),
  });

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (parseInt(page as string) - 1) * parseInt(pageSize as string),
      take:    parseInt(pageSize as string),
    }),
    prisma.customer.count({ where }),
  ]);

  sendSuccess(res, items, 200, { total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) });
});

// GET /crm/customers/:id
router.get('/customers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.tenantId !== req.user.tenantId) {
    sendError(res, 'Customer not found', 404);
    return;
  }
  sendSuccess(res, customer);
});

// POST /crm/customers
router.post('/customers', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CustomerSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, customer, 201);
});

// PATCH /crm/customers/:id
router.patch('/customers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CustomerSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) {
    sendError(res, 'Customer not found', 404);
    return;
  }

  // Deep merge metadata (JSONB flexible fields)
  const mergedMetadata =
    parsed.data.metadata
      ? { ...(existing.metadata as object), ...parsed.data.metadata }
      : existing.metadata;

  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data:  { ...parsed.data, metadata: mergedMetadata },
  });
  sendSuccess(res, updated);
});

// DELETE /crm/customers/:id  (soft delete)
router.delete('/customers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.tenantId !== req.user.tenantId) {
    sendError(res, 'Customer not found', 404);
    return;
  }

  await prisma.customer.update({
    where: { id: req.params.id },
    data:  { status: 'INACTIVE' },
  });
  sendSuccess(res, { message: 'Customer deactivated' });
});

export default router;
