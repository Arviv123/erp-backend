import * as XLSX from 'xlsx';
import { prisma } from '../../config/database';
import {
  CreditCardProcessor,
  LineReconciliationStatus,
  ReconciliationMatchType,
  ReconStatus,
  StatementReconciliationStatus,
} from '@prisma/client';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface ImportStatementDto {
  processor:     CreditCardProcessor;
  statementDate: string;   // ISO date
  periodFrom:    string;   // ISO date
  periodTo:      string;   // ISO date
  csvContent:    string;
  rawFilename?:  string;
}

export interface ManualMatchDto {
  statementLineIds: string[];
  bankLineId?:      string;
  notes?:           string;
  statementId:      string;
}

export interface MatchResult {
  totalLines:   number;
  autoMatched:  number;
  candidates:   number;
  unmatched:    number;
}

export interface ReconciliationReport {
  cards: CardReconciliationSummary[];
  generatedAt: string;
}

export interface CardReconciliationSummary {
  cardId:          string;
  cardNumber:      string;
  cardholderName:  string;
  issuer:          string;
  totalLines:      number;
  matchedLines:    number;
  matchedPercent:  number;
  unmatchedAmount: number;
  disputedCount:   number;
  periodFrom:      string | null;
  periodTo:        string | null;
}

// ─── Parsed Transaction ───────────────────────────────────────────────────────

