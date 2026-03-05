/**
 * Email service — wraps the Resend SDK for transactional email delivery.
 *
 * Behaviour when RESEND_API_KEY is not set:
 *   - A warning is logged once at startup.
 *   - Every send call is silently skipped (no error is thrown).
 *
 * All public functions return Promise<void> and swallow errors internally
 * so that a failed email never crashes the main request flow.
 */

import { Resend } from 'resend';
import { logger } from '../config/logger';
import { payslipTemplate, invoiceTemplate, welcomeTemplate } from './email.templates';

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? 'noreply@erp.local';

if (!resend) {
  logger.warn('RESEND_API_KEY not set — email sending disabled');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}

// ---------------------------------------------------------------------------
// Base send function
// ---------------------------------------------------------------------------

/**
 * Low-level send function.
 * Converts Buffer attachments to base64 strings as required by the Resend SDK,
 * then dispatches the email.
 */
export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  if (!resend) {
    logger.warn('sendEmail: skipped — Resend client not initialised (RESEND_API_KEY missing)', {
      to: opts.to,
      subject: opts.subject,
    });
    return;
  }

  const resendAttachments = opts.attachments?.map((att) => ({
    filename: att.filename,
    // Resend accepts a base64-encoded string or a Buffer for attachment content.
    content: att.content.toString('base64'),
  }));

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(resendAttachments && resendAttachments.length > 0
        ? { attachments: resendAttachments }
        : {}),
    });

    if (error) {
      logger.error('sendEmail: Resend API returned an error', {
        to: opts.to,
        subject: opts.subject,
        error,
      });
      return;
    }

    logger.info('sendEmail: delivered', {
      to: opts.to,
      subject: opts.subject,
      messageId: data?.id,
    });
  } catch (err) {
    logger.error('sendEmail: unexpected error', {
      to: opts.to,
      subject: opts.subject,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// sendPayslipEmail
// ---------------------------------------------------------------------------

export interface SendPayslipEmailOpts {
  to: string;
  employeeName: string;
  month: number;   // 1-based
  year: number;
  netSalary: number;
  pdfBuffer: Buffer;
}

/**
 * Sends a payslip email with the PDF attached.
 * The email body is rendered by `payslipTemplate`.
 */
export async function sendPayslipEmail(opts: SendPayslipEmailOpts): Promise<void> {
  const { to, employeeName, month, year, netSalary, pdfBuffer } = opts;

  let html: string;
  try {
    html = payslipTemplate({ employeeName, month, year, netSalary });
  } catch (err) {
    logger.error('sendPayslipEmail: template rendering failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await sendEmail({
    to,
    subject: `תלוש שכר — ${month}/${year} — ${employeeName}`,
    html,
    attachments: [
      {
        filename: `payslip_${year}_${String(month).padStart(2, '0')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// sendInvoiceEmail
// ---------------------------------------------------------------------------

export interface SendInvoiceEmailOpts {
  to: string;
  customerName: string;
  invoiceNumber: string;
  total: number;
  pdfBuffer: Buffer;
}

/**
 * Sends an invoice email with the PDF attached.
 * The email body is rendered by `invoiceTemplate`.
 */
export async function sendInvoiceEmail(opts: SendInvoiceEmailOpts): Promise<void> {
  const { to, customerName, invoiceNumber, total, pdfBuffer } = opts;

  let html: string;
  try {
    html = invoiceTemplate({ customerName, invoiceNumber, total });
  } catch (err) {
    logger.error('sendInvoiceEmail: template rendering failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await sendEmail({
    to,
    subject: `חשבונית מס מספר ${invoiceNumber} — ${customerName}`,
    html,
    attachments: [
      {
        filename: `invoice_${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// sendWelcomeEmail
// ---------------------------------------------------------------------------

export interface SendWelcomeEmailOpts {
  to: string;
  tenantName: string;
  loginUrl?: string;
}

/**
 * Sends a welcome email to a newly registered tenant admin.
 * No attachment — HTML only.
 */
export async function sendWelcomeEmail(opts: SendWelcomeEmailOpts): Promise<void> {
  const { to, tenantName, loginUrl } = opts;

  let html: string;
  try {
    html = welcomeTemplate({ tenantName, loginUrl });
  } catch (err) {
    logger.error('sendWelcomeEmail: template rendering failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await sendEmail({
    to,
    subject: `ברוכים הבאים למערכת חשבשבת — ${tenantName}`,
    html,
  });
}
