import { prisma } from '../../config/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Store only the last 4 digits with a mask prefix for PCI compliance */
function maskCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const last4  = digits.slice(-4);
  return `****${last4}`;
}

/** Parse an Israeli date string DD/MM/YYYY or ISO YYYY-MM-DD */
function parseIsraeliDate(raw: string): Date | null {
  const cleaned = raw.trim();

  // DD/MM/YYYY or D/M/YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const dt  = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // YYYY-MM-DD
  const isoMatch = cleaned.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const dt = new Date(cleaned.substring(0, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

/**
 * Parse raw CSV text into row arrays.
 * Handles UTF-8 BOM, Windows line endings, and double-quoted fields.
 * Uses simple split — no external packages.
 */
function parseCsvRows(csvContent: string): string[][] {
  // Strip UTF-8 BOM if present
  const content = csvContent.replace(/^\uFEFF/, '').trim();
  const lines   = content.split(/\r?\n/).filter(l => l.trim().length > 0);

  return lines.map(line => {
    const cols: string[] = [];
    let current          = '';
    let inQuotes         = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === ',' || ch === ';') && !inQuotes) {
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

// ─── Card Management ──────────────────────────────────────────────────────────

export async function listCards(tenantId: string) {
  return prisma.corporateCreditCard.findMany({
    where:   { tenantId },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCard(
  tenantId: string,
  data: {
    cardNumber:     string;   // store only last 4 digits
    cardholderName: string;
    employeeId?:    string;
    cardType:       string;   // VISA | MASTERCARD | AMEX
    issuer:         string;   // "לאומי קארד" | "Cal" | "ישראכרט"
    creditLimit?:   number;
    glAccountId?:   string;
  }
) {
  // Never persist the full card number — PCI DSS compliance
  const safeCardNumber = maskCardNumber(data.cardNumber);

  return prisma.corporateCreditCard.create({
    data: {
      tenantId,
      cardNumber:     safeCardNumber,
      cardholderName: data.cardholderName,
      employeeId:     data.employeeId,
      cardType:       data.cardType,
      issuer:         data.issuer,
      creditLimit:    data.creditLimit,
      glAccountId:    data.glAccountId,
      isActive:       true,
    },
  });
}

export async function getCard(id: string, tenantId: string) {
  const card = await prisma.corporateCreditCard.findUnique({
    where:   { id },
    include: {
      transactions: {
        orderBy: { date: 'desc' },
        take:    20,
      },
    },
  });

  if (!card || card.tenantId !== tenantId) return null;
  return card;
}

// ─── Import Transactions from CSV ────────────────────────────────────────────

/**
 * Import credit card transactions from a CSV statement file.
 * Supports common Israeli CC formats: Cal, Leumi Card (ויזה לאומי), Isracard.
 * Common header: "תאריך,שם בית עסק,סכום עסקה,מטבע עסקה"
 * Date format: DD/MM/YYYY. Amounts may use comma as decimal separator.
 * Duplicate detection: matches on (tenantId, cardId, date, amount, description).
 */
export async function importCreditCardCSV(
  tenantId:   string,
  cardId:     string,
  csvContent: string
): Promise<{ imported: number; duplicates: number }> {
  const card = await prisma.corporateCreditCard.findUnique({ where: { id: cardId } });
  if (!card || card.tenantId !== tenantId) {
    throw new Error('כרטיס אשראי לא נמצא');
  }

  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) {
    return { imported: 0, duplicates: 0 };
  }

  const headers  = rows[0].map(h => h.toLowerCase().trim());
  const dataRows = rows.slice(1);

  // Resolve column indices from header
  const dateIdx = headers.findIndex(h =>
    h.includes('תאריך') || h.includes('date'));
  const descIdx = headers.findIndex(h =>
    h.includes('בית עסק') || h.includes('merchant') ||
    h.includes('תיאור')   || h.includes('description') ||
    h.includes('שם'));
  const amountIdx = (() => {
    // Prefer "סכום חיוב" (billing amount) for Leumi, then generic "סכום"
    const billingIdx = headers.findIndex(h =>
      h.includes('סכום חיוב') || h.includes('billing'));
    if (billingIdx >= 0) return billingIdx;
    return headers.findIndex(h =>
      h.includes('סכום') || h.includes('amount') || h.includes('charge'));
  })();
  const currencyIdx = headers.findIndex(h =>
    h.includes('מטבע') || h.includes('currency'));
  const categoryIdx = headers.findIndex(h =>
    h.includes('קטגוריה') || h.includes('category'));

  // Fallback column positions when headers are missing / unrecognised
  const effectiveDateIdx   = dateIdx   >= 0 ? dateIdx   : 0;
  const effectiveDescIdx   = descIdx   >= 0 ? descIdx   : 1;
  const effectiveAmountIdx = amountIdx >= 0 ? amountIdx : 2;

  interface ParsedRow {
    date:        Date;
    description: string;
    amount:      number;
    currency:    string;
    category?:   string;
  }

  const toCreate: ParsedRow[] = [];

  for (const row of dataRows) {
    if (!row[effectiveDateIdx]) continue;

    const parsedDate = parseIsraeliDate(row[effectiveDateIdx]);
    if (!parsedDate) continue;

    const rawAmount = (row[effectiveAmountIdx] ?? '')
      // Remove currency symbols, spaces, and thousands separators
      .replace(/[₪\s]/g, '')
      // Israeli CSVs sometimes use comma as decimal: "100,50" → "100.50"
      .replace(/^(\d+),(\d{2})$/, '$1.$2')
      // Strip remaining non-numeric except dot and leading minus
      .replace(/[^\d.-]/g, '');

    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    toCreate.push({
      date:        parsedDate,
      description: row[effectiveDescIdx] ?? '',
      amount:      Math.abs(amount),      // always store as positive
      currency:    currencyIdx >= 0 && row[currencyIdx]
        ? row[currencyIdx].trim()
        : 'ILS',
      category:    categoryIdx >= 0 && row[categoryIdx]
        ? row[categoryIdx].trim() || undefined
        : undefined,
    });
  }

  if (toCreate.length === 0) {
    return { imported: 0, duplicates: 0 };
  }

  // Fetch existing transactions to detect duplicates in-process
  const existing = await prisma.creditCardTransaction.findMany({
    where:  { tenantId, cardId },
    select: { date: true, amount: true, description: true },
  });

  const existingKeys = new Set(
    existing.map(e =>
      `${e.date.toISOString().substring(0, 10)}|${Number(e.amount).toFixed(2)}|${e.description}`
    )
  );

  let imported   = 0;
  let duplicates = 0;

  for (const row of toCreate) {
    const key = `${row.date.toISOString().substring(0, 10)}|${row.amount.toFixed(2)}|${row.description}`;
    if (existingKeys.has(key)) {
      duplicates++;
      continue;
    }

    await prisma.creditCardTransaction.create({
      data: {
        tenantId,
        cardId,
        date:        row.date,
        description: row.description,
        amount:      row.amount,
        currency:    row.currency,
        category:    row.category,
        status:      'PENDING',
      },
    });

    // Add to the in-memory set so subsequent duplicates in the same batch are caught
    existingKeys.add(key);
    imported++;
  }

  return { imported, duplicates };
}

// ─── List Transactions ───────────────────────────────────────────────────────

export async function listTransactions(
  tenantId: string,
  cardId:   string,
  filters: {
    status?: string;
    from?:   string;
    to?:     string;
    page?:   number;
    limit?:  number;
  }
) {
  const page  = filters.page  ?? 1;
  const limit = filters.limit ?? 25;
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = { tenantId, cardId };

  if (filters.status) {
    where['status'] = filters.status;
  }

  if (filters.from || filters.to) {
    where['date'] = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.creditCardTransaction.findMany({
      where:   where as any,
      orderBy: { date: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.creditCardTransaction.count({ where: where as any }),
  ]);

  return { items, total, page, limit };
}

// ─── Categorize Transaction ───────────────────────────────────────────────────

export async function categorizeTransaction(
  id:       string,
  tenantId: string,
  category: string
) {
  const tx = await prisma.creditCardTransaction.findUnique({ where: { id } });
  if (!tx || tx.tenantId !== tenantId) return null;

  return prisma.creditCardTransaction.update({
    where: { id },
    data:  { category },
  });
}

// ─── Match Transaction to an Expense Report ──────────────────────────────────

export async function matchToExpense(
  id:        string,
  tenantId:  string,
  expenseId: string
) {
  const tx = await prisma.creditCardTransaction.findUnique({ where: { id } });
  if (!tx || tx.tenantId !== tenantId) return null;

  return prisma.creditCardTransaction.update({
    where: { id },
    data: {
      expenseId,
      status: 'MATCHED',
    },
  });
}

// ─── Monthly Summary ─────────────────────────────────────────────────────────

/**
 * Returns a monthly spending summary for a card.
 * @param month  Format: "2026-03"
 */
export async function getCardSummary(
  tenantId: string,
  cardId:   string,
  month:    string
) {
  const card = await prisma.corporateCreditCard.findUnique({ where: { id: cardId } });
  if (!card || card.tenantId !== tenantId) return null;

  const parts = month.split('-');
  const year  = parseInt(parts[0], 10);
  const mon   = parseInt(parts[1], 10);

  const from = new Date(year, mon - 1, 1);
  const to   = new Date(year, mon, 0, 23, 59, 59, 999);

  const transactions = await prisma.creditCardTransaction.findMany({
    where:   { tenantId, cardId, date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  });

  const totalSpent = transactions.reduce(
    (sum, tx) => sum + Number(tx.amount), 0
  );

  // Breakdown by category
  const byCategory: Record<string, number> = {};
  for (const tx of transactions) {
    const cat = tx.category ?? 'לא מסווג';
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(tx.amount);
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key] = Math.round(byCategory[key] * 100) / 100;
  }

  // Breakdown by status
  const byStatus: Record<string, number> = {};
  for (const tx of transactions) {
    byStatus[tx.status] = (byStatus[tx.status] ?? 0) + Number(tx.amount);
  }
  for (const key of Object.keys(byStatus)) {
    byStatus[key] = Math.round(byStatus[key] * 100) / 100;
  }

  return {
    card: {
      id:             card.id,
      cardNumber:     card.cardNumber,
      cardholderName: card.cardholderName,
      cardType:       card.cardType,
      issuer:         card.issuer,
      creditLimit:    card.creditLimit !== null ? Number(card.creditLimit) : null,
      isActive:       card.isActive,
    },
    period:           month,
    totalSpent:       Math.round(totalSpent * 100) / 100,
    transactionCount: transactions.length,
    byCategory,
    byStatus,
  };
}
