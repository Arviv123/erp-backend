## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP CRM — ניהול לקוחות ומכירות

## מה זו האפליקציה?
מערכת CRM לניהול לקוחות, אנשי קשר, פניות ומעקב מכירות.
מחוברת ישירות למודול החשבוניות.

---

## חיבור לשרת המרכזי

```
BACKEND_URL = https://erp-backend-n433.onrender.com
```

### אותנטיקציה
```
POST /api/users/auth/login
Body: { "email": "admin2@test.co.il", "password": "Admin1234!", "tenantId": "cmm95megs00014n265h3objd5" }
```
Header: `Authorization: Bearer <token>`

---

## API Endpoints

```
GET    /api/crm/customers                    → רשימת לקוחות
       Query: type, isActive, page, pageSize

GET    /api/crm/customers/:id                → פרטי לקוח

POST   /api/crm/customers                    → לקוח חדש
       Body: {
         name, type ("B2B"|"B2C"|"GOVERNMENT"),
         email?, phone?,
         address?: { street, city, zip },
         vatNumber?, paymentTerms?,
         notes?, tags?
       }

PATCH  /api/crm/customers/:id                → עדכון לקוח

DELETE /api/crm/customers/:id                → ביטול לקוח

GET    /api/crm/customers/:id/invoices       → חשבוניות הלקוח
```

---

## דאטה קיים

```
טכנולוגיות אלפא בע"מ  | B2B | 03-5551234  | תשלומים: 2 חשבוניות
גרין גארדן שירותי גינון | B2B | 09-7762233  | חשבונית OVERDUE
דוד לוי יעוץ עסקי      | B2C | 050-3334455 | חשבונית SENT
מסעדת הים הכחול        | B2C | 04-8881122  | חשבונית OVERDUE
```

---

## דפים לבנות

### `/` → Login

### `/crm` → רשימת לקוחות

**Toolbar**: חיפוש + filter B2B/B2C/GOVERNMENT + כפתור "+ לקוח חדש"

**כרטיסי לקוחות** (Grid layout, 3 בשורה):
```
┌─────────────────────────────────┐
│ 🏢 טכנולוגיות אלפא בע"מ        │
│ B2B | 03-5551234                │
│ office@alpha-tech.co.il         │
│                                 │
│ סה"כ חשבוניות: 2 | פתוחות: 0  │
│ יתרה: 0 ₪                      │
│                    [צפה בפרטים] │
└─────────────────────────────────┘
```

Badge סוג:
- B2B → כחול "עסק"
- B2C → ירוק "פרטי"
- GOVERNMENT → סגול "ממשלה"

### `/crm/customers/new` → לקוח חדש

Form sections:
1. **פרטים בסיסיים**: שם, סוג (B2B/B2C/GOVERNMENT), ע.מ./ח.פ.
2. **פרטי קשר**: טלפון, אימייל
3. **כתובת**: רחוב, עיר, מיקוד
4. **הגדרות**: תנאי תשלום (ימים), הערות

### `/crm/customers/:id` → פרופיל לקוח

**Header**: שם + סוג + badge פעיל

**Tabs**:
- **פרטים**: כל הפרטים + כפתור "ערוך"
- **חשבוניות**: רשימת חשבוניות הלקוח + סיכום:
  ```
  סה"כ חשבונות: 2 | שולם: 48,852 ₪ | פתוח: 0 ₪ | פג תוקף: 0 ₪
  [INV-2026-0001 | 48,852 ₪ | PAID | 15/01/26]
  [INV-2026-0005 | 50,268 ₪ | DRAFT | 01/03/26]
  ```
- **פעילות**: (placeholder לגרסה עתידית)

**כפתורים**: [צור חשבונית ללקוח] → redirect ל-/invoices/new?customerId=xxx

---

## Tech Stack

```
React 18 + TypeScript + Tailwind CSS (RTL)
@tanstack/react-query v5 + React Router v6 + Axios + lucide-react
```

---

## סדר פיתוח
1. `src/lib/api.ts` + Auth
2. `src/pages/LoginPage.tsx`
3. `src/pages/CustomersPage.tsx` (grid cards)
4. `src/pages/NewCustomerPage.tsx`
5. `src/pages/CustomerDetailPage.tsx` (tabs)
