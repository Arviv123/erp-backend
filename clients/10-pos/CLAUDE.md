## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP POS — קופה רושמת

## מה זו האפליקציה?
קופה רושמת לממשק נקודת מכירה (Point of Sale).
מחוברת למלאי ויוצרת חשבוניות אוטומטית בכל מכירה.

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

### POS
```
POST   /api/pos/sales                        → מכירה חדשה
       Body: {
         items: [{ itemId, quantity, unitPrice, discount? }],
         paymentMethod: "CASH" | "CREDIT_CARD" | "OTHER",
         customerId?: string,
         notes?: string
       }

GET    /api/pos/sales                        → היסטוריית מכירות
       Query: from, to, page, pageSize

GET    /api/pos/sales/:id                    → פרטי מכירה

GET    /api/pos/summary                      → סיכום יומי/חודשי
       Query: date (ברירת מחדל: היום)
```

### מלאי (לחיפוש פריטים בקופה)
```
GET    /api/inventory/items                  → כל הפריטים
       Query: isActive=true, page=1, pageSize=100
```

---

## דאטה קיים
- קופה ריקה — יש להוסיף פריטים ב-09-inventory קודם

---

## ממשק קופה — Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  🏪 ERP קופה                    משמרת: 09:00 | קופאי: יוסי כהן │
├───────────────────────────────────────┬──────────────────────────┤
│                                       │  🛒 עגלת קנייה           │
│  🔍 חיפוש מוצר / סריקת ברקוד        │                          │
│  [________________________]          │  מוצר A    2×  100 ₪    │
│                                       │  מוצר B    1×   50 ₪    │
│  קטגוריות:                            │  ─────────────────────   │
│  [הכל] [אלקטרוני] [מזון] [משרד]     │  לפני מע"מ:   127.12 ₪  │
│                                       │  מע"מ 18%:     22.88 ₪  │
│  ┌──────────┐ ┌──────────┐           │  ─────────────────────   │
│  │מחשב נייד│ │  עכבר    │           │  סה"כ:        150.00 ₪  │
│  │ 3,800 ₪ │ │  250 ₪  │           │                          │
│  └──────────┘ └──────────┘           │  [🗑 נקה עגלה]           │
│  ┌──────────┐ ┌──────────┐           │                          │
│  │ מקלדת   │ │  צג      │           │  [💰 מזומן]  [💳 אשראי] │
│  │  350 ₪  │ │ 800 ₪  │           │                          │
│  └──────────┘ └──────────┘           │  [✅  בצע מכירה]        │
└───────────────────────────────────────┴──────────────────────────┘
```

---

## דפים לבנות

### `/` → Login

### `/pos` → מסך קופה ראשי

**Left Panel — קטלוג**:
- חיפוש חי (debounce 300ms) לפי שם/מק"ט
- Tabs לקטגוריות
- Grid של פריטים (קלפים עם תמונה/icon, שם, מחיר)
- לחיצה על פריט → מוסיף לעגלה

**Right Panel — עגלה**:
- רשימת פריטים עם כמות (+ / -)
- סה"כ + מע"מ + לשלם
- כפתורי תשלום: מזומן / אשראי
- כפתור "בצע מכירה"

**Modal — אישור מכירה**:
```
סה"כ לתשלום: 150.00 ₪

💰 מזומן שהתקבל: [_______] ₪
💵 עודף:          [יחושב]  ₪

לקוח (אופציונלי): [בחר לקוח ▼]

[ביטול] [✅ אשר מכירה]
```

**אחרי מכירה**: הצג קבלה + "מכירה חדשה"

### `/pos/sales` → היסטוריית מכירות

Filters: תאריך מ/עד

**טבלה**:
```
תאריך     | שעה  | פריטים | לפני מע"מ | מע"מ  | סה"כ   | תשלום
02/03/26  | 10:35 |   3   | 127 ₪    | 23 ₪  | 150 ₪  | מזומן
```

**סיכום יומי בתחתית**:
```
סה"כ מכירות היום: 1 | סה"כ הכנסות: 150 ₪
```

### `/pos/summary` → דוח מכירות

Date range + breakdowns:
- לפי שעה (גרף)
- מוצרים נמכרים ביותר
- שיטות תשלום

---

## Tech Stack

```
React 18 + TypeScript + Tailwind CSS (RTL)
@tanstack/react-query v5 + React Router v6 + Axios + lucide-react
```

---

## הנחיות מיוחדות

- **ממשק קופה**: layout מותאם ל-touch screen / tablet
- **גדלי טקסט גדולים**: פריטים וסכומים ברורים מרחוק
- **קיצורי מקלדת**: Enter לאישור, Escape לביטול, F1 לפריט חדש
- **אחסון זמני**: שמור עגלה ב-sessionStorage למקרה של refresh
- **חישוב מע"מ**: `Math.round(total * 0.18 * 100) / 100`

---

## סדר פיתוח
1. `src/lib/api.ts` + Auth
2. `src/pages/LoginPage.tsx`
3. `src/pages/POSPage.tsx` (main POS screen — split layout)
4. `src/components/ProductGrid.tsx` + `src/components/CartPanel.tsx`
5. `src/components/SaleModal.tsx` (confirm + cash change)
6. `src/pages/SalesHistoryPage.tsx`
7. `src/pages/SalesSummaryPage.tsx`
