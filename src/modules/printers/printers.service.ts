import * as net from 'net';
import {
  Printer,
  PrintJob,
  PrintDocumentType,
  PrintJobStatus,
  PrinterConnectionType,
} from '@prisma/client';
import { prisma } from '../../config/database';

// ──────────────────────────────────────────────────────────────────────────────
// ESC/POS Command Helpers
// ──────────────────────────────────────────────────────────────────────────────

export class EscPos {
  static INIT          = Buffer.from([0x1b, 0x40]);
  static ALIGN_LEFT    = Buffer.from([0x1b, 0x61, 0x00]);
  static ALIGN_CENTER  = Buffer.from([0x1b, 0x61, 0x01]);
  static ALIGN_RIGHT   = Buffer.from([0x1b, 0x61, 0x02]);
  static BOLD_ON       = Buffer.from([0x1b, 0x45, 0x01]);
  static BOLD_OFF      = Buffer.from([0x1b, 0x45, 0x00]);
  static DOUBLE_HEIGHT = Buffer.from([0x1b, 0x21, 0x10]);
  static NORMAL_SIZE   = Buffer.from([0x1b, 0x21, 0x00]);
  static CUT           = Buffer.from([0x1d, 0x56, 0x41, 0x10]); // Partial cut

  static FEED = (lines: number): Buffer => Buffer.from([0x1b, 0x64, lines]);
  static text = (str: string): Buffer => Buffer.from(str + '\n', 'utf8');
  static separator = (width = 42): Buffer => Buffer.from('-'.repeat(width) + '\n', 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// Data Interfaces
// ──────────────────────────────────────────────────────────────────────────────

export interface ReceiptPaymentLine {
  method: string;      // e.g. "מזומן", "כרטיס אשראי ...4321"
  amount: number;
}

export interface ReceiptData {
  companyName:    string;
  address?:       string;
  phone?:         string;
  receiptNumber:  string;
  date:           string;   // formatted date string
  customerName?:  string;
  payments:       ReceiptPaymentLine[];
  total:          number;
  linkedDocuments?: string[];  // e.g. ["חשבונית INV-2026-001"]
  thankYouMessage?: string;
}

export interface InvoiceLineData {
  description: string;
  quantity:    number;
  unitPrice:   number;
  vatRate:     number;
  lineTotal:   number;
}

export interface InvoiceData {
  companyName:    string;
  address?:       string;
  phone?:         string;
  vatNumber?:     string;
  businessNumber?: string;
  invoiceNumber:  string;
  date:           string;
  dueDate?:       string;
  customerName:   string;
  customerAddress?: string;
  lines:          InvoiceLineData[];
  subtotal:       number;
  vatAmount:      number;
  total:          number;
  notes?:         string;
}

export interface CreatePrinterDto {
  name:              string;
  printerType:       import('@prisma/client').PrinterType;
  connectionType:    PrinterConnectionType;
  ipAddress?:        string;
  port?:             number;
  usbPath?:          string;
  paperWidth?:       number;
  isDefault?:        boolean;
  branchId?:         string;
  canPrintReceipts?:  boolean;
  canPrintInvoices?:  boolean;
  canPrintDelivery?:  boolean;
  canPrintBarcodes?:  boolean;
  canPrintLabels?:    boolean;
}

export interface QueuePrintDto {
  printerId?:    string;
  documentType:  PrintDocumentType;
  documentId?:   string;
  copies?:       number;
  priority?:     number;
  payload?:      unknown;
}

export interface PaginatedResult<T = unknown> {
  items: T[];
  total: number;
  page:  number;
  pageSize: number;
}

export interface ListPrintJobsFilters {
  printerId?:    string;
  documentType?: PrintDocumentType;
  status?:       PrintJobStatus;
  from?:         string;
  to?:           string;
  page?:         number;
  pageSize?:     number;
}

// ──────────────────────────────────────────────────────────────────────────────
// ESC/POS Formatting Helpers (private)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Right-align a value string against a label, fitting in `width` chars total.
 */
function formatLine(label: string, value: string, width: number): string {
  const spaces = width - label.length - value.length;
  return label + (spaces > 0 ? ' '.repeat(spaces) : ' ') + value + '\n';
}

function formatCurrency(amount: number): string {
  return `₪${amount.toFixed(2)}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Receipt Formatting for POS Thermal Printer
// ──────────────────────────────────────────────────────────────────────────────

export function formatReceiptForPos(
  receipt: ReceiptData,
  paperWidth: 58 | 80 = 80
): Buffer {
  const width = paperWidth === 58 ? 32 : 42;
  const chunks: Buffer[] = [];

  // Initialize
  chunks.push(EscPos.INIT);

  // Company name — centered, bold, double height
  chunks.push(EscPos.ALIGN_CENTER);
  chunks.push(EscPos.BOLD_ON);
  chunks.push(EscPos.DOUBLE_HEIGHT);
  chunks.push(EscPos.text(receipt.companyName));
  chunks.push(EscPos.NORMAL_SIZE);
  chunks.push(EscPos.BOLD_OFF);

  if (receipt.address) chunks.push(EscPos.text(receipt.address));
  if (receipt.phone)   chunks.push(EscPos.text(receipt.phone));

  chunks.push(EscPos.ALIGN_LEFT);
  chunks.push(EscPos.separator(width));

  // Receipt metadata
  chunks.push(EscPos.text(`קבלה מס': ${receipt.receiptNumber}`));
  chunks.push(EscPos.text(`תאריך: ${receipt.date}`));
  if (receipt.customerName) chunks.push(EscPos.text(`לכבוד: ${receipt.customerName}`));

  chunks.push(EscPos.separator(width));

  // Payment lines
  chunks.push(EscPos.text('אמצעי תשלום:'));
  for (const p of receipt.payments) {
    chunks.push(Buffer.from(formatLine(p.method, formatCurrency(p.amount), width), 'utf8'));
  }

  chunks.push(EscPos.separator(width));

  // Total — bold
  chunks.push(EscPos.BOLD_ON);
  chunks.push(Buffer.from(formatLine('סה"כ:', formatCurrency(receipt.total), width), 'utf8'));
  chunks.push(EscPos.BOLD_OFF);

  chunks.push(EscPos.separator(width));

  // Linked documents
  if (receipt.linkedDocuments && receipt.linkedDocuments.length > 0) {
    chunks.push(EscPos.text('מסמכים מקושרים:'));
    for (const doc of receipt.linkedDocuments) {
      chunks.push(EscPos.text(doc));
    }
    chunks.push(EscPos.separator(width));
  }

  // Thank you — centered
  chunks.push(EscPos.ALIGN_CENTER);
  chunks.push(EscPos.text(receipt.thankYouMessage ?? 'תודה על רכישתך!'));
  chunks.push(EscPos.ALIGN_LEFT);

  // Feed and cut
  chunks.push(EscPos.FEED(4));
  chunks.push(EscPos.CUT);

  return Buffer.concat(chunks);
}

// ──────────────────────────────────────────────────────────────────────────────
// Invoice Formatting for Thermal Printer (80mm)
// ──────────────────────────────────────────────────────────────────────────────

export function formatInvoiceForPos(invoice: InvoiceData, paperWidth: 80 = 80): Buffer {
  const width = paperWidth === 80 ? 42 : 32;
  const chunks: Buffer[] = [];

  chunks.push(EscPos.INIT);

  // Header
  chunks.push(EscPos.ALIGN_CENTER);
  chunks.push(EscPos.BOLD_ON);
  chunks.push(EscPos.DOUBLE_HEIGHT);
  chunks.push(EscPos.text(invoice.companyName));
  chunks.push(EscPos.NORMAL_SIZE);
  chunks.push(EscPos.BOLD_OFF);
  if (invoice.address) chunks.push(EscPos.text(invoice.address));
  if (invoice.phone)   chunks.push(EscPos.text(invoice.phone));
  if (invoice.vatNumber) chunks.push(EscPos.text(`מע"מ: ${invoice.vatNumber}`));

  chunks.push(EscPos.ALIGN_LEFT);
  chunks.push(EscPos.separator(width));

  chunks.push(EscPos.BOLD_ON);
  chunks.push(EscPos.text(`חשבונית מס': ${invoice.invoiceNumber}`));
  chunks.push(EscPos.BOLD_OFF);
  chunks.push(EscPos.text(`תאריך: ${invoice.date}`));
  if (invoice.dueDate) chunks.push(EscPos.text(`לתשלום עד: ${invoice.dueDate}`));
  chunks.push(EscPos.text(`לכבוד: ${invoice.customerName}`));
  if (invoice.customerAddress) chunks.push(EscPos.text(invoice.customerAddress));

  chunks.push(EscPos.separator(width));

  // Lines header
  const lineHeaderWidth = width - 12;
  chunks.push(EscPos.BOLD_ON);
  chunks.push(Buffer.from(
    'תיאור'.padEnd(lineHeaderWidth) + 'סה"כ'.padStart(12) + '\n',
    'utf8'
  ));
  chunks.push(EscPos.BOLD_OFF);
  chunks.push(EscPos.separator(width));

  // Invoice lines
  for (const line of invoice.lines) {
    const desc = line.description.substring(0, lineHeaderWidth);
    const total = formatCurrency(line.lineTotal);
    chunks.push(Buffer.from(
      desc.padEnd(lineHeaderWidth) + total.padStart(12) + '\n',
      'utf8'
    ));
    chunks.push(Buffer.from(
      `  ${line.quantity} x ${formatCurrency(line.unitPrice)}\n`,
      'utf8'
    ));
  }

  chunks.push(EscPos.separator(width));

  // Totals
  chunks.push(Buffer.from(formatLine('סה"כ לפני מע"מ:', formatCurrency(invoice.subtotal), width), 'utf8'));
  chunks.push(Buffer.from(formatLine('מע"מ:', formatCurrency(invoice.vatAmount), width), 'utf8'));
  chunks.push(EscPos.BOLD_ON);
  chunks.push(Buffer.from(formatLine('סה"כ לתשלום:', formatCurrency(invoice.total), width), 'utf8'));
  chunks.push(EscPos.BOLD_OFF);

  if (invoice.notes) {
    chunks.push(EscPos.separator(width));
    chunks.push(EscPos.text(`הערות: ${invoice.notes}`));
  }

  chunks.push(EscPos.FEED(4));
  chunks.push(EscPos.CUT);

  return Buffer.concat(chunks);
}

// ──────────────────────────────────────────────────────────────────────────────
// Barcode / QR Code Generation (ESC/POS)
// ──────────────────────────────────────────────────────────────────────────────

export function generateBarcodeEscPos(
  barcode: string,
  type: 'CODE128' | 'EAN13' | 'EAN8' | 'QR'
): Buffer {
  if (type === 'QR') {
    const qrData = Buffer.from(barcode, 'utf8');
    const pL = (qrData.length + 3) & 0xff;
    const pH = Math.floor((qrData.length + 3) / 256);
    return Buffer.concat([
      Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // Model 2
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),        // Size 6
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]),        // Error correction M
      Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]), qrData,   // Store data
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),        // Print
    ]);
  }

  // CODE128 / EAN13 / EAN8 via GS k command
  const barcodeTypeMap: Record<string, number> = {
    EAN8:    6,
    EAN13:   2,
    CODE128: 8,
  };
  const barcodeId = barcodeTypeMap[type] ?? 8;
  const data = Buffer.from(barcode, 'ascii');

  return Buffer.concat([
    // GS h — barcode height (80 dots)
    Buffer.from([0x1d, 0x68, 80]),
    // GS w — barcode width multiplier (2)
    Buffer.from([0x1d, 0x77, 2]),
    // GS H — print HRI below barcode
    Buffer.from([0x1d, 0x48, 2]),
    // GS k — print barcode: type, length, data, NUL terminator
    Buffer.from([0x1d, 0x6b, barcodeId, data.length]),
    data,
    Buffer.from([0x00]),
  ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Network Printing (TCP)
// ──────────────────────────────────────────────────────────────────────────────

export function sendToPrinterNetwork(
  ipAddress: string,
  port: number,
  data: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const TIMEOUT_MS = 5_000;

    socket.setTimeout(TIMEOUT_MS);

    socket.connect(port, ipAddress, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
      });
    });

    socket.on('close', () => resolve());

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Connection to printer ${ipAddress}:${port} timed out`));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Printer CRUD
// ──────────────────────────────────────────────────────────────────────────────

export async function listPrinters(
  tenantId: string,
  branchId?: string
): Promise<Printer[]> {
  return prisma.printer.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(branchId ? { branchId } : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export async function getPrinter(
  tenantId: string,
  printerId: string
): Promise<Printer> {
  const printer = await prisma.printer.findFirst({
    where: { id: printerId, tenantId },
  });
  if (!printer) throw Object.assign(new Error('Printer not found'), { statusCode: 404 });
  return printer;
}

export async function createPrinter(
  tenantId: string,
  _userId: string,
  data: CreatePrinterDto
): Promise<Printer> {
  // If new printer is default, clear existing defaults
  if (data.isDefault) {
    await prisma.printer.updateMany({
      where: { tenantId, isDefault: true },
      data:  { isDefault: false },
    });
  }

  return prisma.printer.create({
    data: {
      tenantId,
      name:           data.name,
      printerType:    data.printerType,
      connectionType: data.connectionType,
      ipAddress:      data.ipAddress,
      port:           data.port,
      usbPath:        data.usbPath,
      paperWidth:     data.paperWidth ?? 80,
      isDefault:      data.isDefault ?? false,
      branchId:       data.branchId,
      canPrintReceipts: data.canPrintReceipts ?? true,
      canPrintInvoices: data.canPrintInvoices ?? false,
      canPrintDelivery: data.canPrintDelivery ?? false,
      canPrintBarcodes: data.canPrintBarcodes ?? false,
      canPrintLabels:   data.canPrintLabels ?? false,
    },
  });
}

export async function updatePrinter(
  tenantId: string,
  printerId: string,
  data: Partial<CreatePrinterDto>
): Promise<Printer> {
  await getPrinter(tenantId, printerId);

  if (data.isDefault) {
    await prisma.printer.updateMany({
      where: { tenantId, isDefault: true, id: { not: printerId } },
      data:  { isDefault: false },
    });
  }

  return prisma.printer.update({
    where: { id: printerId },
    data,
  });
}

export async function deactivatePrinter(
  tenantId: string,
  printerId: string
): Promise<void> {
  await getPrinter(tenantId, printerId);
  await prisma.printer.update({
    where: { id: printerId },
    data:  { isActive: false },
  });
}

export async function testPrinterConnection(
  tenantId: string,
  printerId: string
): Promise<{ success: boolean; message: string }> {
  const printer = await getPrinter(tenantId, printerId);

  if (printer.connectionType !== 'NETWORK') {
    return {
      success: true,
      message: `Printer "${printer.name}" is ${printer.connectionType} — connection must be tested from client device`,
    };
  }

  if (!printer.ipAddress) {
    return { success: false, message: 'No IP address configured for this printer' };
  }

  const port = printer.port ?? 9100;
  const testPage = Buffer.concat([
    EscPos.INIT,
    EscPos.ALIGN_CENTER,
    EscPos.BOLD_ON,
    EscPos.text('TEST PAGE'),
    EscPos.BOLD_OFF,
    EscPos.text(`Printer: ${printer.name}`),
    EscPos.text(new Date().toISOString()),
    EscPos.FEED(3),
    EscPos.CUT,
  ]);

  try {
    await sendToPrinterNetwork(printer.ipAddress, port, testPage);
    return { success: true, message: `Successfully sent test page to ${printer.ipAddress}:${port}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection failed: ${msg}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Print Job Management
