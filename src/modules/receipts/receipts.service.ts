/**
 * receipts.service.ts
 *
 * Business logic for Israeli receipts (קבלות).
 * - Auto-numbered: REC-YYYY-NNNN
 * - Payment methods: CASH | CHECK | BANK_TRANSFER | CREDIT_CARD | OTHER
 * - Linked to invoices and/or payments
 * - Double-entry accounting integration (optional — gracefully skipped if accounts missing)
 * - PDF generation via PDFKit
 * - Email delivery via Resend
 */

import { ReceiptStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/database';
import { createTransaction } from '../accounting/accounting.service';
import { sendEmail } from '../../services/email.service';
import { logger } from '../../config/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceiptPaymentMethod = 'CASH' | 'CHECK' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'OTHER';

export interface PaymentMethodEntry {
  method: ReceiptPaymentMethod;
  amount: number;
  reference?: string;
  last4?: string;
  bankName?: string;
  checkNumber?: string;
}

export interface CreateReceiptDto {
  customerId?: string;
  receiptDate?: Date;
  paymentMethods: PaymentMethodEntry[];
  invoiceIds?: string[];
  paymentIds?: string[];
  terminalTxId?: string;
  branchId?: string;
  notes?: string;
}

export interface ReceiptFilters {
  customerId?: string;
  branchId?: string;
  status?: ReceiptStatus;
  from?: string;
  to?: string;
  search?: string; // matches receiptNumber
  page?: number;
  pageSize?: number;
}

export interface ReceiptStats {
  total: number;
  totalAmount: number;
  averageAmount: number;
  byMethod: {
    cash: number;
    check: number;
    creditCard: number;
    bankTransfer: number;
    other: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatILS(amount: number): string {
  return `\u20AA${amount.toFixed(2)}`;
}

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function paymentMethodHebrew(method: ReceiptPaymentMethod): string {
  const map: Record<ReceiptPaymentMethod, string> = {
    CASH:          'מזומן',
    CHECK:         "צ'ק",
    BANK_TRANSFER: 'העברה בנקאית',
    CREDIT_CARD:   'כרטיס אשראי',
    OTHER:         'אחר',
  };
  return map[method] ?? method;
}

// ─── Receipt Number Generator ─────────────────────────────────────────────────

export async function generateReceiptNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();

  // Find the highest sequential number for this tenant in this year
  const prefix = `REC-${year}-`;
  const latest = await prisma.receipt.findFirst({
    where: {
      tenantId,
      receiptNumber: { startsWith: prefix },
    },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });

  let seq = 1;
  if (latest?.receiptNumber) {
    const parts = latest.receiptNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1] ?? '0', 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── List Receipts ────────────────────────────────────────────────────────────

export async function listReceipts(tenantId: string, filters: ReceiptFilters) {
  const {
    customerId,
    branchId,
    status,
    from,
    to,
    search,
    page = 1,
    pageSize = 25,
  } = filters;

  const where: Record<string, unknown> = { tenantId };

  if (customerId)  where['customerId']     = customerId;
  if (branchId)    where['branchId']       = branchId;
  if (status)      where['status']         = status;
  if (search)      where['receiptNumber']  = { contains: search, mode: 'insensitive' };

  if (from || to) {
    where['receiptDate'] = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.receipt.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        branch:   { select: { id: true, name: true } },
      },
      orderBy: { receiptDate: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.receipt.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

// ─── Get Receipt ──────────────────────────────────────────────────────────────

export async function getReceipt(tenantId: string, receiptId: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      customer: true,
      branch:   true,
      printJob: true,
    },
  });

  if (!receipt || receipt.tenantId !== tenantId) {
    throw new Error('Receipt not found');
  }

  return receipt;
}

// ─── Create Receipt ───────────────────────────────────────────────────────────

export async function createReceipt(
  tenantId: string,
  userId: string,
  data: CreateReceiptDto,
) {
  // Validate customer belongs to this tenant (if provided)
  if (data.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.tenantId !== tenantId) {
      throw new Error('Customer not found');
    }
  }

  // Validate branch belongs to this tenant (if provided)
  if (data.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
    if (!branch || branch.tenantId !== tenantId) {
      throw new Error('Branch not found');
    }
  }

  // Calculate total
  const totalAmount = data.paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
  if (totalAmount <= 0) {
    throw new Error('Total amount must be positive');
  }

  const receiptNumber = await generateReceiptNumber(tenantId);
  const receiptDate   = data.receiptDate ?? new Date();

  // Find GL accounts for journal entry (optional)
  const [arAccount, cashAccount, bankAccount, creditCardAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId, code: '1300' } }),  // לקוחות
    prisma.account.findFirst({ where: { tenantId, code: '1100' } }),  // קופה
    prisma.account.findFirst({ where: { tenantId, code: '1200' } }),  // בנק
    prisma.account.findFirst({ where: { tenantId, code: '1250' } }),  // כרטיסי אשראי לגבייה
  ]);

  return prisma.$transaction(async (tx) => {
    // Create the receipt
    const receipt = await tx.receipt.create({
      data: {
        tenantId,
        receiptNumber,
        customerId:     data.customerId,
        receiptDate,
        totalAmount,
        paymentMethods: data.paymentMethods as object[],
        notes:          data.notes,
        invoiceIds:     data.invoiceIds   ?? [],
        paymentIds:     data.paymentIds   ?? [],
        terminalTxId:   data.terminalTxId,
        branchId:       data.branchId,
        createdBy:      userId,
        status:         'ISSUED',
      },
      include: {
        customer: true,
        branch:   true,
      },
    });

    // Mark linked invoices as paid (if invoiceIds provided)
    if (data.invoiceIds && data.invoiceIds.length > 0) {
      for (const invoiceId of data.invoiceIds) {
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (invoice && invoice.tenantId === tenantId) {
          await tx.invoice.update({
            where: { id: invoiceId },
            data:  { status: 'PAID' },
          });
        }
      }
    }

    // Create accounting journal entry (gracefully skip if accounts are missing)
    if (arAccount) {
      try {
        // Build journal lines: one line per payment method
        // Dr: Cash/Bank/CreditCard account  Cr: Accounts Receivable
        const journalLines: Array<{ debitAccountId: string; creditAccountId: string; amount: number; description?: string }> = [];

        for (const pm of data.paymentMethods) {
          let debitAccount = cashAccount ?? bankAccount ?? creditCardAccount;

          if (pm.method === 'CASH'               && cashAccount)        debitAccount = cashAccount;
          else if (pm.method === 'BANK_TRANSFER'  && bankAccount)       debitAccount = bankAccount;
          else if (pm.method === 'CHECK'          && bankAccount)       debitAccount = bankAccount;
          else if (pm.method === 'CREDIT_CARD'    && creditCardAccount) debitAccount = creditCardAccount;

          if (debitAccount) {
            journalLines.push({
              debitAccountId:  debitAccount.id,
              creditAccountId: arAccount.id,
              amount:          pm.amount,
              description:     `${paymentMethodHebrew(pm.method)} - ${receiptNumber}`,
            });
          }
        }

        if (journalLines.length > 0) {
          await createTransaction({
            tenantId,
            date:        receiptDate,
            reference:   receiptNumber,
            description: `קבלה ${receiptNumber}`,
            sourceType:  'RECEIPT',
            sourceId:    receipt.id,
            createdBy:   userId,
            lines:       journalLines,
          });
        }
      } catch (err) {
        // Journal entry failure must not rollback the receipt
        logger.warn(`[Receipt] Journal entry failed for ${receiptNumber}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return receipt;
  });
}

// ─── Cancel Receipt ───────────────────────────────────────────────────────────

export async function cancelReceipt(
  tenantId: string,
  receiptId: string,
  userId: string,
  reason: string,
) {
  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });

  if (!receipt || receipt.tenantId !== tenantId) {
    throw new Error('Receipt not found');
  }

  if (receipt.status === 'CANCELLED' || receipt.status === 'VOIDED') {
    throw new Error('Receipt is already cancelled');
  }

  if (receipt.status !== 'ISSUED' && receipt.status !== 'PRINTED') {
    throw new Error('Only ISSUED or PRINTED receipts can be cancelled');
  }

  const cancelled = await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status:       'CANCELLED',
      cancelledAt:  new Date(),
      cancelledBy:  userId,
      cancelReason: reason,
    },
    include: { customer: true, branch: true },
  });

  // Create reversal journal entry
  const [arAccount, cashAccount, bankAccount, creditCardAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId, code: '1300' } }),
    prisma.account.findFirst({ where: { tenantId, code: '1100' } }),
    prisma.account.findFirst({ where: { tenantId, code: '1200' } }),
    prisma.account.findFirst({ where: { tenantId, code: '1250' } }),
  ]);

  if (arAccount) {
    try {
      const paymentMethods = receipt.paymentMethods as unknown as PaymentMethodEntry[];
      const reversalLines: Array<{ debitAccountId: string; creditAccountId: string; amount: number; description?: string }> = [];

      for (const pm of paymentMethods) {
        let debitAccount = cashAccount ?? bankAccount ?? creditCardAccount;

        if (pm.method === 'CASH'               && cashAccount)        debitAccount = cashAccount;
        else if (pm.method === 'BANK_TRANSFER'  && bankAccount)       debitAccount = bankAccount;
        else if (pm.method === 'CHECK'          && bankAccount)       debitAccount = bankAccount;
        else if (pm.method === 'CREDIT_CARD'    && creditCardAccount) debitAccount = creditCardAccount;

        if (debitAccount) {
          // Reversal: Dr AR, Cr Cash/Bank (opposite of original)
          reversalLines.push({
            debitAccountId:  arAccount.id,
            creditAccountId: debitAccount.id,
            amount:          pm.amount,
            description:     `ביטול קבלה ${receipt.receiptNumber}`,
          });
        }
      }

      if (reversalLines.length > 0) {
        await createTransaction({
          tenantId,
          date:        new Date(),
          reference:   `REV-${receipt.receiptNumber}`,
          description: `ביטול קבלה ${receipt.receiptNumber} - ${reason}`,
          sourceType:  'RECEIPT_REVERSAL',
          sourceId:    receiptId,
          createdBy:   userId,
          lines:       reversalLines,
        });
      }
    } catch (err) {
      logger.warn(`[Receipt] Reversal journal entry failed for ${receipt.receiptNumber}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return cancelled;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

// PDF layout constants
const PAGE_WIDTH = 595.28; // A4 points
const MARGIN     = 50;
const CONTENT_W  = PAGE_WIDTH - MARGIN * 2;
const BLUE       = '#1a56db';
const DARK       = '#1a202c';
const GREY       = '#718096';
const LIGHT_GREY = '#e2e8f0';
const GREEN      = '#276749';

export async function generateReceiptPDF(tenantId: string, receiptId: string): Promise<Buffer> {
  // Load receipt with all relations
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      customer: true,
      branch:   true,
      tenant:   true,
    },
  });

  if (!receipt || receipt.tenantId !== tenantId) {
    throw new Error('Receipt not found');
  }

  // Pre-fetch linked invoice numbers so the synchronous draw function can use them
  let linkedInvoiceNumbers: string[] = [];
  const rawInvoiceIds = receipt.invoiceIds as unknown as string[] | null;
  if (rawInvoiceIds && rawInvoiceIds.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where:  { id: { in: rawInvoiceIds } },
      select: { number: true },
    }).catch(() => []);
    linkedInvoiceNumbers = invoices.map((inv) => inv.number);
  }

  const tenant   = receipt.tenant;
  const customer = receipt.customer;

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size:   'A4',
        margin: MARGIN,
        info: {
          Title:   `קבלה ${receipt.receiptNumber}`,
          Author:  tenant.name,
          Subject: `קבלה ${receipt.receiptNumber}`,
          Creator: 'חשבשבת ERP',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data',  (chunk: Buffer) => buffers.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      drawReceiptPDF(doc, receipt, tenant, customer, linkedInvoiceNumbers);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawReceiptPDF(
  doc: PDFKit.PDFDocument,
  receipt: {
    receiptNumber: string;
    receiptDate: Date;
    totalAmount: unknown;
    paymentMethods: unknown;
    notes: string | null;
    status: ReceiptStatus;
    cancelReason: string | null;
  },
  tenant: {
    name: string;
    vatNumber?: string | null;
    businessNumber?: string | null;
    address?: unknown;
    phone?: string | null;
    email?: string | null;
  },
  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    businessId?: string | null;
    address?: unknown;
  } | null,
  linkedInvoiceNumbers: string[],
): void {
  let y = MARGIN;

  // ── 1. Header bar ──────────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_WIDTH, 100).fill(BLUE);

  // Company name (left side)
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(tenant.name, MARGIN, 20, { width: CONTENT_W * 0.55, align: 'left' });

  const idLine = tenant.vatNumber
    ? `עוסק מורשה מס' ${tenant.vatNumber}`
    : tenant.businessNumber
      ? `ח.פ. ${tenant.businessNumber}`
      : '';

  if (idLine) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(idLine, MARGIN, 44, { width: CONTENT_W * 0.55, align: 'left' });
  }

  const tenantAddr = parseAddressPDF(tenant.address);
  if (tenantAddr) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#cbd5e0')
      .text(tenantAddr, MARGIN, 62, { width: CONTENT_W * 0.55, align: 'left' });
  }

  // Title: "קבלה" (right side)
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('קבלה', MARGIN + CONTENT_W * 0.55, 16, { width: CONTENT_W * 0.45, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#e2e8f0')
    .text(`מספר: ${receipt.receiptNumber}`, MARGIN + CONTENT_W * 0.55, 44, { width: CONTENT_W * 0.45, align: 'right' });

  const dateStr = formatDate(new Date(receipt.receiptDate));
  doc
    .fontSize(10)
    .text(`תאריך: ${dateStr}`, MARGIN + CONTENT_W * 0.55, 62, { width: CONTENT_W * 0.45, align: 'right' });

  y = 120;

  // ── 2. CANCELLED banner (if applicable) ───────────────────────────────────
  if (receipt.status === 'CANCELLED' || receipt.status === 'VOIDED') {
    doc.rect(MARGIN, y, CONTENT_W, 28).fill('#fff5f5');
    doc.fillColor('#c53030').font('Helvetica-Bold').fontSize(13)
      .text('מסמך בוטל', MARGIN, y + 7, { width: CONTENT_W, align: 'center' });
    if (receipt.cancelReason) {
      doc.font('Helvetica').fontSize(9).fillColor('#e53e3e')
        .text(`סיבת ביטול: ${receipt.cancelReason}`, MARGIN, y + 20, { width: CONTENT_W, align: 'center' });
    }
    y += 36;
  }

  // ── 3. Customer section ───────────────────────────────────────────────────
  if (customer) {
    doc.rect(MARGIN, y, CONTENT_W, 2).fill(LIGHT_GREY);
    y += 10;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('לכבוד:', MARGIN, y);
    y += 16;

    doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK).text(customer.name, MARGIN, y, { width: CONTENT_W * 0.7 });
    y += 18;

    doc.font('Helvetica').fontSize(10).fillColor(GREY);
    const custLines: string[] = [];
    if (customer.email)      custLines.push(`דוא"ל: ${customer.email}`);
    if (customer.phone)      custLines.push(`טל': ${customer.phone}`);
    if (customer.businessId) custLines.push(`ח.פ. / ע.מ.: ${customer.businessId}`);
    const custAddr = parseAddressPDF(customer.address);
    if (custAddr)            custLines.push(`כתובת: ${custAddr}`);

    for (const line of custLines) {
      doc.text(line, MARGIN, y, { width: CONTENT_W * 0.7 });
      y += 14;
    }
    y += 12;
  }

  // ── 4. Payment methods table ──────────────────────────────────────────────
  const paymentMethods = receipt.paymentMethods as unknown as PaymentMethodEntry[];

  const colWidths = [CONTENT_W * 0.35, CONTENT_W * 0.35, CONTENT_W * 0.30];
  const colX      = [MARGIN, MARGIN + colWidths[0]!, MARGIN + colWidths[0]! + colWidths[1]!];
  const ROW_H     = 22;

  // Table header
  doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill('#2d3748');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
  const headers = ['אמצעי תשלום', 'פרטים', 'סכום'];
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i]!, colX[i]! + 4, y + 6, {
      width: colWidths[i]! - 8,
      align: i === 2 ? 'right' : 'left',
    });
  }
  y += ROW_H;

  let isOdd = true;
  for (const pm of paymentMethods) {
    const rowBg = isOdd ? '#ffffff' : '#f7fafc';
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rowBg);
    doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_W, y + ROW_H).strokeColor(LIGHT_GREY).lineWidth(0.5).stroke();

    doc.fillColor(DARK).font('Helvetica').fontSize(10);

    // Method name
    doc.text(paymentMethodHebrew(pm.method), colX[0]! + 4, y + 6, { width: colWidths[0]! - 8, align: 'left' });

    // Details (reference / last4 / check number / bank name)
    const details: string[] = [];
    if (pm.reference)    details.push(pm.reference);
    if (pm.last4)        details.push(`****${pm.last4}`);
    if (pm.checkNumber)  details.push(`צ'ק ${pm.checkNumber}`);
    if (pm.bankName)     details.push(pm.bankName);
    doc.text(details.join(', ') || '', colX[1]! + 4, y + 6, { width: colWidths[1]! - 8, align: 'left', ellipsis: true });

    // Amount
    doc.font('Helvetica-Bold')
      .text(formatILS(pm.amount), colX[2]! + 4, y + 6, { width: colWidths[2]! - 8, align: 'right' });

    y += ROW_H;
    isOdd = !isOdd;
  }

  // Table outer border
  const tableTopY = y - (paymentMethods.length + 1) * ROW_H;
  doc.rect(MARGIN, tableTopY, CONTENT_W, y - tableTopY).strokeColor(LIGHT_GREY).lineWidth(1).stroke();

  y += 10;

  // ── 5. Total line ─────────────────────────────────────────────────────────
  const totalBoxH = 32;
  doc.rect(MARGIN + CONTENT_W * 0.55, y, CONTENT_W * 0.45, totalBoxH).fill('#f0fff4');
  doc.rect(MARGIN + CONTENT_W * 0.55, y, CONTENT_W * 0.45, totalBoxH).strokeColor('#9ae6b4').lineWidth(1).stroke();

  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(14);
  const totalAmountNum = Number(receipt.totalAmount);
  doc.text('סה"כ התקבל:', MARGIN + CONTENT_W * 0.55 + 8, y + 9, { width: CONTENT_W * 0.25, align: 'left' });
  doc.text(formatILS(totalAmountNum), MARGIN + CONTENT_W * 0.80, y + 9, { width: CONTENT_W * 0.18, align: 'right' });

  y += totalBoxH + 14;

  // ── 6. "הסכום התקבל בפועל" note ───────────────────────────────────────────
  doc.fillColor(GREY).font('Helvetica').fontSize(10)
    .text('הסכום התקבל בפועל.', MARGIN, y);
  y += 18;

  // ── 7. Linked invoices ────────────────────────────────────────────────────
  if (linkedInvoiceNumbers.length > 0) {
    const nums = linkedInvoiceNumbers.join(', ');
    doc.fillColor(DARK).font('Helvetica').fontSize(10)
      .text(`מתייחס לחשבוניות: ${nums}`, MARGIN, y, { width: CONTENT_W });
    y += 16;
  }

  // ── 8. Notes ──────────────────────────────────────────────────────────────
  if (receipt.notes) {
    y += 4;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text('הערות:', MARGIN, y);
    y += 14;
    doc.fillColor(GREY).font('Helvetica').fontSize(10)
      .text(receipt.notes, MARGIN, y, { width: CONTENT_W, align: 'left' });
    y += doc.heightOfString(receipt.notes, { width: CONTENT_W }) + 10;
  }

  // ── 9. Signature line ─────────────────────────────────────────────────────
  y += 20;
  if (y < 700) {
    doc.moveTo(MARGIN, y).lineTo(MARGIN + 180, y).strokeColor(DARK).lineWidth(0.5).stroke();
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text('חתימה', MARGIN, y + 4);
  }

  // ── 10. Footer ────────────────────────────────────────────────────────────
  const footerY = 760;
  doc.rect(MARGIN, footerY, CONTENT_W, 1).fill(LIGHT_GREY);

  doc.fillColor(GREY).font('Helvetica').fontSize(9);
  doc.text('זהו אינו מסמך מס', MARGIN, footerY + 6, { width: CONTENT_W * 0.5, align: 'left' });

  const footerParts: string[] = [tenant.name];
  if (tenant.phone) footerParts.push(`טל': ${tenant.phone}`);
  if (tenant.email) footerParts.push(tenant.email);
  if (tenant.vatNumber) footerParts.push(`עוסק מורשה: ${tenant.vatNumber}`);
  doc.text(footerParts.join('  |  '), MARGIN, footerY + 18, { width: CONTENT_W, align: 'center' });
}

