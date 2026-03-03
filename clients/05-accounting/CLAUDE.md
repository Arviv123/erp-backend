## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP Accounting — הנהלת חשבונות

## מה זו האפליקציה?
מערכת הנהלת חשבונות ישראלית עם חשבונאות כפולה (Double-Entry).
כולל תרשים חשבונות, יומן, מאזן בוחן, רווח/הפסד, מאזן ודוח מע"מ.

---

## חיבור לשרת המרכזי

```
BACKEND_URL = https://erp-backend-n433.onrender.com
```

**⚠️ Cold Start**: 30-60 שניות בפעם הראשונה.

### אותנטיקציה
```
POST /api/users/auth/login
Body: { "email": "admin2@test.co.il", "password": "Admin1234!", "tenantId": "cmm95megs00014n265h3objd5" }
```
Header: `Authorization: Bearer <token>`
**נדרשת הרשאה**: ACCOUNTANT לדוחות, ADMIN לביטול עסקאות

---

## API Endpoints

### תרשים חשבונות
```
GET    /api/accounting/accounts             → כל החשבונות פעילים
POST   /api/accounting/accounts             → יצירת חשבון (ACCOUNTANT+)
       Body: { code, name, nameEn?, type, parentId? }
       type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"

GET    /api/accounting/accounts/:id/balance → יתרת חשבון
       Query: asOf (תאריך, optional)
```

### יומן חשבונאי
```
POST   /api/accounting/transactions         → יצירת פעולה (ACCOUNTANT+)
       Body: { date, reference, description, sourceType, sourceId?, lines[] }
       lines: [{ debitAccountId, creditAccountId, amount, description? }]

GET    /api/accounting/transactions         → רשימה
       Query: status, sourceType, from, to, page, pageSize

POST   /api/accounting/transactions/:id/post  → אישור פעולה (ACCOUNTANT+)
POST   /api/accounting/transactions/:id/void  → ביטול פעולה (ADMIN)
```

### דוחות פיננסיים
```
GET    /api/accounting/trial-balance        → מאזן בוחן (ACCOUNTANT+)
       Query: asOf

GET    /api/accounting/reports/pl           → רווח והפסד (ACCOUNTANT+)
       Query: from (required), to (required)
       Example: ?from=2026-01-01&to=2026-03-31

GET    /api/accounting/reports/balance-sheet → מאזן (ACCOUNTANT+)
       Query: asOf (ברירת מחדל = היום)

GET    /api/accounting/reports/vat          → דוח מע"מ (ACCOUNTANT+)
       Query: period (required, פורמט YYYY-MM)
       Example: ?period=2026-02
```

---

## דאטה קיים לדמו

### תרשים חשבונות (13 חשבונות)
```
1200 — חשבון בנק (ASSET)
1300 — לקוחות (ASSET)
1400 — מלאי (ASSET)
3100 — ספקים (LIABILITY)
3200 — מעמ לתשלום (LIABILITY)
3500 — חובות שכר (LIABILITY)
4200 — עודפים (EQUITY)
5100 — הכנסות ממכירות (REVENUE)
5200 — הכנסות שירותים (REVENUE)
6100 — הוצאות שכר (EXPENSE)
6200 — הוצאות שכירות (EXPENSE)
6300 — הוצאות ספקים (EXPENSE)
6400 — הוצאות שיווק (EXPENSE)
```

### פעולות חשבונאיות (4, כולן POSTED)
```
הע-2026-0120    — קבלת תשלום אלפא טק — 48,852 ₪ (BANK ← AR)
שכר-2026-02     — שכר פברואר — 56,500 ₪ (SAL_EXP ← SAL_PAY)
מרקטינג-0226    — Google Ads — 8,500 ₪ (MKTG ← BANK)
חשב-שכירות-0126 — שכירות ינואר — 12,000 ₪ (RENT ← BANK)
```

---

## דפים לבנות

### `/` → Login

### `/accounting` → Dashboard הנה"ח

KPI cards:
```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   יתרת בנק      │ │  הכנסות מצטברות │ │  הוצאות מצטברות │ │  רווח נקי        │
│   +48,852 ₪    │ │   48,852 ₪      │ │   77,000 ₪      │ │  (28,148) ₪     │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

### `/accounting/accounts` → תרשים חשבונות

**עץ חשבונות** מקובץ לפי סוג:
```
▼ נכסים (ASSET)
   1200 — חשבון בנק        +48,852 ₪
   1300 — לקוחות           +49,678 ₪
   1400 — מלאי                  0 ₪

