import { ImportEntityType, ImportJobStatus } from '@prisma/client';
import { prisma } from '../../config/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  jobId: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors: ImportError[];
}

export interface ListJobsFilters {
  entityType?: ImportEntityType;
  status?: ImportJobStatus;
  page?: number;
  limit?: number;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse CSV content into an array of row objects keyed by the header row.
 * Handles:
 *  - Quoted fields (commas and newlines inside double-quotes)
 *  - Trimming of whitespace from keys and values
 *  - Skipping of blank rows
 */
function parseCSV(content: string): Array<Record<string, string>> {
  // Normalise line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into raw lines while respecting quoted fields that may span lines.
  // We tokenise the whole file character-by-character to handle multi-line quotes
  // but in practice ERP CSVs rarely have multi-line values — so we do a simpler
  // but robust field-level tokeniser on each line.

  const lines: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      // Check escaped quote: ""
      if (inQuote && normalized[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === '\n' && !inQuote) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }

  if (lines.length === 0) return [];

  // Helper: split a single CSV line into fields
  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  // First non-empty line is the header row
  const headerLine = lines[0];
  if (!headerLine || headerLine.trim() === '') return [];

  const headers = splitLine(headerLine).map(h => h.trim());

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const values = splitLine(line);
    // Skip rows that are entirely empty
    if (values.every(v => v === '')) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').trim();
    }
    rows.push(row);
  }

  return rows;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Parse a date string in DD/MM/YYYY or YYYY-MM-DD format.
 * Returns a Date on success, null on failure.
 */
