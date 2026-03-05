import { SmartImportSourceType, SmartImportEntityType, SmartImportStatus, AccountType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import * as xlsx from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportSubResult {
  imported: number;
  failed: number;
  errors: SmartImportError[];
}

export interface ListSmartJobsFilters {
  entityType?: SmartImportEntityType;
  status?: SmartImportStatus;
  sourceType?: SmartImportSourceType;
  page?: number;
  limit?: number;
}

export interface CreateSmartImportJobData {
  name: string;
  sourceType: SmartImportSourceType;
  entityType: SmartImportEntityType;
  rawData: string;
  originalFilename?: string;
}

export type AiFieldMapping = {
  mapping: Record<string, string>;
  confidence: number;
  warnings: string[];
  suggestions: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
  let match = value.match(ddmmyyyy);
  if (match) {
    const d = new Date(`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  match = value.match(yyyymmdd);
  if (match) {
    const d = new Date(`${value}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function applyMapping(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [src, target] of Object.entries(mapping)) {
    if (row[src] !== undefined) {
      result[target] = row[src];
    }
  }
  // Also keep any columns that were already named like target fields (no remapping needed)
  for (const [key, value] of Object.entries(row)) {
    if (!result[key] && !Object.values(mapping).includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

// ─── Company-Specific Parsers ─────────────────────────────────────────────────

/**
 * Parse Priority (פריוריטי) ERP exports — semicolon or pipe delimited.
 */
export function parsePriorityFile(content: string, entityType: string): any[] {
  // Detect delimiter: prefer pipe then semicolon then comma
  const firstLine = content.split('\n')[0] ?? '';
  let delimiter: string;
  if (firstLine.includes('|')) {
    delimiter = '|';
  } else if (firstLine.includes(';')) {
    delimiter = ';';
  } else {
    delimiter = ',';
  }

  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim() !== '');

  if (lines.length === 0) return [];

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    if (values.every(v => v === '')) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse Hashavshevet (חשבשבת) CSV exports.
 * Handles UTF-8 BOM and both comma and semicolon delimiters.
 */
export function parseHashavshevetFile(content: string, entityType: string): any[] {
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, '');
  const firstLine = cleaned.split('\n')[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';

  const lines = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim() !== '');

  if (lines.length === 0) return [];

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    if (values.every(v => v === '')) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse SAP exports — standard CSV with English headers like BP_CODE, BP_NAME.
 */
export function parseSapFile(content: string, entityType: string): any[] {
  return parseGenericCSV(content).rows;
}

/**
 * Parse any CSV content — handles BOM, auto-detects delimiter.
 */
export function parseGenericCSV(content: string): { headers: string[]; rows: any[] } {
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, '');

  // Detect delimiter from first line
  const firstLine = cleaned.split('\n')[0] ?? '';
  let delimiter: string;
  const pipes = (firstLine.match(/\|/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs  = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;

  if (pipes > 0 && pipes >= semis && pipes >= tabs && pipes >= commas) {
    delimiter = '|';
  } else if (semis > 0 && semis >= tabs && semis >= commas) {
    delimiter = ';';
  } else if (tabs > 0 && tabs >= commas) {
    delimiter = '\t';
  } else {
    delimiter = ',';
  }

  // Tokenise the whole file respecting quoted fields
  const normalized = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuote && normalized[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === '\n' && !inQuote) {
      rawLines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) rawLines.push(current);

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === delimiter && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  const nonEmpty = rawLines.filter(l => l.trim() !== '');
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = splitLine(nonEmpty[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows: any[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const values = splitLine(nonEmpty[i]);
    if (values.every(v => v === '')) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').replace(/^"|"$/g, '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse a base64-encoded Excel file using the xlsx library.
 */
export function parseGenericExcel(base64Content: string): {
  sheets: { name: string; headers: string[]; rows: any[] }[];
} {
  const buffer = Buffer.from(base64Content, 'base64');
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: { name: string; headers: string[]; rows: any[] }[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rawRows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rawRows.length === 0) {
      sheets.push({ name: sheetName, headers: [], rows: [] });
      continue;
    }

    const headers = (rawRows[0] as any[]).map(h => String(h ?? '').trim());
    const rows: any[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const values = rawRows[i] as any[];
      if (values.every(v => v === '' || v === null || v === undefined)) continue;
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const val = values[j];
        // Convert dates to DD/MM/YYYY strings
        if (val instanceof Date) {
          const d = val.getDate().toString().padStart(2, '0');
          const m = (val.getMonth() + 1).toString().padStart(2, '0');
          const y = val.getFullYear();
          row[headers[j]] = `${d}/${m}/${y}`;
        } else {
          row[headers[j]] = String(val ?? '').trim();
        }
      }
      rows.push(row);
    }
    sheets.push({ name: sheetName, headers, rows });
  }

  return { sheets };
}

/**
 * Parse JSON content — handles plain array or object with items/data/records keys.
 */
export function parseGenericJSON(content: string): any[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON content');
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['items', 'data', 'records', 'rows', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as any[];
    }
    // If single object, wrap it
    return [parsed];
  }
  return [];
}

// ─── AI Field Mapping ─────────────────────────────────────────────────────────

const TARGET_FIELDS: Record<SmartImportEntityType, string[]> = {
  CUSTOMERS:       ['name', 'email', 'phone', 'address', 'city', 'zip', 'taxId', 'notes', 'creditLimit'],
  PRODUCTS:        ['code', 'name', 'description', 'unit', 'price', 'cost', 'taxRate', 'barcode', 'category', 'quantity'],
  EMPLOYEES:       ['firstName', 'lastName', 'idNumber', 'startDate', 'salary', 'department', 'role', 'email', 'phone'],
  VENDORS:         ['name', 'email', 'phone', 'address', 'city', 'taxId', 'paymentTerms', 'bankAccount'],
  CHART_OF_ACCOUNTS: ['code', 'name', 'type', 'parentCode', 'currency'],
  TRANSACTIONS:    ['date', 'reference', 'debitAccount', 'creditAccount', 'amount', 'description'],
  INVOICES:        ['customerName', 'date', 'dueDate', 'amount', 'vat', 'total', 'description'],
};

/**
 * Call Claude Haiku to suggest a field mapping from source columns to target fields.
 */
export async function suggestFieldMapping(
  headers: string[],
  entityType: SmartImportEntityType,
  sampleRows: any[],
): Promise<AiFieldMapping> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Return a naive mapping if no API key configured
    const mapping: Record<string, string> = {};
    const targets = TARGET_FIELDS[entityType] ?? [];
    for (const header of headers) {
      const lower = header.toLowerCase().replace(/[\s_-]/g, '');
      const matched = targets.find(t => {
        const tl = t.toLowerCase();
        return lower === tl || lower.includes(tl) || tl.includes(lower);
      });
      if (matched) mapping[header] = matched;
    }
    return {
      mapping,
      confidence: 0.5,
      warnings: ['ANTHROPIC_API_KEY not configured — using basic heuristic mapping'],
      suggestions: [],
    };
  }

  const targetFields = TARGET_FIELDS[entityType] ?? [];
  const sample = sampleRows.slice(0, 3);

  const prompt = `You are an ERP data migration specialist. A user wants to import data into the "${entityType}" entity.

Source file columns: ${JSON.stringify(headers)}
Sample data (up to 3 rows): ${JSON.stringify(sample, null, 2)}

Target fields available for "${entityType}": ${JSON.stringify(targetFields)}

Please analyze the source columns and suggest the best field mapping. The file may be in Hebrew or English.

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "mapping": { "sourceColumn": "targetField" },
  "confidence": 0.95,
  "warnings": ["list any columns that could not be mapped"],
  "suggestions": ["helpful tips about the mapping"]
}

Rules:
- Only map columns that clearly correspond to a target field
- Do not guess if unsure — leave unmapped columns out of mapping
- Confidence should be between 0 and 1
- For Hebrew ERP exports: שם=name, מייל=email, טלפון=phone, כתובת=address, עיר=city, מיקוד=zip, ח.פ.=taxId`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as any;
  const text: string = data?.content?.[0]?.text ?? '{}';

  // Strip potential markdown code fences
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonStr) as AiFieldMapping;
    return {
      mapping:     parsed.mapping     ?? {},
      confidence:  parsed.confidence  ?? 0.8,
      warnings:    parsed.warnings    ?? [],
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    throw new Error(`Claude returned invalid JSON: ${jsonStr.substring(0, 200)}`);
  }
}

// ─── Import Execution ─────────────────────────────────────────────────────────

export async function importCustomers(
  tenantId: string,
  rows: any[],
  mapping: Record<string, string>,
): Promise<ImportSubResult> {
  let imported = 0;
  let failed = 0;
  const errors: SmartImportError[] = [];

  const BATCH = 50;
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batch = rows.slice(batchStart, batchStart + BATCH);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const rowNum = batchStart + i + 2;
        const raw = batch[i];
        const row = applyMapping(raw, mapping);

        try {
          const name = (row['name'] ?? row['שם לקוח'] ?? row['CUSTDES'] ?? '').trim();
          if (!name) {
            errors.push({ row: rowNum, field: 'name', message: 'name is required' });
            failed++;
            continue;
          }

          const email       = (row['email']       ?? row['מייל']    ?? row['EMAIL']   ?? '').trim() || undefined;
          const phone       = (row['phone']       ?? row['טלפון']   ?? row['PHONE']   ?? '').trim() || undefined;
          const address     = (row['address']     ?? row['כתובת']   ?? row['ADDRESS'] ?? '').trim() || undefined;
          const city        = (row['city']        ?? row['עיר']     ?? row['CITY']    ?? '').trim() || undefined;
          const zip         = (row['zip']         ?? row['מיקוד']   ?? row['ZIP']     ?? '').trim() || undefined;
          const taxId       = (row['taxId']       ?? row['ח.פ.']    ?? row['TAXCODE'] ?? row['ח.פ./ת.ז.'] ?? '').trim() || undefined;
          const notes       = (row['notes']       ?? '').trim() || undefined;
          const creditLimitRaw = (row['creditLimit'] ?? row['יתרה'] ?? '').trim();

          if (email && !isValidEmail(email)) {
            errors.push({ row: rowNum, field: 'email', message: `Invalid email: ${email}` });
            failed++;
            continue;
          }

          let creditLimit: number | undefined;
          if (creditLimitRaw) {
            const n = parseFloat(creditLimitRaw.replace(/,/g, ''));
            if (!isNaN(n)) creditLimit = n;
          }

          const addressJson = address ? { raw: address, city, zip } : (city ? { city, zip } : undefined);

          const customerData = {
            name,
            email,
            phone,
            address: addressJson as any,
            businessId: taxId,
            creditLimit: creditLimit !== undefined ? creditLimit : undefined,
            status: 'ACTIVE' as const,
            type: 'B2B' as const,
          };

          if (email) {
            const existing = await tx.customer.findFirst({ where: { tenantId, email } });
            if (existing) {
              await tx.customer.update({ where: { id: existing.id }, data: customerData });
            } else {
              await tx.customer.create({ data: { tenantId, ...customerData } });
            }
          } else if (taxId) {
            const existing = await tx.customer.findFirst({ where: { tenantId, businessId: taxId } });
            if (existing) {
              await tx.customer.update({ where: { id: existing.id }, data: customerData });
            } else {
              await tx.customer.create({ data: { tenantId, ...customerData } });
            }
          } else {
            await tx.customer.create({ data: { tenantId, ...customerData } });
          }

          imported++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNum, field: '_db', message: msg });
          failed++;
        }
      }
    });
  }

  return { imported, failed, errors };
}