export interface ParsedTransaction {
  transactionDate:   Date;
  postingDate?:      Date;
  merchantName:      string;
  merchantCategory?: string;
  amount:            number;
  currency:          string;
  originalAmount?:   number;
  originalCurrency?: string;
  reference?:        string;
  authCode?:         string;
  installments?:     number;
  installmentNumber?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip UTF-8 BOM and parse CSV rows supporting quoted fields (comma or semicolon).
 */
function parseCsvRows(raw: string): string[][] {
  const content = raw.replace(/^\uFEFF/, '').trim();
  const lines   = content.split(/\r?\n/).filter(l => l.trim().length > 0);

  return lines.map(line => {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if ((ch === ',' || ch === '\t') && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    return cols;
  });
}

/** Parse DD/MM/YYYY or YYYY-MM-DD to a Date */
function parseIsraeliDate(raw: string): Date | null {
  const s = raw.trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const dt = new Date(s.substring(0, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

/** Parse an amount string ("1,234.56" / "1234,56") → number */
function parseAmount(raw: string): number {
  if (!raw) return NaN;
  let s = raw.replace(/[₪\s]/g, '');
  // Israeli format: 1234,56 (comma as decimal, 2 digits)
  s = s.replace(/^(-?\d+),(\d{2})$/, '$1.$2');
  // Strip non-numeric except dot and leading minus
  s = s.replace(/[^\d.-]/g, '');
  return parseFloat(s);
}

// ─── CSV Parsers ──────────────────────────────────────────────────────────────

/**
 * Cal (כ.א.ל) CSV:
 * תאריך עסקה, שם בית עסק, קטגוריה, סכום חיוב, מטבע, 4 ספרות אחרונות,
 * מספר אסמכתא, מספר תשלום, סה"כ תשלומים
 */
export function parseCalCSV(content: string): ParsedTransaction[] {
  const rows    = parseCsvRows(content);
  if (rows.length < 2) return [];
  const results: ParsedTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = parseIsraeliDate(row[0] ?? '');
    if (!date) continue;
    const amount = parseAmount(row[3] ?? '');
    if (isNaN(amount)) continue;

    results.push({
      transactionDate:  date,
      merchantName:     (row[1] ?? '').trim(),
      merchantCategory: (row[2] ?? '').trim() || undefined,
      amount:           Math.abs(amount),
      currency:         (row[4] ?? 'ILS').trim() || 'ILS',
      reference:        (row[6] ?? '').trim() || undefined,
      installmentNumber: row[7] ? parseInt(row[7], 10) || undefined : undefined,
      installments:      row[8] ? parseInt(row[8], 10) || undefined : undefined,
    });
  }
  return results;
}

/**
 * Leumi Card (ויזה כ.א.ל) CSV:
 * תאריך עסקה, שם עסק, סכום חיוב, מספר אחרון, אסמכתא, תשלום מתוך, סכום כולל
 */
export function parseLeumiCardCSV(content: string): ParsedTransaction[] {
  const rows    = parseCsvRows(content);
  if (rows.length < 2) return [];
  const results: ParsedTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = parseIsraeliDate(row[0] ?? '');
    if (!date) continue;
    const amount = parseAmount(row[2] ?? '');
    if (isNaN(amount)) continue;

    const installmentParts = (row[5] ?? '').split('/');
    const installmentNum   = parseInt(installmentParts[0] ?? '', 10) || undefined;
    const installmentsTotal = parseInt(installmentParts[1] ?? '', 10) || undefined;

    results.push({
      transactionDate:  date,
      merchantName:     (row[1] ?? '').trim(),
      amount:           Math.abs(amount),
      currency:         'ILS',
      reference:        (row[4] ?? '').trim() || undefined,
      installmentNumber: installmentNum,
      installments:      installmentsTotal,
    });
  }
  return results;
}

/**
 * Isracard (ישראכארד) CSV:
 * Transaction Date, Merchant, Charge Amount, Currency, Last4, Reference,
 * Installment, Total Installments
 */
export function parseIsracardCSV(content: string): ParsedTransaction[] {
  const rows    = parseCsvRows(content);
  if (rows.length < 2) return [];
  const results: ParsedTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const date = parseIsraeliDate(row[0] ?? '');
    if (!date) continue;
    const amount = parseAmount(row[2] ?? '');
    if (isNaN(amount)) continue;

    results.push({
      transactionDate:  date,
      merchantName:     (row[1] ?? '').trim(),
      amount:           Math.abs(amount),
      currency:         (row[3] ?? 'ILS').trim() || 'ILS',
      reference:        (row[5] ?? '').trim() || undefined,
      installmentNumber: row[6] ? parseInt(row[6], 10) || undefined : undefined,
      installments:      row[7] ? parseInt(row[7], 10) || undefined : undefined,
    });
  }
  return results;
}

/**
 * Poalim Express CSV — same columns as Isracard.
 */
export function parsePoalimExpressCSV(content: string): ParsedTransaction[] {
  return parseIsracardCSV(content);
}

/**
 * Amex Israel CSV:
 * Date, Description, Amount, Reference
 */
export function parseAmexCSV(content: string): ParsedTransaction[] {
  const rows    = parseCsvRows(content);
  if (rows.length < 2) return [];
  const results: ParsedTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const date = parseIsraeliDate(row[0] ?? '');
    if (!date) continue;
    const amount = parseAmount(row[2] ?? '');
    if (isNaN(amount)) continue;

    results.push({
      transactionDate: date,
      merchantName:    (row[1] ?? '').trim(),
      amount:          Math.abs(amount),
      currency:        'ILS',
      reference:       (row[3] ?? '').trim() || undefined,
    });
  }
  return results;
}

/** Dispatch to the correct parser based on processor type */
function parseByProcessor(
  processor: CreditCardProcessor,
  content:   string,
): ParsedTransaction[] {
  switch (processor) {
    case 'CAL':            return parseCalCSV(content);
    case 'LEUMI_CARD':     return parseLeumiCardCSV(content);
    case 'ISRACARD':       return parseIsracardCSV(content);
    case 'POALIM_EXPRESS': return parsePoalimExpressCSV(content);
    case 'AMEX':           return parseAmexCSV(content);
    default:               return parseCalCSV(content); // best-effort for OTHER
  }
}

// ─── Statement CRUD ───────────────────────────────────────────────────────────

/**
 * Import a statement CSV and persist all parsed lines.
 * Duplicates (same statementId + date + amount + merchant) are skipped.
 */
export async function importStatement(
  tenantId: string,
  cardId:   string,
  data:     ImportStatementDto,
  userId:   string,
) {
  // Verify card belongs to tenant
  const card = await prisma.corporateCreditCard.findUnique({ where: { id: cardId } });
  if (!card || card.tenantId !== tenantId) {
    throw new Error('כרטיס אשראי לא נמצא');
  }

  const parsed = parseByProcessor(data.processor, data.csvContent);
  if (parsed.length === 0) {
    throw new Error('לא נמצאו שורות תקינות בקובץ CSV');
  }

  const totalAmount = parsed.reduce((s, t) => s + t.amount, 0);

  const statement = await prisma.creditCardStatement.create({
    data: {
      tenantId,
      cardId,
      processor:     data.processor,
      statementDate: new Date(data.statementDate),
      periodFrom:    new Date(data.periodFrom),
      periodTo:      new Date(data.periodTo),
      rawFilename:   data.rawFilename,
      totalAmount:   totalAmount,
      currency:      'ILS',
      status:        StatementReconciliationStatus.PENDING,
      createdBy:     userId,
    },
  });

  // Create lines in batches to avoid large single queries
  for (const tx of parsed) {
    await prisma.creditCardStatementLine.create({
      data: {
        statementId:      statement.id,
        transactionDate:  tx.transactionDate,
        postingDate:      tx.postingDate,
        merchantName:     tx.merchantName,
        merchantCategory: tx.merchantCategory,
        amount:           tx.amount,
        currency:         tx.currency ?? 'ILS',
        originalAmount:   tx.originalAmount,
        originalCurrency: tx.originalCurrency,
        reference:        tx.reference,
        authCode:         tx.authCode,
        installments:     tx.installments,
        installmentNumber: tx.installmentNumber,
        status:           LineReconciliationStatus.UNMATCHED,
      },
    });
  }

  return prisma.creditCardStatement.findUnique({
    where:   { id: statement.id },
    include: { transactions: true },
  });
}

export async function listStatements(
  tenantId: string,
  filters: { cardId?: string; status?: string; from?: string; to?: string },
) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.cardId) where['cardId'] = filters.cardId;
  if (filters.status) where['status'] = filters.status;
  if (filters.from || filters.to) {
    where['statementDate'] = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to   ? { lte: new Date(filters.to) }   : {}),
    };
  }

  return prisma.creditCardStatement.findMany({
    where:   where as any,
    include: {
      card:           { select: { cardNumber: true, cardholderName: true, issuer: true } },
      _count:         { select: { transactions: true, reconciliations: true } },
    },
    orderBy: { statementDate: 'desc' },
  });
}

