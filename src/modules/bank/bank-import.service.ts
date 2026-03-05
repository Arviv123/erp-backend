import { prisma } from '../../config/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BankFormat = 'LEUMI' | 'HAPOALIM' | 'DISCOUNT' | 'AUTO';

export interface ParsedTransaction {
  date:        Date;
  valueDate?:  Date;
  description: string;
  reference?:  string;
  debit?:      number;
  credit?:     number;
  balance?:    number;
}

// ─── Bank Account Management ──────────────────────────────────────────────────

export async function listBankAccounts(tenantId: string) {
  return prisma.bankAccount.findMany({
    where:   { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createBankAccount(
  tenantId: string,
  data: {
    bankName:      string;
    accountNumber: string;
    branchNumber?: string;
    accountName?:  string;
    currency?:     string;
    glAccountId?:  string;
  }
) {
  return prisma.bankAccount.create({
    data: {
      tenantId,
      bankName:      data.bankName,
      accountNumber: data.accountNumber,
      branchNumber:  data.branchNumber,
      accountName:   data.accountName,
      currency:      data.currency ?? 'ILS',
      glAccountId:   data.glAccountId,
    },
  });
}

export async function updateBankAccount(
  id:       string,
  tenantId: string,
  data: {
    bankName?:      string;
    accountNumber?: string;
    branchNumber?:  string;
    accountName?:   string;
    currency?:      string;
    glAccountId?:   string;
    isActive?:      boolean;
  }
) {
  const existing = await prisma.bankAccount.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) return null;

  return prisma.bankAccount.update({ where: { id }, data });
}

// Keep backward-compat export used by old routes
export async function deleteBankAccount(id: string, tenantId: string) {
  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account || account.tenantId !== tenantId) throw new Error('Bank account not found');
  return prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
}

// ─── CSV Low-level Helpers ────────────────────────────────────────────────────

/** Strip UTF-8 BOM and split into non-empty trimmed lines */
function csvLines(content: string): string[] {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

/** Split one CSV line, respecting double-quoted fields */
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped double-quote ("") inside quoted field
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse Israeli date strings.
 * Supports: DD/MM/YYYY, DD.MM.YYYY, DD/MM/YY, YYYY-MM-DD
 * Two-digit years: 00-49 → 2000-2049, 50-99 → 1950-1999
 */
function parseIsraeliDate(str: string): Date | null {
  if (!str) return null;
  const s = str.trim();

  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (dmy) {
    const dt = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // DD/MM/YY
  const dmyShort = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2})$/);
  if (dmyShort) {
    const yy       = Number(dmyShort[3]);
    const fullYear = yy >= 50 ? 1900 + yy : 2000 + yy;
    const dt       = new Date(fullYear, Number(dmyShort[2]) - 1, Number(dmyShort[1]));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // YYYY-MM-DD (ISO)
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const dt = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Native fallback
  const native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

/**
 * Parse a numeric amount string.
 * Removes commas/whitespace, handles parentheses negatives.
 * Always returns an absolute (positive) value; the debit/credit column determines sign.
 */
function parseAmount(raw: string): number | undefined {
  if (!raw || raw.trim() === '' || raw.trim() === '-') return undefined;
  let s        = raw.trim().replace(/,/g, '').replace(/\s/g, '');
  const negPar = s.startsWith('(') && s.endsWith(')');
  if (negPar) s = '-' + s.slice(1, -1);
  const n = parseFloat(s);
  return isNaN(n) ? undefined : Math.abs(n);
}

// ─── Bank-specific CSV Parsers ────────────────────────────────────────────────

/**
 * Leumi (לאומי)
 * Header (English or Hebrew): Date | Value Date | Description | Reference | Debit | Credit | Balance
 * Date format: DD/MM/YYYY
 */
function parseLeumiCSV(lines: string[]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  let start = 1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (l.includes('date') || l.includes('תאריך')) { start = i + 1; break; }
  }
  for (let i = start; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 5) continue;
    const date = parseIsraeliDate(cols[0]);
    if (!date) continue;
    results.push({
      date,
      valueDate:   parseIsraeliDate(cols[1]) ?? undefined,
      description: cols[2] || '',
      reference:   cols[3] || undefined,
      debit:       parseAmount(cols[4]),
      credit:      parseAmount(cols[5]),
      balance:     parseAmount(cols[6]),
    });
  }
  return results;
}

/**
 * Hapoalim (הפועלים)
 * Header: תאריך | תאריך ערך | פרטים | אסמכתא | חובה | זכות | יתרה
 * Date format: DD/MM/YY
 */
function parseHapoalimCSV(lines: string[]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  let start = 1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (
      l.includes('אסמכתא') || l.includes('income') || l.includes('הכנסה') ||
      l.includes('תאריך') || l.includes('date')
    ) { start = i + 1; break; }
  }
  for (let i = start; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 5) continue;
    const date = parseIsraeliDate(cols[0]);
    if (!date) continue;
    results.push({
      date,
      valueDate:   parseIsraeliDate(cols[1]) ?? undefined,
      description: cols[2] || '',
      reference:   cols[3] || undefined,
      debit:       parseAmount(cols[4]),
      credit:      parseAmount(cols[5]),
      balance:     parseAmount(cols[6]),
    });
  }
  return results;
}