export async function importProducts(
  tenantId: string,
  rows: any[],
  mapping: Record<string, string>,
): Promise<ImportSubResult> {
  let imported = 0;
  let failed = 0;
  const errors: SmartImportError[] = [];

  const BATCH = 50;
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batch = rows.slice(batchStart, batchStart + BATCH);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const rowNum = batchStart + i + 2;
        const raw = batch[i];
        const row = applyMapping(raw, mapping);

        try {
          const name = (row['name'] ?? row['PARTDES'] ?? row['שם'] ?? '').trim();
          if (!name) {
            errors.push({ row: rowNum, field: 'name', message: 'name is required' });
            failed++;
            continue;
          }

          const code        = (row['code']    ?? row['PARTNAME'] ?? row['מק"ט'] ?? '').trim() || undefined;
          const description = (row['description'] ?? row['תיאור'] ?? '').trim() || undefined;
          const unit        = (row['unit']    ?? row['UOMCODE']  ?? row['יחידה'] ?? '').trim() || 'יחידה';
          const barcode     = (row['barcode'] ?? row['ברקוד']   ?? '').trim() || undefined;
          const category    = (row['category'] ?? row['קטגוריה'] ?? '').trim() || undefined;

          const priceRaw   = (row['price']   ?? row['PRICE']   ?? row['מחיר']  ?? '').trim();
          const costRaw    = (row['cost']    ?? row['COST']    ?? row['עלות']  ?? '').trim();
          const taxRateRaw = (row['taxRate'] ?? row['מע"מ']   ?? '').trim();

          const sellingPrice = parseFloat(priceRaw.replace(/,/g, '')) || 0;
          const costPrice    = parseFloat(costRaw.replace(/,/g, ''))  || 0;
          let   vatRate      = 0.18;
          if (taxRateRaw) {
            const v = parseFloat(taxRateRaw);
            if (!isNaN(v)) vatRate = v > 1 ? v / 100 : v; // handle % or decimal
          }

          // Find or create category
          let categoryId: string | undefined;
          if (category) {
            const cat = await tx.productCategory.upsert({
              where: { tenantId_name: { tenantId, name: category } },
              update: {},
              create: { tenantId, name: category },
            });
            categoryId = cat.id;
          }

          const sku = code ?? `SKU-${name.replace(/\s+/g,'-').toUpperCase().substring(0,30)}-${Date.now()}`;

          const productData = {
            name,
            description,
            sellingPrice,
            costPrice,
            vatRate,
            unitOfMeasure: unit,
            categoryId,
            barcode,
            isActive: true,
          };

          const existing = await tx.product.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
          if (existing) {
            await tx.product.update({ where: { id: existing.id }, data: productData });
          } else {
            await tx.product.create({ data: { tenantId, sku, ...productData } });
          }

          imported++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNum, field: '_db', message: msg });
          failed++;
        }
      }
    });
  }

  return { imported, failed, errors };
}

