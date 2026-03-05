import { prisma } from '../../config/database';
import { z } from 'zod';
import PDFDocument from 'pdfkit';

// ─── Helpers ──────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Zod Schemas ──────────────────────────────────────────────────

export const QuoteLineSchema = z.object({
  description:  z.string().min(1),
  quantity:     z.number().positive(),
  unitPrice:    z.number().nonnegative(),
  discount:     z.number().min(0).max(100).default(0),
  productId:    z.string().optional(),
  sortOrder:    z.number().int().default(0),
});

export const CreateQuoteSchema = z.object({
  customerId:       z.string(),
  title:            z.string().optional(),
  expiryDate:       z.string().datetime().optional(),
  vatRate:          z.number().default(17),
  notes:            z.string().optional(),
  termsConditions:  z.string().optional(),
  lines:            z.array(QuoteLineSchema).min(1),
});

export const UpdateQuoteSchema = z.object({
  title:            z.string().optional(),
  expiryDate:       z.string().datetime().optional(),
  notes:            z.string().optional(),
  termsConditions:  z.string().optional(),
  lines:            z.array(QuoteLineSchema).min(1).optional(),
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>;

// ─── Auto-number generator ────────────────────────────────────────

async function nextQuoteNumber(tenantId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.quote.count({ where: { tenantId } });
  return `QT-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ─── Line total calculation ───────────────────────────────────────

function calcLineTotal(quantity: number, unitPrice: number, discount: number): number {
  return round2(quantity * unitPrice * (1 - discount / 100));
}

function calcTotals(
  lines: Array<{ quantity: number; unitPrice: number; discount: number }>,
  vatRate: number
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal  = round2(lines.reduce((s, l) => s + calcLineTotal(l.quantity, l.unitPrice, l.discount), 0));
  const vatAmount = round2(subtotal * vatRate / 100);
  const total     = round2(subtotal + vatAmount);
  return { subtotal, vatAmount, total };
}

// ─── List Quotes ──────────────────────────────────────────────────

export async function listQuotes(
  tenantId: string,
  filters: {
    status?:     string;
    customerId?: string;
    from?:       string;
    to?:         string;
    page?:       number;
    limit?:      number;
  }
) {
  const page  = filters.page  ?? 1;
  const limit = filters.limit ?? 25;
  const skip  = (page - 1) * limit;

  const where: any = {
    tenantId,
    ...(filters.status     ? { status:     filters.status     } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.from || filters.to
      ? {
          issueDate: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        _count:   { select: { lines: true } },
      },
      orderBy: { issueDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.quote.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ─── Get Single Quote ─────────────────────────────────────────────

export async function getQuote(id: string, tenantId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        include: { product: { select: { id: true, name: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!quote || quote.tenantId !== tenantId) {
    throw new Error('Quote not found');
  }

  return quote;
}

// ─── Create Quote ─────────────────────────────────────────────────

export async function createQuote(
  tenantId:   string,
  data:       CreateQuoteInput,
  createdBy?: string
) {
  // Verify customer belongs to this tenant
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  // Expiry default: today + 30 days
  const expiryDate = data.expiryDate
    ? new Date(data.expiryDate)
    : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })();

  const { subtotal, vatAmount, total } = calcTotals(data.lines, data.vatRate);
  const number = await nextQuoteNumber(tenantId);

  return prisma.quote.create({
    data: {
      tenantId,
      customerId:      data.customerId,
      number,
      title:           data.title,
      expiryDate,
      vatRate:         data.vatRate,
      subtotal,
      vatAmount,
      total,
      notes:           data.notes,
      termsConditions: data.termsConditions,
      createdBy:       createdBy,
      lines: {
        create: data.lines.map(l => ({
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          discount:    l.discount,
          lineTotal:   calcLineTotal(l.quantity, l.unitPrice, l.discount),
          productId:   l.productId,
          sortOrder:   l.sortOrder,
        })),
      },
    },
    include: {
      lines:    true,
      customer: { select: { id: true, name: true } },
    },
  });
}

// ─── Update Quote ─────────────────────────────────────────────────

export async function updateQuote(
  id:       string,
  tenantId: string,
  data:     UpdateQuoteInput
) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.tenantId !== tenantId) {
    throw new Error('Quote not found');
  }
  if (quote.status !== 'DRAFT' && quote.status !== 'SENT') {
    throw new Error('Only DRAFT or SENT quotes can be updated');
  }

  return prisma.$transaction(async (tx) => {
    let subtotal  = Number(quote.subtotal);
    let vatAmount = Number(quote.vatAmount);
    let total     = Number(quote.total);

    if (data.lines && data.lines.length > 0) {
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });

      const vatRate = Number(quote.vatRate);
      const totals  = calcTotals(data.lines, vatRate);
      subtotal  = totals.subtotal;
      vatAmount = totals.vatAmount;
      total     = totals.total;

      await tx.quoteLine.createMany({
        data: data.lines.map(l => ({
          quoteId:     id,
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          discount:    l.discount,
          lineTotal:   calcLineTotal(l.quantity, l.unitPrice, l.discount),
          productId:   l.productId,
          sortOrder:   l.sortOrder,
        })),
      });
    }

    const updated = await tx.quote.update({
      where: { id },
      data: {
        ...(data.title           !== undefined ? { title:           data.title           } : {}),
        ...(data.expiryDate      !== undefined ? { expiryDate:      new Date(data.expiryDate) } : {}),
        ...(data.notes           !== undefined ? { notes:           data.notes           } : {}),
        ...(data.termsConditions !== undefined ? { termsConditions: data.termsConditions } : {}),
        ...(data.lines ? { subtotal, vatAmount, total } : {}),
      },
      include: {
        lines:    true,
        customer: { select: { id: true, name: true } },
      },
    });

    return updated;
  });
}

// ─── Status transitions ───────────────────────────────────────────

export async function sendQuote(id: string, tenantId: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.tenantId !== tenantId) throw new Error('Quote not found');
  if (quote.status !== 'DRAFT') throw new Error('Only DRAFT quotes can be sent');

  return prisma.quote.update({
    where: { id },
    data:  { status: 'SENT' },
    include: { lines: true, customer: { select: { id: true, name: true } } },
  });
}

export async function acceptQuote(id: string, tenantId: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.tenantId !== tenantId) throw new Error('Quote not found');
  if (quote.status === 'ACCEPTED') throw new Error('Quote is already accepted');
  if (quote.status === 'REJECTED') throw new Error('Cannot accept a rejected quote');
  if (quote.status === 'CONVERTED') throw new Error('Cannot accept a converted quote');
  if (quote.status === 'EXPIRED') throw new Error('Cannot accept an expired quote');

  return prisma.quote.update({
    where: { id },
    data:  { status: 'ACCEPTED' },
    include: { lines: true, customer: { select: { id: true, name: true } } },
  });
}

export async function rejectQuote(id: string, tenantId: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.tenantId !== tenantId) throw new Error('Quote not found');
  if (quote.status === 'REJECTED') throw new Error('Quote is already rejected');
  if (quote.status === 'CONVERTED') throw new Error('Cannot reject a converted quote');

  return prisma.quote.update({
    where: { id },
    data:  { status: 'REJECTED' },
    include: { lines: true, customer: { select: { id: true, name: true } } },
  });
}

// ─── Expire Overdue Quotes ────────────────────────────────────────

export async function expireOverdueQuotes(tenantId?: string) {
  const now = new Date();

  const result = await prisma.quote.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status:     { in: ['DRAFT', 'SENT'] },
      expiryDate: { lt: now },
    },
    data: { status: 'EXPIRED' },
  });

  return { expired: result.count };
}

// ─── Convert to Sales Order ───────────────────────────────────────

export async function convertToSalesOrder(id: string, tenantId: string) {
  const quote = await prisma.quote.findUnique({
    where:   { id },
    include: { lines: true },
  });

  if (!quote || quote.tenantId !== tenantId) throw new Error('Quote not found');
  if (quote.status === 'CONVERTED') throw new Error('Quote has already been converted');
  if (quote.status === 'REJECTED')  throw new Error('Cannot convert a rejected quote');
  if (quote.status === 'EXPIRED')   throw new Error('Cannot convert an expired quote');

  // Generate sales order number
  const year      = new Date().getFullYear();
  const soCount   = await prisma.salesOrder.count({ where: { tenantId } });
  const soNumber  = `SO-${year}-${String(soCount + 1).padStart(4, '0')}`;

  const vatRate = Number(quote.vatRate) / 100; // SalesOrderLine uses decimal fraction (e.g. 0.17)

  return prisma.$transaction(async (tx) => {
    const salesOrder = await tx.salesOrder.create({
      data: {
        tenantId,
        customerId: quote.customerId,
        quoteId:    quote.id,
        number:     soNumber,
        date:       new Date(),
        notes:      quote.notes ?? undefined,
        subtotal:   quote.subtotal,
        vatAmount:  quote.vatAmount,
        total:      quote.total,
        createdBy:  quote.createdBy ?? '',
        lines: {
          create: quote.lines.map((line, idx) => ({
            description: line.description,
            quantity:    line.quantity,
            unitPrice:   line.unitPrice,
            vatRate,
            lineTotal:   line.lineTotal,
          })),
        },
      },
      include: { lines: true, customer: { select: { id: true, name: true } } },
    });

    await tx.quote.update({
      where: { id },
      data:  { status: 'CONVERTED', convertedToId: salesOrder.id },
    });

    return salesOrder;
  });
}

// ─── Convert to Invoice ───────────────────────────────────────────

export async function convertToInvoice(id: string, tenantId: string) {
  const quote = await prisma.quote.findUnique({
    where:   { id },
    include: { lines: true },
  });

  if (!quote || quote.tenantId !== tenantId) throw new Error('Quote not found');
  if (quote.status === 'CONVERTED') throw new Error('Quote has already been converted');
  if (quote.status === 'REJECTED')  throw new Error('Cannot convert a rejected quote');
  if (quote.status === 'EXPIRED')   throw new Error('Cannot convert an expired quote');

  // Generate invoice number
  const year     = new Date().getFullYear();
  const invCount = await prisma.invoice.count({ where: { tenantId } });
  const invNumber = `INV-${year}-${String(invCount + 1).padStart(4, '0')}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const vatRate = Number(quote.vatRate) / 100; // InvoiceLine uses decimal fraction (e.g. 0.17)

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        tenantId,
        customerId: quote.customerId,
        number:     invNumber,
        date:       new Date(),
        dueDate,
        notes:      quote.notes ?? undefined,
        reference:  quote.number,
        subtotal:   quote.subtotal,
        vatAmount:  quote.vatAmount,
        total:      quote.total,
        createdBy:  quote.createdBy ?? '',
        lines: {
          create: quote.lines.map((line, idx) => ({
            description: line.description,
            quantity:    line.quantity,
            unitPrice:   line.unitPrice,
            vatRate,
            lineTotal:   line.lineTotal,
            sortOrder:   idx,
          })),
        },
      },
      include: { lines: true, customer: { select: { id: true, name: true } } },
    });

    await tx.quote.update({
      where: { id },
      data:  { status: 'CONVERTED', convertedToId: invoice.id },
    });

    return invoice;
  });
}