// ──────────────────────────────────────────────────────────────────────────────

export async function queuePrintJob(
  tenantId: string,
  userId: string,
  data: QueuePrintDto
): Promise<PrintJob> {
  // Resolve printer
  let printer: Printer | null = null;
  if (data.printerId) {
    printer = await prisma.printer.findFirst({
      where: { id: data.printerId, tenantId, isActive: true },
    });
    if (!printer) throw Object.assign(new Error('Printer not found'), { statusCode: 404 });
  } else {
    // Use default printer
    printer = await prisma.printer.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });
  }

  const job = await prisma.printJob.create({
    data: {
      tenantId,
      printerId:    printer?.id,
      documentType: data.documentType,
      documentId:   data.documentId,
      copies:       data.copies ?? 1,
      priority:     data.priority ?? 5,
      status:       'QUEUED',
      payload:      data.payload ? (data.payload as import('@prisma/client').Prisma.InputJsonValue) : undefined,
      createdBy:    userId,
    },
  });

  // For network printers, attempt immediate processing
  if (printer?.connectionType === 'NETWORK') {
    processPrintJob(job.id).catch(() => {
      // Background — errors will update job status
    });
  }

  return job;
}

/**
 * Internal: generate ESC/POS payload and send to network printer.
 * Updates job status throughout.
 */