export async function importEmployees(
  tenantId: string,
  rows: any[],
  mapping: Record<string, string>,
): Promise<ImportSubResult> {
  let imported = 0;
  let failed = 0;
  const errors: SmartImportError[] = [];

  const BATCH = 50;
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batch = rows.slice(batchStart, batchStart + BATCH);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const rowNum = batchStart + i + 2;
        const raw = batch[i];
        const row = applyMapping(raw, mapping);

        try {
          const firstName = (row['firstName'] ?? row['שם פרטי'] ?? '').trim();
          const lastName  = (row['lastName']  ?? row['שם משפחה'] ?? '').trim();
          if (!firstName || !lastName) {
            errors.push({ row: rowNum, field: 'name', message: 'firstName and lastName are required' });
            failed++;
            continue;
          }

          const idNumber   = (row['idNumber']  ?? row['ת.ז.'] ?? row['תעודת זהות'] ?? '').trim() || undefined;
          const email      = (row['email']     ?? row['מייל'] ?? '').trim() || undefined;
          const phone      = (row['phone']     ?? row['טלפון'] ?? '').trim() || undefined;
          const department = (row['department'] ?? row['מחלקה'] ?? '').trim() || 'General';
          const role       = (row['role']      ?? row['תפקיד'] ?? '').trim() || 'Employee';
          const startDateRaw = (row['startDate'] ?? row['תאריך תחילה'] ?? '').trim();
          const salaryRaw    = (row['salary']    ?? row['שכר'] ?? '').trim();

          const startDate = startDateRaw ? (parseDate(startDateRaw) ?? new Date()) : new Date();
          const grossSalary = parseFloat(salaryRaw.replace(/,/g, '')) || 0;

          // Skip if employee with same idNumber already exists
          if (idNumber) {
            const existing = await tx.employee.findUnique({
              where: { tenantId_idNumber: { tenantId, idNumber } },
            });
            if (existing) {
              // Update but do not duplicate
              await tx.employee.update({
                where: { id: existing.id },
                data: { firstName, lastName, department, jobTitle: role, startDate, ...(grossSalary > 0 ? { grossSalary } : {}), ...(email ? { personalEmail: email } : {}), ...(phone ? { phone } : {}) },
              });
              imported++;
              continue;
            }
          }

          if (!idNumber) {
            errors.push({ row: rowNum, field: 'idNumber', message: 'idNumber is required to create a new employee' });
            failed++;
            continue;
          }
          if (!grossSalary) {
            errors.push({ row: rowNum, field: 'salary', message: 'salary is required to create a new employee' });
            failed++;
            continue;
          }

          await tx.employee.create({
            data: {
              tenantId,
              firstName,
              lastName,
              idNumber,
              personalEmail: email ?? '',
              phone: phone ?? '',
              department,
              jobTitle: role,
              startDate,
              grossSalary,
              gender: 'M',
              birthDate: new Date('1990-01-01'),
              address: {},
            },
          });
          imported++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNum, field: '_db', message: msg });
          failed++;
        }
      }
    });
  }

  return { imported, failed, errors };
}