// ─── Duplicate Quote ──────────────────────────────────────────────

export async function duplicateQuote(id: string, tenantId: string) {
  const source = await prisma.quote.findUnique({
    where:   { id },
    include: { lines: true },
  });

  if (!source || source.tenantId !== tenantId) throw new Error('Quote not found');

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  const number = await nextQuoteNumber(tenantId);

  return prisma.quote.create({
    data: {
      tenantId,
      customerId:      source.customerId,
      number,
      title:           source.title ? `${source.title} (עותק)` : undefined,
      status:          'DRAFT',
      expiryDate,
      vatRate:         source.vatRate,
      subtotal:        source.subtotal,
      vatAmount:       source.vatAmount,
      total:           source.total,
      notes:           source.notes ?? undefined,
      termsConditions: source.termsConditions ?? undefined,
      createdBy:       source.createdBy ?? undefined,
      lines: {
        create: source.lines.map(l => ({
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          discount:    l.discount,
          lineTotal:   l.lineTotal,
          productId:   l.productId ?? undefined,
          sortOrder:   l.sortOrder,
        })),
      },
    },
    include: {
      lines:    true,
      customer: { select: { id: true, name: true } },
    },
  });
}

// ─── Generate PDF ─────────────────────────────────────────────────

export async function getQuotePDF(id: string, tenantId: string): Promise<Buffer> {
  const quote = await prisma.quote.findUnique({
    where:   { id },
    include: {
      customer: true,
      lines:    { orderBy: { sortOrder: 'asc' } },
      tenant:   { select: { name: true } },
    },
  });

  if (!quote || quote.tenantId !== tenantId) throw new Error('Quote not found');

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const BLUE       = '#1a56db';
    const LIGHT_BLUE = '#ebf3ff';
    const DARK_GRAY  = '#374151';
    const MED_GRAY   = '#6b7280';
    const pageWidth  = doc.page.width;
    const margin     = 50;
    const contentW   = pageWidth - margin * 2;

    // ── Header bar ────────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 90).fill(BLUE);

    // Company name (top-left of header)
    doc.fillColor('#ffffff')
       .fontSize(20)
       .font('Helvetica-Bold')
       .text(quote.tenant?.name ?? '', margin, 28, { align: 'left', width: contentW / 2 });

    // Hebrew title (top-right of header)
    doc.fontSize(26)
       .text('\u05D4\u05E6\u05E2\u05EA \u05DE\u05D7\u05D9\u05E8', margin + contentW / 2, 22, {
         align: 'right',
         width: contentW / 2,
       });

    doc.moveDown(0);

    // ── Quote meta block ──────────────────────────────────────────
    let y = 110;
    doc.fillColor(DARK_GRAY).fontSize(10).font('Helvetica-Bold');
    doc.text('Quote Number:', margin, y);
    doc.font('Helvetica').text(quote.number, margin + 85, y);

    doc.font('Helvetica-Bold').text('Issue Date:', margin + 260, y);
    doc.font('Helvetica').text(quote.issueDate.toLocaleDateString('he-IL'), margin + 340, y);

    y += 18;
    doc.font('Helvetica-Bold').text('Expiry Date:', margin, y);
    doc.font('Helvetica').text(quote.expiryDate.toLocaleDateString('he-IL'), margin + 85, y);

    if (quote.title) {
      y += 18;
      doc.font('Helvetica-Bold').text('Subject:', margin, y);
      doc.font('Helvetica').text(quote.title, margin + 85, y);
    }

    // ── Customer block ────────────────────────────────────────────
    y += 30;
    doc.rect(margin, y, contentW, 14).fill(LIGHT_BLUE);
    doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold')
       .text('\u05DC\u05DE\u05D9\u05D3\u05E2\u05E0\u05D5 / Bill To:', margin + 4, y + 2);

    y += 20;
    const cust = quote.customer;
    doc.fillColor(DARK_GRAY).font('Helvetica-Bold').fontSize(11)
       .text(cust.name, margin, y);

    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(MED_GRAY);
    if (cust.email)   { doc.text(cust.email,                       margin, y); y += 12; }
    if (cust.phone)   { doc.text(cust.phone,                       margin, y); y += 12; }
    if (cust.address) { doc.text(JSON.stringify(cust.address),     margin, y); y += 12; }

    // ── Lines table header ────────────────────────────────────────
    y += 14;
    const colX = {
      no:       margin,
      desc:     margin + 30,
      qty:      margin + 270,
      price:    margin + 330,
      discount: margin + 390,
      total:    margin + 450,
    };

    doc.rect(margin, y, contentW, 16).fill(BLUE);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('#',         colX.no,       y + 3);
    doc.text('Description', colX.desc,   y + 3, { width: 230 });
    doc.text('Qty',        colX.qty,      y + 3, { width: 55, align: 'right' });
    doc.text('Unit Price', colX.price,    y + 3, { width: 55, align: 'right' });
    doc.text('Disc %',     colX.discount, y + 3, { width: 55, align: 'right' });
    doc.text('Total',      colX.total,    y + 3, { width: 55, align: 'right' });
    y += 16;

    // ── Lines rows ────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9);
    let rowIndex = 0;

    for (const line of quote.lines) {
      const lineTotal = Number(line.lineTotal);
      const rowBg     = rowIndex % 2 === 0 ? '#f9fafb' : '#ffffff';
      doc.rect(margin, y, contentW, 16).fill(rowBg);
      doc.fillColor(DARK_GRAY);

      doc.text(String(rowIndex + 1),          colX.no,       y + 3);
      doc.text(line.description,              colX.desc,     y + 3, { width: 230, ellipsis: true });
      doc.text(Number(line.quantity).toFixed(2),  colX.qty,  y + 3, { width: 55, align: 'right' });
      doc.text(Number(line.unitPrice).toFixed(2), colX.price,y + 3, { width: 55, align: 'right' });
      doc.text(`${Number(line.discount).toFixed(1)}%`, colX.discount, y + 3, { width: 55, align: 'right' });
      doc.text(lineTotal.toFixed(2),          colX.total,    y + 3, { width: 55, align: 'right' });

      y += 16;
      rowIndex++;
    }

    // ── Totals block ──────────────────────────────────────────────
    y += 10;
    const totalsX     = margin + contentW - 220;
    const totalsLabelW = 110;
    const totalsValW   = 100;

    doc.moveTo(totalsX, y).lineTo(margin + contentW, y).strokeColor('#d1d5db').stroke();
    y += 8;

    const subtotal  = Number(quote.subtotal);
    const vatAmount = Number(quote.vatAmount);
    const total     = Number(quote.total);
    const vatRate   = Number(quote.vatRate);

    doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(10);
    doc.text('Subtotal:', totalsX, y, { width: totalsLabelW });
    doc.text(`\u20AA ${subtotal.toFixed(2)}`, totalsX + totalsLabelW, y, { width: totalsValW, align: 'right' });
    y += 16;

    doc.text(`VAT (${vatRate}%):`, totalsX, y, { width: totalsLabelW });
    doc.text(`\u20AA ${vatAmount.toFixed(2)}`, totalsX + totalsLabelW, y, { width: totalsValW, align: 'right' });
    y += 4;

    doc.moveTo(totalsX, y + 10).lineTo(margin + contentW, y + 10).strokeColor(BLUE).stroke();
    y += 14;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE);
    doc.text('TOTAL:', totalsX, y, { width: totalsLabelW });
    doc.text(`\u20AA ${total.toFixed(2)}`, totalsX + totalsLabelW, y, { width: totalsValW, align: 'right' });

    y += 30;

    // ── Notes ─────────────────────────────────────────────────────
    if (quote.notes) {
      doc.rect(margin, y, contentW, 14).fill(LIGHT_BLUE);
      doc.fillColor(BLUE).fontSize(9).font('Helvetica-Bold')
         .text('\u05D4\u05E2\u05E8\u05D5\u05EA / Notes:', margin + 4, y + 2);
      y += 18;
      doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(9)
         .text(quote.notes, margin, y, { width: contentW });
      y += doc.currentLineHeight() * 2 + 10;
    }

    // ── Terms & Conditions ────────────────────────────────────────
    if (quote.termsConditions) {
      doc.rect(margin, y, contentW, 14).fill(LIGHT_BLUE);
      doc.fillColor(BLUE).fontSize(9).font('Helvetica-Bold')
         .text('\u05EA\u05E0\u05D0\u05D9\u05DD / Terms & Conditions:', margin + 4, y + 2);
      y += 18;
      doc.fillColor(MED_GRAY).font('Helvetica').fontSize(8)
         .text(quote.termsConditions, margin, y, { width: contentW });
    }

    // ── Footer ────────────────────────────────────────────────────
    const footerY = doc.page.height - 40;
    doc.moveTo(margin, footerY - 5).lineTo(margin + contentW, footerY - 5).strokeColor('#d1d5db').stroke();
    doc.fillColor(MED_GRAY).fontSize(8).font('Helvetica')
       .text(
         `${quote.tenant?.name ?? ''} | ${quote.number} | Generated ${new Date().toLocaleDateString('he-IL')}`,
         margin,
         footerY,
         { align: 'center', width: contentW }
       );

    doc.end();
  });
}
