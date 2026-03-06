import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// GET /api/search?q=...&types=invoices,customers,vendors,...&limit=8
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query['q'] ?? '').trim();
  if (!q || q.length < 2) return sendError(res, 'Query must be at least 2 characters', 400);

  const typesParam = String(req.query['types'] ?? 'all');
  const types = typesParam === 'all'
    ? ['invoices', 'bills', 'customers', 'vendors', 'employees', 'products', 'quotes', 'accounts', 'sales_orders']
    : typesParam.split(',');
  const limit = Math.min(parseInt(String(req.query['limit'] ?? '10')), 20);
  const tenantId = req.user.tenantId;

  const results: Record<string, any[]> = {};

  await Promise.allSettled([

    // ── INVOICES ──────────────────────────────────────────────────────────────
    // Searches: number, customer name, notes, AND line item descriptions
    types.includes('invoices') && prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { notes: { contains: q, mode: 'insensitive' } },
          // Search inside line items (e.g. product description)
          { lines: { some: { description: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: limit,
      orderBy: { date: 'desc' },
      include: { customer: { select: { name: true } } },
    }).then(rows => {
      results['invoices'] = rows.map(r => ({
        type: 'invoice',
        id: r.id,
        label: `חשבונית ${r.number}`,
        sublabel: r.customer?.name ?? '',
        extra: `₪${Number(r.total).toFixed(2)} · ${r.status}`,
        url: `/invoices/${r.id}`,
        date: r.date,
        status: r.status,
      }));
    }),

    // ── BILLS ─────────────────────────────────────────────────────────────────
    types.includes('bills') && prisma.bill.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { vendor: { name: { contains: q, mode: 'insensitive' } } },
          { vendorRef: { contains: q, mode: 'insensitive' } },
          { lines: { some: { description: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: limit,
      orderBy: { date: 'desc' },
      include: { vendor: { select: { name: true } } },
    }).then(rows => {
      results['bills'] = rows.map(r => ({
        type: 'bill',
        id: r.id,
        label: `חשבונית ספק ${r.number ?? ''}`,
        sublabel: r.vendor?.name ?? '',
        extra: `₪${Number(r.total).toFixed(2)} · ${r.status}`,
        url: `/purchasing/bills`,
        date: r.date,
      }));
    }),

    // ── CUSTOMERS ─────────────────────────────────────────────────────────────
    // Schema: Customer { name, email, phone, businessId (ח.פ.), address (Json) }
    // NOTE: taxId → businessId in the actual schema
    types.includes('customers') && prisma.customer.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { businessId: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { name: 'asc' },
    }).then(rows => {
      results['customers'] = rows.map(r => ({
        type: 'customer',
        id: r.id,
        label: r.name,
        sublabel: r.email ?? r.phone ?? '',
        extra: r.businessId ? `ח.פ.: ${r.businessId}` : '',
        url: `/crm/customers/${r.id}`,
      }));
    }),

    // ── VENDORS ───────────────────────────────────────────────────────────────
    // Schema: Vendor { name, email, phone, vatNumber, businessId }
    // NOTE: contactName does NOT exist — removed from query
    types.includes('vendors') && prisma.vendor.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { vatNumber: { contains: q, mode: 'insensitive' } },
          { businessId: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { name: 'asc' },
    }).then(rows => {
      results['vendors'] = rows.map(r => ({
        type: 'vendor',
        id: r.id,
        label: r.name,
        sublabel: r.email ?? r.phone ?? '',
        extra: r.vatNumber ? `עוסק: ${r.vatNumber}` : '',
        url: `/purchasing/vendors`,
      }));
    }),

    // ── EMPLOYEES ─────────────────────────────────────────────────────────────
    types.includes('employees') && prisma.employee.findMany({
      where: {
        tenantId,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          // Full name: "שם פרטי שם משפחה" — split query and check both parts
          ...(q.includes(' ') ? [
            { firstName: { contains: q.split(' ')[0], mode: 'insensitive' as const } },
            { lastName:  { contains: q.split(' ')[1], mode: 'insensitive' as const } },
          ] : []),
          { personalEmail: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { idNumber: { contains: q, mode: 'insensitive' } },
          { jobTitle: { contains: q, mode: 'insensitive' } },
          { department: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { firstName: 'asc' },
    }).then(rows => {
      results['employees'] = rows.map(r => ({
        type: 'employee',
        id: r.id,
        label: `${r.firstName} ${r.lastName}`,
        sublabel: r.jobTitle ?? r.personalEmail ?? '',
        extra: r.idNumber ? `ת.ז.: ${r.idNumber}` : '',
        url: `/employees/${r.id}`,
      }));
    }),

    // ── PRODUCTS ──────────────────────────────────────────────────────────────
    // Schema: Product { name, sku, description, barcode, sellingPrice }
    // NOTE: salePrice → sellingPrice in the actual schema
    types.includes('products') && prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { name: 'asc' },
    }).then(rows => {
      results['products'] = rows.map(r => ({
        type: 'product',
        id: r.id,
        label: r.name,
        sublabel: r.sku ? `מק"ט: ${r.sku}` : '',
        extra: `₪${Number(r.sellingPrice ?? 0).toFixed(2)}`,
        url: `/inventory?product=${r.id}`,
      }));
    }),

    // ── QUOTES ────────────────────────────────────────────────────────────────
    // Schema: Quote { number, issueDate, total, notes, status, customer relation }
    types.includes('quotes') && prisma.quote.findMany({
      where: {
        tenantId,
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { notes: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { lines: { some: { description: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: limit,
      orderBy: { issueDate: 'desc' },
      include: { customer: { select: { name: true } } },
    }).then(rows => {
      results['quotes'] = rows.map(r => ({
        type: 'quote',
        id: r.id,
        label: `הצעת מחיר ${r.number}`,
        sublabel: r.customer?.name ?? '',
        extra: `₪${Number(r.total).toFixed(2)} · ${r.status}`,
        url: `/quotes/${r.id}`,
      }));
    }),

    // ── GL ACCOUNTS ───────────────────────────────────────────────────────────
    // Schema: Account { code, name, nameEn, type }
    types.includes('accounts') && prisma.account.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { nameEn: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { code: 'asc' },
    }).then(rows => {
      results['accounts'] = rows.map(r => ({
        type: 'account',
        id: r.id,
        label: `${r.code} — ${r.name}`,
        sublabel: r.type ?? '',
        extra: '',
        url: `/accounting?account=${r.code}`,
      }));
    }),

    // ── SALES ORDERS ──────────────────────────────────────────────────────────
    // Schema: SalesOrder { number (not orderNumber), date (not orderDate), total, notes, status, customer relation }
    types.includes('sales_orders') && prisma.salesOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { notes: { contains: q, mode: 'insensitive' } },
          { lines: { some: { description: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: limit,
      orderBy: { date: 'desc' },
      include: { customer: { select: { name: true } } },
    }).then(rows => {
      results['sales_orders'] = rows.map(r => ({
        type: 'sales_order',
        id: r.id,
        label: `הזמנה ${r.number}`,
        sublabel: r.customer?.name ?? '',
        extra: r.status,
        url: `/sales-orders`,
      }));
    }),

  ]);

  // ── Type labels for UI ─────────────────────────────────────────────────────
  const TYPE_LABELS: Record<string, string> = {
    invoice:     'חשבוניות',
    bill:        'חשבוניות ספק',
    customer:    'לקוחות',
    vendor:      'ספקים',
    employee:    'עובדים',
    product:     'מוצרים',
    quote:       'הצעות מחיר',
    account:     'חשבונות GL',
    sales_order: 'הזמנות מכירה',
  };

  // Return grouped (for UI) and a total count
  const grouped = Object.entries(results)
    .filter(([, items]) => items && items.length > 0)
    .map(([key, items]) => ({
      type: key,
      label: TYPE_LABELS[items[0]?.type ?? key] ?? key,
      items,
    }));

  const total = Object.values(results).flat().length;

  sendSuccess(res, { query: q, grouped, total });
}));

export default router;