export async function importVendors(
  tenantId: string,
  rows: any[],
  mapping: Record<string, string>,
): Promise<ImportSubResult> {
  let imported = 0;
  let failed = 0;
  const errors: SmartImportError[] = [];

  const BATCH = 50;
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batch = rows.slice(batchStart, batchStart + BATCH);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const rowNum = batchStart + i + 2;
        const raw = batch[i];
        const row = applyMapping(raw, mapping);

        try {
          const name = (row['name'] ?? row['שם ספק'] ?? row['BP_NAME'] ?? '').trim();
          if (!name) {
            errors.push({ row: rowNum, field: 'name', message: 'name is required' });
            failed++;
            continue;
          }

          const email        = (row['email']        ?? row['מייל']  ?? row['EMAIL']   ?? '').trim() || undefined;
          const phone        = (row['phone']        ?? row['טלפון'] ?? row['PHONE']   ?? '').trim() || undefined;
          const address      = (row['address']      ?? row['כתובת'] ?? row['ADDRESS'] ?? '').trim() || undefined;
          const taxId        = (row['taxId']        ?? row['ח.פ.']  ?? row['BP_CODE'] ?? '').trim() || undefined;
          const paymentTerms = (row['paymentTerms'] ?? row['תנאי תשלום'] ?? '').trim() || undefined;
          const bankAccount  = (row['bankAccount']  ?? row['חשבון בנק'] ?? '').trim() || undefined;

          if (email && !isValidEmail(email)) {
            errors.push({ row: rowNum, field: 'email', message: `Invalid email: ${email}` });
            failed++;
            continue;
          }

          const addressJson = address ? { raw: address } : undefined;

          const vendorData = {
            name,
            email,
            phone,
            address: addressJson as any,
            vatNumber: taxId,
            paymentTerms,
            bankAccountNumber: bankAccount,
            status: 'ACTIVE',
          };

          if (taxId) {
            const existing = await tx.vendor.findFirst({ where: { tenantId, vatNumber: taxId } });
            if (existing) {
              await tx.vendor.update({ where: { id: existing.id }, data: vendorData });
            } else {
              await tx.vendor.create({ data: { tenantId, ...vendorData } });
            }
          } else {
            await tx.vendor.create({ data: { tenantId, ...vendorData } });
          }

          imported++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNum, field: '_db', message: msg });
          failed++;
        }
      }
    });
  }

  return { imported, failed, errors };
}