function parseDate(value: string): Date | null {
  if (!value) return null;
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;

  let match = value.match(ddmmyyyy);
  if (match) {
    const d = new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  match = value.match(yyyymmdd);
  if (match) {
    const d = new Date(`${value}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parsePositiveNumber(value: string): number | null {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

function parseNonNegativeNumber(value: string): number | null {
  const n = parseFloat(value);
  if (isNaN(n) || n < 0) return null;
  return n;
}

// ─── Job helpers ──────────────────────────────────────────────────────────────

async function createJob(
  tenantId: string,
  entityType: ImportEntityType,
  totalRows: number,
  createdBy?: string,
): Promise<string> {
  const job = await prisma.bulkImportJob.create({
    data: {
      tenantId,
      entityType,
      status: ImportJobStatus.PROCESSING,
      totalRows,
      processedRows: 0,
      successRows: 0,
      errorRows: 0,
      errors: [],
      createdBy: createdBy ?? null,
    },
  });
  return job.id;
}

async function finaliseJob(
  jobId: string,
  successRows: number,
  errors: ImportError[],
  totalRows: number,
): Promise<void> {
  const errorRows = errors.length;
  const status = successRows === 0 ? ImportJobStatus.FAILED : ImportJobStatus.COMPLETED;
  await prisma.bulkImportJob.update({
    where: { id: jobId },
    data: {
      status,
      processedRows: totalRows,
      successRows,
      errorRows,
      errors: errors as unknown as object[],
      completedAt: new Date(),
    },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List import jobs for a tenant with optional filtering and pagination.
 */
export async function listImportJobs(
  tenantId: string,
  filters: ListJobsFilters = {},
) {
  const { entityType, status, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    ...(entityType ? { entityType } : {}),
    ...(status     ? { status }     : {}),
  };

  const [items, total] = await Promise.all([
    prisma.bulkImportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      // Exclude the raw errors array from list view to keep responses light
      select: {
        id: true,
        tenantId: true,
        entityType: true,
        status: true,
        fileName: true,
        totalRows: true,
        processedRows: true,
        successRows: true,
        errorRows: true,
        createdBy: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.bulkImportJob.count({ where }),
  ]);

  return { items, total, page, limit };
}

/**
 * Get a single import job (including errors) with tenant isolation.
 */
export async function getImportJob(id: string, tenantId: string) {
  const job = await prisma.bulkImportJob.findUnique({ where: { id } });
  if (!job || job.tenantId !== tenantId) {
    throw new Error('Import job not found');
  }
  return job;
}

// ─── importCustomers ─────────────────────────────────────────────────────────

/**
 * Import customers from CSV content.
 *
 * Expected columns: name*, email, phone, address, vatNumber,
 *                   creditLimit, paymentTermsDays
 */
export async function importCustomers(
  tenantId: string,
  csvContent: string,
  createdBy?: string,
): Promise<ImportResult> {
  const rows = parseCSV(csvContent);
  const totalRows = rows.length;
  const errors: ImportError[] = [];
  let successRows = 0;

  const jobId = await createJob(tenantId, ImportEntityType.CUSTOMERS, totalRows, createdBy);

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // 1-based + skip header
    const row = rows[i];

    try {
      // ── Required fields ───────────────────────────────────────────
      const name = row['name']?.trim();
      if (!name) {
        errors.push({ row: rowNum, field: 'name', message: 'name is required' });
        continue;
      }

      // ── Optional fields ───────────────────────────────────────────
      const email           = row['email']?.trim()           || undefined;
      const phone           = row['phone']?.trim()           || undefined;
      const address         = row['address']?.trim()         || undefined;
      const vatNumber       = row['vatNumber']?.trim()       || undefined;
      const creditLimitRaw  = row['creditLimit']?.trim()     || '';
      const payTermsRaw     = row['paymentTermsDays']?.trim()|| '';

      if (email && !isValidEmail(email)) {
        errors.push({ row: rowNum, field: 'email', message: `Invalid email format: ${email}` });
        continue;
      }

      let creditLimit: number | null = null;
      if (creditLimitRaw !== '') {
        creditLimit = parseNonNegativeNumber(creditLimitRaw);
        if (creditLimit === null) {
          errors.push({ row: rowNum, field: 'creditLimit', message: 'creditLimit must be a non-negative number' });
          continue;
        }
      }

      let paymentTermsDays: number | null = null;
      if (payTermsRaw !== '') {
        const pt = parseInt(payTermsRaw, 10);
        if (isNaN(pt) || pt < 0) {
          errors.push({ row: rowNum, field: 'paymentTermsDays', message: 'paymentTermsDays must be a non-negative integer' });
          continue;
        }
        paymentTermsDays = pt;
      }

      const addressJson = address ? { raw: address } : undefined;

      // ── Upsert by email (if email provided) ───────────────────────
      if (email) {
        const existing = await prisma.customer.findFirst({
          where: { tenantId, email },
        });
        if (existing) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: {
              name,
              phone: phone ?? existing.phone,
              address: addressJson ?? existing.address ?? undefined,
              ...(vatNumber        ? { businessId: vatNumber }    : {}),
              ...(creditLimit !== null   ? { creditLimit }         : {}),
              ...(paymentTermsDays !== null ? { paymentTermsDays } : {}),
            },
          });
        } else {
          await prisma.customer.create({
            data: {
              tenantId,
              name,
              email,
              phone,
              address: addressJson,
              businessId: vatNumber,
              creditLimit: creditLimit !== null ? creditLimit : undefined,
              paymentTermsDays: paymentTermsDays !== null ? paymentTermsDays : undefined,
              status: 'ACTIVE',
              type: 'B2B',
            },
          });
        }
      } else {
        await prisma.customer.create({
          data: {
            tenantId,
            name,
            phone,
            address: addressJson,
            businessId: vatNumber,
            creditLimit: creditLimit !== null ? creditLimit : undefined,
            paymentTermsDays: paymentTermsDays !== null ? paymentTermsDays : undefined,
            status: 'ACTIVE',
            type: 'B2B',
          },
        });
      }

      successRows++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNum, field: '_db', message: msg });
    }
  }

  await finaliseJob(jobId, successRows, errors, totalRows);

  return { jobId, totalRows, successRows, errorRows: errors.length, errors };
}

// ─── importProducts ───────────────────────────────────────────────────────────

/**
 * Import products from CSV content.
 *
 * Expected columns: name*, sku, description, sellingPrice*,
 *                   costPrice, vatRate, categoryName,
 *                   reorderPoint, unit
 */
export async function importProducts(
  tenantId: string,
  csvContent: string,
  createdBy?: string,
): Promise<ImportResult> {
  const rows = parseCSV(csvContent);
  const totalRows = rows.length;
  const errors: ImportError[] = [];
  let successRows = 0;

  const jobId = await createJob(tenantId, ImportEntityType.PRODUCTS, totalRows, createdBy);

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    try {
      // ── Required fields ───────────────────────────────────────────
      const name = row['name']?.trim();
      if (!name) {
        errors.push({ row: rowNum, field: 'name', message: 'name is required' });
        continue;
      }

      const sellingPriceRaw = row['sellingPrice']?.trim() || '';
      if (!sellingPriceRaw) {
        errors.push({ row: rowNum, field: 'sellingPrice', message: 'sellingPrice is required' });
        continue;
      }
      const sellingPrice = parsePositiveNumber(sellingPriceRaw);
      if (sellingPrice === null) {
        errors.push({ row: rowNum, field: 'sellingPrice', message: 'sellingPrice must be a positive number' });
        continue;
      }

      // ── Optional fields ───────────────────────────────────────────
      const sku          = row['sku']?.trim()          || undefined;
      const description  = row['description']?.trim()  || undefined;
      const costPriceRaw = row['costPrice']?.trim()    || '';
      const vatRateRaw   = row['vatRate']?.trim()      || '';
      const categoryName = row['categoryName']?.trim() || undefined;
      const reorderRaw   = row['reorderPoint']?.trim() || '';
      const unit         = row['unit']?.trim()         || undefined;

      let costPrice = 0;
      if (costPriceRaw !== '') {
        const cp = parseNonNegativeNumber(costPriceRaw);
        if (cp === null) {
          errors.push({ row: rowNum, field: 'costPrice', message: 'costPrice must be a non-negative number' });
          continue;
        }
        costPrice = cp;
      }

      let vatRate = 0.18;
      if (vatRateRaw !== '') {
        const vr = parseFloat(vatRateRaw);
        if (isNaN(vr) || vr < 0 || vr > 1) {
          errors.push({ row: rowNum, field: 'vatRate', message: 'vatRate must be a decimal between 0 and 1 (e.g. 0.18)' });
          continue;
        }
        vatRate = vr;
      }

      let reorderPoint: number | undefined;
      if (reorderRaw !== '') {
        const rp = parseNonNegativeNumber(reorderRaw);
        if (rp === null) {
          errors.push({ row: rowNum, field: 'reorderPoint', message: 'reorderPoint must be a non-negative number' });
          continue;
        }
        reorderPoint = rp;
      }

      // ── Find or create category ───────────────────────────────────
      let categoryId: string | undefined;
      if (categoryName) {
        const cat = await prisma.productCategory.upsert({
          where: { tenantId_name: { tenantId, name: categoryName } },
          update: {},
          create: { tenantId, name: categoryName },
        });
        categoryId = cat.id;
      }

      // ── Generate a SKU if not provided ────────────────────────────
      // Use a simple slug from the product name to guarantee the NOT NULL constraint.
      const effectiveSku = sku || `SKU-${name.replace(/\s+/g, '-').toUpperCase().substring(0, 30)}-${Date.now()}`;

      // ── Upsert by SKU (if SKU was explicitly provided) ─────────────
      if (sku) {
        const existing = await prisma.product.findUnique({
          where: { tenantId_sku: { tenantId, sku } },
        });
        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              name,
              description,
              sellingPrice,
              costPrice,
              vatRate,
              categoryId,
              unitOfMeasure: unit ?? existing.unitOfMeasure,
            },
          });
        } else {
          await prisma.product.create({
            data: {
              tenantId,
              sku,
              name,
              description,
              sellingPrice,
              costPrice,
              vatRate,
              categoryId,
              unitOfMeasure: unit ?? 'יחידה',
            },
          });
        }
      } else {
        await prisma.product.create({
          data: {
            tenantId,
            sku: effectiveSku,
            name,
            description,
            sellingPrice,
            costPrice,
            vatRate,
            categoryId,
            unitOfMeasure: unit ?? 'יחידה',
          },
        });
      }

      successRows++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNum, field: '_db', message: msg });
    }
  }

  await finaliseJob(jobId, successRows, errors, totalRows);

  return { jobId, totalRows, successRows, errorRows: errors.length, errors };
}

// ─── importEmployees ──────────────────────────────────────────────────────────

/**
 * Import employees from CSV content.
 *
 * Expected columns: firstName*, lastName*, email*, phone, idNumber,
 *                   department, jobTitle, startDate, baseSalary,
 *                   bankAccount, bankBranch
 *
 * Upsert order: by idNumber (if provided) → by email
 * Date format : DD/MM/YYYY or YYYY-MM-DD
 */
export async function importEmployees(
  tenantId: string,
  csvContent: string,
  createdBy?: string,
): Promise<ImportResult> {
  const rows = parseCSV(csvContent);
  const totalRows = rows.length;
  const errors: ImportError[] = [];
  let successRows = 0;

  const jobId = await createJob(tenantId, ImportEntityType.EMPLOYEES, totalRows, createdBy);

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    try {
      // ── Required fields ───────────────────────────────────────────
      const firstName = row['firstName']?.trim();
      if (!firstName) {
        errors.push({ row: rowNum, field: 'firstName', message: 'firstName is required' });
        continue;
      }

      const lastName = row['lastName']?.trim();
      if (!lastName) {
        errors.push({ row: rowNum, field: 'lastName', message: 'lastName is required' });
        continue;
      }

      const email = row['email']?.trim();
      if (!email) {
        errors.push({ row: rowNum, field: 'email', message: 'email is required' });
        continue;
      }
      if (!isValidEmail(email)) {
        errors.push({ row: rowNum, field: 'email', message: `Invalid email format: ${email}` });
        continue;
      }

      // ── Optional fields ───────────────────────────────────────────
      const phone        = row['phone']?.trim()       || undefined;
      const idNumber     = row['idNumber']?.trim()    || undefined;
      const department   = row['department']?.trim()  || 'General';
      const jobTitle     = row['jobTitle']?.trim()    || 'Employee';
      const startDateRaw = row['startDate']?.trim()   || '';
      const salaryRaw    = row['baseSalary']?.trim()  || '';
      const bankAccount  = row['bankAccount']?.trim() || undefined;
      const bankBranch   = row['bankBranch']?.trim()  || undefined;

      // startDate — default to today if missing
      let startDate: Date;
      if (startDateRaw) {
        const parsed = parseDate(startDateRaw);
        if (!parsed) {
          errors.push({ row: rowNum, field: 'startDate', message: `Invalid date format "${startDateRaw}". Use DD/MM/YYYY or YYYY-MM-DD` });
          continue;
        }
        startDate = parsed;
      } else {
        startDate = new Date();
      }

      // baseSalary
      let grossSalary = 0;
      if (salaryRaw) {
        const s = parsePositiveNumber(salaryRaw);
        if (s === null) {
          errors.push({ row: rowNum, field: 'baseSalary', message: 'baseSalary must be a positive number' });
          continue;
        }
        grossSalary = s;
      }

      const bankAccountJson =
        bankAccount || bankBranch
          ? { accountNumber: bankAccount ?? '', branch: bankBranch ?? '' }
          : undefined;

      // ── Upsert logic ──────────────────────────────────────────────
      // 1. By idNumber
      if (idNumber) {
        const byId = await prisma.employee.findUnique({
          where: { tenantId_idNumber: { tenantId, idNumber } },
        });
        if (byId) {
          await prisma.employee.update({
            where: { id: byId.id },
            data: {
              firstName,
              lastName,
              personalEmail: email,
              phone: phone ?? byId.phone,
              department,
              jobTitle,
              startDate,
              ...(grossSalary > 0 ? { grossSalary } : {}),
              ...(bankAccountJson ? { bankAccount: bankAccountJson } : {}),
            },
          });
          successRows++;
          continue;
        }
      }

      // 2. By email
      const byEmail = await prisma.employee.findFirst({
        where: { tenantId, personalEmail: email },
      });
      if (byEmail) {
        await prisma.employee.update({
          where: { id: byEmail.id },
          data: {
            firstName,
            lastName,
            phone: phone ?? byEmail.phone,
            ...(idNumber    ? { idNumber }                  : {}),
            department,
            jobTitle,
            startDate,
            ...(grossSalary > 0 ? { grossSalary } : {}),
            ...(bankAccountJson ? { bankAccount: bankAccountJson } : {}),
          },
        });
        successRows++;
        continue;
      }

      // 3. Create new — Employee model has several NOT NULL fields
      if (!idNumber) {
        errors.push({ row: rowNum, field: 'idNumber', message: 'idNumber is required to create a new employee' });
        continue;
      }
      if (grossSalary === 0) {
        errors.push({ row: rowNum, field: 'baseSalary', message: 'baseSalary is required to create a new employee' });
        continue;
      }

      await prisma.employee.create({
        data: {
          tenantId,
          firstName,
          lastName,
          idNumber,
          personalEmail: email,
          phone: phone ?? '',
          department,
          jobTitle,
          startDate,
          grossSalary,
          gender: 'M', // default — can be updated later
          birthDate: new Date('1990-01-01'), // placeholder
          address: {},
          ...(bankAccountJson ? { bankAccount: bankAccountJson } : {}),
        },
      });
      successRows++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNum, field: '_db', message: msg });
    }
  }

  await finaliseJob(jobId, successRows, errors, totalRows);

  return { jobId, totalRows, successRows, errorRows: errors.length, errors };
}

// ─── importVendors ────────────────────────────────────────────────────────────

/**
 * Import vendors from CSV content.
 *
 * Expected columns: name*, email, phone, address, vatNumber,
 *                   bankAccountNumber, bankName, bankBranch
 *
 * Upsert by vatNumber if provided.
 */
export async function importVendors(
  tenantId: string,
  csvContent: string,
  createdBy?: string,
): Promise<ImportResult> {
  const rows = parseCSV(csvContent);
  const totalRows = rows.length;
  const errors: ImportError[] = [];
  let successRows = 0;

  const jobId = await createJob(tenantId, ImportEntityType.VENDORS, totalRows, createdBy);

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    try {
      // ── Required fields ───────────────────────────────────────────
      const name = row['name']?.trim();
      if (!name) {
        errors.push({ row: rowNum, field: 'name', message: 'name is required' });
        continue;
      }

      // ── Optional fields ───────────────────────────────────────────
      const email             = row['email']?.trim()             || undefined;
      const phone             = row['phone']?.trim()             || undefined;
      const address           = row['address']?.trim()           || undefined;
      const vatNumber         = row['vatNumber']?.trim()         || undefined;
      const bankAccountNumber = row['bankAccountNumber']?.trim() || undefined;
      const bankName          = row['bankName']?.trim()          || undefined;
      const bankBranch        = row['bankBranch']?.trim()        || undefined;

      if (email && !isValidEmail(email)) {
        errors.push({ row: rowNum, field: 'email', message: `Invalid email format: ${email}` });
        continue;
      }

      const addressJson = address ? { raw: address } : undefined;

      const data = {
        name,
        email,
        phone,
        address: addressJson,
        vatNumber,
        bankAccountNumber,
        bankName,
        bankBranch,
      };

      // ── Upsert by vatNumber if provided ───────────────────────────
      if (vatNumber) {
        const existing = await prisma.vendor.findFirst({
          where: { tenantId, vatNumber },
        });
        if (existing) {
          await prisma.vendor.update({
            where: { id: existing.id },
            data: {
              name,
              ...(email             ? { email }             : {}),
              ...(phone             ? { phone }             : {}),
              ...(addressJson       ? { address: addressJson } : {}),
              ...(bankAccountNumber ? { bankAccountNumber } : {}),
              ...(bankName          ? { bankName }          : {}),
              ...(bankBranch        ? { bankBranch }        : {}),
            },
          });
        } else {
          await prisma.vendor.create({ data: { tenantId, ...data } });
        }
      } else {
        await prisma.vendor.create({ data: { tenantId, ...data } });
      }

      successRows++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNum, field: '_db', message: msg });
    }
  }

  await finaliseJob(jobId, successRows, errors, totalRows);

  return { jobId, totalRows, successRows, errorRows: errors.length, errors };
}

// ─── getImportTemplate ────────────────────────────────────────────────────────

/**
 * Returns a sample CSV string (header + 2 example rows) for the given entity type.
 */
export function getImportTemplate(entityType: string): string {
  switch (entityType.toUpperCase()) {
    case 'CUSTOMERS':
      return [
        'name,email,phone,address,vatNumber,creditLimit,paymentTermsDays',
        '"ACME Corp","acme@example.com","050-1234567","Tel Aviv","516789123","10000","30"',
        '"Beta Ltd","beta@example.com","052-9876543","Haifa","","5000","60"',
      ].join('\n');

    case 'PRODUCTS':
      return [
        'name,sku,description,sellingPrice,costPrice,vatRate,categoryName,reorderPoint,unit',
        '"Widget A","WGT-001","Blue widget","49.90","25.00","0.18","Widgets","10","יחידה"',
        '"Service B","SRV-001","Consulting hour","350.00","0","0.18","Services","","שעה"',
      ].join('\n');

    case 'EMPLOYEES':
      return [
        'firstName,lastName,email,phone,idNumber,department,jobTitle,startDate,baseSalary,bankAccount,bankBranch',
        '"David","Cohen","d.cohen@company.co.il","050-1111111","123456789","Engineering","Developer","01/01/2026","15000","123456","12"',
        '"Sarah","Levi","s.levi@company.co.il","052-2222222","987654321","HR","HR Manager","15/02/2026","18000","654321","34"',
      ].join('\n');

    case 'VENDORS':
      return [
        'name,email,phone,address,vatNumber,bankAccountNumber,bankName,bankBranch',
        '"Supply Co","supply@vendor.co.il","03-1234567","Jerusalem","123456780","987654","Bank Hapoalim","12"',
        '"Tech Parts Ltd","tech@parts.co.il","03-9876543","Ramat Gan","","","","" ',
      ].join('\n');

    default:
      throw new Error(`Unknown entity type: ${entityType}. Supported: CUSTOMERS, PRODUCTS, EMPLOYEES, VENDORS`);
  }
}
