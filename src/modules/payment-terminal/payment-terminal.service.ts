/**
 * Payment Terminal Service (מסופני אשראי)
 * Israeli payment processing providers: Pele Card, CardCom, Tranzila, PayPlus, Meshulam
 */

import { CardTxStatus, TerminalProvider } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateTerminalDto {
  name:        string;
  terminalId:  string;
  provider:    TerminalProvider;
  apiUrl?:     string;
  apiKey?:     string;
  apiSecret?:  string;
  merchantId?: string;
  currency?:   string;
  branchId?:   string;
}

export interface UpdateTerminalDto {
  name?:       string;
  terminalId?: string;
  provider?:   TerminalProvider;
  apiUrl?:     string | null;
  apiKey?:     string | null;
  apiSecret?:  string | null;
  merchantId?: string | null;
  currency?:   string;
  branchId?:   string | null;
  isActive?:   boolean;
}

export interface ChargeDto {
  terminalId:    string;
  amount:        number;
  currency?:     string;
  installments?: number;
  customerId?:   string;
  invoiceId?:    string;
  description?:  string;
  cardToken?:    string;
}

export interface PaymentLinkDto {
  terminalId:  string;
  amount:      number;
  currency?:   string;
  description?: string;
  customerId?:  string;
  invoiceId?:   string;
  customerName?:  string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface TransactionFilters {
  terminalId?:  string;
  customerId?:  string;
  status?:      CardTxStatus;
  from?:        Date;
  to?:          Date;
  minAmount?:   number;
  maxAmount?:   number;
  page?:        number;
  pageSize?:    number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page:  number;
  pageSize: number;
}

// ─── Provider API Helpers ─────────────────────────────────────────────────────

/** Check that a required env var is set; throw if missing */
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Terminal provider not configured. Set environment variables. Missing: ${key}`);
  }
  return val;
}

/** Generic HTTP POST helper using Node's built-in fetch (Node 18+) */
async function httpPost(
  url: string,
  body: Record<string, unknown> | string,
  headers: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; text: string; json: () => unknown }> {
  const isString = typeof body === 'string';
  const defaultHeaders: Record<string, string> = isString
    ? { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }
    : { 'Content-Type': 'application/json', ...headers };

  const res = await fetch(url, {
    method:  'POST',
    headers: defaultHeaders,
    body:    isString ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    ok:     res.ok,
    status: res.status,
    text,
    json: () => {
      try { return JSON.parse(text); } catch { return null; }
    },
  };
}

/** Encode object to application/x-www-form-urlencoded */
function toFormData(obj: Record<string, string | number | boolean>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

// ─── Provider: Pele Card (פלה כארד) ──────────────────────────────────────────

async function chargePeleCard(
  terminal: { terminalId: string; apiKey?: string | null; apiSecret?: string | null },
  charge:   ChargeDto
): Promise<{ approved: boolean; approvalCode?: string; providerTxId?: string; providerResponse: unknown }> {
  const user     = requireEnv('PELECARD_USER');
  const password = requireEnv('PELECARD_PASSWORD');
  const termNum  = requireEnv('PELECARD_TERMINAL');

  const formBody = toFormData({
    user,
    password,
    terminal:       termNum,
    transactionSum: charge.amount,
    currency:       1,  // ILS
    j5:             'True',
    ...(charge.installments && charge.installments > 1
      ? { payments: charge.installments, firstPayment: charge.amount, periodicalPayment: 0 }
      : {}),
    ...(charge.cardToken ? { token: charge.cardToken } : {}),
  });

  const res = await httpPost(
    'https://gateway20.pelecard.biz/landingpage',
    formBody,
    {}
  );

  const json = res.json() as Record<string, unknown> | null;
  const code  = json?.PelecardStatusCode as string | undefined;
  const approved = code === '000';

  return {
    approved,
    approvalCode:    (json?.AuthNumber as string) ?? undefined,
    providerTxId:    (json?.VoucherNum as string) ?? undefined,
    providerResponse: json ?? { rawText: res.text },
  };
}

async function refundPeleCard(
  terminal:      { terminalId: string },
  originalTxId:  string,
  amount:        number
): Promise<{ approved: boolean; providerResponse: unknown }> {
  const user     = requireEnv('PELECARD_USER');
  const password = requireEnv('PELECARD_PASSWORD');
  const termNum  = requireEnv('PELECARD_TERMINAL');

  const formBody = toFormData({
    user,
    password,
    terminal: termNum,
    VoucherNum: originalTxId,
    transactionSum: amount,
    currency: 1,
    j5: 'False',
  });

  const res = await httpPost('https://gateway20.pelecard.biz/landingpage', formBody);
  const json = res.json() as Record<string, unknown> | null;

  return {
    approved: (json?.PelecardStatusCode as string) === '000',
    providerResponse: json ?? { rawText: res.text },
  };
}

async function testPeleCard(): Promise<{ success: boolean; message: string }> {
  try {
    requireEnv('PELECARD_USER');
    requireEnv('PELECARD_PASSWORD');
    requireEnv('PELECARD_TERMINAL');
    return { success: true, message: 'Pele Card credentials are configured' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Provider: CardCom (קארדקום) ──────────────────────────────────────────────

async function generateCardComLink(
  terminal: { terminalId: string; merchantId?: string | null },
  link:     PaymentLinkDto
): Promise<{ url: string; providerCode: string }> {
  const tokenId = requireEnv('CARDCOM_TOKEN_ID');
  const apiName = requireEnv('CARDCOM_API_NAME');

  const res = await httpPost(
    'https://secure.cardcom.solutions/api/v11/LowProfile/Create',
    {
      TerminalNumber: terminal.merchantId ?? terminal.terminalId,
      UserName:       apiName,
      SumToBill:      link.amount,
      CoinID:         1,
      Description:    link.description ?? 'תשלום',
      Language:       'he',
      ...(link.customerName  ? { FullName:    link.customerName  } : {}),
      ...(link.customerEmail ? { Email:       link.customerEmail } : {}),
      ...(link.customerPhone ? { Phone:       link.customerPhone } : {}),
    },
    { TokenId: tokenId, ApiName: apiName }
  );

  const json = res.json() as Record<string, unknown> | null;
  if (!res.ok || !json || (json.ResponseCode as number) !== 0) {
    throw new Error(`CardCom error: ${JSON.stringify(json)}`);
  }

  return {
    url:          (json.url as string) ?? (json.LowProfileUrl as string) ?? '',
    providerCode: (json.LowProfileCode as string) ?? '',
  };
}

async function testCardCom(): Promise<{ success: boolean; message: string }> {
  try {
    requireEnv('CARDCOM_TOKEN_ID');
    requireEnv('CARDCOM_API_NAME');
    return { success: true, message: 'CardCom credentials are configured' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Provider: Tranzila (טרנזילה) ─────────────────────────────────────────────

async function chargeTranzila(
  terminal: { terminalId: string; apiSecret?: string | null },
  charge:   ChargeDto
): Promise<{ approved: boolean; approvalCode?: string; providerTxId?: string; providerResponse: unknown }> {
  const supplier = requireEnv('TRANZILA_SUPPLIER');

  const params: Record<string, string | number> = {
    sum:       charge.amount,
    currency:  1,
    cred_type: 1,
  };
  if (charge.cardToken) params['token'] = charge.cardToken;
  if (charge.installments && charge.installments > 1) {
    params['cred_type'] = 8; // installments
    params['fpay']      = charge.amount;
    params['spay']      = 0;
    params['npay']      = charge.installments;
  }

  const url = `https://direct.tranzila.com/${supplier}/iframenew.php`;
  const res = await httpPost(url, toFormData(params));

