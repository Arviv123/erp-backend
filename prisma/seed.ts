/**
 * Database Seed Script
 * Creates a demo tenant with:
 * - Israeli standard Chart of Accounts (תרשים חשבונות)
 * - Admin user
 * - Israeli holidays 2026
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Israeli Chart of Accounts ────────────────────────────────────

type AccountSeed = {
  code: string;
  name: string;
  nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentCode?: string;
};

const CHART_OF_ACCOUNTS: AccountSeed[] = [
  // ─── נכסים (ASSETS) ─────────────────────────────────
  { code: '1000', name: 'נכסים שוטפים',         nameEn: 'Current Assets',          type: 'ASSET' },
  { code: '1100', name: 'קופה ומזומן',           nameEn: 'Cash & Petty Cash',       type: 'ASSET', parentCode: '1000' },
  { code: '1200', name: 'חשבון בנק',             nameEn: 'Bank Account',            type: 'ASSET', parentCode: '1000' },
  { code: '1210', name: 'בנק לאומי',             nameEn: 'Bank Leumi',              type: 'ASSET', parentCode: '1200' },
  { code: '1220', name: 'בנק הפועלים',           nameEn: 'Bank Hapoalim',           type: 'ASSET', parentCode: '1200' },
  { code: '1300', name: 'לקוחות (חובות)',         nameEn: 'Accounts Receivable',     type: 'ASSET', parentCode: '1000' },
  { code: '1400', name: 'מלאי',                  nameEn: 'Inventory',               type: 'ASSET', parentCode: '1000' },
  { code: '1500', name: 'מקדמות לספקים',          nameEn: 'Prepaid to Suppliers',    type: 'ASSET', parentCode: '1000' },
  { code: '1600', name: 'מע"מ תשומות',            nameEn: 'VAT Input',               type: 'ASSET', parentCode: '1000' },
  { code: '2000', name: 'נכסים קבועים',           nameEn: 'Fixed Assets',            type: 'ASSET' },
  { code: '2100', name: 'ציוד',                  nameEn: 'Equipment',               type: 'ASSET', parentCode: '2000' },
  { code: '2200', name: 'רכבים',                 nameEn: 'Vehicles',                type: 'ASSET', parentCode: '2000' },
  { code: '2300', name: 'מחשבים ותוכנה',          nameEn: 'IT & Software',           type: 'ASSET', parentCode: '2000' },
  { code: '2900', name: 'פחת נצבר',              nameEn: 'Accumulated Depreciation', type: 'ASSET', parentCode: '2000' },

  // ─── התחייבויות (LIABILITIES) ───────────────────────
  { code: '3000', name: 'התחייבויות שוטפות',      nameEn: 'Current Liabilities',     type: 'LIABILITY' },
  { code: '3100', name: 'ספקים (זכאים)',           nameEn: 'Accounts Payable',        type: 'LIABILITY', parentCode: '3000' },
  { code: '3200', name: 'מע"מ לתשלום',            nameEn: 'VAT Payable',             type: 'LIABILITY', parentCode: '3000' },
  { code: '3300', name: 'ביטוח לאומי לתשלום',     nameEn: 'National Insurance Payable', type: 'LIABILITY', parentCode: '3000' },
  { code: '3400', name: 'ניכוי מס הכנסה מהמקור',  nameEn: 'Income Tax Withheld',     type: 'LIABILITY', parentCode: '3000' },
  { code: '3500', name: 'חובות שכר',              nameEn: 'Accrued Salaries',        type: 'LIABILITY', parentCode: '3000' },
  { code: '3600', name: 'מקדמות מלקוחות',          nameEn: 'Customer Advances',       type: 'LIABILITY', parentCode: '3000' },
  { code: '3700', name: 'פנסיה מעסיק לתשלום',     nameEn: 'Pension Payable',         type: 'LIABILITY', parentCode: '3000' },
  { code: '4000', name: 'התחייבויות לזמן ארוך',   nameEn: 'Long-term Liabilities',   type: 'LIABILITY' },
  { code: '4100', name: 'הלוואות לזמן ארוך',      nameEn: 'Long-term Loans',         type: 'LIABILITY', parentCode: '4000' },

  // ─── הון עצמי (EQUITY) ──────────────────────────────
  { code: '5000', name: 'הון עצמי',               nameEn: 'Equity',                  type: 'EQUITY' },
  { code: '5100', name: 'הון מניות',              nameEn: 'Share Capital',           type: 'EQUITY', parentCode: '5000' },
  { code: '5200', name: 'עודפים',                 nameEn: 'Retained Earnings',       type: 'EQUITY', parentCode: '5000' },
  { code: '5300', name: 'רווח השנה',              nameEn: 'Current Year Profit',     type: 'EQUITY', parentCode: '5000' },

  // ─── הכנסות (REVENUE) ───────────────────────────────
  { code: '6000', name: 'הכנסות',                 nameEn: 'Revenue',                 type: 'REVENUE' },
  { code: '6100', name: 'הכנסות ממכירות',          nameEn: 'Sales Revenue',           type: 'REVENUE', parentCode: '6000' },
  { code: '6200', name: 'הכנסות שירותים',          nameEn: 'Service Revenue',         type: 'REVENUE', parentCode: '6000' },
  { code: '6300', name: 'הכנסות אחרות',            nameEn: 'Other Revenue',           type: 'REVENUE', parentCode: '6000' },
  { code: '6400', name: 'הכנסות ריבית',            nameEn: 'Interest Income',         type: 'REVENUE', parentCode: '6000' },

  // ─── הוצאות (EXPENSES) ──────────────────────────────
  { code: '7000', name: 'הוצאות',                 nameEn: 'Expenses',                type: 'EXPENSE' },
  { code: '7100', name: 'הוצאות שכר',              nameEn: 'Salary Expenses',         type: 'EXPENSE', parentCode: '7000' },
  { code: '7110', name: 'שכר ברוטו',              nameEn: 'Gross Salary',            type: 'EXPENSE', parentCode: '7100' },
  { code: '7120', name: 'פנסיה מעסיק',             nameEn: 'Employer Pension',        type: 'EXPENSE', parentCode: '7100' },
  { code: '7130', name: 'ביטוח לאומי מעסיק',       nameEn: 'Employer NI',             type: 'EXPENSE', parentCode: '7100' },
  { code: '7140', name: 'פיצויים',                nameEn: 'Severance Pay Provision', type: 'EXPENSE', parentCode: '7100' },
  { code: '7200', name: 'הוצאות שכירות',           nameEn: 'Rent Expenses',           type: 'EXPENSE', parentCode: '7000' },
  { code: '7300', name: 'הוצאות רכב',              nameEn: 'Vehicle Expenses',        type: 'EXPENSE', parentCode: '7000' },
  { code: '7400', name: 'הוצאות טלפון ותקשורת',   nameEn: 'Communication Expenses',  type: 'EXPENSE', parentCode: '7000' },
  { code: '7500', name: 'הוצאות פרסום ושיווק',     nameEn: 'Marketing Expenses',      type: 'EXPENSE', parentCode: '7000' },
  { code: '7600', name: 'הוצאות ספקים',            nameEn: 'Supplier Expenses',       type: 'EXPENSE', parentCode: '7000' },
  { code: '7700', name: 'הוצאות ריבית',            nameEn: 'Interest Expenses',       type: 'EXPENSE', parentCode: '7000' },
  { code: '7800', name: 'פחת',                    nameEn: 'Depreciation',            type: 'EXPENSE', parentCode: '7000' },
  { code: '7900', name: 'הוצאות אחרות',            nameEn: 'Other Expenses',          type: 'EXPENSE', parentCode: '7000' },
];

// ─── Israeli Holidays 2026 ────────────────────────────────────────

const HOLIDAYS_2026 = [
  { name: 'ראש השנה (א)',        date: new Date('2026-09-11'), isNational: true },
  { name: 'ראש השנה (ב)',        date: new Date('2026-09-12'), isNational: true },
  { name: 'יום כיפור',          date: new Date('2026-09-20'), isNational: true },
  { name: 'סוכות',              date: new Date('2026-09-25'), isNational: true },
  { name: 'שמחת תורה',          date: new Date('2026-10-02'), isNational: true },
  { name: 'פסח (א)',             date: new Date('2026-04-02'), isNational: true },
  { name: 'פסח (ז)',             date: new Date('2026-04-08'), isNational: true },
  { name: 'יום העצמאות',        date: new Date('2026-04-29'), isNational: true },
  { name: 'שבועות',             date: new Date('2026-05-22'), isNational: true },
  { name: 'פורים',              date: new Date('2026-03-03'), isNational: false },
  { name: 'חנוכה (א)',           date: new Date('2026-12-05'), isNational: false },
];

// ─── Main Seed ────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting database seed...');

  // Create demo tenant
  const existingTenant = await prisma.tenant.findUnique({
    where: { businessNumber: '500000000' },
  });

  const tenant = existingTenant ?? await prisma.tenant.create({
    data: {
      name:           'חברת הדגמה בע"מ',
      businessNumber: '500000000',
      vatNumber:      '100000001',
      phone:          '03-1234567',
      email:          'admin@demo.co.il',
      address:        { street: 'רחוב הרצל 1', city: 'תל אביב', zip: '6100000', country: 'IL' },
      taxSettings:    { vatRate: 0.18, taxYear: 2026 },
    },
  });

  console.log(`✓ Tenant: ${tenant.name} (${tenant.id})`);

  // Create admin user
  const adminExists = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: 'admin@demo.co.il' },
  });

  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin1234!', 12);
    await prisma.user.create({
      data: {
        tenantId:     tenant.id,
        email:        'admin@demo.co.il',
        passwordHash,
        role:         'ADMIN',
        firstName:    'מנהל',
        lastName:     'מערכת',
      },
    });
    console.log('✓ Admin user created (admin@demo.co.il / Admin1234!)');
  }

  // Seed Chart of Accounts
  const accountMap = new Map<string, string>(); // code → id

  // First pass: create parent accounts (no parentCode)
  for (const acc of CHART_OF_ACCOUNTS.filter(a => !a.parentCode)) {
    const existing = await prisma.account.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
    });

    const created = existing ?? await prisma.account.create({
      data: {
        tenantId: tenant.id,
        code:     acc.code,
        name:     acc.name,
        nameEn:   acc.nameEn,
        type:     acc.type,
      },
    });

    accountMap.set(acc.code, created.id);
  }

  // Second pass: child accounts
  for (const acc of CHART_OF_ACCOUNTS.filter(a => a.parentCode)) {
    const parentId = accountMap.get(acc.parentCode!);

    const existing = await prisma.account.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
    });

    const created = existing ?? await prisma.account.create({
      data: {
        tenantId: tenant.id,
        code:     acc.code,
        name:     acc.name,
        nameEn:   acc.nameEn,
        type:     acc.type,
        parentId,
      },
    });

    accountMap.set(acc.code, created.id);
  }

  console.log(`✓ Chart of Accounts: ${CHART_OF_ACCOUNTS.length} accounts created`);

  // Seed Israeli Holidays 2026
  for (const holiday of HOLIDAYS_2026) {
    const exists = await prisma.holidayCalendar.findFirst({
      where: { tenantId: tenant.id, date: holiday.date },
    });

    if (!exists) {
      await prisma.holidayCalendar.create({
        data: { ...holiday, tenantId: tenant.id },
      });
    }
  }

  console.log(`✓ Israeli Holidays 2026: ${HOLIDAYS_2026.length} holidays seeded`);
  console.log('\n✅ Seed completed successfully!');
  console.log(`   Tenant ID: ${tenant.id}`);
  console.log('   Login: admin@demo.co.il / Admin1234!');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