▼ התחייבויות (LIABILITY)
   3100 — ספקים                 0 ₪
   3200 — מעמ לתשלום            0 ₪
   3500 — חובות שכר             0 ₪

▼ הכנסות (REVENUE)
   5100 — הכנסות ממכירות        0 ₪
   5200 — הכנסות שירותים   48,852 ₪

▼ הוצאות (EXPENSE)
   6100 — הוצאות שכר       56,500 ₪
   6200 — הוצאות שכירות    12,000 ₪
   6400 — הוצאות שיווק      8,500 ₪
```

כפתור "+ חשבון חדש" → modal עם form

### `/accounting/transactions` → יומן

**Filters**: סטאטוס (DRAFT/POSTED/VOID) + מתאריך + עד תאריך + סוג מקור

**טבלה**:
```
תאריך     | אסמכתא          | תיאור                    | סכום    | סטאטוס | פעולות
01/02/26  | שכר-2026-02    | תשלום שכר - פברואר      | 56,500 ₪ | ✅ POSTED | [צפה]
20/02/26  | הע-2026-0120   | קבלת תשלום - אלפא טק   | 48,852 ₪ | ✅ POSTED | [צפה]
```

כפתור "+ פעולה ידנית" → form עם שורות חיוב/זיכוי

### `/accounting/trial-balance` → מאזן בוחן

Date picker "ליום: [01/03/2026]"

```
חשבון | שם               | חיוב     | זיכוי
1200  | חשבון בנק        | 48,852   |
1300  | לקוחות          |         | 49,678
5200  | הכנסות שירותים  |         | 48,852
6100  | הוצאות שכר      | 56,500   |
6200  | הוצאות שכירות   | 12,000   |
6400  | הוצאות שיווק    |  8,500   |
─────────────────────────────────────
      | סה"כ            | 125,852  | 98,530
```

### `/accounting/reports/pl` → רווח והפסד

Date range picker (ברירת מחדל: ינואר-מרץ 2026)

```
דוח רווח והפסד: ינואר–מרץ 2026
══════════════════════════════
הכנסות
  הכנסות שירותים:     48,852 ₪
  ─────────────────────────────
  סה"כ הכנסות:        48,852 ₪

הוצאות
  הוצאות שכר:         56,500 ₪
  הוצאות שכירות:      12,000 ₪
  הוצאות שיווק:        8,500 ₪
  ─────────────────────────────
  סה"כ הוצאות:        77,000 ₪

══════════════════════════════
רווח / (הפסד) נקי:  (28,148 ₪)
```

### `/accounting/reports/balance-sheet` → מאזן

```
מאזן ליום: 01/03/2026
══════════════════════════════
נכסים
  חשבון בנק:    48,852 ₪
  לקוחות:       49,678 ₪
  מלאי:              0 ₪
  ─────────────
  סה"כ נכסים:   98,530 ₪

התחייבויות
  ספקים:             0 ₪
  ─────────────────
  סה"כ התחייבויות:   0 ₪

הון עצמי
  עודפים:       98,530 ₪
  ─────────────────────
  סה"כ הון:     98,530 ₪

══════════════════════════════
בדיקת איזון: נכסים = התחייבויות + הון ✅
```

### `/accounting/reports/vat` → דוח מע"מ

Period picker (ברירת מחדל: 2026-02)

```
דוח מע"מ — פברואר 2026
══════════════════════════════
עסקאות חייבות:
  INV-2026-0002: 15,222 ₪ (מע"מ: 2,322 ₪)
  ─────────────────────────
  סה"כ עסקאות:  15,222 ₪
  מע"מ עסקאות:   2,322 ₪

תשומות (קניות):      0 ₪

══════════════════════════════
מע"מ לתשלום:         2,322 ₪
```

---

## Tech Stack

```
React 18 + TypeScript + Tailwind CSS (RTL)
@tanstack/react-query v5 + React Router v6 + Axios + lucide-react
recharts (גרפים) — npm install recharts
```

---

## סדר פיתוח
1. `src/lib/api.ts` + Auth
2. `src/pages/LoginPage.tsx`
3. `src/pages/AccountingDashboardPage.tsx`
4. `src/pages/ChartOfAccountsPage.tsx` (tree view)
5. `src/pages/JournalPage.tsx` (transactions list + form)
6. `src/pages/TrialBalancePage.tsx`
7. `src/pages/PLReportPage.tsx`
8. `src/pages/BalanceSheetPage.tsx`
9. `src/pages/VATReportPage.tsx`