export async function importAccounts(
  tenantId: string,
  rows: any[],
  mapping: Record<string, string>,
): Promise<ImportSubResult> {
  let imported = 0;
  let failed = 0;
  const errors: SmartImportError[] = [];

  const VALID_TYPES = new Set<string>(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);

  const BATCH = 50;
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batch = rows.slice(batchStart, batchStart + BATCH);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const rowNum = batchStart + i + 2;
        const raw = batch[i];
        const row = applyMapping(raw, mapping);

        try {
          const code = (row['code'] ?? row['חשבון'] ?? row['קוד'] ?? '').trim();
          const name = (row['name'] ?? row['שם חשבון'] ?? row['שם'] ?? '').trim();

          if (!code) {
            errors.push({ row: rowNum, field: 'code', message: 'code is required' });
            failed++;
            continue;
          }
          if (!name) {
            errors.push({ row: rowNum, field: 'name', message: 'name is required' });
            failed++;
            continue;
          }

          const typeRaw = (row['type'] ?? row['סוג'] ?? row['צד'] ?? '').trim().toUpperCase();
          // Map Hebrew type names to enum values
          const hebrewTypeMap: Record<string, string> = {
            'נכסים': 'ASSET',
            'נכס': 'ASSET',
            'התחייבויות': 'LIABILITY',
            'התחייבות': 'LIABILITY',
            'הון': 'EQUITY',
            'הכנסות': 'REVENUE',
            'הכנסה': 'REVENUE',
            'הוצאות': 'EXPENSE',
            'הוצאה': 'EXPENSE',
            'חובה': 'ASSET',
            'זכות': 'LIABILITY',
          };

          const resolvedType = hebrewTypeMap[row['type'] ?? row['סוג'] ?? row['צד'] ?? ''] ?? typeRaw;
          if (!VALID_TYPES.has(resolvedType)) {
            errors.push({ row: rowNum, field: 'type', message: `Invalid account type: "${resolvedType}". Valid: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE` });
            failed++;
            continue;
          }

          const parentCode = (row['parentCode'] ?? row['חשבון אב'] ?? '').trim() || undefined;

          // Resolve parentId from parentCode
          let parentId: string | undefined;
          if (parentCode) {
            const parent = await tx.account.findUnique({ where: { tenantId_code: { tenantId, code: parentCode } } });
            if (parent) parentId = parent.id;
          }

          const existing = await tx.account.findUnique({ where: { tenantId_code: { tenantId, code } } });
          if (existing) {
            await tx.account.update({
              where: { id: existing.id },
              data: { name, type: resolvedType as AccountType, parentId },
            });
          } else {
            await tx.account.create({
              data: { tenantId, code, name, type: resolvedType as AccountType, parentId },
            });
          }

          imported++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNum, field: '_db', message: msg });
          failed++;
        }
      }
    });
  }

  return { imported, failed, errors };
}