/**
 * Discount (דיסקונט)
 * Header: תאריך פעולה | תאריך ערך | תיאור | מספר מסמך | חובה | זכות | יתרה
 * Date format: DD/MM/YYYY
 * Also handles 6-column variant (no value-date column).
 */
function parseDiscountCSV(lines: string[]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (l.includes('תאריך') || l.includes('date')) { headerIdx = i; break; }
  }
  const headerCols  = splitCSVLine(lines[headerIdx]);
  const hasValueDate = headerCols.length >= 7 ||
    headerCols.some(h => h.includes('ערך') || h.toLowerCase().includes('value'));

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 4) continue;
    const date = parseIsraeliDate(cols[0]);
    if (!date) continue;

    if (hasValueDate) {
      results.push({
        date,
        valueDate:   parseIsraeliDate(cols[1]) ?? undefined,
        description: cols[2] || '',
        reference:   cols[3] || undefined,
        debit:       parseAmount(cols[4]),
        credit:      parseAmount(cols[5]),
        balance:     parseAmount(cols[6]),
      });
    } else {
      results.push({
        date,
        description: cols[1] || '',
        reference:   cols[2] || undefined,
        debit:       parseAmount(cols[3]),
        credit:      parseAmount(cols[4]),
        balance:     parseAmount(cols[5]),
      });
    }
  }
  return results;
}

/**
 * Generic / Auto parser — detects column positions from header keywords.
 */
