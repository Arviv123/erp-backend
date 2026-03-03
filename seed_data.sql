-- ═══════════════════════════════════════════════════
-- ERP Seed Data — Demo Tenant + Israeli Chart of Accounts
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id UUID;
  a_1000 UUID; a_1200 UUID; a_2000 UUID;
  a_3000 UUID; a_4000 UUID; a_5000 UUID;
  a_6000 UUID; a_7000 UUID; a_7100 UUID;
BEGIN

-- ─── 1. Create Demo Tenant ───────────────────────────────────────────
SELECT id INTO v_tenant_id FROM "Tenant" WHERE "businessNumber" = '500000000' LIMIT 1;

IF v_tenant_id IS NULL THEN
  INSERT INTO "Tenant" (
    id, name, "businessNumber", "vatNumber", phone, email,
    address, "taxSettings", "isActive", "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid(),
    'חברת הדגמה בע"מ',
    '500000000',
    '100000001',
    '03-1234567',
    'admin@demo.co.il',
    '{"street":"רחוב הרצל 1","city":"תל אביב","zip":"6100000","country":"IL"}'::jsonb,
    '{"vatRate":0.18,"taxYear":2026}'::jsonb,
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO v_tenant_id;
  RAISE NOTICE 'Tenant created: %', v_tenant_id;
ELSE
  RAISE NOTICE 'Tenant already exists: %', v_tenant_id;
END IF;

-- ─── 2. Create Admin User ────────────────────────────────────────────
-- Password: Admin1234! (bcrypt hash cost=12)
INSERT INTO "User" (
  id, "tenantId", email, "passwordHash", role,
  "firstName", "lastName", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), v_tenant_id, 'admin@demo.co.il',
  '$2a$12$LZCoA5L2QzBGKSqt2.4MteH6XNFJ5ycOmQV8H3KZhcf1K2H.a2Iy',
  'ADMIN', 'מנהל', 'מערכת', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "User" WHERE "tenantId" = v_tenant_id AND email = 'admin@demo.co.il'
);

-- ─── 3. Chart of Accounts (Root Nodes) ───────────────────────────────

-- ASSETS
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'1000','נכסים שוטפים','Current Assets','ASSET',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_1000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='1000';

INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'2000','נכסים קבועים','Fixed Assets','ASSET',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_2000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='2000';

-- LIABILITIES
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'3000','התחייבויות שוטפות','Current Liabilities','LIABILITY',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_3000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='3000';

INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'4000','התחייבויות לזמן ארוך','Long-term Liabilities','LIABILITY',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_4000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='4000';

-- EQUITY
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'5000','הון עצמי','Equity','EQUITY',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_5000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='5000';

-- REVENUE
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'6000','הכנסות','Revenue','REVENUE',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_6000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='6000';

-- EXPENSES
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid(),v_tenant_id,'7000','הוצאות','Expenses','EXPENSE',true,NOW(),NOW())
ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_7000 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='7000';

-- ─── Child Accounts ───────────────────────────────────────────────────

-- Current Assets
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1100','קופה ומזומן','Cash & Petty Cash','ASSET',a_1000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1200','חשבון בנק','Bank Account','ASSET',a_1000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_1200 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='1200';
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1210','בנק לאומי','Bank Leumi','ASSET',a_1200,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1220','בנק הפועלים','Bank Hapoalim','ASSET',a_1200,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1300','לקוחות (חובות)','Accounts Receivable','ASSET',a_1000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1400','מלאי','Inventory','ASSET',a_1000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1500','מקדמות לספקים','Prepaid to Suppliers','ASSET',a_1000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'1600','מע"מ תשומות','VAT Input','ASSET',a_1000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- Fixed Assets
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'2100','ציוד','Equipment','ASSET',a_2000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'2200','רכבים','Vehicles','ASSET',a_2000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'2300','מחשבים ותוכנה','IT & Software','ASSET',a_2000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'2900','פחת נצבר','Accumulated Depreciation','ASSET',a_2000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- Current Liabilities
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3100','ספקים (זכאים)','Accounts Payable','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3200','מע"מ לתשלום','VAT Payable','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3300','ביטוח לאומי לתשלום','National Insurance Payable','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3400','ניכוי מס הכנסה מהמקור','Income Tax Withheld','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3500','חובות שכר','Accrued Salaries','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3600','מקדמות מלקוחות','Customer Advances','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'3700','פנסיה מעסיק לתשלום','Pension Payable','LIABILITY',a_3000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- Long-term Liabilities
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'4100','הלוואות לזמן ארוך','Long-term Loans','LIABILITY',a_4000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- Equity
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'5100','הון מניות','Share Capital','EQUITY',a_5000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'5200','עודפים','Retained Earnings','EQUITY',a_5000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'5300','רווח השנה','Current Year Profit','EQUITY',a_5000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- Revenue
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'6100','הכנסות ממכירות','Sales Revenue','REVENUE',a_6000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'6200','הכנסות שירותים','Service Revenue','REVENUE',a_6000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'6300','הכנסות אחרות','Other Revenue','REVENUE',a_6000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'6400','הכנסות ריבית','Interest Income','REVENUE',a_6000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- Expenses
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7100','הוצאות שכר','Salary Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
SELECT id INTO a_7100 FROM "Account" WHERE "tenantId"=v_tenant_id AND code='7100';
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7110','שכר ברוטו','Gross Salary','EXPENSE',a_7100,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7120','פנסיה מעסיק','Employer Pension','EXPENSE',a_7100,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7130','ביטוח לאומי מעסיק','Employer NI','EXPENSE',a_7100,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7140','פיצויים','Severance Pay Provision','EXPENSE',a_7100,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7200','הוצאות שכירות','Rent Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7300','הוצאות רכב','Vehicle Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7400','הוצאות טלפון ותקשורת','Communication Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7500','הוצאות פרסום ושיווק','Marketing Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7600','הוצאות ספקים','Supplier Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7700','הוצאות ריבית','Interest Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7800','פחת','Depreciation','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;
INSERT INTO "Account" (id,"tenantId",code,name,"nameEn",type,"parentId","isActive","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'7900','הוצאות אחרות','Other Expenses','EXPENSE',a_7000,true,NOW(),NOW()) ON CONFLICT ("tenantId",code) DO NOTHING;

-- ─── 4. Israeli Holidays 2026 ────────────────────────────────────────
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'ראש השנה (א)','2026-09-11',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'ראש השנה (ב)','2026-09-12',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'יום כיפור','2026-09-20',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'סוכות','2026-09-25',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'שמחת תורה','2026-10-02',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'פסח (א)','2026-04-02',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'פסח (ז)','2026-04-08',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'יום העצמאות','2026-04-29',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'שבועות','2026-05-22',true,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'פורים','2026-03-03',false,NOW(),NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "HolidayCalendar" (id,"tenantId",name,date,"isNational","createdAt","updatedAt") VALUES (gen_random_uuid(),v_tenant_id,'חנוכה (א)','2026-12-05',false,NOW(),NOW()) ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ Seed completed! Tenant ID: %', v_tenant_id;
RAISE NOTICE 'Login: admin@demo.co.il / Admin1234!';

END $$;
