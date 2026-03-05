import { Router, Response } from 'express';
import { authenticate }            from '../../middleware/auth';
import { enforceTenantIsolation }  from '../../middleware/tenant';
import { requireMinRole }          from '../../middleware/rbac';
import { AuthenticatedRequest }    from '../../shared/types';
import { sendSuccess, sendError }  from '../../shared/utils/response';
import { asyncHandler }            from '../../shared/utils/asyncHandler';
import * as CurrencyService        from './currency.service';
import { SetRateSchema }           from './currency.service';

const router = Router();

// ─── Global middleware ────────────────────────────────────────────
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── GET /currency/currencies ─────────────────────────────────────
// List all supported currencies (static — no DB query needed)
router.get('/currencies', (_req, res: Response) => {
  sendSuccess(res, CurrencyService.getSupportedCurrencies());
});

// ─── GET /currency/rates ──────────────────────────────────────────
// List stored exchange rates with optional filters
// Query params: fromCurrency, toCurrency, from (date), to (date)
router.get(
  '/rates',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { fromCurrency, toCurrency, from, to } = req.query;

    const rates = await CurrencyService.listExchangeRates(
      req.user.tenantId,
      {
        fromCurrency: fromCurrency as string | undefined,
        toCurrency:   toCurrency  as string | undefined,
        from:         from        as string | undefined,
        to:           to          as string | undefined,
      }
    );

    sendSuccess(res, rates);
  })
);

// ─── POST /currency/rates ─────────────────────────────────────────
// Set / upsert an exchange rate (ACCOUNTANT+)
router.post(
  '/rates',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = SetRateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    try {
      const record = await CurrencyService.setExchangeRate(
        req.user.tenantId,
        parsed.data
      );
      sendSuccess(res, record, 201);
    } catch (err: any) {
      sendError(res, err.message);
    }
  })
);

// ─── GET /currency/rates/latest ───────────────────────────────────
// Get the most recent rate for every supported currency vs ILS
router.get(
  '/rates/latest',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rates = await CurrencyService.getLatestRatesAll(req.user.tenantId);
    sendSuccess(res, rates);
  })
);

// ─── GET /currency/rates/history ──────────────────────────────────
// Historical rates for charting
// Query params: from (currency code, required), to (currency code, default ILS),
//               days (integer, default 30)
router.get(
  '/rates/history',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from, to, days } = req.query;

    if (!from) {
      sendError(res, 'Query param "from" (currency code) is required');
      return;
    }

    const parsedDays = days ? parseInt(days as string, 10) : 30;
    if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      sendError(res, '"days" must be an integer between 1 and 365');
      return;
    }

    const history = await CurrencyService.getHistoricalRates(
      req.user.tenantId,
      from as string,
      (to as string) || 'ILS',
      parsedDays
    );

    sendSuccess(res, history);
  })
);

// ─── POST /currency/rates/fetch-boi ──────────────────────────────
// Fetch live rates from Bank of Israel API and store them (ACCOUNTANT+)
router.post(
  '/rates/fetch-boi',
  requireMinRole('ACCOUNTANT') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await CurrencyService.fetchBOIRates(req.user.tenantId);

    if (result.error && result.imported === 0) {
      // Return 200 with error detail rather than 5xx — the BOI API being down
      // is not our server's fault; the caller should decide what to do.
      sendSuccess(res, result);
      return;
    }

    sendSuccess(res, result);
  })
);

// ─── GET /currency/convert ────────────────────────────────────────
// Convert an amount between currencies using the latest stored rate
// Query params: amount (number, required), from (currency code, required),
//               to (currency code, default ILS)
router.get(
  '/convert',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { amount, from, to } = req.query;

    if (!amount || !from) {
      sendError(res, 'Query params "amount" and "from" are required');
      return;
    }

    const numericAmount = parseFloat(amount as string);
    if (isNaN(numericAmount) || numericAmount < 0) {
      sendError(res, '"amount" must be a non-negative number');
      return;
    }

    const result = await CurrencyService.convert(
      req.user.tenantId,
      numericAmount,
      from as string,
      (to as string) || 'ILS'
    );

    if (result === null) {
      sendError(
        res,
        `No exchange rate found for ${(from as string).toUpperCase()} → ${((to as string) || 'ILS').toUpperCase()}`,
        404
      );
      return;
    }

    sendSuccess(res, {
      amount:        numericAmount,
      fromCurrency:  (from as string).toUpperCase(),
      toCurrency:    ((to as string) || 'ILS').toUpperCase(),
      converted:     result.converted,
      rate:          result.rate,
      rateDate:      result.rateDate,
    });
  })
);

export default router;
