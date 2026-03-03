/**
 * Database Seed Script — Comprehensive Demo Data
 * Creates a demo tenant with full Israeli business data:
 * - Chart of Accounts, Holidays
 * - 7 Employees + user accounts
 * - 8 Customers + 15 Invoices
 * - 5 Vendors + 6 Bills
 * - 6 Products/Services
 * - Attendance records (Jan–Feb 2026)
 * - 2 Payroll runs (Jan PAID, Feb APPROVED)
 * - Leave types + balances
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Chart of Accounts ────────────────────────────────────────────

type AccountSeed = {
  code: string; name: string; nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentCode?: string;
};

const CHART_OF_ACCOUNTS: AccountSeed[] = [
  // נכסים
  { code: '1000', name: 'נכסים שוטפים',         nameEn: 'Current Assets',             type: 'ASSET' },
  { code: '1100', name: 'קופה ומזומן',           nameEn: 'Cash & Petty Cash',          type: 'ASSET', parentCode: '1000' },
  { code: '1200', name: 'חשבון בנק',             nameEn: 'Bank Account',               type: 'ASSET', parentCode: '1000' },
  { code: '1210', name: 'בנק לאומי',             nameEn: 'Bank Leumi',                 type: 'ASSET', parentCode: '1200' },
  { code: '1220', name: 'בנק הפועלים',           nameEn: 'Bank Hapoalim',              type: 'ASSET', parentCode: '1200' },
  { code: '1300', name: 'לקוחות (חובות)',         nameEn: 'Accounts Receivable',        type: 'ASSET', parentCode: '1000' },
  { code: '1400', name: 'מלאי',                  nameEn: 'Inventory',                  type: 'ASSET', parentCode: '1000' },
  { code: '1500', name: 'מקדמות לספקים',          nameEn: 'Prepaid to Suppliers',       type: 'ASSET', parentCode: '1000' },
  { code: '1600', name: 'מע"מ תשומות',            nameEn: 'VAT Input',                  type: 'ASSET', parentCode: '1000' },
  { code: '2000', name: 'נכסים קבועים',           nameEn: 'Fixed Assets',               type: 'ASSET' },
  { code: '2100', name: 'ציוד',                  nameEn: 'Equipment',                  type: 'ASSET', parentCode: '2000' },
  { code: '2200', name: 'רכבים',                 nameEn: 'Vehicles',                   type: 'ASSET', parentCode: '2000' },
  { code: '2300', name: 'מחשבים ותוכנה',          nameEn: 'IT & Software',              type: 'ASSET', parentCode: '2000' },
  { code: '2900', name: 'פחת נצבר',              nameEn: 'Accumulated Depreciation',   type: 'ASSET', parentCode: '2000' },
  // התחייבויות
  { code: '3000', name: 'התחייבויות שוטפות',      nameEn: 'Current Liabilities',        type: 'LIABILITY' },
  { code: '3100', name: 'ספקים (זכאים)',           nameEn: 'Accounts Payable',           type: 'LIABILITY', parentCode: '3000' },
  { code: '3200', name: 'מע"מ לתשלום',            nameEn: 'VAT Payable',                type: 'LIABILITY', parentCode: '3000' },
  { code: '3300', name: 'ביטוח לאומי לתשלום',     nameEn: 'National Insurance Payable', type: 'LIABILITY', parentCode: '3000' },
  { code: '3400', name: 'ניכוי מס הכנסה מהמקור',  nameEn: 'Income Tax Withheld',        type: 'LIABILITY', parentCode: '3000' },
  { code: '3500', name: 'חובות שכר',              nameEn: 'Accrued Salaries',           type: 'LIABILITY', parentCode: '3000' },
  { code: '3600', name: 'מקדמות מלקוחות',          nameEn: 'Customer Advances',          type: 'LIABILITY', parentCode: '3000' },
  { code: '3700', name: 'פנסיה מעסיק לתשלום',     nameEn: 'Pension Payable',            type: 'LIABILITY', parentCode: '3000' },
  { code: '4000', name: 'התחייבויות לזמן ארוך',   nameEn: 'Long-term Liabilities',      type: 'LIABILITY' },
  { code: '4100', name: 'הלוואות לזמן ארוך',      nameEn: 'Long-term Loans',            type: 'LIABILITY', parentCode: '4000' },
  // הון עצמי
  { code: '5000', name: 'הון עצמי',               nameEn: 'Equity',                     type: 'EQUITY' },
  { code: '5100', name: 'הון מניות',              nameEn: 'Share Capital',              type: 'EQUITY', parentCode: '5000' },
  { code: '5200', name: 'עודפים',                 nameEn: 'Retained Earnings',          type: 'EQUITY', parentCode: '5000' },
  { code: '5300', name: 'רווח השנה',              nameEn: 'Current Year Profit',        type: 'EQUITY', parentCode: '5000' },
  // הכנסות
  { code: '6000', name: 'הכנסות',                 nameEn: 'Revenue',                    type: 'REVENUE' },
  { code: '6100', name: 'הכנסות ממכירות',          nameEn: 'Sales Revenue',              type: 'REVENUE', parentCode: '6000' },
  { code: '6200', name: 'הכנסות שירותים',          nameEn: 'Service Revenue',            type: 'REVENUE', parentCode: '6000' },
  { code: '6300', name: 'הכנסות אחרות',            nameEn: 'Other Revenue',              type: 'REVENUE', parentCode: '6000' },
  { code: '6400', name: 'הכנסות ריבית',            nameEn: 'Interest Income',            type: 'REVENUE', parentCode: '6000' },
  // הוצאות
  { code: '7000', name: 'הוצאות',                 nameEn: 'Expenses',                   type: 'EXPENSE' },
  { code: '7100', name: 'הוצאות שכר',              nameEn: 'Salary Expenses',            type: 'EXPENSE', parentCode: '7000' },
  { code: '7110', name: 'שכר ברוטו',              nameEn: 'Gross Salary',               type: 'EXPENSE', parentCode: '7100' },
  { code: '7120', name: 'פנסיה מעסיק',             nameEn: 'Employer Pension',           type: 'EXPENSE', parentCode: '7100' },
  { code: '7130', name: 'ביטוח לאומי מעסיק',       nameEn: 'Employer NI',               type: 'EXPENSE', parentCode: '7100' },
  { code: '7140', name: 'פיצויים',                nameEn: 'Severance Pay Provision',    type: 'EXPENSE', parentCode: '7100' },
  { code: '7200', name: 'הוצאות שכירות',           nameEn: 'Rent Expenses',              type: 'EXPENSE', parentCode: '7000' },
  { code: '7300', name: 'הוצאות רכב',              nameEn: 'Vehicle Expenses',           type: 'EXPENSE', parentCode: '7000' },
  { code: '7400', name: 'הוצאות טלפון ותקשורת',   nameEn: 'Communication Expenses',     type: 'EXPENSE', parentCode: '7000' },
  { code: '7500', name: 'הוצאות פרסום ושיווק',     nameEn: 'Marketing Expenses',         type: 'EXPENSE', parentCode: '7000' },
  { code: '7600', name: 'הוצאות ספקים',            nameEn: 'Supplier Expenses',          type: 'EXPENSE', parentCode: '7000' },
  { code: '7700', name: 'הוצאות ריבית',            nameEn: 'Interest Expenses',          type: 'EXPENSE', parentCode: '7000' },
  { code: '7800', name: 'פחת',                    nameEn: 'Depreciation',               type: 'EXPENSE', parentCode: '7000' },
  { code: '7900', name: 'הוצאות אחרות',            nameEn: 'Other Expenses',             type: 'EXPENSE', parentCode: '7000' },
];

// ─── Israeli Holidays 2026 ────────────────────────────────────────

const HOLIDAYS_2026 = [
  { name: 'ראש השנה (א)',  date: new Date('2026-09-11'), isNational: true },
  { name: 'ראש השנה (ב)',  date: new Date('2026-09-12'), isNational: true },
  { name: 'יום כיפור',    date: new Date('2026-09-20'), isNational: true },
  { name: 'סוכות',        date: new Date('2026-09-25'), isNational: true },
  { name: 'שמחת תורה',    date: new Date('2026-10-02'), isNational: true },
  { name: 'פסח (א)',       date: new Date('2026-04-02'), isNational: true },
  { name: 'פסח (ז)',       date: new Date('2026-04-08'), isNational: true },
  { name: 'יום העצמאות',  date: new Date('2026-04-29'), isNational: true },
  { name: 'שבועות',       date: new Date('2026-05-22'), isNational: true },
  { name: 'פורים',        date: new Date('2026-03-03'), isNational: false },
  { name: 'חנוכה (א)',     date: new Date('2026-12-05'), isNational: false },
];

// ─── Helpers ──────────────────────────────────────────────────────

function workingDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const dow = d.getDay();
    if (dow >= 0 && dow <= 4) days.push(new Date(d)); // Sun-Thu (Israeli standard)
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dt(date: Date, h: number, m: number): Date {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// Simple payslip approximation (good enough for demo)
function approxPayslip(gross: number, credits: number, hasTF: boolean) {
  const CREDIT_POINT = 248;
  // Tax (simplified brackets)
  let tax = 0;
  const brackets = [
    { min: 0,     max: 7180,  rate: 0.10 },
    { min: 7180,  max: 10290, rate: 0.14 },
    { min: 10290, max: 16530, rate: 0.20 },
    { min: 16530, max: 22970, rate: 0.31 },
    { min: 22970, max: 47720, rate: 0.35 },
    { min: 47720, max: null,  rate: 0.47 },
  ];
  for (const b of brackets) {
    if (gross <= b.min) break;
    const taxable = b.max ? Math.min(gross, b.max) - b.min : gross - b.min;
    tax += taxable * b.rate;
  }
  tax = Math.max(0, tax - credits * CREDIT_POINT);

  // NI
  const NI_THRESH = 7700, NI_CEIL = 50200;
  const niEmp = Math.min(gross, NI_THRESH) * 0.04 +
    Math.max(0, Math.min(gross, NI_CEIL) - NI_THRESH) * 0.12;
  const healthEmp = Math.min(gross, NI_THRESH) * 0.031 +
    Math.max(0, Math.min(gross, NI_CEIL) - NI_THRESH) * 0.05;

  const penEmp = gross * 0.06;
  const tfEmp  = hasTF ? gross * 0.025 : 0;
  const penEr  = gross * 0.065;
  const sev    = gross * 0.0833;
  const niEr   = gross * 0.075;
  const tfEr   = hasTF ? gross * 0.075 : 0;

  const totalDed  = Math.round(tax + niEmp + healthEmp + penEmp + tfEmp);
  const net       = gross - totalDed;
  const totalCost = Math.round(gross + penEr + sev + niEr + tfEr);

  return {
    taxableIncome:        gross,
    incomeTax:            Math.round(tax),
    nationalInsurance:    Math.round(niEmp),
    healthInsurance:      Math.round(healthEmp),
    pensionEmployee:      Math.round(penEmp),
    trainingFundEmployee: Math.round(tfEmp),
    netSalary:            Math.round(net),
    pensionEmployer:      Math.round(penEr),
    severancePay:         Math.round(sev),
    niEmployer:           Math.round(niEr),
    trainingFundEmployer: Math.round(tfEr),
    totalEmployerCost:    totalCost,
  };
}

// ─── Main Seed ────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting comprehensive database seed...');

  // ── Tenant ──────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { businessNumber: '500000000' },
    update: {},
    create: {
      name:           'חברת הדגמה בע"מ',
      businessNumber: '500000000',
      vatNumber:      '100000001',
      phone:          '03-1234567',
      email:          'admin@demo.co.il',
      address:        { street: 'רחוב הרצל 1', city: 'תל אביב', zip: '6100000', country: 'IL' },
      taxSettings:    { vatRate: 0.18, taxYear: 2026 },
    },
  });
  console.log(`✓ Tenant: ${tenant.name}`);

  // ── Chart of Accounts ──────────────────────────────────────────
  const accountMap = new Map<string, string>();
  for (const acc of CHART_OF_ACCOUNTS.filter(a => !a.parentCode)) {
    const r = await prisma.account.upsert({
      where:  { tenantId_code: { tenantId: tenant.id, code: acc.code } },
      update: { name: acc.name },
      create: { tenantId: tenant.id, code: acc.code, name: acc.name, nameEn: acc.nameEn, type: acc.type },
    });
    accountMap.set(acc.code, r.id);
  }
  for (const acc of CHART_OF_ACCOUNTS.filter(a => a.parentCode)) {
    const r = await prisma.account.upsert({
      where:  { tenantId_code: { tenantId: tenant.id, code: acc.code } },
      update: { name: acc.name },
      create: { tenantId: tenant.id, code: acc.code, name: acc.name, nameEn: acc.nameEn, type: acc.type, parentId: accountMap.get(acc.parentCode!) },
    });
    accountMap.set(acc.code, r.id);
  }
  console.log(`✓ Chart of Accounts: ${CHART_OF_ACCOUNTS.length} accounts`);

  // ── Holidays ────────────────────────────────────────────────────
  for (const h of HOLIDAYS_2026) {
    const exists = await prisma.holidayCalendar.findFirst({ where: { tenantId: tenant.id, date: h.date } });
    if (!exists) await prisma.holidayCalendar.create({ data: { ...h, tenantId: tenant.id } });
  }
  console.log(`✓ Holidays: ${HOLIDAYS_2026.length}`);

  // ── Admin user ──────────────────────────────────────────────────
  const adminEmail = 'admin@demo.co.il';
  const adminExists = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: adminEmail } });
  let adminUser = adminExists;
  if (!adminExists) {
    adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id, email: adminEmail,
        passwordHash: await bcrypt.hash('Admin1234!', 12),
        role: 'ADMIN', firstName: 'מנהל', lastName: 'מערכת',
      },
    });
    console.log('✓ Admin user: admin@demo.co.il / Admin1234!');
  }

  // Also create second admin with original tenant id
  const admin2Email = 'admin2@test.co.il';
  const admin2Exists = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: admin2Email } });
  if (!admin2Exists) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id, email: admin2Email,
        passwordHash: await bcrypt.hash('Admin1234!', 12),
        role: 'ADMIN', firstName: 'מנהל', lastName: 'שני',
      },
    });
  }

  // ── Leave Types ─────────────────────────────────────────────────
  const leaveTypes = [
    { name: 'חופשה שנתית',       code: 'VACATION',    maxDaysPerYear: 16, isPaid: true,  requiresApproval: true,  colorHex: '#3B82F6' },
    { name: 'מחלה',              code: 'SICK',        maxDaysPerYear: 18, isPaid: true,  requiresApproval: false, colorHex: '#EF4444' },
    { name: 'אבל',               code: 'BEREAVEMENT', maxDaysPerYear: 7,  isPaid: true,  requiresApproval: false, colorHex: '#6B7280' },
    { name: 'חופשה ללא תשלום',   code: 'UNPAID',      maxDaysPerYear: null, isPaid: false, requiresApproval: true,  colorHex: '#F59E0B' },
    { name: 'מילואים',           code: 'RESERVE',     maxDaysPerYear: null, isPaid: true,  requiresApproval: false, colorHex: '#10B981' },
  ];
  const leaveTypeMap = new Map<string, string>();
  for (const lt of leaveTypes) {
    const existing = await prisma.leaveType.findFirst({ where: { tenantId: tenant.id, name: lt.name } });
    if (!existing) {
      const { code: _code, ...ltData } = lt as any;
      const r = await prisma.leaveType.create({ data: { ...ltData, tenantId: tenant.id } });
      leaveTypeMap.set(lt.code, r.id);
    } else {
      leaveTypeMap.set(lt.code, existing.id);
    }
  }
  console.log(`✓ Leave types: ${leaveTypes.length}`);

  // ── Employees ───────────────────────────────────────────────────
  const EMPLOYEES = [
    {
      firstName: 'ישראל', lastName: 'כהן',     idNumber: '123456782', gender: 'M',
      birthDate: new Date('1980-03-15'), phone: '054-1234567', personalEmail: 'israel.cohen@demo.co.il',
      startDate: new Date('2020-01-01'), jobTitle: 'מנהל כספים', department: 'כספים',
      grossSalary: 15000, taxCredits: 2.25, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 2.5, trainingFundErRate: 7.5,
      bankAccount: { bank: 'לאומי', branchCode: '845', accountNumber: '123456' },
      address: { street: 'רחוב ויצמן 12', city: 'תל אביב', zip: '6423004' },
      userEmail: 'israel@demo.co.il', userPassword: 'Employee1!', userRole: 'ACCOUNTANT',
    },
    {
      firstName: 'שרה', lastName: 'לוי',       idNumber: '234567891', gender: 'F',
      birthDate: new Date('1985-07-22'), phone: '053-2345678', personalEmail: 'sara.levi@demo.co.il',
      startDate: new Date('2021-03-01'), jobTitle: 'מנהלת שיווק', department: 'שיווק',
      grossSalary: 12000, taxCredits: 2.75, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 2.5, trainingFundErRate: 7.5,
      bankAccount: { bank: 'הפועלים', branchCode: '603', accountNumber: '234567' },
      address: { street: 'שדרות רוטשילד 45', city: 'תל אביב', zip: '6688111' },
      userEmail: 'sara@demo.co.il', userPassword: 'Employee1!', userRole: 'EMPLOYEE',
    },
    {
      firstName: 'אמיר', lastName: 'דוד',      idNumber: '345678902', gender: 'M',
      birthDate: new Date('1990-11-08'), phone: '052-3456789', personalEmail: 'amir.david@demo.co.il',
      startDate: new Date('2022-01-15'), jobTitle: 'מפתח בכיר', department: 'טכנולוגיה',
      grossSalary: 14000, taxCredits: 2.25, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 2.5, trainingFundErRate: 7.5,
      bankAccount: { bank: 'מזרחי טפחות', branchCode: '416', accountNumber: '345678' },
      address: { street: 'רחוב בן יהודה 78', city: 'תל אביב', zip: '6329314' },
      userEmail: 'amir@demo.co.il', userPassword: 'Employee1!', userRole: 'EMPLOYEE',
    },
    {
      firstName: 'רחל', lastName: 'בן-דוד',    idNumber: '456789013', gender: 'F',
      birthDate: new Date('1983-05-30'), phone: '050-4567890', personalEmail: 'rachel.bendavid@demo.co.il',
      startDate: new Date('2019-06-01'), jobTitle: 'מנהלת משאבי אנוש', department: 'HR',
      grossSalary: 11000, taxCredits: 3.25, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 0, trainingFundErRate: 0,
      bankAccount: { bank: 'דיסקונט', branchCode: '22', accountNumber: '456789' },
      address: { street: 'רחוב אלנבי 90', city: 'תל אביב', zip: '6580204' },
      userEmail: 'rachel@demo.co.il', userPassword: 'Employee1!', userRole: 'HR_MANAGER',
    },
    {
      firstName: 'יצחק', lastName: 'גולן',     idNumber: '567890124', gender: 'M',
      birthDate: new Date('1978-09-14'), phone: '055-5678901', personalEmail: 'yitzhak.golan@demo.co.il',
      startDate: new Date('2020-09-01'), jobTitle: 'חשב שכר', department: 'כספים',
      grossSalary: 10000, taxCredits: 2.25, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 0, trainingFundErRate: 0,
      bankAccount: { bank: 'לאומי', branchCode: '123', accountNumber: '567890' },
      address: { street: 'רחוב דיזנגוף 33', city: 'תל אביב', zip: '6433208' },
      userEmail: 'yitzhak@demo.co.il', userPassword: 'Employee1!', userRole: 'EMPLOYEE',
    },
    {
      firstName: 'נועה', lastName: 'אברהם',    idNumber: '678901235', gender: 'F',
      birthDate: new Date('1993-02-19'), phone: '058-6789012', personalEmail: 'noa.avraham@demo.co.il',
      startDate: new Date('2023-02-01'), jobTitle: 'מעצבת UI/UX', department: 'טכנולוגיה',
      grossSalary: 9500, taxCredits: 2.75, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 0, trainingFundErRate: 0,
      bankAccount: { bank: 'הפועלים', branchCode: '501', accountNumber: '678901' },
      address: { street: 'רחוב קינג ג\'ורג 11', city: 'תל אביב', zip: '6429414' },
      userEmail: 'noa@demo.co.il', userPassword: 'Employee1!', userRole: 'EMPLOYEE',
    },
    {
      firstName: 'מיכל', lastName: 'שפירא',   idNumber: '789012346', gender: 'F',
      birthDate: new Date('1988-12-03'), phone: '054-7890123', personalEmail: 'michal.shapira@demo.co.il',
      startDate: new Date('2021-08-01'), jobTitle: 'מנהלת משרד', department: 'מנהל',
      grossSalary: 8500, taxCredits: 2.75, pensionEmployee: 6.00, pensionEmployer: 6.50, severancePay: 8.33,
      trainingFundRate: 0, trainingFundErRate: 0,
      bankAccount: { bank: 'מזרחי טפחות', branchCode: '601', accountNumber: '789012' },
      address: { street: 'רחוב יהודה הלוי 25', city: 'תל אביב', zip: '6516332' },
      userEmail: 'michal@demo.co.il', userPassword: 'Employee1!', userRole: 'EMPLOYEE',
    },
  ];

  const empIds: string[] = [];
  for (const e of EMPLOYEES) {
    let emp = await prisma.employee.findFirst({ where: { tenantId: tenant.id, idNumber: e.idNumber } });
    if (!emp) {
      const { userEmail, userPassword, userRole, trainingFundRate, trainingFundErRate, ...empData } = e;
      emp = await prisma.$transaction(async tx => {
        const newEmp = await tx.employee.create({
          data: {
            ...empData, tenantId: tenant.id,
            trainingFundRate, trainingFundErRate,
            creditPointsDetails: {
              resident: true, gender: empData.gender === 'F',
              children: [],   veteran: false, disability: false,
            },
          } as any,
        });
        const pw = await bcrypt.hash(userPassword, 12);
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id, email: userEmail, passwordHash: pw,
            role: userRole as any, firstName: empData.firstName, lastName: empData.lastName,
          },
        });
        await tx.employee.update({ where: { id: newEmp.id }, data: { userId: user.id } });
        return newEmp;
      });
    }
    empIds.push(emp.id);
  }
  console.log(`✓ Employees: ${empIds.length}`);

  // ── Leave Balances ──────────────────────────────────────────────
  // ── Leave Requests (balance is computed dynamically from approved requests) ─
  const vacTypeId = leaveTypeMap.get('VACATION')!;
  const sickTypeId = leaveTypeMap.get('SICK')!;
  const leaveRequestsData = [
    { empIdx: 0, typeId: vacTypeId,  start: '2026-01-05', end: '2026-01-07', days: 3, status: 'APPROVED' },
    { empIdx: 1, typeId: sickTypeId, start: '2026-01-14', end: '2026-01-14', days: 1, status: 'APPROVED' },
    { empIdx: 2, typeId: vacTypeId,  start: '2026-02-08', end: '2026-02-09', days: 2, status: 'PENDING'  },
    { empIdx: 3, typeId: vacTypeId,  start: '2026-02-22', end: '2026-02-26', days: 5, status: 'PENDING'  },
    { empIdx: 4, typeId: sickTypeId, start: '2026-02-10', end: '2026-02-10', days: 1, status: 'APPROVED' },
  ];
  for (const lr of leaveRequestsData) {
    if (!vacTypeId || !sickTypeId) continue;
    const empId = empIds[lr.empIdx];
    if (!empId) continue;
    const exists = await prisma.leaveRequest.findFirst({
      where: { tenantId: tenant.id, employeeId: empId, startDate: new Date(lr.start) },
    });
    if (!exists) {
      await prisma.leaveRequest.create({
        data: {
          tenantId: tenant.id, employeeId: empId, leaveTypeId: lr.typeId,
          startDate: new Date(lr.start), endDate: new Date(lr.end),
          totalDays: lr.days, status: lr.status as any,
          notes: 'נוצר אוטומטית בזרעייה',
        },
      });
    }
  }
  console.log(`✓ Leave requests: ${leaveRequestsData.length}`);

  // ── Attendance — Jan & Feb 2026 (batch insert) ──────────────────
  const clockInTimes  = [[8,0],[8,15],[8,30],[8,0],[8,45],[9,0],[8,15]];
  const clockOutTimes = [[17,30],[18,0],[17,0],[17,45],[18,30],[17,15],[17,0]];

  // Skip if already seeded (check one employee)
  const attendanceExists = await prisma.attendanceLog.count({
    where: { tenantId: tenant.id, employeeId: empIds[0] },
  });
  if (attendanceExists === 0) {
    const attendanceRows: any[] = [];
    for (const [idx, empId] of empIds.entries()) {
      const [cih, cim] = clockInTimes[idx];
      const [coh, com] = clockOutTimes[idx];
      for (const [yr, mo] of [[2026, 1], [2026, 2]]) {
        for (const day of workingDays(yr, mo)) {
          attendanceRows.push({
            tenantId: tenant.id, employeeId: empId, date: day,
            clockIn:  dt(day, cih, cim),
            clockOut: dt(day, coh, com),
            breakMinutes: 30,
            notes: 'נוצר בזרעייה',
          });
        }
      }
    }
    // Insert in batches of 50
    for (let i = 0; i < attendanceRows.length; i += 50) {
      await prisma.attendanceLog.createMany({ data: attendanceRows.slice(i, i + 50), skipDuplicates: true });
    }
    console.log(`✓ Attendance records: ${attendanceRows.length}`);
  } else {
    console.log(`✓ Attendance records: already seeded`);
  }

  // ── Payroll Runs ────────────────────────────────────────────────
  for (const [month, status] of [['2026-01', 'PAID'], ['2026-02', 'APPROVED']]) {
    const existing = await prisma.payrollRun.findFirst({ where: { tenantId: tenant.id, period: month as string } });
    if (existing) continue;

    const calcs = EMPLOYEES.map(e => approxPayslip(e.grossSalary, e.taxCredits, e.trainingFundRate > 0));
    const totalGross   = EMPLOYEES.reduce((s, e) => s + e.grossSalary, 0);
    const totalNet     = calcs.reduce((s, c) => s + c.netSalary, 0);
    const totalTax     = calcs.reduce((s, c) => s + c.incomeTax, 0);
    const totalNI      = calcs.reduce((s, c) => s + c.nationalInsurance + c.healthInsurance, 0);
    const totalPension = calcs.reduce((s, c) => s + c.pensionEmployer, 0);
    const run = await prisma.payrollRun.create({
      data: {
        tenantId: tenant.id, period: month as string,
        status: status as any,
        totalGross, totalNet, totalTax, totalNI, totalPension,
        approvedAt: status !== 'DRAFT' ? new Date(`${month}-25`) : undefined,
        paidAt: status === 'PAID' ? new Date(`${month}-28`) : undefined,
      },
    });

    for (const [idx, empId] of empIds.entries()) {
      const e = EMPLOYEES[idx];
      const hasTF = e.trainingFundRate > 0;
      const calc = approxPayslip(e.grossSalary, e.taxCredits, hasTF);
      await prisma.payslip.create({
        data: {
          tenantId: tenant.id, payrollRunId: run.id, employeeId: empId,
          period: month as string,
          grossSalary:          e.grossSalary,
          taxableIncome:        calc.taxableIncome,
          incomeTax:            calc.incomeTax,
          nationalInsurance:    calc.nationalInsurance,
          healthInsurance:      calc.healthInsurance,
          pensionEmployee:      calc.pensionEmployee,
          trainingFundEmployee: calc.trainingFundEmployee,
          netSalary:            calc.netSalary,
          pensionEmployer:      calc.pensionEmployer,
          severancePay:         calc.severancePay,
          niEmployer:           calc.niEmployer,
          trainingFundEmployer: calc.trainingFundEmployer,
          totalEmployerCost:    calc.totalEmployerCost,
          carBenefit:           0,
          breakdown:            { taxBrackets: [], niCalc: {}, period: month },
        },
      });
    }
  }
  console.log(`✓ Payroll runs: Jan (PAID) + Feb (APPROVED)`);

  // ── Customers ───────────────────────────────────────────────────
  const CUSTOMERS = [
    { name: 'מיקרוסופט ישראל',     businessId: '512345678', email: 'billing@microsoft.co.il',  phone: '03-6666000', type: 'B2B',  status: 'ACTIVE' },
    { name: 'בנק לאומי',            businessId: '520000000', email: 'vendor@leumi.co.il',        phone: '03-9548888', type: 'B2B',  status: 'ACTIVE' },
    { name: 'כלל ביטוח',            businessId: '520001000', email: 'proc@clal.co.il',           phone: '03-6386222', type: 'B2B',  status: 'ACTIVE' },
    { name: 'שטראוס גרופ',          businessId: '510000100', email: 'finance@strauss.co.il',     phone: '09-7474747', type: 'B2B',  status: 'ACTIVE' },
    { name: 'פרטנר תקשורת',         businessId: '510005500', email: 'vendors@partner.co.il',     phone: '054-5000000', type: 'B2B', status: 'ACTIVE' },
    { name: 'סופרפארם',             businessId: '513200000', email: 'purchase@super-pharm.co.il', phone: '03-6100000', type: 'B2B', status: 'ACTIVE' },
    { name: 'ד"ר ראובן לוי',        businessId: '012345671', email: 'dr.levi@gmail.com',         phone: '052-3344556', type: 'B2C', status: 'ACTIVE' },
    { name: 'הדסה עמיר',            businessId: '123456786', email: 'hadassi@gmail.com',          phone: '050-7788990', type: 'B2C', status: 'LEAD'   },
  ];

  const custMap = new Map<string, string>();
  for (const c of CUSTOMERS) {
    let cust = await prisma.customer.findFirst({ where: { tenantId: tenant.id, businessId: c.businessId } });
    if (!cust) cust = await prisma.customer.create({ data: { ...c, tenantId: tenant.id } as any });
    custMap.set(c.name, cust.id);
  }
  console.log(`✓ Customers: ${CUSTOMERS.length}`);

  // ── Products ────────────────────────────────────────────────────
  const PRODUCTS = [
    { sku: 'SRV-001', name: 'ייעוץ עסקי — שעה',        costPrice: 250,  sellingPrice: 450,  vatRate: 0.18, isService: true  },
    { sku: 'SRV-002', name: 'ריטיינר חודשי',             costPrice: 2000, sellingPrice: 4500, vatRate: 0.18, isService: true  },
    { sku: 'SRV-003', name: 'פיתוח תוכנה — ספרינט',     costPrice: 8000, sellingPrice: 14000, vatRate: 0.18, isService: true  },
    { sku: 'SRV-004', name: 'תמיכה ותחזוקה — חודש',     costPrice: 500,  sellingPrice: 1200, vatRate: 0.18, isService: true  },
    { sku: 'SRV-005', name: 'הדרכה — יום מלא',           costPrice: 1500, sellingPrice: 3500, vatRate: 0.18, isService: true  },
    { sku: 'PRD-001', name: 'מחשב נייד Dell XPS',        costPrice: 3500, sellingPrice: 5200, vatRate: 0.18, isService: false },
  ];

  const prodMap = new Map<string, string>();
  for (const p of PRODUCTS) {
    let prod = await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: p.sku } });
    if (!prod) prod = await prisma.product.create({ data: { ...p, tenantId: tenant.id } });
    prodMap.set(p.sku, prod.id);
  }
  console.log(`✓ Products: ${PRODUCTS.length}`);

  // ── Invoices ────────────────────────────────────────────────────
  const INVOICES = [
    // January 2026
    { custName: 'מיקרוסופט ישראל', date: '2026-01-05', due: '2026-02-05', subtotal: 14000, status: 'PAID',   desc: 'פיתוח תוכנה — ינואר' },
    { custName: 'בנק לאומי',        date: '2026-01-10', due: '2026-02-10', subtotal:  4500, status: 'PAID',   desc: 'ריטיינר ייעוץ — ינואר' },
    { custName: 'כלל ביטוח',        date: '2026-01-15', due: '2026-02-15', subtotal:  3500, status: 'PAID',   desc: 'הדרכה — ינואר' },
    { custName: 'שטראוס גרופ',      date: '2026-01-20', due: '2026-02-20', subtotal:  1200, status: 'PAID',   desc: 'תמיכה — ינואר' },
    { custName: 'פרטנר תקשורת',     date: '2026-01-28', due: '2026-03-28', subtotal:  4500, status: 'SENT',   desc: 'ריטיינר — ינואר' },
    // February 2026
    { custName: 'מיקרוסופט ישראל', date: '2026-02-03', due: '2026-03-03', subtotal: 14000, status: 'PAID',   desc: 'פיתוח תוכנה — פברואר' },
    { custName: 'בנק לאומי',        date: '2026-02-10', due: '2026-03-10', subtotal:  4500, status: 'PAID',   desc: 'ריטיינר ייעוץ — פברואר' },
    { custName: 'כלל ביטוח',        date: '2026-02-12', due: '2026-03-12', subtotal:  2700, status: 'SENT',   desc: 'ייעוץ — פברואר' },
    { custName: 'סופרפארם',         date: '2026-02-18', due: '2026-03-18', subtotal:  5200, status: 'SENT',   desc: 'מחשב נייד Dell XPS' },
    { custName: 'שטראוס גרופ',      date: '2026-02-25', due: '2026-03-25', subtotal:  1200, status: 'SENT',   desc: 'תמיכה — פברואר' },
    // March 2026
    { custName: 'מיקרוסופט ישראל', date: '2026-03-01', due: '2026-04-01', subtotal: 14000, status: 'SENT',   desc: 'פיתוח תוכנה — מרץ' },
    { custName: 'פרטנר תקשורת',     date: '2026-03-01', due: '2026-04-01', subtotal:  4500, status: 'DRAFT',  desc: 'ריטיינר — מרץ' },
    { custName: 'ד"ר ראובן לוי',    date: '2026-03-02', due: '2026-03-30', subtotal:  1800, status: 'SENT',   desc: 'ייעוץ פרטי' },
    { custName: 'כלל ביטוח',        date: '2026-03-02', due: '2026-04-02', subtotal:  4500, status: 'DRAFT',  desc: 'ריטיינר — מרץ' },
    { custName: 'בנק לאומי',        date: '2026-03-03', due: '2026-04-03', subtotal:  4500, status: 'DRAFT',  desc: 'ריטיינר ייעוץ — מרץ' },
  ];

  let invCount = 0;
  let invNum = 1001;
  for (const inv of INVOICES) {
    const custId = custMap.get(inv.custName);
    if (!custId) continue;
    const existing = await prisma.invoice.findFirst({
      where: { tenantId: tenant.id, number: `INV-2026-${String(invNum).padStart(4,'0')}` }
    });
    if (!existing) {
      const vatAmount = Math.round(inv.subtotal * 0.18);
      const total     = inv.subtotal + vatAmount;
      const newInv = await prisma.invoice.create({
        data: {
          tenantId:   tenant.id,
          customerId: custId,
          number:     `INV-2026-${String(invNum).padStart(4,'0')}`,
          date:       new Date(inv.date),
          dueDate:    new Date(inv.due),
          status:     inv.status as any,
          subtotal:   inv.subtotal,
          vatAmount,
          total,
          notes:      inv.desc,
          createdBy:  adminUser!.id,
        },
      });
      await prisma.invoiceLine.create({
        data: {
          invoiceId: newInv.id, description: inv.desc,
          quantity: 1, unitPrice: inv.subtotal, vatRate: 0.18,
          lineTotal: inv.subtotal,
        },
      });
      if (inv.status === 'PAID') {
        await prisma.invoicePayment.create({
          data: {
            invoiceId: newInv.id, tenantId: tenant.id,
            amount: total, method: 'BANK_TRANSFER',
            date: new Date(inv.due), reference: `PAY-${invNum}`,
            createdBy: adminUser!.id,
          },
        });
      }
      invCount++;
    }
    invNum++;
  }
  console.log(`✓ Invoices: ${invCount} created`);

  // ── Vendors ─────────────────────────────────────────────────────
  const VENDORS = [
    { name: 'לוגיטק ישראל',           businessId: '513100001', vatNumber: '513100001', email: 'orders@logitech.co.il',    phone: '03-7654321', paymentTerms: '30 days' },
    { name: 'yes — HOT',               businessId: '510000200', vatNumber: '510000200', email: 'billing@yes.co.il',         phone: '02-5396300', paymentTerms: '30 days' },
    { name: 'פלאפון תקשורת',           businessId: '512100000', vatNumber: '512100000', email: 'business@pelephone.co.il',  phone: '052-0500000', paymentTerms: '30 days' },
    { name: 'Office Depot ישראל',      businessId: '513200001', vatNumber: '513200001', email: 'orders@officedepot.co.il', phone: '03-9265000', paymentTerms: '45 days' },
    { name: 'משרד עוה"ד כהן ושות\'',  businessId: '012345671', vatNumber: '012345671', email: 'billing@cohen-law.co.il',  phone: '03-7778888', paymentTerms: '14 days' },
  ];

  const vendMap = new Map<string, string>();
  for (const v of VENDORS) {
    let vend = await prisma.vendor.findFirst({ where: { tenantId: tenant.id, businessId: v.businessId } });
    if (!vend) vend = await prisma.vendor.create({ data: { ...v, tenantId: tenant.id } });
    vendMap.set(v.name, vend.id);
  }
  console.log(`✓ Vendors: ${VENDORS.length}`);

  // ── Bills ───────────────────────────────────────────────────────
  const BILLS = [
    { vendName: 'לוגיטק ישראל',          date: '2026-01-15', due: '2026-02-15', subtotal: 3500,  desc: 'ציוד משרדי — Q1',          status: 'PAID' },
    { vendName: 'yes — HOT',              date: '2026-01-31', due: '2026-02-28', subtotal:  850,  desc: 'תשתיות תקשורת — ינואר',    status: 'PAID' },
    { vendName: 'פלאפון תקשורת',          date: '2026-02-28', due: '2026-03-28', subtotal:  650,  desc: 'טלפונים עסקיים — פברואר',  status: 'POSTED' },
    { vendName: 'Office Depot ישראל',     date: '2026-02-20', due: '2026-04-05', subtotal: 1200,  desc: 'מוצרי נייר וכלי כתיבה',    status: 'PARTIALLY_PAID' },
    { vendName: 'משרד עוה"ד כהן ושות\'', date: '2026-02-25', due: '2026-03-10', subtotal: 4500,  desc: 'שירותים משפטיים — Q1',     status: 'POSTED' },
    { vendName: 'לוגיטק ישראל',           date: '2026-03-01', due: '2026-04-01', subtotal: 2200,  desc: 'עכבר + מקלדת ×10',         status: 'DRAFT' },
  ];

  let billNum = 1;
  for (const b of BILLS) {
    const vendId = vendMap.get(b.vendName);
    if (!vendId) continue;
    const bNum = `BILL-2026-${String(billNum).padStart(4,'0')}`;
    const existing = await prisma.bill.findFirst({ where: { tenantId: tenant.id, number: bNum } });
    if (!existing) {
      const vatAmount = Math.round(b.subtotal * 0.18);
      const total = b.subtotal + vatAmount;
      await prisma.bill.create({
        data: {
          tenantId: tenant.id, vendorId: vendId,
          number: bNum, vendorRef: `EXT-${billNum}`,
          date:    new Date(b.date), dueDate: new Date(b.due),
          status:  b.status as any,
          subtotal: b.subtotal, vatAmount, total,
          notes:   b.desc, createdBy: adminUser!.id,
        },
      });
    }
    billNum++;
  }
  console.log(`✓ Bills: ${BILLS.length}`);

  // ── Leave Requests ──────────────────────────────────────────────
  if (vacTypeId) {
    const existingReq = await prisma.leaveRequest.findFirst({ where: { tenantId: tenant.id } });
    if (!existingReq) {
      const reqData = [
        { empId: empIds[1], typeId: vacTypeId, from: '2026-03-10', to: '2026-03-12', days: 3, notes: 'חופשת פורים' },
        { empId: empIds[2], typeId: vacTypeId, from: '2026-03-15', to: '2026-03-19', days: 5, notes: 'חופשה שנתית' },
        { empId: empIds[5], typeId: vacTypeId, from: '2026-04-05', to: '2026-04-09', days: 5, notes: 'חופשת פסח' },
      ];
      for (const r of reqData) {
        await prisma.leaveRequest.create({
          data: {
            tenantId:    tenant.id, employeeId: r.empId, leaveTypeId: r.typeId,
            startDate:   new Date(r.from), endDate: new Date(r.to),
            totalDays:   r.days, notes: r.notes,
            status:      'PENDING',
          },
        });
      }
      console.log(`✓ Leave requests: ${reqData.length}`);
    }
  }

  console.log('\n✅ Seed completed!');
  console.log(`   Tenant ID: ${tenant.id}`);
  console.log('   Admin:     admin@demo.co.il / Admin1234!');
  console.log('   Also:      admin2@test.co.il / Admin1234!');
  console.log('   Employees: israel@demo.co.il / Employee1! (ACCOUNTANT)');
  console.log('              sara@demo.co.il / Employee1! (EMPLOYEE)');
  console.log('              rachel@demo.co.il / Employee1! (HR_MANAGER)');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
