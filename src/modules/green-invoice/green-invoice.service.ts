/**
 * green-invoice.service.ts
 *
 * Integration with Green Invoice (חשבונית ירוקה) — Israel Tax Authority e-invoice API.
 * API base: https://api.greeninvoice.co.il/api/v1/
 * Auth: JWT token obtained via POST /account/token, valid 24h, cached module-level.
 *
 * All HTTP calls use Node 18 built-in fetch.
 * All errors are caught and never thrown as raw HTTP errors.
 */

import { prisma } from '../../config/database';
import { GreenInvoiceStatus } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const GI_BASE_URL = 'https://api.greeninvoice.co.il/api/v1';

/** Map ERP invoice types to Green Invoice document type codes */
const DOC_TYPE_MAP: Record<string, number> = {
  TAX_INVOICE:  305,
  INVOICE:      305,
  CREDIT_NOTE:  330,
  RECEIPT:      320,
};

/** Map ERP payment methods to Green Invoice payment type codes */
const PAYMENT_TYPE_MAP: Record<string, number> = {
  CASH:          1,
  CHECK:         2,
  BANK_TRANSFER: 3,
  CREDIT_CARD:   4,
  OTHER:         5,
};

const MAX_RETRIES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GreenInvoiceDocument {
  type: number;         // 305 = tax invoice, 320 = receipt invoice, 330 = credit note
  date: number;         // Unix timestamp in seconds
  dueDate?: number;
  lang: 'he';
  currency: string;     // ILS, USD, EUR
  vatType: number;      // 1 = included, 2 = excluded
  amount: number;
  vat: number;
  client: {
    name: string;
    id?: string;        // customer VAT/ID number
    emails?: string[];
    phone?: string;
    address?: string;
    city?: string;
  };
  description: string;
  lineItems?: Array<{
    name: string;
    quantity: number;
    price: number;
    vat: number;
    total: number;
  }>;
  payment?: Array<{
    type: number;       // 1=cash, 2=check, 3=bank transfer, 4=credit card, 5=other
    date: number;
    price: number;
  }>;
}

interface TokenCache {
  token: string;
  expiresAt: number; // Unix ms timestamp
}

