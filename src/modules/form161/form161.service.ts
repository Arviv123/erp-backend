/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║       FORM 161 SERVICE — Termination + Severance Tax (2026)     ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Laws implemented:                                              ║
 * ║  • סעיף 9(7א) לפקודת מס הכנסה — פטור פיצויי פיטורים           ║
 * ║  • תקנות מס הכנסה (פטור מהגשת דו"ח) — טופס 161                 ║
 * ║  • חוק פיצויי פיטורים, תשכ"ג-1963                              ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Constants (2026):                                              ║
 * ║  • תקרת פטור לשנת עבודה: 12,760 ₪                              ║
 * ║  • מקסימום שנות ותק לחישוב הפטור: 32 שנה                       ║
 * ║  • פטור מקסימלי: 408,320 ₪ (32 × 12,760)                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import PDFDocument from 'pdfkit';
import { prisma } from '../../config/database';

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — 2026 CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** תקרת פטור ממס לפיצויים לכל שנת עבודה — 2026 */
const SEVERANCE_EXEMPT_PER_YEAR = 12_760; // ₪

/** מקסימום שנות ותק שנספרות לחישוב הפטור */
const SEVERANCE_MAX_EXEMPT_YEARS = 32;

/** מדרגות מס הכנסה חודשיות 2026 (לחישוב שיעור על שווה ערך שנתי / חודשי) */
const TAX_BRACKETS_2026 = [
  { min: 0,      max: 7_180,  rate: 0.10 },
  { min: 7_180,  max: 10_290, rate: 0.14 },
  { min: 10_290, max: 16_530, rate: 0.20 },
  { min: 16_530, max: 22_970, rate: 0.31 },
  { min: 22_970, max: 47_720, rate: 0.35 },
  { min: 47_720, max: null,   rate: 0.47 },
];

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════════

export interface Form161Calculation {
  yearsOfService:     number;   // שנות ותק
  lastSalary:         number;   // משכורת אחרונה חודשית
  totalSeverance:     number;   // סך פיצויים (עובד + פנסיה)
  maxExemptPerYear:   number;   // תקרת פטור לשנה (12,760 ₪)
  maxExemptTotal:     number;   // פטור מקסימלי = min(שנות,32) × 12,760
  taxExempt:          number;   // פטור בפועל = min(סך פיצויים, מקסימום פטור)
  taxableAmount:      number;   // סכום חייב במס
  taxRate:            number;   // שיעור מס (מדרגה מתאימה)
  taxAmount:          number;   // מס לתשלום
  netSeverance:       number;   // נטו אחרי מס
}

/**
 * חישוב מס על פיצויים לפי סעיף 9(7א) לפקודת מס הכנסה.
 *
 * שיטת חישוב שיעור המס:
 *   מחלקים את הסכום החייב במספר שנות הוותק כדי לקבל שווה ערך שנתי,
 *   מחפשים את המדרגה המתאימה ומחילים את שיעורה על כל הסכום החייב.
 *   (שיטת "ממוצע שנתי" — מקובלת ברשות המסים לחישוב פיצויים.)
 */
export function calculateForm161(data: {
  yearsOfService:   number;
  lastSalary:       number;
  severancePay:     number;
  pensionSeverance: number;
}): Form161Calculation {
  const { yearsOfService, lastSalary, severancePay, pensionSeverance } = data;

  const years = Math.max(yearsOfService, 0);

  // סך פיצויים = פיצויי פיטורים + פיצויים מקרן פנסיה
  const totalSeverance = round2(severancePay + pensionSeverance);

  // פטור מקסימלי = min(שנות ותק, 32) × 12,760
  const exemptYears    = Math.min(years, SEVERANCE_MAX_EXEMPT_YEARS);
  const maxExemptTotal = round2(exemptYears * SEVERANCE_EXEMPT_PER_YEAR);

  // פטור בפועל = min(סך פיצויים, פטור מקסימלי)
  const taxExempt = round2(Math.min(totalSeverance, maxExemptTotal));

  // סכום חייב במס
  const taxableAmount = round2(Math.max(totalSeverance - taxExempt, 0));

  // חישוב שיעור מס: מחלקים את הסכום החייב בשנות הוותק → שווה-ערך שנתי
  // (אם אין שנות ותק, משתמשים ב-1 כדי להימנע מחלוקה באפס)
  let taxRate = 0;
  if (taxableAmount > 0) {
    const annualEquivalent = taxableAmount / Math.max(years, 1);
    taxRate = getTaxRate(annualEquivalent);
  }

  const taxAmount   = round2(taxableAmount * taxRate);
  const netSeverance = round2(totalSeverance - taxAmount);

  return {
    yearsOfService:   round2(years),
    lastSalary:       round2(lastSalary),
    totalSeverance,
    maxExemptPerYear: SEVERANCE_EXEMPT_PER_YEAR,
    maxExemptTotal,
    taxExempt,
    taxableAmount,
    taxRate,
    taxAmount,
    netSeverance,
  };
}

/**
 * מחזיר את שיעור מס ההכנסה החל על הסכום לפי מדרגות 2026.
 * (שיעור שולי — המדרגה בה נופל הסכום)
 */
function getTaxRate(amount: number): number {
  for (const bracket of TAX_BRACKETS_2026) {
    if (bracket.max === null || amount <= bracket.max) {
      return bracket.rate;
    }
  }
  return 0.47; // ברירת מחדל: מדרגה עליונה
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════

// ─── List Form 161s ───────────────────────────────────────────────
export async function listForm161s(
  tenantId: string,
  filters?: {
    employeeId?: string;
    status?:     string;
    page?:       number;
    limit?:      number;
  }
) {
  const page  = Math.max((filters?.page  ?? 1), 1);
  const limit = Math.min((filters?.limit ?? 20), 100);
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = { tenantId };
  if (filters?.employeeId) where.employeeId = filters.employeeId;
  if (filters?.status)     where.status     = filters.status;

  const [items, total] = await Promise.all([
    prisma.form161.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true,
            idNumber: true, department: true, jobTitle: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.form161.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

// ─── Get single Form 161 ──────────────────────────────────────────
export async function getForm161(id: string, tenantId: string) {
  const form = await prisma.form161.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true,
          idNumber: true, department: true, jobTitle: true,
          startDate: true, endDate: true, grossSalary: true,
          phone: true, personalEmail: true, address: true,
        },
      },
      tenant: {
        select: { id: true, name: true, businessNumber: true, vatNumber: true, address: true, phone: true },
      },
    },
  });

  if (!form) throw new Error('Form 161 not found');
  return form;
}