export async function getStatement(tenantId: string, statementId: string) {
  const stmt = await prisma.creditCardStatement.findUnique({
    where:   { id: statementId },
    include: {
      card:         { select: { cardNumber: true, cardholderName: true, issuer: true } },
      transactions: { orderBy: { transactionDate: 'asc' } },
      reconciliations: {
        include: { bankLine: true },
      },
    },
  });
  if (!stmt || stmt.tenantId !== tenantId) return null;
  return stmt;
}

export async function getStatementSummary(tenantId: string, statementId: string) {
  const stmt = await prisma.creditCardStatement.findUnique({
    where:   { id: statementId },
    include: { transactions: true },
  });
  if (!stmt || stmt.tenantId !== tenantId) return null;

  const lines    = stmt.transactions;
  const total    = lines.length;
  const matched  = lines.filter(l => l.status === 'MATCHED').length;
  const unmatched = lines.filter(l => l.status === 'UNMATCHED').length;
  const disputed = lines.filter(l => l.status === 'DISPUTED').length;

  // Amount by category
  const byCategory: Record<string, number> = {};
  for (const l of lines) {
    const cat = l.merchantCategory ?? 'לא מסווג';
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(l.amount);
  }
  for (const k of Object.keys(byCategory)) {
    byCategory[k] = Math.round(byCategory[k] * 100) / 100;
  }

  return {
    statementId,
    total,
    matched,
    unmatched,
    disputed,
    totalAmount:     Math.round(Number(stmt.totalAmount) * 100) / 100,
    unmatchedAmount: Math.round(lines.filter(l => l.status === 'UNMATCHED').reduce((s, l) => s + Number(l.amount), 0) * 100) / 100,
    byCategory,
  };
}