function parseGenericCSV(lines: string[]): ParsedTransaction[] {
  if (lines.length < 2) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const l = lines[i].toLowerCase();
    if (
      l.includes('date') || l.includes('תאריך') ||
      l.includes('description') || l.includes('פרטים') || l.includes('תיאור') ||
      l.includes('debit') || l.includes('חובה')
    ) { headerIdx = i; break; }
  }

  const headers = splitCSVLine(lines[headerIdx]).map(h => h.toLowerCase().replace(/\s+/g, ' ').trim());
  const findCol = (...kws: string[]) => headers.findIndex(h => kws.some(k => h.includes(k)));

  const idxDate      = findCol('date', 'תאריך');
  const idxValueDate = findCol('value date', 'value', 'תאריך ערך', 'ערך');
  const idxDesc      = findCol('description', 'פרטים', 'תיאור', 'details');
  const idxRef       = findCol('reference', 'אסמכתא', 'מספר מסמך', 'ref');
  const idxDebit     = findCol('debit', 'חובה', 'expense', 'הוצאה');
  const idxCredit    = findCol('credit', 'זכות', 'income', 'הכנסה');
  const idxBalance   = findCol('balance', 'יתרה');

  const results: ParsedTransaction[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 2) continue;
    const dateStr = idxDate >= 0 ? cols[idxDate] : cols[0];
    const date    = parseIsraeliDate(dateStr);
    if (!date) continue;

    results.push({
      date,
      valueDate:   idxValueDate >= 0 ? (parseIsraeliDate(cols[idxValueDate]) ?? undefined) : undefined,
      description: idxDesc >= 0      ? (cols[idxDesc] || '') : (cols[1] || ''),
      reference:   idxRef >= 0       ? (cols[idxRef] || undefined) : undefined,
      debit:       idxDebit  >= 0    ? parseAmount(cols[idxDebit])  : undefined,
      credit:      idxCredit >= 0    ? parseAmount(cols[idxCredit]) : undefined,
      balance:     idxBalance >= 0   ? parseAmount(cols[idxBalance]) : undefined,
    });
  }
  return results;
}

// ─── Format Detection ─────────────────────────────────────────────────────────

/**
 * Inspects the first ~500 characters of CSV content to identify the exporting bank.
 */
export function detectBankFormat(csvContent: string): BankFormat {
  const sample = csvContent.replace(/^\uFEFF/, '').slice(0, 600).toLowerCase();

  // Leumi exports use English headers even for Hebrew accounts
  if (
    sample.includes('value date') ||
    (sample.includes('leumi') || sample.includes('לאומי')) ||
    (sample.includes('date') && sample.includes('debit') && sample.includes('credit') &&
     !sample.includes('אסמכתא') && !sample.includes('מספר מסמך'))
  ) return 'LEUMI';

  // Hapoalim is identified by "אסמכתא" (reference column name)
  if (sample.includes('אסמכתא') || sample.includes('hapoalim') || sample.includes('הפועלים'))
    return 'HAPOALIM';

  // Discount uses "מספר מסמך" or "תאריך פעולה"
  if (sample.includes('מספר מסמך') || sample.includes('תאריך פעולה') ||
      sample.includes('discount') || sample.includes('דיסקונט'))
    return 'DISCOUNT';

  // Column-count heuristic on the first data-bearing line
  const firstLine = csvContent.split(/\r?\n/).find(l => l.trim() && !l.startsWith('#'));
  if (firstLine) {
    const colCount = splitCSVLine(firstLine).length;
    if (colCount >= 7) return 'LEUMI';
    if (colCount === 6) return 'HAPOALIM';
  }

  return 'AUTO';
}

// ─── Main CSV Parser Dispatcher ───────────────────────────────────────────────

export function parseBankCSV(csvContent: string, format?: BankFormat): ParsedTransaction[] {
  const lines = csvLines(csvContent);
  const fmt   = format && format !== 'AUTO' ? format : detectBankFormat(csvContent);

  switch (fmt) {
    case 'LEUMI':    return parseLeumiCSV(lines);
    case 'HAPOALIM': return parseHapoalimCSV(lines);
    case 'DISCOUNT': return parseDiscountCSV(lines);
    default:         return parseGenericCSV(lines);
  }
}

/**
 * Legacy helper kept for backward compat with old routes.
 * Accepts an optional bankName hint and delegates to parseBankCSV.
 */
export function detectAndParseCSV(csvContent: string, bankName?: string): ParsedTransaction[] {
  if (bankName) {
    const n = bankName.toLowerCase();
    if (n.includes('leumi') || n.includes('לאומי'))
      return parseBankCSV(csvContent, 'LEUMI');
    if (n.includes('hapoalim') || n.includes('הפועלים') || n.includes('poalim'))
      return parseBankCSV(csvContent, 'HAPOALIM');
    if (n.includes('discount') || n.includes('דיסקונט'))
      return parseBankCSV(csvContent, 'DISCOUNT');
  }
  return parseBankCSV(csvContent);
}

