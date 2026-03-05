import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';

// ─── Zod Schemas ──────────────────────────────────────────────────

export const SetRateSchema = z.object({
  fromCurrency:  z.string().length(3).toUpperCase(),
  toCurrency:    z.string().length(3).toUpperCase().default('ILS'),
  rate:          z.number().positive(),
  effectiveDate: z.string().datetime().optional(),
  source:        z.string().optional(),
});

export type SetRateInput = z.infer<typeof SetRateSchema>;

// ─── Supported Currencies ─────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar',          symbol: '$'  },
  { code: 'EUR', name: 'Euro',               symbol: '€'  },
  { code: 'GBP', name: 'British Pound',      symbol: '£'  },
  { code: 'CHF', name: 'Swiss Franc',        symbol: 'Fr' },
  { code: 'JPY', name: 'Japanese Yen',       symbol: '¥'  },
  { code: 'CAD', name: 'Canadian Dollar',    symbol: 'CA$'},
  { code: 'AUD', name: 'Australian Dollar',  symbol: 'A$' },
];

// ─── BOI currency codes (as they appear in BOI API) ──────────────

const BOI_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF'];

// ─── Filters type ────────────────────────────────────────────────

export interface ListRatesFilters {
  fromCurrency?: string;
  toCurrency?:   string;
  from?:         string;
  to?:           string;
}

// ─── Service Functions ────────────────────────────────────────────

/**
 * List exchange rates for a tenant, ordered by effectiveDate DESC.
 */
export async function listExchangeRates(
  tenantId: string,
  filters: ListRatesFilters = {}
) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.fromCurrency) where.fromCurrency = filters.fromCurrency.toUpperCase();
  if (filters.toCurrency)   where.toCurrency   = filters.toCurrency.toUpperCase();

  if (filters.from || filters.to) {
    const dateFilter: Record<string, Date> = {};
    if (filters.from) dateFilter.gte = new Date(filters.from);
    if (filters.to)   dateFilter.lte = new Date(filters.to);
    where.effectiveDate = dateFilter;
  }

  return prisma.exchangeRate.findMany({
    where,
    orderBy: { effectiveDate: 'desc' },
  });
}

/**
 * Get the most recent exchange rate for a currency pair.
 * Returns null if no rate is found.
 */
export async function getLatestRate(
  tenantId: string,
  fromCurrency: string,
  toCurrency = 'ILS'
): Promise<Prisma.Decimal | null> {
  const record = await prisma.exchangeRate.findFirst({
    where: {
      tenantId,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency:   toCurrency.toUpperCase(),
    },
    orderBy: { effectiveDate: 'desc' },
    select:  { rate: true },
  });

  return record?.rate ?? null;
}

/**
 * Upsert an exchange rate (unique on tenantId + fromCurrency + toCurrency + effectiveDate).
 */
export async function setExchangeRate(tenantId: string, data: SetRateInput) {
  const effectiveDate = data.effectiveDate
    ? new Date(data.effectiveDate)
    : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'); // midnight UTC today

  return prisma.exchangeRate.upsert({
    where: {
      tenantId_fromCurrency_toCurrency_effectiveDate: {
        tenantId,
        fromCurrency:  data.fromCurrency,
        toCurrency:    data.toCurrency,
        effectiveDate,
      },
    },
    update: {
      rate:   new Prisma.Decimal(data.rate),
      source: data.source,
    },
    create: {
      tenantId,
      fromCurrency:  data.fromCurrency,
      toCurrency:    data.toCurrency,
      rate:          new Prisma.Decimal(data.rate),
      effectiveDate,
      source:        data.source,
    },
  });
}

/**
 * Convert an amount from one currency to another using the latest available rate.
 * Returns null if no rate exists.
 */
export async function convert(
  tenantId: string,
  amount: number,
  fromCurrency: string,
  toCurrency = 'ILS'
): Promise<{ converted: number; rate: number; rateDate: string } | null> {
  const from = fromCurrency.toUpperCase();
  const to   = toCurrency.toUpperCase();

  // Identity conversion
  if (from === to) {
    return { converted: amount, rate: 1, rateDate: new Date().toISOString() };
  }

  // Direct rate lookup
  let rateRecord = await prisma.exchangeRate.findFirst({
    where:   { tenantId, fromCurrency: from, toCurrency: to },
    orderBy: { effectiveDate: 'desc' },
  });

  // Inverse rate lookup (if we have TO→FROM, we can invert)
  if (!rateRecord) {
    const inverseRecord = await prisma.exchangeRate.findFirst({
      where:   { tenantId, fromCurrency: to, toCurrency: from },
      orderBy: { effectiveDate: 'desc' },
    });
    if (inverseRecord) {
      const inverseRate = Number(inverseRecord.rate);
      if (inverseRate === 0) return null;
      const computedRate = 1 / inverseRate;
      return {
        converted: Math.round(amount * computedRate * 10000) / 10000,
        rate:      Math.round(computedRate * 10000) / 10000,
        rateDate:  inverseRecord.effectiveDate.toISOString(),
      };
    }
    return null;
  }

  const rate = Number(rateRecord.rate);
  return {
    converted: Math.round(amount * rate * 10000) / 10000,
    rate,
    rateDate: rateRecord.effectiveDate.toISOString(),
  };
}