function parseAddressPDF(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const a = address as Record<string, unknown>;
  const parts: string[] = [];
  if (a['street'])  parts.push(String(a['street']));
  if (a['city'])    parts.push(String(a['city']));
  if (a['zip'])     parts.push(String(a['zip']));
  if (a['country']) parts.push(String(a['country']));
  return parts.join(', ');
}

// ─── Email Receipt ────────────────────────────────────────────────────────────

export async function emailReceipt(
  tenantId: string,
  receiptId: string,
  email: string,
): Promise<void> {
  const receipt = await prisma.receipt.findUnique({
    where:   { id: receiptId },
    include: { tenant: true, customer: true },
  });

  if (!receipt || receipt.tenantId !== tenantId) {
    throw new Error('Receipt not found');
  }

  const pdfBuffer = await generateReceiptPDF(tenantId, receiptId);

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="font-family:Arial,sans-serif;direction:rtl;background:#f4f6f9;padding:32px 0;">
  <table width="600" align="center" style="background:#fff;border-radius:8px;overflow:hidden;">
    <tr><td style="background:#1a56db;padding:24px 32px;">
      <p style="margin:0;font-size:20px;font-weight:bold;color:#fff;">מערכת חשבשבת</p>
    </td></tr>
    <tr><td style="padding:32px;">
      <p style="font-size:16px;color:#1a202c;">שלום,</p>
      <p style="color:#4a5568;">מצורפת קבלה מספר <strong>${receipt.receiptNumber}</strong> על סך <strong>${formatILS(Number(receipt.totalAmount))}</strong>.</p>
      <p style="color:#4a5568;">תודה על עסקינו!</p>
    </td></tr>
    <tr><td style="background:#f7fafc;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#718096;">${receipt.tenant.name}</p>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to:      email,
    subject: `קבלה מספר ${receipt.receiptNumber}`,
    html,
    attachments: [
      {
        filename:    `receipt-${receipt.receiptNumber}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  // Update status to EMAILED (only if ISSUED / PRINTED)
  if (receipt.status === 'ISSUED' || receipt.status === 'PRINTED') {
    await prisma.receipt.update({
      where: { id: receiptId },
      data:  { status: 'EMAILED' },
    });
  }
}

// ─── Receipt Stats ────────────────────────────────────────────────────────────

export async function getReceiptStats(
  tenantId: string,
  from?: string,
  to?: string,
): Promise<ReceiptStats> {
  const dateFilter: Record<string, unknown> = {};
  if (from || to) {
    dateFilter['receiptDate'] = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      tenantId,
      status: { not: 'CANCELLED' },
      ...dateFilter,
    },
    select: { totalAmount: true, paymentMethods: true },
  });

  const total         = receipts.length;
  const totalAmount   = receipts.reduce((s, r) => s + Number(r.totalAmount), 0);
  const averageAmount = total > 0 ? totalAmount / total : 0;

  const byMethod = { cash: 0, check: 0, creditCard: 0, bankTransfer: 0, other: 0 };

  for (const r of receipts) {
    const pms = r.paymentMethods as unknown as PaymentMethodEntry[];
    for (const pm of pms) {
      if      (pm.method === 'CASH')          byMethod.cash         += pm.amount;
      else if (pm.method === 'CHECK')         byMethod.check        += pm.amount;
      else if (pm.method === 'CREDIT_CARD')   byMethod.creditCard   += pm.amount;
      else if (pm.method === 'BANK_TRANSFER') byMethod.bankTransfer += pm.amount;
      else                                     byMethod.other        += pm.amount;
    }
  }

  return { total, totalAmount, averageAmount, byMethod };
}