// ─── Import Bank Statement ────────────────────────────────────────────────────

export async function importBankStatement(
  tenantId:      string,
  bankAccountId: string,
  csvContent:    string,
  format?:       BankFormat
): Promise<{ imported: number; duplicates: number; errors: number }> {
  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!bankAccount || bankAccount.tenantId !== tenantId)
    throw new Error('Bank account not found');

  let parsed: ParsedTransaction[];
  try {
    parsed = parseBankCSV(csvContent, format);
  } catch {
    throw new Error('Failed to parse CSV');
  }

  let imported   = 0;
  let duplicates = 0;
  let errors     = 0;

  for (const tx of parsed) {
    try {
      const existing = await prisma.bankStatementLine.findFirst({
        where: {
          tenantId,
          bankAccountId,
          date:        tx.date,
          description: tx.description,
          debit:       tx.debit  != null ? tx.debit  : null,
          credit:      tx.credit != null ? tx.credit : null,
        },
      });

      if (existing) { duplicates++; continue; }

      await prisma.bankStatementLine.create({
        data: {
          tenantId,
          bankAccountId,
          date:        tx.date,
          valueDate:   tx.valueDate ?? null,
          description: tx.description,
          reference:   tx.reference ?? null,
          debit:       tx.debit  != null ? tx.debit  : null,
          credit:      tx.credit != null ? tx.credit : null,
          balance:     tx.balance != null ? tx.balance : null,
          status:      'UNMATCHED',
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }

  return { imported, duplicates, errors };
}

// ─── Auto-match Statement Lines to GL Transactions ───────────────────────────

export async function autoMatchStatements(
  tenantId:      string,
  bankAccountId: string
): Promise<{ matched: number; unmatched: number }> {
  const TOLERANCE_DAYS   = 3;
  const AMOUNT_TOLERANCE = 0.01;

  const unmatchedLines = await prisma.bankStatementLine.findMany({
    where: { tenantId, bankAccountId, status: 'UNMATCHED' },
  });

  let matched = 0;

  for (const line of unmatchedLines) {
    const lineAmount = Number(line.credit ?? line.debit ?? 0);
    if (lineAmount === 0) continue;

    const dateFrom = new Date(line.date);
    dateFrom.setDate(dateFrom.getDate() - TOLERANCE_DAYS);
    const dateTo = new Date(line.date);
    dateTo.setDate(dateTo.getDate() + TOLERANCE_DAYS);

    // Build set of already-matched transaction IDs to exclude
    const alreadyMatchedIds = (
      await prisma.bankStatementLine.findMany({
        where:  { tenantId, matchedTxId: { not: null } },
        select: { matchedTxId: true },
      })
    ).map(l => l.matchedTxId!);

    let candidates = await prisma.transaction.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status:    'POSTED',
        date:      { gte: dateFrom, lte: dateTo },
        totalAmount: {
          gte: lineAmount - AMOUNT_TOLERANCE,
          lte: lineAmount + AMOUNT_TOLERANCE,
        },
        ...(alreadyMatchedIds.length > 0 ? { id: { notIn: alreadyMatchedIds } } : {}),
      },
    });

    // Narrow by reference if multiple amount-matches
    if (candidates.length > 1 && line.reference) {
      const refined = candidates.filter(tx =>
        tx.reference && tx.reference.includes(line.reference!)
      );
      if (refined.length > 0) candidates = refined;
    } else if (candidates.length === 0 && line.reference) {
      // Fallback: try reference-only match in same date window
      const refCandidates = await prisma.transaction.findMany({
        where: {
          tenantId,
          deletedAt: null,
          date:      { gte: dateFrom, lte: dateTo },
          reference: { contains: line.reference },
          ...(alreadyMatchedIds.length > 0 ? { id: { notIn: alreadyMatchedIds } } : {}),
        },
      });
      candidates = refCandidates;
    }

    // Match only if unambiguous (exactly one candidate)
    if (candidates.length === 1) {
      await prisma.bankStatementLine.update({
        where: { id: line.id },
        data:  { status: 'MATCHED', matchedTxId: candidates[0].id },
      });
      matched++;
    }
  }

  const unmatched = unmatchedLines.length - matched;
  return { matched, unmatched };
}