/**
 * Return daily exchange rates for the last N days for charting.
 */
export async function getHistoricalRates(
  tenantId: string,
  fromCurrency: string,
  toCurrency: string,
  days = 30
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.exchangeRate.findMany({
    where: {
      tenantId,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency:   toCurrency.toUpperCase(),
      effectiveDate: { gte: since },
    },
    orderBy: { effectiveDate: 'asc' },
    select:  { effectiveDate: true, rate: true, source: true },
  });
}

/**
 * Fetch live rates from the Bank of Israel public API and store them.
 * Handles network/parse errors gracefully — never throws.
 */
export async function fetchBOIRates(
  tenantId: string
): Promise<{ imported: number; rates?: Record<string, number>; error?: string }> {
  const BOI_URL = 'https://boi.org.il/PublicApi/GetExchangeRates';

  let json: unknown;
  try {
    const response = await fetch(BOI_URL, {
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { imported: 0, error: `BOI API returned HTTP ${response.status}` };
    }

    json = await response.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { imported: 0, error: `BOI API unavailable: ${msg}` };
  }

  // Parse BOI JSON response.
  // The BOI API returns an array of objects with a "key" (currency code) and "currentExchangeRate".
  // Example: [{ "key": "USD", "currentExchangeRate": 3.72 }, ...]
  // We also handle the simpler flat-object format { USD: 3.72, EUR: 4.01, ... } as a fallback.
  let rates: Record<string, number> = {};

  try {
    if (Array.isArray(json)) {
      // Array format: [{ key: "USD", currentExchangeRate: 3.72 }, ...]
      for (const item of json as Array<Record<string, unknown>>) {
        const code = String(item.key ?? item.currencyCode ?? '').toUpperCase();
        const val  =
          Number(item.currentExchangeRate ?? item.rate ?? item.value ?? NaN);
        if (BOI_CURRENCIES.includes(code) && !isNaN(val) && val > 0) {
          rates[code] = val;
        }
      }
    } else if (typeof json === 'object' && json !== null) {
      // Flat object format: { USD: 3.72, EUR: 4.01 }
      for (const code of BOI_CURRENCIES) {
        const val = Number((json as Record<string, unknown>)[code]);
        if (!isNaN(val) && val > 0) {
          rates[code] = val;
        }
      }
    }
  } catch {
    return { imported: 0, error: 'Failed to parse BOI API response' };
  }

  if (Object.keys(rates).length === 0) {
    return { imported: 0, error: 'No recognized currency data in BOI response' };
  }

  // Upsert rates into the database
  const todayMidnight = new Date(
    new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  );
  let imported = 0;

  for (const [code, rate] of Object.entries(rates)) {
    try {
      await prisma.exchangeRate.upsert({
        where: {
          tenantId_fromCurrency_toCurrency_effectiveDate: {
            tenantId,
            fromCurrency:  code,
            toCurrency:    'ILS',
            effectiveDate: todayMidnight,
          },
        },
        update: { rate: new Prisma.Decimal(rate), source: 'BOI' },
        create: {
          tenantId,
          fromCurrency:  code,
          toCurrency:    'ILS',
          rate:          new Prisma.Decimal(rate),
          effectiveDate: todayMidnight,
          source:        'BOI',
        },
      });
      imported++;
    } catch {
      // Skip individual currency failures — continue with the rest
    }
  }

  return { imported, rates };
}

/**
 * Return the static list of supported currencies.
 */
export function getSupportedCurrencies() {
  return SUPPORTED_CURRENCIES;
}

/**
 * Get the latest rate for every supported currency vs ILS.
 * Returns an array with one entry per currency that has at least one stored rate.
 */
export async function getLatestRatesAll(tenantId: string) {
  // Fetch the single most-recent record per fromCurrency vs ILS
  const results = await Promise.all(
    SUPPORTED_CURRENCIES.map(async (cur) => {
      const record = await prisma.exchangeRate.findFirst({
        where: {
          tenantId,
          fromCurrency: cur.code,
          toCurrency:   'ILS',
        },
        orderBy: { effectiveDate: 'desc' },
      });
      if (!record) return null;
      return {
        fromCurrency:  cur.code,
        toCurrency:    'ILS',
        rate:          record.rate,
        effectiveDate: record.effectiveDate,
        source:        record.source,
      };
    })
  );

  return results.filter(Boolean);
}