// ─── Create Form 161 ──────────────────────────────────────────────
export async function createForm161(
  tenantId: string,
  data: {
    employeeId:       string;
    terminationDate:  string | Date;
    severancePay:     number;
    pensionSeverance?: number;
    notes?:           string;
  }
) {
  // 1. שליפת נתוני עובד
  const employee = await prisma.employee.findFirst({
    where: { id: data.employeeId, tenantId },
  });
  if (!employee) throw new Error('Employee not found');

  // 2. חישוב שנות ותק
  const terminationDate = new Date(data.terminationDate);
  const startDate       = new Date(employee.startDate);
  const msPerDay        = 24 * 3600 * 1000;
  const daysDiff        = (terminationDate.getTime() - startDate.getTime()) / msPerDay;
  const yearsOfService  = round2(daysDiff / 365);

  const lastSalary      = Number(employee.grossSalary);
  const pensionSev      = data.pensionSeverance ?? 0;

  // 3. חישוב מס
  const calc = calculateForm161({
    yearsOfService,
    lastSalary,
    severancePay:     data.severancePay,
    pensionSeverance: pensionSev,
  });

  // 4. שמירה ב-DB
  const form = await prisma.form161.create({
    data: {
      tenantId,
      employeeId:      data.employeeId,
      status:          'DRAFT',
      terminationDate,
      lastSalary:      calc.lastSalary,
      yearsOfService:  calc.yearsOfService,
      severancePay:    data.severancePay,
      pensionSeverance: pensionSev,
      taxExempt:       calc.taxExempt,
      taxableAmount:   calc.taxableAmount,
      taxRate:         calc.taxRate,
      taxAmount:       calc.taxAmount,
      notes:           data.notes,
    },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true,
          idNumber: true, department: true, jobTitle: true,
        },
      },
    },
  });

  return { form, calculation: calc };
}

