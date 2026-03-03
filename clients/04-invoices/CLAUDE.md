# ERP Invoices — ניהול חשבוניות

## מה זו האפליקציה?
מערכת חשבוניות ישראלית מלאה: יצירה, שליחה, גביה, דוח גיל חובות.
כולל חשבוניות מע"מ (18%), מעקב תשלומים ו-PDF.

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

---

## API Endpoints

### חשבוניות
```
POST   /api/invoices                    → יצירת חשבונית
GET    /api/invoices                    → רשימה עם פילטרים
       Query: status, customerId, from, to, page, pageSize
GET    /api/invoices/aging              → דוח גיל חובות (ACCOUNTANT+)
GET    /api/invoices/:id                → פרטי חשבונית + שורות + תשלומים
POST   /api/invoices/:id/send           → שלח (DRAFT → SENT)
POST   /api/invoices/:id/pay            → רשום תשלום
POST   /api/invoices/:id/cancel         → בטל (ACCOUNTANT+)
POST   /api/invoices/update-overdue     → עדכן חשבוניות שעברו תאריך (ADMIN)
```

### לקוחות (לdropdown)
```
GET    /api/crm/customers               → כל הלקוחות לdropdown
GET    /api/crm/customers/:id           → פרטי לקוח
```

### Schema — יצירת חשבונית
```typescript
{
  customerId:   string    // cuid של לקוח
  date:         string    // "2026-03-01T00:00:00.000Z"
  dueDate:      string    // "2026-03-31T00:00:00.000Z"
  notes?:       string
  paymentTerms?: string   // "שוטף +30"
  lines: [{
    description: string   // תיאור שורה
    quantity:    number   // כמות
    unitPrice:   number   // מחיר ליחידה
    vatRate:     number   // 0.18 (18%)
  }]
}
```

### Schema — רישום תשלום
```typescript
{
  amount:     number
  method:     "CASH" | "BANK_TRANSFER" | "CREDIT_CARD" | "CHECK" | "OTHER"
  date:       string    // ISO datetime
  reference?: string    // מספר העברה / צ'ק
  notes?:     string
}
```

---

## דאטה קיים לדמו

### חשבוניות קיימות
| מספר | לקוח | סכום | מע"מ | סטאטוס |
|------|------|------|------|--------|
| INV-2026-0001 | טכנולוגיות אלפא | 48,852 ₪ | 6,282 ₪ | **PAID** |
| INV-2026-0002 | גרין גארדן | 15,222 ₪ | 1,956 ₪ | **OVERDUE** |
| INV-2026-0003 | דוד לוי | 20,709 ₪ | 2,659 ₪ | SENT |
| INV-2026-0004 | מסעדת הים הכחול | 34,456 ₪ | 4,426 ₪ | **OVERDUE** |
| INV-2026-0005 | טכנולוגיות אלפא | 50,268 ₪ | 6,459 ₪ | DRAFT |

### לקוחות קיימים
```
טכנולוגיות אלפא בע"מ — B2B — office@alpha-tech.co.il
גרין גארדן שירותי גינון — B2B — info@green-garden.co.il
דוד לוי יעוץ עסקי — B2C — david.levi@gmail.com
מסעדת הים הכחול — B2C — manager@hayam.co.il
```

---

## דפים לבנות

### `/` → Login

### `/invoices` → רשימת חשבוניות

**Toolbar**:
- פילטר סטאטוס: [הכל | טיוטה | נשלח | שולם | פג תוקף | בוטל]
- חיפוש לקוח
- פילטר תאריכים (מ/עד)
- כפתור "חשבונית חדשה"
- כפתור "עדכן פגי תוקף" (ADMIN)

**טבלה**:
```
מספר       | תאריך     | לקוח              | לפני מע"מ | מע"מ    | סה"כ     | סטאטוס   | פעולות
INV-2026-0005 | 01/03/26 | טכנולוגיות אלפא  | 42,600 ₪  | 7,668 ₪ | 50,268 ₪ | 📄 טיוטה  | [שלח] [בטל]
INV-2026-0001 | 15/01/26 | טכנולוגיות אלפא  | 41,400 ₪  | 7,452 ₪ | 48,852 ₪ | ✅ שולם   | [צפה]
INV-2026-0002 | 01/02/26 | גרין גארדן       | 12,900 ₪  | 2,322 ₪ | 15,222 ₪ | 🔴 פג תוקף| [רשום תשלום]
```

