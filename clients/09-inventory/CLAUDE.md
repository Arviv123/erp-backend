## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP Inventory — ניהול מלאי

## מה זו האפליקציה?
מערכת ניהול מלאי: פריטים, קטגוריות, תנועות מלאי, הזמנות רכש ועוד.
מתחברת למודול הרכש וה-POS.

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
GET    /api/inventory/items                  → רשימת פריטים
       Query: category, isActive, lowStock, page, pageSize

GET    /api/inventory/items/:id              → פרט פריט + תנועות

POST   /api/inventory/items                  → פריט חדש
       Body: {
         sku, name, description?,
         category, unit ("UNIT"|"KG"|"LITER"|"METER"|"BOX"),
         costPrice, sellingPrice,
         currentStock, minStockLevel,
         vatRate (0.18 ברירת מחדל),
         isActive
       }

PATCH  /api/inventory/items/:id              → עדכון פריט

POST   /api/inventory/items/:id/adjust       → תיקון מלאי
       Body: { quantity (חיובי/שלילי), reason, notes? }

GET    /api/inventory/movements              → תנועות מלאי
       Query: itemId, type, from, to, page, pageSize
```

---

## דאטה קיים
המערכת ריקה — יש ליצור פריטים ראשונים דרך האפליקציה.

**קטגוריות לדוגמה**: אלקטרוניקה, מזון, משרד, ציוד, תוכנה

---

## דפים לבנות

### `/` → Login

### `/inventory` → לוח בקרה מלאי

**KPI Cards**:
```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  0 פריטים     │ │  0 מלאי נמוך  │ │  0 ₪ שווי     │ │  0 תנועות     │
│  פעילים       │ │  מתחת למינ'   │ │  מלאי          │ │  היום          │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
```

Alert אדום אם יש פריטים מתחת ל-minStockLevel

### `/inventory/items` → רשימת פריטים

**Toolbar**: חיפוש + filter קטגוריה + filter מלאי נמוך + "+ פריט חדש"

**טבלה**:
```
מק"ט   | שם         | קטגוריה | מלאי  | מינ' | מחיר קנייה | מחיר מכירה | פעולות
PRD-001 | מחשב נייד  | אלקטרוני | 15   |  5  | 2,500 ₪   | 3,800 ₪    | [ערוך] [תנועה]
```

**Badge מלאי**: ירוק (מספיק) / אדום (מתחת מינ') / אפור (לא פעיל)

### `/inventory/items/new` → פריט חדש

Form:
1. מק"ט + שם + תיאור + קטגוריה
2. יחידת מידה + מחיר קנייה + מחיר מכירה + מע"מ
3. מלאי נוכחי + מלאי מינ' לאזהרה

### `/inventory/items/:id` → פרטי פריט

**Header**: שם + מק"ט + badge מלאי

**Info**: כל הפרטים + כרטיס מלאי עם:
```
מלאי נוכחי: 15 יחידות
ערך מלאי: 37,500 ₪
מינ' להזמנה: 5 יחידות
```

**כפתור "תיקון מלאי"** → Modal:
```
תיקון מלאי — מחשב נייד
מלאי נוכחי: 15

סוג תיקון: [הוספה ▼] / [הפחתה]
כמות:       [____]
סיבה:       [גניבה / נזק / ספירה / רכישה ▼]
הערות:      [__________]
[ביטול] [עדכן מלאי]
```

**היסטוריית תנועות**:
```
תאריך    | סוג       | כמות | מלאי אחרי | סיבה
02/03/26 | תיקון +   | +5   | 15        | קליטת סחורה
```

### `/inventory/movements` → כל תנועות המלאי

Filters: פריט + סוג + תאריך

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
3. `src/pages/InventoryDashboardPage.tsx`
4. `src/pages/ItemsPage.tsx` (list + filters)
5. `src/pages/NewItemPage.tsx`
6. `src/pages/ItemDetailPage.tsx` + `src/components/StockAdjustModal.tsx`
7. `src/pages/MovementsPage.tsx`