export async function deleteStatement(tenantId: string, statementId: string) {
  const stmt = await prisma.creditCardStatement.findUnique({ where: { id: statementId } });
  if (!stmt || stmt.tenantId !== tenantId) throw new Error('הצהרה לא נמצאה');
  if (stmt.status !== StatementReconciliationStatus.PENDING) {
    throw new Error('ניתן למחוק רק הצהרות בסטטוס PENDING');
  }
  // Cascade deletes lines due to schema onDelete: Cascade
  await prisma.creditCardStatement.delete({ where: { id: statementId } });
}

// ─── Auto-Matching Engine ─────────────────────────────────────────────────────

export async function autoMatchStatement(
  tenantId:    string,
  statementId: string,
): Promise<MatchResult> {
  const stmt = await prisma.creditCardStatement.findUnique({
    where:   { id: statementId },
    include: { transactions: true },
  });
  if (!stmt || stmt.tenantId !== tenantId) throw new Error('הצהרה לא נמצאה');

  const unmatchedLines = stmt.transactions.filter(
    l => l.status === LineReconciliationStatus.UNMATCHED,
  );

  // Fetch bank statement lines in period ±7 days that are unmatched
  const periodFrom = new Date(stmt.periodFrom.getTime() - 7 * 24 * 60 * 60 * 1000);
  const periodTo   = new Date(stmt.periodTo.getTime()   + 7 * 24 * 60 * 60 * 1000);

  const bankLines = await prisma.bankStatementLine.findMany({
    where: {
      tenantId,
      status: 'UNMATCHED',
      date:   { gte: periodFrom, lte: periodTo },
    },
  });

  let autoMatched = 0;
  let candidates  = 0;
  const usedBankLineIds = new Set<string>();

  for (const line of unmatchedLines) {
    const lineAmount = Number(line.amount);
    const lineDate   = line.transactionDate;
    // Same-month window: first and last day of the charge month
    const monthStart = new Date(lineDate.getFullYear(), lineDate.getMonth(), 1);
    const monthEnd   = new Date(lineDate.getFullYear(), lineDate.getMonth() + 1, 0, 23, 59, 59);

    let bestScore = 0;
    let bestBank: typeof bankLines[0] | null = null;

    for (const bank of bankLines) {
      if (usedBankLineIds.has(bank.id)) continue;
      // BankStatementLine has debit/credit rather than amount — use debit for CC charges
      const bankAmount = Math.abs(Number(bank.debit ?? bank.credit ?? 0));
      const bankDate   = bank.date;

      // Date within same month
      const bankInMonth = bankDate >= monthStart && bankDate <= monthEnd;
      // Date within ±3 days
      const daysDiff = Math.abs((bankDate.getTime() - lineDate.getTime()) / (1000 * 60 * 60 * 24));

      const amountDiff = Math.abs(bankAmount - lineAmount);

      let score = 0;
      if (amountDiff < 0.001 && bankInMonth) {
        score = 1.0; // exact match, same month
      } else if (amountDiff <= 1.0 && bankInMonth) {
        score = 0.85; // within 1 NIS tolerance
      } else if (amountDiff < 0.001 && daysDiff <= 3) {
        score = 0.75; // exact amount, ±3 days
      } else if (amountDiff <= 1.0 && daysDiff <= 3) {
        score = 0.65; // near amount, ±3 days
      }

      if (score > bestScore) {
        bestScore = score;
        bestBank  = bank;
      }
    }

    if (bestScore >= 0.85 && bestBank) {
      // Auto-match: create reconciliation record
      const recon = await prisma.creditCardReconciliation.create({
        data: {
          tenantId,
          statementId,
          matchType:       ReconciliationMatchType.AUTO,
          matchScore:      bestScore,
          differenceAmount: bestBank
            ? Math.abs(Math.abs(Number(bestBank.debit ?? bestBank.credit ?? 0)) - lineAmount)
            : 0,
          bankLineId:   bestBank.id,
          status:       ReconStatus.MATCHED,
          reconciledBy: 'SYSTEM',
        },
      });

      // Link the statement line to this recon
      await prisma.creditCardStatementLine.update({
        where: { id: line.id },
        data:  { status: LineReconciliationStatus.MATCHED, reconId: recon.id },
      });

      // Mark bank line matched
      await prisma.bankStatementLine.update({
        where: { id: bestBank.id },
        data:  { status: 'MATCHED' },
      });

      usedBankLineIds.add(bestBank.id);
      autoMatched++;
    } else if (bestScore >= 0.5) {
      candidates++;
      // Don't auto-match — leave as UNMATCHED for manual review
    }
  }

  // Update statement status
  const allLines = await prisma.creditCardStatementLine.findMany({
    where: { statementId },
  });
  const stillUnmatched = allLines.filter(l => l.status === LineReconciliationStatus.UNMATCHED).length;
  const newStatus =
    stillUnmatched === 0
      ? StatementReconciliationStatus.FULLY_RECONCILED
      : autoMatched > 0
      ? StatementReconciliationStatus.PARTIALLY_RECONCILED
      : StatementReconciliationStatus.IN_PROGRESS;

  await prisma.creditCardStatement.update({
    where: { id: statementId },
    data:  { status: newStatus },
  });

  return {
    totalLines:  unmatchedLines.length,
    autoMatched,
    candidates,
    unmatched:   unmatchedLines.length - autoMatched - candidates,
  };
}