interface GreenInvoiceApiResponse {
  id?: string;
  signedUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface SubmissionFilters {
  status?: GreenInvoiceStatus;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

// ─── Token Cache (module-level) ───────────────────────────────────────────────

let _tokenCache: TokenCache | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEnvVars(): { apiKey: string; apiSecret: string } {
  const apiKey    = process.env.GREEN_INVOICE_API_KEY;
  const apiSecret = process.env.GREEN_INVOICE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('GREEN_INVOICE_API_KEY not configured');
  }

  return { apiKey, apiSecret };
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function parseAddressString(address: unknown): { address?: string; city?: string } {
  if (!address || typeof address !== 'object') return {};
  const a = address as Record<string, unknown>;
  const parts: string[] = [];
  if (a['street']) parts.push(String(a['street']));
  if (a['zip'])    parts.push(String(a['zip']));
  const addressStr = parts.join(', ') || undefined;
  const city = a['city'] ? String(a['city']) : undefined;
  return { address: addressStr, city };
}

// ─── getAuthToken ─────────────────────────────────────────────────────────────

/**
 * Authenticate with the Green Invoice API and return a JWT token.
 * Token is cached module-level and reused until within 5 minutes of expiry.
 */
export async function getAuthToken(): Promise<string> {
  const { apiKey, apiSecret } = getEnvVars();

  // Return cached token if still valid (with 5-minute buffer)
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return _tokenCache.token;
  }

  let response: Response;
  try {
    response = await fetch(`${GI_BASE_URL}/account/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: apiKey, secret: apiSecret }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Green Invoice auth request failed: ${msg}`);
  }

  let body: { token?: string; errorCode?: string; errorMessage?: string };
  try {
    body = await response.json() as typeof body;
  } catch {
    throw new Error(`Green Invoice auth response parse error (HTTP ${response.status})`);
  }

  if (!response.ok || !body.token) {
    const detail = body.errorMessage ?? body.errorCode ?? `HTTP ${response.status}`;
    throw new Error(`Green Invoice authentication failed: ${detail}`);
  }

  // Token is valid for 24 hours; cache for 23h 55m
  _tokenCache = {
    token:     body.token,
    expiresAt: now + 23 * 60 * 60 * 1000 + 55 * 60 * 1000,
  };

  return _tokenCache.token;
}

// ─── mapInvoiceToGreenDoc ─────────────────────────────────────────────────────

/**
 * Map an ERP Invoice (with its lines and customer) to the Green Invoice document format.
 */
export function mapInvoiceToGreenDoc(
  invoice: any,
  customer: any,
  lines: any[]
): GreenInvoiceDocument {
  const docType = DOC_TYPE_MAP[invoice.invoiceType as string] ?? 305;

  // Build client object
  const { address: addrStr, city } = parseAddressString(customer.address);
  const client: GreenInvoiceDocument['client'] = {
    name: customer.name,
  };
  if (customer.vatNumber)  client.id      = customer.vatNumber;
  else if (customer.businessId) client.id = customer.businessId;
  if (customer.email)      client.emails  = [customer.email];
  if (customer.phone)      client.phone   = customer.phone;
  if (addrStr)             client.address = addrStr;
  if (city)                client.city    = city;

  // Build line items
  const lineItems: GreenInvoiceDocument['lineItems'] = lines.map((line: any) => {
    const qty      = Number(line.quantity);
    const price    = Number(line.unitPrice);
    const vatRate  = Number(line.vatRate);   // e.g. 0.18
    const vatAmt   = price * vatRate;
    const total    = Number(line.lineTotal);
    return {
      name:     line.description,
      quantity: qty,
      price:    price,
      vat:      vatAmt,
      total:    total,
    };
  });

  // Build payment entries if invoice has payments
  let payment: GreenInvoiceDocument['payment'] | undefined;
  if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    payment = invoice.payments.map((p: any) => ({
      type:  PAYMENT_TYPE_MAP[p.method as string] ?? 5,
      date:  toUnixSeconds(new Date(p.date)),
      price: Number(p.amount),
    }));
  }

  const doc: GreenInvoiceDocument = {
    type:        docType,
    date:        toUnixSeconds(new Date(invoice.date)),
    lang:        'he',
    currency:    invoice.currency ?? 'ILS',
    vatType:     1,  // VAT included in amounts
    amount:      Number(invoice.subtotal),
    vat:         Number(invoice.vatAmount),
    client,
    description: invoice.notes ?? invoice.number ?? '',
    lineItems,
  };

  if (invoice.dueDate) {
    doc.dueDate = toUnixSeconds(new Date(invoice.dueDate));
  }

  if (payment && payment.length > 0) {
    doc.payment = payment;
  }

  return doc;
}

// ─── submitInvoice ────────────────────────────────────────────────────────────

/**
 * Submit an ERP invoice to the Green Invoice API.
 * Creates or updates a GreenInvoiceSubmission record in the database.
 * Returns the submission record.
 */