// ─── Execute Import ───────────────────────────────────────────────────────────

export async function executeImport(
  jobId: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const job = await prisma.smartImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) {
    throw new Error('Smart import job not found');
  }
  if (!job.rawData) {
    throw new Error('No raw data to import');
  }
  if (!job.fieldMapping) {
    throw new Error('Field mapping not confirmed yet');
  }

  // Update status to IMPORTING
  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: { status: SmartImportStatus.IMPORTING },
  });

  const mapping = job.fieldMapping as Record<string, string>;
  let rows: any[] = [];

  try {
    // Parse raw data according to sourceType
    switch (job.sourceType) {
      case SmartImportSourceType.PRIORITY:
        rows = parsePriorityFile(job.rawData, job.entityType);
        break;
      case SmartImportSourceType.HASHAVSHEVET:
        rows = parseHashavshevetFile(job.rawData, job.entityType);
        break;
      case SmartImportSourceType.SAP:
        rows = parseSapFile(job.rawData, job.entityType);
        break;
      case SmartImportSourceType.EXCEL:
        {
          const parsed = parseGenericExcel(job.rawData);
          rows = parsed.sheets[0]?.rows ?? [];
        }
        break;
      case SmartImportSourceType.JSON:
        rows = parseGenericJSON(job.rawData);
        break;
      case SmartImportSourceType.CSV:
      case SmartImportSourceType.MANUAL:
      default:
        rows = parseGenericCSV(job.rawData).rows;
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.smartImportJob.update({
      where: { id: jobId },
      data: {
        status: SmartImportStatus.FAILED,
        errorLog: `Parse error: ${msg}`,
        completedAt: new Date(),
      },
    });
    return;
  }

  // Update total rows count
  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: { totalRows: rows.length },
  });

  let result: ImportSubResult;
  try {
    switch (job.entityType) {
      case SmartImportEntityType.CUSTOMERS:
        result = await importCustomers(tenantId, rows, mapping);
        break;
      case SmartImportEntityType.PRODUCTS:
        result = await importProducts(tenantId, rows, mapping);
        break;
      case SmartImportEntityType.EMPLOYEES:
        result = await importEmployees(tenantId, rows, mapping);
        break;
      case SmartImportEntityType.VENDORS:
        result = await importVendors(tenantId, rows, mapping);
        break;
      case SmartImportEntityType.CHART_OF_ACCOUNTS:
        result = await importAccounts(tenantId, rows, mapping);
        break;
      default:
        result = { imported: 0, failed: rows.length, errors: [{ row: 0, field: 'entityType', message: `Entity type "${job.entityType}" import not yet implemented` }] };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.smartImportJob.update({
      where: { id: jobId },
      data: {
        status: SmartImportStatus.FAILED,
        errorLog: `Import error: ${msg}`,
        completedAt: new Date(),
      },
    });
    return;
  }

  const finalStatus =
    result.failed === 0
      ? SmartImportStatus.COMPLETED
      : result.imported === 0
        ? SmartImportStatus.FAILED
        : SmartImportStatus.PARTIAL;

  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: {
      status: finalStatus,
      importedRows: result.imported,
      failedRows: result.failed,
      validationErrors: result.errors as any,
      resultSummary: {
        imported: result.imported,
        failed: result.failed,
        total: rows.length,
      } as any,
      completedAt: new Date(),
    },
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listImportJobs(
  tenantId: string,
  filters: ListSmartJobsFilters = {},
) {
  const { entityType, status, sourceType, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    tenantId,
    ...(entityType  ? { entityType }  : {}),
    ...(status      ? { status }      : {}),
    ...(sourceType  ? { sourceType }  : {}),
  };

  const [items, total] = await Promise.all([
    prisma.smartImportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id:               true,
        tenantId:         true,
        name:             true,
        sourceType:       true,
        entityType:       true,
        status:           true,
        originalFilename: true,
        totalRows:        true,
        importedRows:     true,
        failedRows:       true,
        skippedRows:      true,
        createdBy:        true,
        createdAt:        true,
        completedAt:      true,
      },
    }),
    prisma.smartImportJob.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function getImportJob(tenantId: string, jobId: string) {
  const job = await prisma.smartImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) {
    throw new Error('Smart import job not found');
  }
  return job;
}