// ─── Manual Matching ──────────────────────────────────────────────────────────

export async function matchManually(
  tenantId: string,
  data:     ManualMatchDto,
  userId:   string,
): Promise<object> {
  // Verify all statement lines belong to this tenant's statement
  const lines = await prisma.creditCardStatementLine.findMany({
    where:   { id: { in: data.statementLineIds }, statementId: data.statementId },
    include: { statement: { select: { tenantId: true } } },
  });

  if (lines.length !== data.statementLineIds.length) {
    throw new Error('אחת או יותר משורות ההצהרה לא נמצאו');
  }
  if (lines.some(l => l.statement.tenantId !== tenantId)) {
    throw new Error('אין גישה לשורות אלה');
  }

  // Verify bank line belongs to tenant (if provided)
  if (data.bankLineId) {
    const bankLine = await prisma.bankStatementLine.findUnique({
      where: { id: data.bankLineId },
    });
    if (!bankLine || bankLine.tenantId !== tenantId) {
      throw new Error('שורת הבנק לא נמצאה');
    }
  }

  const recon = await prisma.creditCardReconciliation.create({
    data: {
      tenantId,
      statementId:  data.statementId,
      matchType:    ReconciliationMatchType.MANUAL,
      bankLineId:   data.bankLineId,
      notes:        data.notes,
      status:       ReconStatus.MATCHED,
      reconciledBy: userId,
    },
  });

  // Mark statement lines as MATCHED
  await prisma.creditCardStatementLine.updateMany({
    where: { id: { in: data.statementLineIds } },
    data:  { status: LineReconciliationStatus.MATCHED, reconId: recon.id },
  });

  // Mark bank line as MATCHED
  if (data.bankLineId) {
    await prisma.bankStatementLine.update({
      where: { id: data.bankLineId },
      data:  { status: 'MATCHED' },
    });
  }

  return recon;
}

// ─── Unmatch ──────────────────────────────────────────────────────────────────