// ─── Update Form 161 (DRAFT only) ─────────────────────────────────
export async function updateForm161(
  id: string,
  tenantId: string,
  data: {
    terminationDate?:  string | Date;
    severancePay?:     number;
    pensionSeverance?: number;
    notes?:            string;
  }
) {
  const existing = await prisma.form161.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('Form 161 not found');
  if (existing.status !== 'DRAFT') throw new Error('Only DRAFT forms can be updated');

  // שליפת עובד לחישוב מחדש
  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, tenantId },
  });
  if (!employee) throw new Error('Employee not found');

  const terminationDate = data.terminationDate
    ? new Date(data.terminationDate)
    : new Date(existing.terminationDate);

  const startDate      = new Date(employee.startDate);
  const msPerDay       = 24 * 3600 * 1000;
  const daysDiff       = (terminationDate.getTime() - startDate.getTime()) / msPerDay;
  const yearsOfService = round2(daysDiff / 365);

  const severancePay    = data.severancePay    ?? Number(existing.severancePay);
  const pensionSeverance = data.pensionSeverance ?? Number(existing.pensionSeverance);
  const lastSalary       = Number(employee.grossSalary);

  const calc = calculateForm161({ yearsOfService, lastSalary, severancePay, pensionSeverance });

  const updated = await prisma.form161.update({
    where: { id },
    data: {
      terminationDate,
      severancePay,
      pensionSeverance,
      lastSalary:    calc.lastSalary,
      yearsOfService: calc.yearsOfService,
      taxExempt:     calc.taxExempt,
      taxableAmount: calc.taxableAmount,
      taxRate:       calc.taxRate,
      taxAmount:     calc.taxAmount,
      notes:         data.notes !== undefined ? data.notes : existing.notes,
    },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true,
          idNumber: true, department: true, jobTitle: true,
        },
      },
    },
  });

  return { form: updated, calculation: calc };
}

// ─── Submit Form 161 ──────────────────────────────────────────────
export async function submitForm161(id: string, tenantId: string) {
  const existing = await prisma.form161.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('Form 161 not found');
  if (existing.status !== 'DRAFT') throw new Error('Only DRAFT forms can be submitted');

  return prisma.form161.update({
    where: { id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
}

// ─── Approve Form 161 ─────────────────────────────────────────────
export async function approveForm161(id: string, tenantId: string) {
  const existing = await prisma.form161.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('Form 161 not found');
  if (existing.status !== 'SUBMITTED') throw new Error('Only SUBMITTED forms can be approved');

  return prisma.form161.update({
    where: { id },
    data: { status: 'APPROVED' },
  });
}

// ─── List Terminating Employees ───────────────────────────────────
/**
 * מחזיר עובדים שתאריך הסיום שלהם נמצא בטווח daysAhead ימים קדימה
 * ואין להם עדיין טופס 161 פתוח.
 */
export async function listTerminatingEmployees(tenantId: string, daysAhead = 30) {
  const now    = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);

  // שליפת עובדים עם endDate בטווח
  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      isActive: true,
      endDate: { gte: now, lte: future },
    },
    select: {
      id: true, firstName: true, lastName: true,
      idNumber: true, department: true, jobTitle: true,
      startDate: true, endDate: true, grossSalary: true,
    },
  });

  // אילו עובדים כבר יש להם טופס 161?
  const existingForms = await prisma.form161.findMany({
    where: {
      tenantId,
      employeeId: { in: employees.map(e => e.id) },
    },
    select: { employeeId: true, status: true },
  });

  const coveredIds = new Set(existingForms.map(f => f.employeeId));

  return employees
    .filter(e => !coveredIds.has(e.id))
    .map(e => ({
      ...e,
      daysUntilTermination: e.endDate
        ? Math.ceil((new Date(e.endDate).getTime() - now.getTime()) / (24 * 3600 * 1000))
        : null,
    }));
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — PDF GENERATOR
// ═══════════════════════════════════════════════════════════════════

function formatNIS(amount: number): string {
  return `${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NIS`;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('he-IL');
}

/**
 * מייצר PDF של טופס 161 — הודעה על פרישה / סיום עבודה.
 * הערה: pdfkit אינו תומך בעברית RTL ב-Unicode באופן ישיר.
 * כותרות בעברית מוצגות באמצעות טרנסליטרציה + טקסט עברי מקוורי.
 */