export async function createImportJob(
  tenantId: string,
  userId: string,
  data: CreateSmartImportJobData,
) {
  return prisma.smartImportJob.create({
    data: {
      tenantId,
      name:             data.name,
      sourceType:       data.sourceType,
      entityType:       data.entityType,
      rawData:          data.rawData,
      originalFilename: data.originalFilename,
      status:           SmartImportStatus.PENDING,
      createdBy:        userId,
    },
  });
}

export async function deleteImportJob(tenantId: string, jobId: string): Promise<void> {
  const job = await prisma.smartImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) {
    throw new Error('Smart import job not found');
  }
  await prisma.smartImportJob.delete({ where: { id: jobId } });
}

export async function retryImportJob(
  tenantId: string,
  jobId: string,
  userId: string,
): Promise<void> {
  const job = await prisma.smartImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) {
    throw new Error('Smart import job not found');
  }

  // Reset to PENDING
  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: {
      status:           SmartImportStatus.PENDING,
      importedRows:     0,
      failedRows:       0,
      skippedRows:      0,
      validationErrors: Prisma.DbNull,
      errorLog:         null,
      completedAt:      null,
      resultSummary:    Prisma.DbNull,
    },
  });

  await executeImport(jobId, tenantId, userId);
}

// ─── Analyze Job (parse + AI suggestion) ─────────────────────────────────────

export async function analyzeImportJob(
  tenantId: string,
  jobId: string,
): Promise<{ headers: string[]; sampleRows: any[]; aiSuggestions: AiFieldMapping }> {
  const job = await getImportJob(tenantId, jobId);
  if (!job.rawData) throw new Error('No raw data available for analysis');

  // Update status to ANALYZING
  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: { status: SmartImportStatus.ANALYZING },
  });

  let headers: string[] = [];
  let rows: any[] = [];

  try {
    switch (job.sourceType) {
      case SmartImportSourceType.PRIORITY:
        rows = parsePriorityFile(job.rawData, job.entityType);
        headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        break;
      case SmartImportSourceType.HASHAVSHEVET:
        rows = parseHashavshevetFile(job.rawData, job.entityType);
        headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        break;
      case SmartImportSourceType.SAP:
        rows = parseSapFile(job.rawData, job.entityType);
        headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        break;
      case SmartImportSourceType.EXCEL:
        {
          const parsed = parseGenericExcel(job.rawData);
          const sheet = parsed.sheets[0];
          headers = sheet?.headers ?? [];
          rows = sheet?.rows ?? [];
        }
        break;
      case SmartImportSourceType.JSON:
        rows = parseGenericJSON(job.rawData);
        headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        break;
      case SmartImportSourceType.CSV:
      case SmartImportSourceType.MANUAL:
      default:
        {
          const parsed = parseGenericCSV(job.rawData);
          headers = parsed.headers;
          rows = parsed.rows;
        }
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.smartImportJob.update({
      where: { id: jobId },
      data: { status: SmartImportStatus.FAILED, errorLog: `Parse error: ${msg}` },
    });
    throw err;
  }

  const sampleRows = rows.slice(0, 3);
  const aiSuggestions = await suggestFieldMapping(headers, job.entityType, sampleRows);

  // Store AI suggestions and update total rows
  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: {
      aiSuggestions: aiSuggestions as any,
      totalRows: rows.length,
      status: SmartImportStatus.PENDING, // back to PENDING, waiting for user to confirm mapping
    },
  });

  return { headers, sampleRows, aiSuggestions };
}