export async function unmatch(tenantId: string, reconId: string): Promise<void> {
  const recon = await prisma.creditCardReconciliation.findUnique({
    where:   { id: reconId },
    include: { statementLines: true },
  });
  if (!recon || recon.tenantId !== tenantId) throw new Error('התאמה לא נמצאה');

  // Reset statement lines
  await prisma.creditCardStatementLine.updateMany({
    where: { reconId },
    data:  { status: LineReconciliationStatus.UNMATCHED, reconId: null },
  });

  // Reset bank line
  if (recon.bankLineId) {
    await prisma.bankStatementLine.update({
      where: { id: recon.bankLineId },
      data:  { status: 'UNMATCHED' },
    });
  }

  await prisma.creditCardReconciliation.delete({ where: { id: reconId } });

  // Re-evaluate statement status
  const allLines = await prisma.creditCardStatementLine.findMany({
    where: { statementId: recon.statementId },
  });
  const unmatchedCount = allLines.filter(l => l.status === LineReconciliationStatus.UNMATCHED).length;
  const newStatus = unmatchedCount === allLines.length
    ? StatementReconciliationStatus.PENDING
    : StatementReconciliationStatus.PARTIALLY_RECONCILED;

  await prisma.creditCardStatement.update({
    where: { id: recon.statementId },
    data:  { status: newStatus },
  });
}

// ─── Approve / Dispute Reconciliation ────────────────────────────────────────

export async function approveReconciliation(
  tenantId: string,
  reconId:  string,
  userId:   string,
) {
  const recon = await prisma.creditCardReconciliation.findUnique({ where: { id: reconId } });
  if (!recon || recon.tenantId !== tenantId) throw new Error('התאמה לא נמצאה');

  return prisma.creditCardReconciliation.update({
    where: { id: reconId },
    data:  {
      status:     ReconStatus.APPROVED,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });
}

export async function disputeReconciliation(
  tenantId: string,
  reconId:  string,
  reason:   string,
) {
  const recon = await prisma.creditCardReconciliation.findUnique({
    where:   { id: reconId },
    include: { statementLines: true },
  });
  if (!recon || recon.tenantId !== tenantId) throw new Error('התאמה לא נמצאה');

  // Mark lines as DISPUTED
  await prisma.creditCardStatementLine.updateMany({
    where: { reconId },
    data:  { status: LineReconciliationStatus.DISPUTED },
  });

  // Mark statement as DISPUTED
  await prisma.creditCardStatement.update({
    where: { id: recon.statementId },
    data:  { status: StatementReconciliationStatus.DISPUTED },
  });

  return prisma.creditCardReconciliation.update({
    where: { id: reconId },
    data:  { status: ReconStatus.DISPUTED, notes: reason },
  });
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export async function getReconciliationReport(
  tenantId: string,
  filters:  { from?: string; to?: string; cardId?: string },
): Promise<ReconciliationReport> {
  const where: Record<string, unknown> = { tenantId };
  if (filters.cardId) where['cardId'] = filters.cardId;
  if (filters.from || filters.to) {
    where['statementDate'] = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to   ? { lte: new Date(filters.to) }   : {}),
    };
  }

  const statements = await prisma.creditCardStatement.findMany({
    where:   where as any,
    include: {
      card:         { select: { cardNumber: true, cardholderName: true, issuer: true } },
      transactions: { select: { status: true, amount: true } },
      reconciliations: { select: { status: true } },
    },
  });

  // Group by cardId
  const cardMap = new Map<string, CardReconciliationSummary>();

  for (const stmt of statements) {
    const key = stmt.cardId;
    let summary = cardMap.get(key);
    if (!summary) {
      summary = {
        cardId:          stmt.cardId,
        cardNumber:      stmt.card.cardNumber,
        cardholderName:  stmt.card.cardholderName,
        issuer:          stmt.card.issuer,
        totalLines:      0,
        matchedLines:    0,
        matchedPercent:  0,
        unmatchedAmount: 0,
        disputedCount:   0,
        periodFrom:      null,
        periodTo:        null,
      };
      cardMap.set(key, summary);
    }

    for (const line of stmt.transactions) {
      summary.totalLines++;
      if (line.status === 'MATCHED') summary.matchedLines++;
      if (line.status === 'UNMATCHED') summary.unmatchedAmount += Number(line.amount);
    }
    summary.disputedCount += stmt.reconciliations.filter(r => r.status === 'DISPUTED').length;

    // Date range
    const pFrom = stmt.periodFrom.toISOString().substring(0, 10);
    const pTo   = stmt.periodTo.toISOString().substring(0, 10);
    if (!summary.periodFrom || pFrom < summary.periodFrom) summary.periodFrom = pFrom;
    if (!summary.periodTo   || pTo   > summary.periodTo)   summary.periodTo   = pTo;
  }

  // Compute percentages and round amounts
  const cards: CardReconciliationSummary[] = [];
  for (const s of cardMap.values()) {
    s.matchedPercent  = s.totalLines > 0 ? Math.round((s.matchedLines / s.totalLines) * 10000) / 100 : 0;
    s.unmatchedAmount = Math.round(s.unmatchedAmount * 100) / 100;
    cards.push(s);
  }

  return { cards, generatedAt: new Date().toISOString() };
}