export async function submitInvoice(
  tenantId: string,
  invoiceId: string
) {
  // 1. Check if a successful submission already exists
  const existing = await prisma.greenInvoiceSubmission.findUnique({
    where: { invoiceId },
  });
  if (existing && existing.status === GreenInvoiceStatus.ACCEPTED) {
    throw new Error('חשבונית זו כבר הוגשה בהצלחה לחשבונית ירוקה');
  }

  // 2. Fetch invoice with lines, customer, and payments
  const invoice = await prisma.invoice.findFirst({
    where:   { id: invoiceId, tenantId, deletedAt: null },
    include: {
      lines:    { orderBy: { sortOrder: 'asc' } },
      customer: true,
      payments: { orderBy: { date: 'desc' } },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // 3. Map to Green Invoice format
  const greenDoc = mapInvoiceToGreenDoc(invoice, invoice.customer, invoice.lines);

  // 4. Get auth token
  let token: string;
  try {
    token = await getAuthToken();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Save error submission
    return await upsertSubmission(existing?.id ?? null, {
      tenantId,
      invoiceId,
      status:      GreenInvoiceStatus.ERROR,
      responseMsg: msg,
      retryCount:  existing ? existing.retryCount + 1 : 0,
    });
  }

  // 5. POST to Green Invoice documents endpoint
  let apiResponse: GreenInvoiceApiResponse;
  let responseOk = false;

  try {
    const res = await fetch(`${GI_BASE_URL}/documents`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(greenDoc),
    });

    apiResponse = await res.json() as GreenInvoiceApiResponse;
    responseOk  = res.ok;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return await upsertSubmission(existing?.id ?? null, {
      tenantId,
      invoiceId,
      status:      GreenInvoiceStatus.ERROR,
      responseMsg: `Network error: ${msg}`,
      retryCount:  existing ? existing.retryCount + 1 : 0,
    });
  }

  // 6. Handle API response
  if (responseOk && apiResponse.id) {
    return await upsertSubmission(existing?.id ?? null, {
      tenantId,
      invoiceId,
      status:       GreenInvoiceStatus.ACCEPTED,
      submittedAt:  new Date(),
      documentId:   apiResponse.id,
      signedUrl:    apiResponse.signedUrl ?? null,
      responseCode: null,
      responseMsg:  null,
      rawResponse:  apiResponse,
      retryCount:   existing ? existing.retryCount : 0,
    });
  } else {
    // Determine whether it is a hard rejection or a transient error
    const status = apiResponse.errorCode
      ? GreenInvoiceStatus.REJECTED
      : GreenInvoiceStatus.ERROR;

    return await upsertSubmission(existing?.id ?? null, {
      tenantId,
      invoiceId,
      status,
      submittedAt:  new Date(),
      responseCode: apiResponse.errorCode ?? null,
      responseMsg:  apiResponse.errorMessage ?? 'Unknown error',
      rawResponse:  apiResponse,
      retryCount:   existing ? existing.retryCount + 1 : 0,
    });
  }
}

// ─── Internal upsert helper ───────────────────────────────────────────────────

async function upsertSubmission(
  existingId: string | null,
  data: {
    tenantId:     string;
    invoiceId:    string;
    status:       GreenInvoiceStatus;
    submittedAt?: Date;
    documentId?:  string | null;
    signedUrl?:   string | null;
    responseCode?: string | null;
    responseMsg?:  string | null;
    rawResponse?:  unknown;
    retryCount:   number;
  }
) {
  if (existingId) {
    return prisma.greenInvoiceSubmission.update({
      where: { id: existingId },
      data: {
        status:       data.status,
        submittedAt:  data.submittedAt,
        documentId:   data.documentId,
        signedUrl:    data.signedUrl,
        responseCode: data.responseCode,
        responseMsg:  data.responseMsg,
        rawResponse:  data.rawResponse as any,
        retryCount:   data.retryCount,
      },
    });
  }

  return prisma.greenInvoiceSubmission.create({
    data: {
      tenantId:     data.tenantId,
      invoiceId:    data.invoiceId,
      status:       data.status,
      submittedAt:  data.submittedAt,
      documentId:   data.documentId,
      signedUrl:    data.signedUrl,
      responseCode: data.responseCode,
      responseMsg:  data.responseMsg,
      rawResponse:  data.rawResponse as any,
      retryCount:   data.retryCount,
    },
  });
}

// ─── getSubmissionStatus ──────────────────────────────────────────────────────

/**
 * Retrieve the existing Green Invoice submission for a given invoice.
 */
export async function getSubmissionStatus(invoiceId: string, tenantId: string) {
  const submission = await prisma.greenInvoiceSubmission.findUnique({
    where:   { invoiceId },
    include: { invoice: { select: { number: true, total: true, status: true } } },
  });

  if (!submission || submission.tenantId !== tenantId) {
    return null;
  }

  return submission;
}

// ─── retrySubmission ──────────────────────────────────────────────────────────

/**
 * Retry a REJECTED or ERROR submission.
 * Maximum of MAX_RETRIES (3) retries allowed.
 */
export async function retrySubmission(submissionId: string, tenantId: string) {
  const submission = await prisma.greenInvoiceSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission || submission.tenantId !== tenantId) {
    throw new Error('Submission not found');
  }

  if (
    submission.status !== GreenInvoiceStatus.REJECTED &&
    submission.status !== GreenInvoiceStatus.ERROR
  ) {
    throw new Error(`Cannot retry a submission with status: ${submission.status}`);
  }

  if (submission.retryCount >= MAX_RETRIES) {
    throw new Error(
      `Maximum retry attempts (${MAX_RETRIES}) reached for submission ${submissionId}`
    );
  }

  // Re-run the full submit flow — upsertSubmission will update in-place via invoiceId unique constraint
  return await submitInvoice(tenantId, submission.invoiceId);
}

// ─── getSignedDocument ────────────────────────────────────────────────────────

/**
 * Download the signed PDF document from Green Invoice.
 * Returns a Buffer suitable for streaming to the HTTP client.
 */
export async function getSignedDocument(
  submissionId: string,
  tenantId: string
): Promise<Buffer> {
  const submission = await prisma.greenInvoiceSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission || submission.tenantId !== tenantId) {
    throw new Error('Submission not found');
  }

  if (submission.status !== GreenInvoiceStatus.ACCEPTED) {
    throw new Error('Document only available for accepted submissions');
  }

  if (!submission.documentId) {
    throw new Error('No document ID stored for this submission');
  }

  let token: string;
  try {
    token = await getAuthToken();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Authentication failed: ${msg}`);
  }

  let res: Response;
  try {
    res = await fetch(
      `${GI_BASE_URL}/documents/${submission.documentId}/download`,
      {
        method:  'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Download request failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Green Invoice download failed with HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── listSubmissions ──────────────────────────────────────────────────────────

/**
 * List all Green Invoice submissions for a tenant with optional filters and pagination.
 */
export async function listSubmissions(
  tenantId: string,
  filters: SubmissionFilters = {}
) {
  const {
    status,
    from,
    to,
    page  = 1,
    limit = 25,
  } = filters;

  const where: Record<string, unknown> = { tenantId };

  if (status) {
    where['status'] = status;
  }

  if (from || to) {
    where['createdAt'] = {
      ...(from ? { gte: from } : {}),
      ...(to   ? { lte: to   } : {}),
    };
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.greenInvoiceSubmission.findMany({
      where,
      include: {
        invoice: {
          select: {
            number:      true,
            total:       true,
            status:      true,
            invoiceType: true,
            date:        true,
            customer:    { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.greenInvoiceSubmission.count({ where }),
  ]);

  return { items, total, page, limit };
}

// ─── testConnection ───────────────────────────────────────────────────────────

/**
 * Test Green Invoice API credentials.
 * Returns { connected: true } on success or { connected: false, message } on failure.
 */
export async function testConnection(
  _tenantId: string
): Promise<{ connected: boolean; message: string }> {
  const apiKey    = process.env.GREEN_INVOICE_API_KEY;
  const apiSecret = process.env.GREEN_INVOICE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return {
      connected: false,
      message:   'GREEN_INVOICE_API_KEY or GREEN_INVOICE_API_SECRET environment variable is not set',
    };
  }

  // Invalidate cache to force a fresh auth attempt
  _tokenCache = null;

  try {
    await getAuthToken();
    return {
      connected: true,
      message:   'Connected to Green Invoice API successfully',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      message:   msg,
    };
  }
}