export async function confirmMapping(
  tenantId: string,
  jobId: string,
  fieldMapping: Record<string, string>,
): Promise<void> {
  const job = await getImportJob(tenantId, jobId);
  if (!job) throw new Error('Smart import job not found');

  await prisma.smartImportJob.update({
    where: { id: jobId },
    data: {
      fieldMapping: fieldMapping as any,
      status: SmartImportStatus.MAPPED,
    },
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function getTemplate(
  entityType: SmartImportEntityType,
  sourceType: SmartImportSourceType,
): string {
  const delim = sourceType === SmartImportSourceType.PRIORITY ? ';' : ',';

  switch (entityType) {
    case SmartImportEntityType.CUSTOMERS:
      if (sourceType === SmartImportSourceType.HASHAVSHEVET) {
        return ['מספר לקוח,שם לקוח,ח.פ./ת.ז.,טלפון,כתובת,עיר,מיקוד,מייל,יתרה',
          '"1001","חברת לדוגמה","516789123","050-1234567","רחוב הרצל 1","תל אביב","6100000","info@example.co.il","0"'].join('\n');
      }
      if (sourceType === SmartImportSourceType.PRIORITY) {
        return ['CUSTNAME;CUSTDES;EMAIL;PHONE;ADDRESS;CITY;ZIP;TAXCODE',
          'C001;חברת לדוגמה;info@example.co.il;050-1234567;רחוב הרצל 1;תל אביב;6100000;516789123'].join('\n');
      }
      return ['name,email,phone,address,city,zip,taxId,notes,creditLimit',
        '"חברת לדוגמה","info@example.co.il","050-1234567","רחוב הרצל 1","תל אביב","6100000","516789123","","10000"'].join('\n');

    case SmartImportEntityType.PRODUCTS:
      if (sourceType === SmartImportSourceType.PRIORITY) {
        return ['PARTNAME;PARTDES;UNIT;UOMCODE;COST;PRICE;MINPRICE',
          'P001;מוצר לדוגמה;1;יחידה;50;99.90;49'].join('\n');
      }
      return [`name${delim}code${delim}description${delim}unit${delim}price${delim}cost${delim}taxRate${delim}barcode${delim}category`,
        `"מוצר לדוגמה"${delim}"P001"${delim}"תיאור מוצר"${delim}"יחידה"${delim}"99.90"${delim}"50.00"${delim}"0.18"${delim}""${delim}"כללי"`].join('\n');

    case SmartImportEntityType.EMPLOYEES:
      return [`firstName${delim}lastName${delim}idNumber${delim}email${delim}phone${delim}startDate${delim}salary${delim}department${delim}role`,
        `"דוד"${delim}"כהן"${delim}"123456789"${delim}"d.cohen@company.co.il"${delim}"050-1111111"${delim}"01/01/2026"${delim}"15000"${delim}"הנדסה"${delim}"מפתח"`].join('\n');

    case SmartImportEntityType.VENDORS:
      return [`name${delim}email${delim}phone${delim}address${delim}taxId${delim}paymentTerms${delim}bankAccount`,
        `"ספק לדוגמה"${delim}"supply@vendor.co.il"${delim}"03-1234567"${delim}"ירושלים"${delim}"123456780"${delim}"שוטף+30"${delim}"987654"`].join('\n');

    case SmartImportEntityType.CHART_OF_ACCOUNTS:
      if (sourceType === SmartImportSourceType.HASHAVSHEVET) {
        return ['חשבון,שם חשבון,צד,יתרה,מטבע',
          '"1100","קופה רושמת","נכסים","0","ILS"',
          '"2100","ספקים","התחייבויות","0","ILS"'].join('\n');
      }
      return [`code${delim}name${delim}type${delim}parentCode${delim}currency`,
        `"1100"${delim}"קופה רושמת"${delim}"ASSET"${delim}"1000"${delim}"ILS"`,
        `"2100"${delim}"ספקים"${delim}"LIABILITY"${delim}"2000"${delim}"ILS"`].join('\n');

    default:
      return `# Template not available for entity type: ${entityType}`;
  }
}