  const text = res.text;
  // Tranzila returns query-string-like response: Response=00&AuthNum=123&...
  const parsed: Record<string, string> = {};
  text.split('&').forEach(part => {
    const [k, v] = part.split('=');
    if (k && v !== undefined) parsed[decodeURIComponent(k)] = decodeURIComponent(v);
  });

  const approved = parsed['Response'] === '00';
  return {
    approved,
    approvalCode:    parsed['AuthNum'],
    providerTxId:    parsed['index'],
    providerResponse: parsed,
  };
}

async function refundTranzila(
  originalTxId: string,
  amount:       number
): Promise<{ approved: boolean; providerResponse: unknown }> {
  const supplier = requireEnv('TRANZILA_SUPPLIER');

  const params: Record<string, string | number> = {
    sum:       amount,
    currency:  1,
    cred_type: 6, // refund
    index:     originalTxId,
  };

  const url = `https://direct.tranzila.com/${supplier}/iframenew.php`;
  const res = await httpPost(url, toFormData(params));

  const parsed: Record<string, string> = {};
  res.text.split('&').forEach(part => {
    const [k, v] = part.split('=');
    if (k && v !== undefined) parsed[decodeURIComponent(k)] = decodeURIComponent(v);
  });

  return { approved: parsed['Response'] === '00', providerResponse: parsed };
}

