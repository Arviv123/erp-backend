import { prisma } from '../../config/database';
import { createTransaction } from '../accounting/accounting.service';
import { moveStock } from '../inventory/inventory.service';

// ─── Helpers ──────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Auto-number generator ────────────────────────────────────────

async function nextOrderNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.salesOrder.count({ where: { tenantId } });
  return `SO-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ─── List Sales Orders ────────────────────────────────────────────

export async function listSalesOrders(
  tenantId: string,
  filters: {
    status?: string;
    customerId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }
) {
  const page  = filters.page  ?? 1;
  const limit = filters.limit ?? 25;
  const skip  = (page - 1) * limit;

  const where: any = {
    tenantId,
    deletedAt: null,
    ...(filters.status     ? { status:     filters.status }                             : {}),
    ...(filters.customerId ? { customerId: filters.customerId }                         : {}),
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        _count:   { select: { lines: true } },
      },
      orderBy: { date: 'desc' },
      skip,
      take: limit,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ─── Get Single Sales Order ───────────────────────────────────────

export async function getSalesOrder(id: string, tenantId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      lines:    true,
    },
  });

  if (!order || order.tenantId !== tenantId || order.deletedAt !== null) {
    throw new Error('Sales order not found');
  }

  return order;
}

// ─── Create Sales Order ───────────────────────────────────────────

export interface CreateSalesOrderInput {
  customerId:   string;
  quoteId?:     string;
  date?:        Date;
  expectedDate?: Date;
  notes?:       string;
  lines: Array<{
    description: string;
    quantity:    number;
    unitPrice:   number;
    vatRate?:    number;
    productId?:  string;
  }>;
}

export async function createSalesOrder(
  data: CreateSalesOrderInput,
  tenantId: string,
  userId: string
) {
  // Verify customer belongs to this tenant
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  // Calculate per-line totals
  const processedLines = data.lines.map(line => {
    const vatRate  = line.vatRate ?? 0.18;
    const qty      = line.quantity;
    const price    = line.unitPrice;
    const lineNet  = round2(qty * price);
    const lineTotal = lineNet; // lineTotal = net amount (VAT shown at order level)
    return { ...line, vatRate, lineTotal };
  });

  // Aggregate order totals
  const subtotal  = round2(processedLines.reduce((s, l) => s + l.lineTotal, 0));
  const vatAmount = round2(processedLines.reduce((s, l) => s + round2(l.lineTotal * l.vatRate), 0));
  const total     = round2(subtotal + vatAmount);

  const number = await nextOrderNumber(tenantId);

  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.create({
      data: {
        tenantId,
        customerId:  data.customerId,
        quoteId:     data.quoteId,
        number,
        date:        data.date ?? new Date(),
        expectedDate: data.expectedDate,
        notes:       data.notes,
        subtotal,
        vatAmount,
        total,
        createdBy:   userId,
        lines: {
          create: processedLines.map(l => ({
            productId:   l.productId,
            description: l.description,
            quantity:    l.quantity,
            unitPrice:   l.unitPrice,
            vatRate:     l.vatRate,
            lineTotal:   l.lineTotal,
          })),
        },
      },
      include: { lines: true, customer: { select: { name: true } } },
    });

    return order;
  });
}

// ─── Update Sales Order ───────────────────────────────────────────

export async function updateSalesOrder(
  id: string,
  tenantId: string,
  data: {
    expectedDate?: Date;
    notes?:        string;
    lines?: Array<{
      description: string;
      quantity:    number;
      unitPrice:   number;
      vatRate?:    number;
      productId?:  string;
    }>;
  }
) {
  const order = await prisma.salesOrder.findUnique({ where: { id } });
  if (!order || order.tenantId !== tenantId || order.deletedAt !== null) {
    throw new Error('Sales order not found');
  }
  if (order.status !== 'DRAFT') {
    throw new Error('Only DRAFT orders can be updated');
  }

  return prisma.$transaction(async (tx) => {
    let subtotal  = Number(order.subtotal);
    let vatAmount = Number(order.vatAmount);
    let total     = Number(order.total);

    if (data.lines && data.lines.length > 0) {
      // Delete existing lines and recreate
      await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });

      const processedLines = data.lines.map(line => {
        const vatRate   = line.vatRate ?? 0.18;
        const lineTotal = round2(line.quantity * line.unitPrice);
        return { ...line, vatRate, lineTotal };
      });

      subtotal  = round2(processedLines.reduce((s, l) => s + l.lineTotal, 0));
      vatAmount = round2(processedLines.reduce((s, l) => s + round2(l.lineTotal * l.vatRate), 0));
      total     = round2(subtotal + vatAmount);

      await tx.salesOrderLine.createMany({
        data: processedLines.map(l => ({
          salesOrderId: id,
          productId:    l.productId,
          description:  l.description,
          quantity:     l.quantity,
          unitPrice:    l.unitPrice,
          vatRate:      l.vatRate,
          lineTotal:    l.lineTotal,
        })),
      });
    }

    const updated = await tx.salesOrder.update({
      where: { id },
      data: {
        ...(data.expectedDate !== undefined ? { expectedDate: data.expectedDate } : {}),
        ...(data.notes        !== undefined ? { notes:        data.notes        } : {}),
        ...(data.lines ? { subtotal, vatAmount, total } : {}),
      },
      include: { lines: true, customer: { select: { name: true } } },
    });

    return updated;
  });
}

// ─── Confirm Sales Order ──────────────────────────────────────────

export async function confirmSalesOrder(id: string, tenantId: string) {
  const order = await prisma.salesOrder.findUnique({ where: { id } });
  if (!order || order.tenantId !== tenantId || order.deletedAt !== null) {
    throw new Error('Sales order not found');
  }
  if (order.status === 'CONFIRMED') {
    throw new Error('Order is already confirmed');
  }
  if (order.status === 'CANCELLED') {
    throw new Error('Cannot confirm a cancelled order');
  }
  if (order.status === 'FULFILLED') {
    throw new Error('Cannot confirm a fulfilled order');
  }

  return prisma.salesOrder.update({
    where: { id },
    data:  { status: 'CONFIRMED' },
    include: { lines: true, customer: { select: { name: true } } },
  });
}

// ─── Cancel Sales Order ───────────────────────────────────────────

export async function cancelSalesOrder(id: string, tenantId: string) {
  const order = await prisma.salesOrder.findUnique({ where: { id } });
  if (!order || order.tenantId !== tenantId || order.deletedAt !== null) {
    throw new Error('Sales order not found');
  }
  if (order.status === 'CANCELLED') {
    throw new Error('Order is already cancelled');
  }
  if (order.status === 'FULFILLED') {
    throw new Error('Cannot cancel a fulfilled order');
  }

  return prisma.salesOrder.update({
    where: { id },
    data:  { status: 'CANCELLED', deletedAt: new Date() },
    include: { lines: true, customer: { select: { name: true } } },
  });
}

// ─── Convert Sales Order to Invoice ──────────────────────────────

export async function convertToInvoice(
  id: string,
  tenantId: string,
  userId: string
) {
  const order = await prisma.salesOrder.findUnique({
    where:   { id },
    include: { lines: true, customer: true },
  });

  if (!order || order.tenantId !== tenantId || order.deletedAt !== null) {
    throw new Error('Sales order not found');
  }
  if (order.status === 'CANCELLED') {
    throw new Error('Cannot convert a cancelled order');
  }
  if (order.status === 'FULFILLED') {
    throw new Error('Order has already been converted to an invoice');
  }

  // Generate invoice number
  const year       = new Date().getFullYear();
  const invCount   = await prisma.invoice.count({ where: { tenantId } });
  const invoiceNum = `INV-${year}-${String(invCount + 1).padStart(4, '0')}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // 30-day payment terms by default

  const invoice = await prisma.$transaction(async (tx) => {
    // Create the invoice with mapped lines
    const invoice = await tx.invoice.create({
      data: {
        tenantId,
        customerId:   order.customerId,
        number:       invoiceNum,
        date:         order.date,
        dueDate,
        notes:        order.notes ?? undefined,
        subtotal:     order.subtotal,
        vatAmount:    order.vatAmount,
        total:        order.total,
        createdBy:    userId,
        reference:    order.number, // link back to SO number
        lines: {
          create: order.lines.map((line, idx) => ({
            description: line.description,
            quantity:    line.quantity,
            unitPrice:   line.unitPrice,
            vatRate:     line.vatRate,
            lineTotal:   line.lineTotal,
            sortOrder:   idx,
          })),
        },
      },
      include: { lines: true, customer: { select: { name: true } } },
    });

    // Mark the sales order as FULFILLED
    await tx.salesOrder.update({
      where: { id },
      data:  { status: 'FULFILLED' },
    });

    return invoice;
  });

  // ── COGS GL entry: DR Cost-of-Goods-Sold CR Inventory (best-effort) ──
  // Account 5000 = עלות המכר (COGS), Account 1400 = מלאי (Inventory)
  try {
    const productLines = order.lines.filter((l: any) => l.productId);

    if (productLines.length > 0) {
      // Look up products to get their cost prices
      const productIds = [...new Set(productLines.map((l: any) => l.productId as string))];
      const products   = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        select: { id: true, costPrice: true, isService: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      // Only inventory (non-service) products generate a COGS entry
      const inventoryLines = productLines.filter((l: any) => {
        const p = productMap.get(l.productId as string);
        return p && !p.isService && Number(p.costPrice ?? 0) > 0;
      });

      if (inventoryLines.length > 0) {
        const [cogsAcc, inventoryAcc] = await Promise.all([
          prisma.account.findFirst({ where: { tenantId, code: '5000', isActive: true } }),
          prisma.account.findFirst({ where: { tenantId, code: '1400', isActive: true } }),
        ]);

        if (cogsAcc && inventoryAcc) {
          const cogsLines = inventoryLines.map((l: any) => {
            const p        = productMap.get(l.productId as string)!;
            const costAmt  = Math.round(Number(l.quantity) * Number(p.costPrice) * 100) / 100;
            return {
              debitAccountId:  cogsAcc.id,
              creditAccountId: inventoryAcc.id,
              amount:          costAmt,
              description:     `עלות מכר ${invoiceNum} — ${l.description}`,
            };
          }).filter((l: any) => l.amount > 0);

          if (cogsLines.length > 0) {
            await createTransaction({
              tenantId,
              date:        order.date,
              reference:   invoiceNum,
              description: `עלות מכר הזמנה ${order.number} → ${invoiceNum}`,
              sourceType:  'SO_INVOICE',
              sourceId:    invoice.id,
              createdBy:   userId,
              lines:       cogsLines,
            });
          }
        }
      }
    }
  } catch (cogsErr) {
    console.error('[SO→Invoice] COGS GL entry failed:', cogsErr);
  }

  // ── Inventory deduction: move stock OUT for product lines (best-effort) ──
  try {
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });

    if (defaultWarehouse) {
      for (const line of order.lines) {
        const lineAny = line as any;
        if (!lineAny.productId) continue;

        // Check if product is a service (services don't have stock)
        const product = await prisma.product.findUnique({
          where:  { id: lineAny.productId },
          select: { isService: true },
        });
        if (!product || product.isService) continue;

        try {
          await moveStock({
            tenantId,
            productId:   lineAny.productId,
            warehouseId: defaultWarehouse.id,
            type:        'OUT',
            quantity:    Number(line.quantity),
            reference:   invoiceNum,
            sourceType:  'SO_INVOICE',
            sourceId:    invoice.id,
            createdBy:   userId,
          });
        } catch (lineErr) {
          // Insufficient stock or other per-line error — log but continue
          console.error(`[SO→Invoice] Stock deduction failed for product ${lineAny.productId}:`, lineErr);
        }
      }
    }
  } catch (stockErr) {
    console.error('[SO→Invoice] Inventory deduction failed:', stockErr);
  }

  return invoice;
}