export async function getForm161PDF(id: string, tenantId: string): Promise<Buffer> {
  const form = await getForm161(id, tenantId);
  const emp    = (form as any).employee;
  const tenant = (form as any).tenant;

  const totalSev       = round2(Number(form.severancePay) + Number(form.pensionSeverance));
  const netSeverance   = round2(totalSev - Number(form.taxAmount));
  const taxRatePct     = round2(Number(form.taxRate) * 100);

  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageWidth    = 595.28;
    const marginL      = 45;
    const marginR      = 45;
    const contentWidth = pageWidth - marginL - marginR;
    const rightX       = pageWidth - marginR;

    // ── helpers ─────────────────────────────────────────────────
    function drawDivider(y: number, color = '#cccccc'): number {
      doc.strokeColor(color).lineWidth(0.5).moveTo(marginL, y).lineTo(rightX, y).stroke();
      return y + 8;
    }

    function drawSectionHeader(label: string, y: number, bg = '#e8f0fe'): number {
      doc.rect(marginL, y, contentWidth, 22).fill(bg);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a365d')
        .text(label, marginL + 8, y + 5, { width: contentWidth - 16 });
      return y + 30;
    }

    function drawRow(label: string, value: string, y: number, bold = false, valueColor = '#1a1a1a'): number {
      doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#4a5568')
        .text(label, marginL, y, { width: contentWidth * 0.60 });
      doc.font('Helvetica-Bold').fillColor(valueColor)
        .text(value, marginL + contentWidth * 0.60, y, { width: contentWidth * 0.40, align: 'right' });
      return y + 18;
    }

    function drawTwoCol(
      lLabel: string, lVal: string,
      rLabel: string, rVal: string,
      y: number
    ): number {
      const col = contentWidth / 2 - 10;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#4a5568')
        .text(lLabel + ':', marginL, y, { width: col });
      doc.font('Helvetica').fillColor('#1a1a1a')
        .text(lVal, marginL + 80, y, { width: col - 80 });
      doc.font('Helvetica-Bold').fillColor('#4a5568')
        .text(rLabel + ':', marginL + col + 20, y, { width: col });
      doc.font('Helvetica').fillColor('#1a1a1a')
        .text(rVal, marginL + col + 100, y, { width: col - 80 });
      return y + 18;
    }

    let y = 45;

    // ── HEADER ──────────────────────────────────────────────────
    doc.rect(marginL, y, contentWidth, 50).fill('#1a365d');
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff')
      .text('TOFES 161  |  טופס 161', marginL + 10, y + 8, { width: contentWidth - 20, align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#bee3f8')
      .text('Hoda\'a al Prisha / Siyum Avoda  |  הודעה על פרישה / סיום עבודה', marginL + 10, y + 28, { width: contentWidth - 20, align: 'center' });
    y += 62;

    // Form meta
    doc.fontSize(9).font('Helvetica').fillColor('#718096')
      .text(`Form ID: ${form.id}  |  Status: ${form.status}  |  Generated: ${new Date().toLocaleDateString('he-IL')}`,
        marginL, y, { width: contentWidth, align: 'right' });
    y += 16;

    y = drawDivider(y, '#2b6cb0');

    // ── EMPLOYER SECTION ────────────────────────────────────────
    y = drawSectionHeader('PIRTEI MAASIK  |  פרטי מעסיק', y, '#ebf4ff');
    y = drawTwoCol('Company / Shm haAsa', tenant?.name ?? '-', 'Business No. / Eosek', tenant?.businessNumber ?? '-', y);
    if (tenant?.vatNumber) {
      y = drawTwoCol('VAT No. / Osek Morasheh', tenant.vatNumber, 'Phone / Telefon', tenant?.phone ?? '-', y);
    }
    const tenantAddr = tenant?.address
      ? `${(tenant.address as any).street ?? ''}, ${(tenant.address as any).city ?? ''}`.replace(/^,\s*/, '').replace(/,\s*$/, '')
      : '-';
    y = drawRow('Address / Ktovet:', tenantAddr, y);
    y += 4;

    // ── EMPLOYEE SECTION ────────────────────────────────────────
    y = drawSectionHeader('PIRTEI OVED  |  פרטי עובד', y, '#f0fff4');
    y = drawTwoCol('Name / Shem', `${emp.firstName} ${emp.lastName}`, 'ID / Teudat Zehut', emp.idNumber, y);
    y = drawTwoCol('Job Title / Tafkid', emp.jobTitle ?? '-', 'Department / Machlaka', emp.department ?? '-', y);
    y = drawTwoCol('Start Date / Tchilat Avoda', formatDate(emp.startDate), 'End Date / Siyum Avoda', formatDate(form.terminationDate), y);
    y += 4;

    // ── CALCULATION TABLE ────────────────────────────────────────
    y = drawSectionHeader('CHISHUVIM  |  חישובים', y, '#fffbeb');

    y = drawRow('Years of Service  |  Shnot Vatek', `${Number(form.yearsOfService).toFixed(2)} years`, y);
    y = drawDivider(y - 4, '#e2e8f0');
    y = drawRow('Last Monthly Salary  |  Miskoret Ahronah', formatNIS(Number(form.lastSalary)), y);
    y = drawDivider(y - 4, '#e2e8f0');
    y = drawRow('Employer Severance Pay  |  Pitzuyei Peturim', formatNIS(Number(form.severancePay)), y);
    y = drawDivider(y - 4, '#e2e8f0');
    if (Number(form.pensionSeverance) > 0) {
      y = drawRow('Pension Fund Severance  |  Pitzuyim miKeren Pension', formatNIS(Number(form.pensionSeverance)), y);
      y = drawDivider(y - 4, '#e2e8f0');
    }
    y = drawRow('Total Severance  |  Sach Pitzuyim', formatNIS(totalSev), y, true);
    y = drawDivider(y - 4, '#e2e8f0');

    y = drawRow(`Exempt Ceiling (${SEVERANCE_MAX_EXEMPT_YEARS} yrs × ${SEVERANCE_EXEMPT_PER_YEAR.toLocaleString()} NIS/yr)  |  Tokeret Pator`,
      formatNIS(round2(Math.min(Number(form.yearsOfService), SEVERANCE_MAX_EXEMPT_YEARS) * SEVERANCE_EXEMPT_PER_YEAR)), y);
    y = drawDivider(y - 4, '#e2e8f0');

    // Tax exempt row — green
    y = drawRow('Tax Exempt Amount  |  Skhum Patur miMas', formatNIS(Number(form.taxExempt)), y, true, '#276749');
    y = drawDivider(y - 4, '#e2e8f0');

    // Taxable row
    y = drawRow('Taxable Amount  |  Skhum Hayav beMas', formatNIS(Number(form.taxableAmount)), y, false, '#c53030');
    y = drawDivider(y - 4, '#e2e8f0');
    y = drawRow('Tax Rate  |  Shu\'ur Mas', `${taxRatePct.toFixed(0)}%`, y, false, '#c53030');
    y = drawDivider(y - 4, '#e2e8f0');
    y = drawRow('Tax Amount  |  Skhum haMas', formatNIS(Number(form.taxAmount)), y, false, '#c53030');
    y += 6;

    // Net box
    doc.rect(marginL, y, contentWidth, 48).fill('#1a365d');
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#bee3f8')
      .text('NET SEVERANCE  |  Neto Pitzuyim', marginL + 10, y + 6, { width: contentWidth - 20 });
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff')
      .text(formatNIS(netSeverance), marginL + 10, y + 22, { width: contentWidth - 20, align: 'right' });
    y += 60;

    // Notes
    if (form.notes) {
      y += 6;
      y = drawSectionHeader('He\'arot  |  הערות', y, '#faf5ff');
      doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a')
        .text(form.notes, marginL, y, { width: contentWidth });
      y += 30;
    }

    // ── SIGNATURE SECTION ────────────────────────────────────────
    y = Math.max(y + 20, 650); // push to bottom area if room
    y = drawDivider(y, '#cccccc');
    y += 10;

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#2d3748')
      .text('Chotamot  |  חתימות', marginL, y, { width: contentWidth, align: 'center' });
    y += 20;

    const sigColW = contentWidth / 2 - 20;
    // Employer signature
    doc.fontSize(9).font('Helvetica').fillColor('#718096')
      .text('Chatimat haMaasik  |  חתימת המעסיק', marginL, y, { width: sigColW });
    doc.strokeColor('#1a1a1a').lineWidth(0.5)
      .moveTo(marginL, y + 30).lineTo(marginL + sigColW, y + 30).stroke();
    doc.fontSize(8).font('Helvetica').fillColor('#a0aec0')
      .text('Shem + Tafkid + Chotem  |  שם, תפקיד, חותמת', marginL, y + 34, { width: sigColW });

    // Employee signature
    const rSigX = marginL + sigColW + 40;
    doc.fontSize(9).font('Helvetica').fillColor('#718096')
      .text('Chatimat haOved  |  חתימת העובד', rSigX, y, { width: sigColW });
    doc.strokeColor('#1a1a1a').lineWidth(0.5)
      .moveTo(rSigX, y + 30).lineTo(rSigX + sigColW, y + 30).stroke();
    doc.fontSize(8).font('Helvetica').fillColor('#a0aec0')
      .text('Shem + Taarich  |  שם ותאריך', rSigX, y + 34, { width: sigColW });

    y += 60;

    // Date fields
    doc.fontSize(9).font('Helvetica').fillColor('#4a5568')
      .text('Date / Taarich: ________________', marginL, y, { width: sigColW });
    doc.text('Date / Taarich: ________________', rSigX, y, { width: sigColW });

    // Footer
    const footerY = 780;
    doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(marginL, footerY).lineTo(rightX, footerY).stroke();
    doc.fontSize(7.5).font('Helvetica').fillColor('#a0aec0')
      .text(
        `Tofes 161 hukhan al yedei: ${tenant?.name ?? ''}  |  Taarich: ${new Date().toLocaleDateString('he-IL')}  |  ID: ${form.id}`,
        marginL, footerY + 6, { width: contentWidth, align: 'center' }
      );

    doc.end();
  });
}