**KPI Row**:
```
סה"כ חשבוניות: 5 | פתוחות: 3 | פגות תוקף: 2 | שולם: 48,852 ₪
```

### `/invoices/new` → יצירת חשבונית

**Form**:
- לקוח (dropdown מלקוחות קיימים)
- תאריך חשבונית + תאריך לתשלום
- הערות + תנאי תשלום

**טבלת שורות (dynamic)**:
```
[+] הוסף שורה

 # | תיאור             | כמות | מחיר יחידה | מע"מ | סה"כ שורה
 1 | שעות פיתוח       |  80  |   350 ₪    | 18%  |  32,060 ₪
 2 | עיצוב UI         |  20  |   280 ₪    | 18%  |   6,608 ₪
   [מחק שורה]

───────────────────────────────────────
                     לפני מע"מ:  38,600 ₪
                     מע"מ 18%:    6,948 ₪
                     סה"כ לתשלום: 45,548 ₪
```

כפתורים: [שמור כטיוטה] [שמור ושלח]

### `/invoices/:id` → פרטי חשבונית

**Header**: מספר חשבונית + סטאטוס badge + כפתורי פעולה

**לפי סטאטוס**:
- DRAFT → [שלח] [ערוך] [בטל]
- SENT → [רשום תשלום] [בטל]
- PAID → [צור חשבונית חדשה ללקוח]
- OVERDUE → [רשום תשלום] [בטל]

**גוף חשבונית** (פורמט ישראלי):
```
╔══════════════════════════════════════╗
║  חשבונית מס INV-2026-0001            ║
║  תאריך: 15/01/2026                   ║
║  לתשלום עד: 14/02/2026               ║
╠══════════════════════════════════════╣
║  לכבוד: טכנולוגיות אלפא בע"מ        ║
║  office@alpha-tech.co.il             ║
╠══════════════════════════════════════╣
║  תיאור          כמות  מחיר   סה"כ   ║
║  שעות פיתוח CRM  80   350  28,000   ║
║  עיצוב UI/UX     20   280   5,600   ║
║  בדיקות QA       15   220   3,300   ║
║  הקמת AWS         1  4,500  4,500   ║
╠══════════════════════════════════════╣
║              לפני מע"מ:  41,400 ₪   ║
║              מע"מ 18%:    7,452 ₪   ║
║              סה"כ:       48,852 ₪   ║
╚══════════════════════════════════════╝
```

**היסטוריית תשלומים**:
```
תאריך      | סכום      | אמצעי תשלום    | אסמכתא
20/02/2026 | 48,852 ₪  | העברה בנקאית  | העברה 120234
```

### Modal — רישום תשלום
```
סכום לתשלום:  [_______] ₪    יתרה: 15,222 ₪
אמצעי תשלום: [BANK_TRANSFER ▼]
תאריך:        [____/____/____]
אסמכתא:      [______________]
הערות:        [______________]
[ביטול] [רשום תשלום]
```

### `/invoices/aging` → דוח גיל חובות

```
לקוח                | 0-30 יום | 31-60 יום | 61-90 יום | 90+ יום | סה"כ
גרין גארדן          |    -     |  15,222 ₪ |     -     |    -    | 15,222 ₪
מסעדת הים הכחול    |    -     |     -     |  34,456 ₪ |    -    | 34,456 ₪
─────────────────────────────────────────────────────────────────────────────
סה"כ                |    -     |  15,222 ₪ | 34,456 ₪  |    -    | 49,678 ₪
```

---

## Tech Stack

```
React 18 + TypeScript + Tailwind CSS (RTL)
@tanstack/react-query v5 + React Router v6 + Axios
lucide-react + react-hook-form + zod
```

---

## הנחיות RTL + עברית

- `<html dir="rtl" lang="he">`
- מע"מ: תמיד 18% אלא אם שונה בשורה
- מספרים: `₪` אחרי המספר
- תאריכים: `dd/mm/yyyy` פורמט ישראלי

---

## סדר פיתוח
1. `src/lib/api.ts` + `src/contexts/AuthContext.tsx`
2. `src/pages/LoginPage.tsx`
3. `src/pages/InvoicesListPage.tsx` (with KPI + table + filters)
4. `src/pages/NewInvoicePage.tsx` (dynamic lines table)
5. `src/pages/InvoiceDetailPage.tsx` (Hebrew invoice format)
6. `src/components/PaymentModal.tsx`
7. `src/pages/AgingReportPage.tsx`