async function testTranzila(): Promise<{ success: boolean; message: string }> {
  try {
    requireEnv('TRANZILA_SUPPLIER');
    return { success: true, message: 'Tranzila credentials are configured' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Provider: PayPlus (פייפלוס) ──────────────────────────────────────────────

async function generatePayPlusLink(
  _terminal: { terminalId: string },
  link:      PaymentLinkDto
): Promise<{ url: string; providerCode: string }> {
  const secretKey = requireEnv('PAYPLUS_SECRET_KEY');
  const pageUid   = requireEnv('PAYPLUS_PAGE_UID');

  const res = await httpPost(
    'https://restapi.payplus.co.il/api/v1.0/PaymentPages/generateLink',
    {
      payment_page_uid: pageUid,
      amount:           link.amount,
      currency_code:    link.currency ?? 'ILS',
      ...(link.description ? { more_info: link.description } : {}),
      ...(link.customerName || link.customerEmail || link.customerPhone
        ? {
            customer: {
              ...(link.customerName  ? { full_name:     link.customerName  } : {}),
              ...(link.customerEmail ? { email:         link.customerEmail } : {}),
              ...(link.customerPhone ? { phone_number:  link.customerPhone } : {}),
            },
          }
        : {}),
    },
    { Authorization: secretKey }
  );

  const json = res.json() as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error(`PayPlus error: ${JSON.stringify(json)}`);
  }

  return {
    url:          (json?.data as Record<string, unknown>)?.page_request_uid as string ?? '',
    providerCode: (json?.data as Record<string, unknown>)?.payment_page_link as string ?? '',
  };
}

async function testPayPlus(): Promise<{ success: boolean; message: string }> {
  try {
    requireEnv('PAYPLUS_SECRET_KEY');
    requireEnv('PAYPLUS_PAGE_UID');
    return { success: true, message: 'PayPlus credentials are configured' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Provider: Meshulam (משולם) ───────────────────────────────────────────────

async function generateMeshulamLink(
  _terminal: { terminalId: string },
  link:      PaymentLinkDto
): Promise<{ url: string; providerCode: string }> {
  const pageCode = requireEnv('MESHULAM_PAGE_CODE');
  const userId   = requireEnv('MESHULAM_USER_ID');
  const apiKey   = requireEnv('MESHULAM_API_KEY');

  const res = await httpPost(
    'https://secure.meshulam.biz/api',
    {
      pageCode,
      userId,
      apiKey,
      sum:         link.amount,
      description: link.description ?? 'תשלום',
      ...(link.customerName  ? { fullName: link.customerName  } : {}),
      ...(link.customerPhone ? { phone:    link.customerPhone } : {}),
      ...(link.customerEmail ? { email:    link.customerEmail } : {}),
    }
  );

  const json = res.json() as { success?: boolean; url?: string; data?: { url?: string } } | null;
  if (!json?.success) {
    throw new Error(`Meshulam error: ${res.text}`);
  }

  const url = json.url ?? json.data?.url ?? '';
  return { url, providerCode: '' };
}

async function testMeshulam(): Promise<{ success: boolean; message: string }> {
  try {
    requireEnv('MESHULAM_PAGE_CODE');
    requireEnv('MESHULAM_USER_ID');
    requireEnv('MESHULAM_API_KEY');
    return { success: true, message: 'Meshulam credentials are configured' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Service: Terminals ───────────────────────────────────────────────────────

export async function listTerminals(tenantId: string, branchId?: string) {
  return prisma.paymentTerminal.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(branchId ? { branchId } : {}),
    },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getTerminal(tenantId: string, terminalId: string) {
  const terminal = await prisma.paymentTerminal.findUnique({
    where:   { id: terminalId },
    include: { branch: { select: { id: true, name: true } } },
  });
  if (!terminal || terminal.tenantId !== tenantId) {
    throw new Error('Terminal not found');
  }
  return terminal;
}

export async function createTerminal(
  tenantId: string,
  _userId:  string,
  data:     CreateTerminalDto
) {
  // Never log sensitive credentials
  logger.info('Creating payment terminal', {
    tenantId,
    name:     data.name,
    provider: data.provider,
  });

  return prisma.paymentTerminal.create({
    data: {
      tenantId,
      name:       data.name,
      terminalId: data.terminalId,
      provider:   data.provider,
      apiUrl:     data.apiUrl,
      apiKey:     data.apiKey,
      apiSecret:  data.apiSecret,
      merchantId: data.merchantId,
      currency:   data.currency ?? 'ILS',
      branchId:   data.branchId,
    },
  });
}

export async function updateTerminal(
  tenantId:   string,
  terminalId: string,
  data:       UpdateTerminalDto
) {
  const existing = await getTerminal(tenantId, terminalId);

  logger.info('Updating payment terminal', {
    tenantId,
    terminalId: existing.id,
    provider:   existing.provider,
  });

  return prisma.paymentTerminal.update({
    where: { id: terminalId },
    data: {
      ...(data.name        !== undefined ? { name:       data.name        } : {}),
      ...(data.terminalId  !== undefined ? { terminalId: data.terminalId  } : {}),
      ...(data.provider    !== undefined ? { provider:   data.provider    } : {}),
      ...(data.apiUrl      !== undefined ? { apiUrl:     data.apiUrl      } : {}),
      ...(data.apiKey      !== undefined ? { apiKey:     data.apiKey      } : {}),
      ...(data.apiSecret   !== undefined ? { apiSecret:  data.apiSecret   } : {}),
      ...(data.merchantId  !== undefined ? { merchantId: data.merchantId  } : {}),
      ...(data.currency    !== undefined ? { currency:   data.currency    } : {}),
      ...(data.branchId    !== undefined ? { branchId:   data.branchId    } : {}),
      ...(data.isActive    !== undefined ? { isActive:   data.isActive    } : {}),
    },
  });
}

export async function deactivateTerminal(
  tenantId:   string,
  terminalId: string
): Promise<void> {
  await getTerminal(tenantId, terminalId);
  await prisma.paymentTerminal.update({
    where: { id: terminalId },
    data:  { isActive: false },
  });
}

export async function testTerminal(
  tenantId:   string,
  terminalId: string
): Promise<{ success: boolean; message: string }> {
  const terminal = await getTerminal(tenantId, terminalId);

  switch (terminal.provider) {
    case 'PELE_CARD':  return testPeleCard();
    case 'CARDCOM':    return testCardCom();
    case 'TRANZILA':   return testTranzila();
    case 'PAYPLUS':    return testPayPlus();
    case 'MESHULAM':   return testMeshulam();
    case 'EMV_DIRECT': return { success: true, message: 'EMV direct terminal — physical ping not supported via API' };
    default:           return { success: false, message: `Unsupported provider: ${terminal.provider}` };
  }
}

// ─── Service: Charge ──────────────────────────────────────────────────────────

export async function chargeCard(tenantId: string, userId: string, data: ChargeDto) {
  const terminal = await getTerminal(tenantId, data.terminalId);

  if (!terminal.isActive) {
    throw new Error('Terminal is inactive');
  }

  let result: {
    approved:         boolean;
    approvalCode?:    string;
    providerTxId?:    string;
    providerResponse: unknown;
  };

  switch (terminal.provider) {
    case 'PELE_CARD':
      result = await chargePeleCard(terminal, data);
      break;
    case 'TRANZILA':
      result = await chargeTranzila(terminal, data);
      break;
    case 'CARDCOM':
    case 'PAYPLUS':
    case 'MESHULAM':
      throw new Error(
        `Provider ${terminal.provider} only supports hosted payment links. Use POST /payment-link instead.`
      );
    case 'EMV_DIRECT':
      throw new Error('EMV_DIRECT terminals are managed by physical hardware — direct charge via API is not supported.');
    default:
      throw new Error(`Unsupported provider: ${terminal.provider}`);
  }

  const status: CardTxStatus = result.approved ? 'APPROVED' : 'DECLINED';

  const tx = await prisma.cardPaymentTransaction.create({
    data: {
      tenantId,
      terminalId:      terminal.id,
      amount:          data.amount,
      currency:        data.currency ?? terminal.currency ?? 'ILS',
      installments:    data.installments ?? 1,
      status,
      paymentType:     (data.installments ?? 1) > 1 ? 'INSTALLMENTS' : 'REGULAR',
      approvalCode:    result.approvalCode,
      providerTxId:    result.providerTxId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerResponse: result.providerResponse as any,
      customerId:      data.customerId,
      invoiceId:       data.invoiceId,
      createdBy:       userId,
    },
  });

  logger.info('Card payment transaction created', {
    tenantId,
    txId:   tx.id,
    status,
    amount: data.amount,
  });

  return tx;
}

// ─── Service: Payment Link ────────────────────────────────────────────────────

export async function generatePaymentLink(
  tenantId: string,
  userId:   string,
  data:     PaymentLinkDto
): Promise<{ url: string; txId: string }> {
  const terminal = await getTerminal(tenantId, data.terminalId);

  if (!terminal.isActive) {
    throw new Error('Terminal is inactive');
  }

  let linkResult: { url: string; providerCode: string };

  switch (terminal.provider) {
    case 'CARDCOM':
      linkResult = await generateCardComLink(terminal, data);
      break;
    case 'PAYPLUS':
      linkResult = await generatePayPlusLink(terminal, data);
      break;
    case 'MESHULAM':
      linkResult = await generateMeshulamLink(terminal, data);
      break;
    case 'PELE_CARD':
    case 'TRANZILA':
      throw new Error(
        `Provider ${terminal.provider} does not support hosted payment links. Use POST /charge instead.`
      );
    default:
      throw new Error(`Unsupported provider for payment links: ${terminal.provider}`);
  }

  const tx = await prisma.cardPaymentTransaction.create({
    data: {
      tenantId,
      terminalId:  terminal.id,
      amount:      data.amount,
      currency:    data.currency ?? terminal.currency ?? 'ILS',
      status:      'PENDING',
      paymentType: 'INTERNET',
      providerTxId: linkResult.providerCode || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerResponse: { paymentUrl: linkResult.url } as any,
      customerId:  data.customerId,
      invoiceId:   data.invoiceId,
      createdBy:   userId,
    },
  });

  return { url: linkResult.url, txId: tx.id };
}

// ─── Service: Refund ──────────────────────────────────────────────────────────

export async function refundTransaction(
  tenantId:      string,
  userId:        string,
  originalTxId:  string,
  amount?:       number
) {
  const original = await prisma.cardPaymentTransaction.findUnique({
    where:   { id: originalTxId },
    include: { terminal: true },
  });

  if (!original || original.tenantId !== tenantId) {
    throw new Error('Transaction not found');
  }

  if (original.status !== 'APPROVED') {
    throw new Error('Only approved transactions can be refunded');
  }

  const refundAmount = amount ?? Number(original.amount);

  if (refundAmount > Number(original.amount)) {
    throw new Error('Refund amount cannot exceed original transaction amount');
  }

  let providerResult: { approved: boolean; providerResponse: unknown };

  switch (original.terminal.provider) {
    case 'PELE_CARD':
      providerResult = await refundPeleCard(
        original.terminal,
        original.providerTxId ?? originalTxId,
        refundAmount
      );
      break;
    case 'TRANZILA':
      providerResult = await refundTranzila(
        original.providerTxId ?? originalTxId,
        refundAmount
      );
      break;
    default:
      // For providers that don't have direct refund API exposed here,
      // record as refunded (manual processing may be required)
      providerResult = {
        approved: true,
        providerResponse: { note: `Manual refund required for provider ${original.terminal.provider}` },
      };
  }

  if (!providerResult.approved) {
    throw new Error(`Refund declined by provider: ${JSON.stringify(providerResult.providerResponse)}`);
  }

  // Mark original as REFUNDED
  await prisma.cardPaymentTransaction.update({
    where: { id: originalTxId },
    data:  { status: 'REFUNDED' },
  });

  // Create new refund transaction
  const refundTx = await prisma.cardPaymentTransaction.create({
    data: {
      tenantId,
      terminalId:      original.terminalId,
      amount:          refundAmount,
      currency:        original.currency,
      installments:    1,
      status:          'REFUNDED',
      paymentType:     original.paymentType,
      approvalCode:    undefined,
      providerTxId:    undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerResponse: providerResult.providerResponse as any,
      customerId:      original.customerId ?? undefined,
      invoiceId:       original.invoiceId  ?? undefined,
      createdBy:       userId,
    },
  });

  logger.info('Card payment refund created', {
    tenantId,
    originalTxId,
    refundTxId: refundTx.id,
    amount: refundAmount,
  });

  return refundTx;
}

// ─── Service: Transactions ────────────────────────────────────────────────────

export async function getTransaction(tenantId: string, txId: string) {
  const tx = await prisma.cardPaymentTransaction.findUnique({
    where:   { id: txId },
    include: { terminal: true, customer: { select: { id: true, name: true } } },
  });
  if (!tx || tx.tenantId !== tenantId) {
    throw new Error('Transaction not found');
  }
  return tx;
}

export async function listTransactions(
  tenantId: string,
  filters:  TransactionFilters
): Promise<PaginatedResult<unknown>> {
  const page     = filters.page     ?? 1;
  const pageSize = filters.pageSize ?? 50;

  const where: Record<string, unknown> = {
    tenantId,
    ...(filters.terminalId ? { terminalId: filters.terminalId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.status     ? { status:     filters.status     } : {}),
    ...(filters.from || filters.to
      ? {
          transactionDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to   ? { lte: filters.to   } : {}),
          },
        }
      : {}),
    ...(filters.minAmount !== undefined || filters.maxAmount !== undefined
      ? {
          amount: {
            ...(filters.minAmount !== undefined ? { gte: filters.minAmount } : {}),
            ...(filters.maxAmount !== undefined ? { lte: filters.maxAmount } : {}),
          },
        }
      : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause = where as any;

  const [items, total] = await Promise.all([
    prisma.cardPaymentTransaction.findMany({
      where:   whereClause,
      include: { terminal: { select: { id: true, name: true, provider: true } } },
      orderBy: { transactionDate: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.cardPaymentTransaction.count({
      where: whereClause,
    }),
  ]);

  return { items, total, page, pageSize };
}

// ─── Service: Terminal Summary ────────────────────────────────────────────────

export async function getTerminalSummary(
  tenantId:   string,
  terminalId: string,
  from:       Date,
  to:         Date
) {
  await getTerminal(tenantId, terminalId);

  const transactions = await prisma.cardPaymentTransaction.findMany({
    where: {
      tenantId,
      terminalId,
      transactionDate: { gte: from, lte: to },
    },
    select: {
      status:   true,
      amount:   true,
      cardType: true,
    },
  });

  const approved  = transactions.filter(t => t.status === 'APPROVED');
  const declined  = transactions.filter(t => t.status === 'DECLINED');
  const refunded  = transactions.filter(t => t.status === 'REFUNDED');

  const sum = (arr: typeof transactions) =>
    arr.reduce((s, t) => s + Number(t.amount), 0);

  // Aggregate by card type
  const byCardType: Record<string, { count: number; amount: number }> = {};
  for (const t of approved) {
    const key = t.cardType ?? 'UNKNOWN';
    if (!byCardType[key]) byCardType[key] = { count: 0, amount: 0 };
    byCardType[key].count++;
    byCardType[key].amount += Number(t.amount);
  }

  return {
    terminalId,
    from:            from.toISOString(),
    to:              to.toISOString(),
    totalApproved:   approved.length,
    totalDeclined:   declined.length,
    totalRefunded:   refunded.length,
    approvedAmount:  sum(approved),
    refundedAmount:  sum(refunded),
    byCardType,
  };
}

// ─── Service: Webhook ─────────────────────────────────────────────────────────

export async function handleWebhook(
  provider: string,
  payload:  Record<string, unknown>
): Promise<void> {
  logger.info('Payment terminal webhook received', { provider, keys: Object.keys(payload) });

  switch (provider.toUpperCase()) {
    case 'PELE_CARD': {
      // Pele Card sends VoucherNum and final status
      const voucherNum = payload['VoucherNum'] as string | undefined;
      const statusCode = payload['PelecardStatusCode'] as string | undefined;
      if (voucherNum && statusCode) {
        const tx = await prisma.cardPaymentTransaction.findFirst({
          where: { providerTxId: voucherNum },
        });
        if (tx) {
          await prisma.cardPaymentTransaction.update({
            where: { id: tx.id },
            data:  {
              status:          statusCode === '000' ? 'APPROVED' : 'DECLINED',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              providerResponse: payload as any,
            },
          });
        }
      }
      break;
    }

    case 'CARDCOM': {
      // CardCom sends LowProfileCode and ReturnValue
      const lowProfileCode = payload['LowProfileCode'] as string | undefined;
      const responseCode   = payload['ResponseCode']   as number | undefined;
      if (lowProfileCode) {
        const tx = await prisma.cardPaymentTransaction.findFirst({
          where: { providerTxId: lowProfileCode },
        });
        if (tx) {
          await prisma.cardPaymentTransaction.update({
            where: { id: tx.id },
            data:  {
              status:          responseCode === 0 ? 'APPROVED' : 'DECLINED',
              approvalCode:    payload['AuthNum'] as string | undefined,
              last4:           payload['Last4Digits'] as string | undefined,
              cardType:        payload['CardName'] as string | undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              providerResponse: payload as any,
            },
          });
        }
      }
      break;
    }

    case 'TRANZILA': {
      const index = payload['index'] as string | undefined;
      const response = payload['Response'] as string | undefined;
      if (index) {
        const tx = await prisma.cardPaymentTransaction.findFirst({
          where: { providerTxId: index },
        });
        if (tx) {
          await prisma.cardPaymentTransaction.update({
            where: { id: tx.id },
            data:  {
              status:          response === '00' ? 'APPROVED' : 'DECLINED',
              approvalCode:    payload['AuthNum'] as string | undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              providerResponse: payload as any,
            },
          });
        }
      }
      break;
    }

    case 'PAYPLUS': {
      const pageRequestUid = payload['page_request_uid'] as string | undefined;
      const statusCode     = payload['status_code']      as string | undefined;
      if (pageRequestUid) {
        const tx = await prisma.cardPaymentTransaction.findFirst({
          where: { providerTxId: pageRequestUid },
        });
        if (tx) {
          await prisma.cardPaymentTransaction.update({
            where: { id: tx.id },
            data:  {
              status:          statusCode === 'APPROVED' ? 'APPROVED' : 'DECLINED',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              providerResponse: payload as any,
            },
          });
        }
      }
      break;
    }

    case 'MESHULAM': {
      const transactionId = payload['transactionId'] as string | undefined;
      const status        = payload['status']         as string | undefined;
      if (transactionId) {
        const tx = await prisma.cardPaymentTransaction.findFirst({
          where: { providerTxId: transactionId },
        });
        if (tx) {
          await prisma.cardPaymentTransaction.update({
            where: { id: tx.id },
            data:  {
              status:          status === 'success' ? 'APPROVED' : 'DECLINED',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              providerResponse: payload as any,
            },
          });
        }
      }
      break;
    }

    default:
      logger.warn('Unknown payment terminal webhook provider', { provider });
  }
}