/** Alias kept for backward compatibility with old routes */
export const autoMatchStatementLines = autoMatchStatements;

// ─── Statement Line Queries ───────────────────────────────────────────────────

export async function getBankStatementLines(
  tenantId:      string,
  bankAccountId: string,
  filters: {
    status?: string;
    from?:   string;
    to?:     string;
    page?:   number;
    limit?:  number;
  }
) {
  const page  = Math.max(1, filters.page  ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = {
    tenantId,
    bankAccountId,
    ...(filters.status ? { status: filters.status } : {}),
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
    prisma.bankStatementLine.findMany({
      where:   where as any,
      orderBy: { date: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.bankStatementLine.count({ where: where as any }),
  ]);

  return { items, total, page, limit };
}

// ─── Reconciliation Summary ───────────────────────────────────────────────────

export async function getReconciliationSummary(
  tenantId:      string,
  bankAccountId: string
) {
  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!bankAccount || bankAccount.tenantId !== tenantId) return null;

  const [total, matched, reconciled, ignored, aggregate] = await Promise.all([
    prisma.bankStatementLine.count({ where: { tenantId, bankAccountId } }),
    prisma.bankStatementLine.count({ where: { tenantId, bankAccountId, status: 'MATCHED'    } }),
    prisma.bankStatementLine.count({ where: { tenantId, bankAccountId, status: 'RECONCILED' } }),
    prisma.bankStatementLine.count({ where: { tenantId, bankAccountId, status: 'IGNORED'    } }),
    prisma.bankStatementLine.aggregate({
      where: { tenantId, bankAccountId },
      _min:  { date: true },
      _max:  { date: true },
      _sum:  { debit: true, credit: true },
    }),
  ]);

  const unmatched = total - matched - reconciled - ignored;

  const unmatchedLines = await prisma.bankStatementLine.findMany({
    where:  { tenantId, bankAccountId, status: 'UNMATCHED' },
    select: { debit: true, credit: true },
  });

  const unmatchedAmount = unmatchedLines.reduce((sum, l) => {
    const net = (l.credit != null ? Number(l.credit) : 0) -
                (l.debit  != null ? Number(l.debit)  : 0);
    return sum + net;
  }, 0);

  return {
    bankAccountId,
    bankName:           bankAccount.bankName,
    accountNumber:      bankAccount.accountNumber,
    total,
    matched,
    reconciled,
    ignored,
    unmatched,
    unmatchedAmount:    Math.round(unmatchedAmount * 100) / 100,
    matchedPercentage:  total > 0 ? Math.round(((matched + reconciled) / total) * 1000) / 10 : 0,
    dateFrom:           aggregate._min.date,
    dateTo:             aggregate._max.date,
    totalDebits:        Number(aggregate._sum.debit  ?? 0),
    totalCredits:       Number(aggregate._sum.credit ?? 0),
  };
}

/** Alias kept for backward compat with old routes */
export const getStatementSummary = getReconciliationSummary;

// ─── Unmatched Lines (kept for backward compat) ───────────────────────────────

export async function getUnmatchedLines(tenantId: string, bankAccountId: string) {
  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!bankAccount || bankAccount.tenantId !== tenantId) throw new Error('Bank account not found');

  return prisma.bankStatementLine.findMany({
    where:   { tenantId, bankAccountId, status: 'UNMATCHED' },
    orderBy: { date: 'asc' },
  });
}