export async function processPrintJob(jobId: string): Promise<void> {
  const job = await prisma.printJob.findUnique({
    where:   { id: jobId },
    include: { printer: true },
  });

  if (!job) throw new Error(`PrintJob ${jobId} not found`);
  if (job.status !== 'QUEUED') return;

  await prisma.printJob.update({
    where: { id: jobId },
    data:  { status: 'PRINTING', attempts: { increment: 1 } },
  });

  try {
    let payload: Buffer;

    // If pre-built payload exists (stored as JSON array of byte values or base64)
    if (job.payload) {
      const raw = job.payload;
      if (typeof raw === 'string') {
        payload = Buffer.from(raw, 'base64');
      } else if (Array.isArray(raw)) {
        payload = Buffer.from(raw as number[]);
      } else {
        // Generate minimal payload based on document type
        payload = buildGenericPayload(job.documentType, job.documentId);
      }
    } else {
      payload = buildGenericPayload(job.documentType, job.documentId);
    }

    if (job.printer?.connectionType === 'NETWORK' && job.printer.ipAddress) {
      const port = job.printer.port ?? 9100;
      for (let copy = 0; copy < (job.copies ?? 1); copy++) {
        await sendToPrinterNetwork(job.printer.ipAddress, port, payload);
      }
    }

    await prisma.printJob.update({
      where: { id: jobId },
      data:  { status: 'COMPLETED', printedAt: new Date() },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.printJob.update({
      where: { id: jobId },
      data:  { status: 'FAILED', errorMessage: msg },
    });
    throw err;
  }
}

/**
 * Build a minimal ESC/POS buffer when no pre-built payload is present.
 */
function buildGenericPayload(
  documentType: PrintDocumentType,
  documentId?: string | null
): Buffer {
  const typeLabel: Record<PrintDocumentType, string> = {
    RECEIPT:       'קבלה',
    INVOICE:       'חשבונית',
    TAX_INVOICE:   'חשבונית מס',
    DELIVERY_NOTE: 'תעודת משלוח',
    QUOTE:         'הצעת מחיר',
    BARCODE:       'ברקוד',
    LABEL:         'תווית',
    PAYSLIP:       'תלוש שכר',
    REPORT:        'דו"ח',
  };

  return Buffer.concat([
    EscPos.INIT,
    EscPos.ALIGN_CENTER,
    EscPos.BOLD_ON,
    EscPos.text(typeLabel[documentType] ?? documentType),
    EscPos.BOLD_OFF,
    documentId ? EscPos.text(`מספר: ${documentId}`) : Buffer.alloc(0),
    EscPos.text(new Date().toLocaleString('he-IL')),
    EscPos.FEED(3),
    EscPos.CUT,
  ]);
}

export async function getPrintJob(
  tenantId: string,
  jobId: string
): Promise<PrintJob> {
  const job = await prisma.printJob.findFirst({
    where: { id: jobId, tenantId },
    include: { printer: true },
  });
  if (!job) throw Object.assign(new Error('Print job not found'), { statusCode: 404 });
  return job;
}

export async function listPrintJobs(
  tenantId: string,
  filters: ListPrintJobsFilters
): Promise<PaginatedResult<PrintJob>> {
  const page     = filters.page     ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const where: import('@prisma/client').Prisma.PrintJobWhereInput = {
    tenantId,
    ...(filters.printerId    ? { printerId:    filters.printerId }                  : {}),
    ...(filters.documentType ? { documentType: filters.documentType }               : {}),
    ...(filters.status       ? { status:       filters.status }                     : {}),
    ...(filters.from || filters.to ? {
      createdAt: {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
      },
    } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.printJob.findMany({
      where,
      include: { printer: { select: { name: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.printJob.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function cancelPrintJob(
  tenantId: string,
  jobId: string
): Promise<void> {
  const job = await getPrintJob(tenantId, jobId);
  if (job.status !== 'QUEUED') {
    throw Object.assign(
      new Error(`Cannot cancel job with status ${job.status} — only QUEUED jobs can be cancelled`),
      { statusCode: 400 }
    );
  }
  await prisma.printJob.update({
    where: { id: jobId },
    data:  { status: 'CANCELLED' },
  });
}

export async function retryPrintJob(
  tenantId: string,
  jobId: string
): Promise<void> {
  const job = await getPrintJob(tenantId, jobId);
  if (job.status !== 'FAILED') {
    throw Object.assign(
      new Error(`Cannot retry job with status ${job.status} — only FAILED jobs can be retried`),
      { statusCode: 400 }
    );
  }
  await prisma.printJob.update({
    where: { id: jobId },
    data:  { status: 'QUEUED', errorMessage: null },
  });

  // Attempt processing if printer is network
  const printer = await prisma.printer.findFirst({
    where: { id: job.printerId ?? undefined, tenantId },
  });
  if (printer?.connectionType === 'NETWORK') {
    processPrintJob(jobId).catch(() => {});
  }
}

export async function getPrinterStatus(
  tenantId: string,
  printerId: string
): Promise<{ online: boolean; queueLength: number; lastJob: PrintJob | null }> {
  const printer = await getPrinter(tenantId, printerId);

  // Check if network printer is reachable
  let online = false;
  if (printer.connectionType === 'NETWORK' && printer.ipAddress) {
    try {
      await sendToPrinterNetwork(printer.ipAddress, printer.port ?? 9100, Buffer.alloc(0));
      online = true;
    } catch {
      online = false;
    }
  } else {
    // USB/Bluetooth/Virtual — assume online (client manages these)
    online = true;
  }

  const [queueLength, lastJob] = await Promise.all([
    prisma.printJob.count({
      where: { printerId, tenantId, status: 'QUEUED' },
    }),
    prisma.printJob.findFirst({
      where:   { printerId, tenantId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return { online, queueLength, lastJob };
}

/**
 * Return raw ESC/POS payload as a Buffer.
 * For network printers the payload was sent already; this is mainly for USB/Bluetooth clients.
 */
export async function getPayload(
  tenantId: string,
  jobId: string
): Promise<Buffer> {
  const job = await getPrintJob(tenantId, jobId);

  if (job.payload) {
    const raw = job.payload;
    if (typeof raw === 'string') return Buffer.from(raw, 'base64');
    if (Array.isArray(raw))      return Buffer.from(raw as number[]);
  }

  // Re-generate on-the-fly
  return buildGenericPayload(job.documentType, job.documentId);
}