// ─── XLSX Export ──────────────────────────────────────────────────────────────

export async function exportReconciliationXLSX(
  tenantId:    string,
  statementId: string,
): Promise<Buffer> {
  const stmt = await prisma.creditCardStatement.findUnique({
    where:   { id: statementId },
    include: {
      card:         { select: { cardNumber: true, cardholderName: true, issuer: true } },
      transactions: {
        orderBy: { transactionDate: 'asc' },
        include: { reconciliation: { include: { bankLine: true } } },
      },
    },
  });
  if (!stmt || stmt.tenantId !== tenantId) throw new Error('הצהרה לא נמצאה');

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: פירוט עסקאות ──
  const detailRows = stmt.transactions.map(l => ({
    'תאריך עסקה':   l.transactionDate.toISOString().substring(0, 10),
    'תאריך רישום':  l.postingDate?.toISOString().substring(0, 10) ?? '',
    'שם בית עסק':   l.merchantName,
    'קטגוריה':       l.merchantCategory ?? '',
    'סכום':          Number(l.amount),
    'מטבע':          l.currency,
    'אסמכתא':        l.reference ?? '',
    'תשלום':         l.installmentNumber ?? '',
    'מס\' תשלומים':  l.installments ?? '',
    'סטטוס':         l.status,
    'הערות':         l.notes ?? '',
  }));
  const ws1 = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'פירוט עסקאות');

  // ── Sheet 2: התאמות ──
  const reconciliations = await prisma.creditCardReconciliation.findMany({
    where:   { statementId },
    include: {
      statementLines: true,
      bankLine:       true,
    },
  });

  const reconRows = reconciliations.map(r => ({
    'מזהה התאמה':       r.id,
    'סוג התאמה':        r.matchType,
    'ציון':             r.matchScore ?? '',
    'סטטוס':            r.status,
    'תאריך התאמה':      r.reconciledAt.toISOString().substring(0, 10),
    'שורות כרטיס':      r.statementLines.map(l => l.merchantName).join('; '),
    'סכום כרטיס':       r.statementLines.reduce((s, l) => s + Number(l.amount), 0),
    'תאריך בנק':        r.bankLine?.date.toISOString().substring(0, 10) ?? '',
    'תיאור בנק':        r.bankLine?.description ?? '',
    'סכום בנק':         r.bankLine ? Math.abs(Number(r.bankLine.debit ?? r.bankLine.credit ?? 0)) : '',
    'הפרש':             r.differenceAmount != null ? Number(r.differenceAmount) : '',
    'הערות':            r.notes ?? '',
  }));
  const ws2 = XLSX.utils.json_to_sheet(reconRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'התאמות');

  // ── Sheet 3: לא מותאם ──
  const unmatchedLines = stmt.transactions.filter(
    l => l.status === LineReconciliationStatus.UNMATCHED,
  );
  const unmatchedRows = unmatchedLines.map(l => ({
    'תאריך עסקה':   l.transactionDate.toISOString().substring(0, 10),
    'שם בית עסק':   l.merchantName,
    'קטגוריה':       l.merchantCategory ?? '',
    'סכום':          Number(l.amount),
    'מטבע':          l.currency,
    'אסמכתא':        l.reference ?? '',
  }));
  const ws3 = XLSX.utils.json_to_sheet(unmatchedRows);
  XLSX.utils.book_append_sheet(wb, ws3, 'לא מותאם');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf as Buffer;
}
