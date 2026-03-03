/**
 * One-shot script: fix Hebrew encoding for all accounts in all tenants.
 * Uses a single $transaction to avoid Neon connection drops.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_NAMES: Record<string, { name: string; nameEn: string }> = {
  '1000': { name: 'נכסים שוטפים',          nameEn: 'Current Assets' },
  '1100': { name: 'קופה ומזומן',            nameEn: 'Cash & Petty Cash' },
  '1200': { name: 'חשבון בנק',              nameEn: 'Bank Account' },
  '1210': { name: 'בנק לאומי',              nameEn: 'Bank Leumi' },
  '1220': { name: 'בנק הפועלים',            nameEn: 'Bank Hapoalim' },
  '1300': { name: 'לקוחות (חובות)',          nameEn: 'Accounts Receivable' },
  '1400': { name: 'מלאי',                   nameEn: 'Inventory' },
  '1500': { name: 'מקדמות לספקים',           nameEn: 'Prepaid to Suppliers' },
  '1600': { name: 'מע"מ תשומות',             nameEn: 'VAT Input' },
  '2000': { name: 'נכסים קבועים',            nameEn: 'Fixed Assets' },
  '2100': { name: 'ציוד',                   nameEn: 'Equipment' },
  '2200': { name: 'רכבים',                  nameEn: 'Vehicles' },
  '2300': { name: 'מחשבים ותוכנה',           nameEn: 'IT & Software' },
  '2900': { name: 'פחת נצבר',               nameEn: 'Accumulated Depreciation' },
  '3000': { name: 'התחייבויות שוטפות',       nameEn: 'Current Liabilities' },
  '3100': { name: 'ספקים (זכאים)',            nameEn: 'Accounts Payable' },
  '3200': { name: 'מע"מ לתשלום',             nameEn: 'VAT Payable' },
  '3300': { name: 'ביטוח לאומי לתשלום',      nameEn: 'National Insurance Payable' },
  '3400': { name: 'ניכוי מס הכנסה מהמקור',   nameEn: 'Income Tax Withheld' },
  '3500': { name: 'חובות שכר',               nameEn: 'Accrued Salaries' },
  '3600': { name: 'מקדמות מלקוחות',           nameEn: 'Customer Advances' },
  '3700': { name: 'פנסיה מעסיק לתשלום',      nameEn: 'Pension Payable' },
  '4000': { name: 'התחייבויות לזמן ארוך',    nameEn: 'Long-term Liabilities' },
  '4100': { name: 'הלוואות לזמן ארוך',       nameEn: 'Long-term Loans' },
  '5000': { name: 'הון עצמי',                nameEn: 'Equity' },
  '5100': { name: 'הון מניות',               nameEn: 'Share Capital' },
  '5200': { name: 'עודפים',                  nameEn: 'Retained Earnings' },
  '5300': { name: 'רווח השנה',               nameEn: 'Current Year Profit' },
  '6000': { name: 'הכנסות',                  nameEn: 'Revenue' },
  '6100': { name: 'הכנסות ממכירות',           nameEn: 'Sales Revenue' },
  '6200': { name: 'הכנסות שירותים',           nameEn: 'Service Revenue' },
  '6300': { name: 'הכנסות אחרות',             nameEn: 'Other Revenue' },
  '6400': { name: 'הכנסות ריבית',             nameEn: 'Interest Income' },
  '7000': { name: 'הוצאות',                  nameEn: 'Expenses' },
  '7100': { name: 'הוצאות שכר',               nameEn: 'Salary Expenses' },
  '7110': { name: 'שכר ברוטו',               nameEn: 'Gross Salary' },
  '7120': { name: 'פנסיה מעסיק',              nameEn: 'Employer Pension' },
  '7130': { name: 'ביטוח לאומי מעסיק',        nameEn: 'Employer NI' },
  '7140': { name: 'פיצויים',                 nameEn: 'Severance Pay Provision' },
  '7200': { name: 'הוצאות שכירות',            nameEn: 'Rent Expenses' },
  '7300': { name: 'הוצאות רכב',               nameEn: 'Vehicle Expenses' },
  '7400': { name: 'הוצאות טלפון ותקשורת',    nameEn: 'Communication Expenses' },
  '7500': { name: 'הוצאות פרסום ושיווק',      nameEn: 'Marketing Expenses' },
  '7600': { name: 'הוצאות ספקים',             nameEn: 'Supplier Expenses' },
  '7700': { name: 'הוצאות ריבית',             nameEn: 'Interest Expenses' },
  '7800': { name: 'פחת',                     nameEn: 'Depreciation' },
  '7900': { name: 'הוצאות אחרות',             nameEn: 'Other Expenses' },
};

async function main() {
  console.log('🔧 Fixing Hebrew encoding for all accounts...');

  const updates = Object.entries(ACCOUNT_NAMES).map(([code, { name, nameEn }]) =>
    prisma.account.updateMany({
      where: { code },
      data: { name, nameEn },
    })
  );

  const results = await prisma.$transaction(updates);
  const total = results.reduce((s, r) => s + r.count, 0);

  console.log(`✅ Fixed ${total} account records across all tenants.`);
}

main()
  .catch(e => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
