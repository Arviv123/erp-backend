## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP Payroll — ניהול שכר

## מה זו האפליקציה?
מערכת ניהול שכר ישראלית מלאה: ריצות שכר, תלושי שכר, אישורים, דוחות.
מחשבת שכר לפי מדרגות מס ישראל 2026, ביטוח לאומי ופנסיה.

---

## חיבור לשרת המרכזי

```
BACKEND_URL = https://erp-backend-n433.onrender.com
```

**⚠️ Cold Start**: הבקשה הראשונה לוקחת 30-60 שניות.

### אותנטיקציה
```
POST /api/users/auth/login
Body: { "email": "admin2@test.co.il", "password": "Admin1234!", "tenantId": "cmm95megs00014n265h3objd5" }
```
Header: `Authorization: Bearer <token>`

---

## API Endpoints

```
POST   /api/payroll/run                    → ריצת שכר חדשה (HR_MANAGER+)
       Body: { "period": "2026-03" }       // פורמט YYYY-MM

GET    /api/payroll/runs                   → רשימת כל הריצות
       Response: [{ id, period, status, totalGross, totalNet, _count.payslips }]

GET    /api/payroll/runs/:id/payslips      → פירוט ריצה + כל התלושים
       Response: { ...run, payslips: [{ ...payslip, employee: { firstName, lastName, idNumber } }] }

POST   /api/payroll/runs/:id/approve       → אישור ריצה (ADMIN)
POST   /api/payroll/runs/:id/paid          → סימון כשולם (ADMIN)

GET    /api/payroll/payslips/:id           → תלוש ספציפי

GET    /api/payroll/preview/:employeeId    → תחזית שכר בלי לשמור
       Response: {
         grossSalary, taxableIncome,
         incomeTax, nationalInsuranceEmployee, nationalInsuranceEmployer,
         pensionEmployee, pensionEmployer, severancePay,
         netSalary, breakdown: []
       }
```

### סטאטוסי ריצת שכר
```
DRAFT → APPROVED → PAID
```

---

## דאטה קיים לדמו

### ריצות שכר
| תקופה | סטאטוס | ברוטו | נטו |
|-------|--------|-------|-----|
| 2026-01 | PAID | 56,500 ₪ | 38,355 ₪ |
| 2026-02 | APPROVED | 56,500 ₪ | 38,355 ₪ |

### עובדים (תלושי פברואר)
| עובד | ברוטו | מס הכנסה | נטו |
|------|-------|----------|-----|
| יוסי כהן | 22,000 ₪ | 3,539 ₪ | 14,201 ₪ |
| מיכל לוי | 16,500 ₪ | 1,837 ₪ | 11,668 ₪ |
| אבי מזרחי | 18,000 ₪ | 2,175 ₪ | 12,485 ₪ |

---

## מדרגות מס 2026 (לתצוגה)

| הכנסה חודשית | שיעור |
|-------------|-------|
| 0 – 7,180 ₪ | 10% |
| 7,181 – 10,290 ₪ | 14% |
| 10,291 – 16,530 ₪ | 20% |
| 16,531 – 22,970 ₪ | 31% |
| 22,971 – 47,720 ₪ | 35% |
| מעל 47,720 ₪ | 47% |

נקודת זיכוי: 248 ₪/חודש

---

## דפים לבנות

### `/` → Login

### `/payroll` → רשימת ריצות שכר

**Header**: כותרת + כפתור "הפעל שכר חדש" (HR_MANAGER+)

**טבלה**:
```
תקופה   | עובדים | ברוטו      | נטו        | סטאטוס   | פעולות
2026-02 | 3     | 56,500 ₪  | 38,355 ₪  | ✅ מאושר  | [צפה] [אשר] [שולם]
2026-01 | 3     | 56,500 ₪  | 38,355 ₪  | 💰 שולם   | [צפה]
```

**Badge סטאטוסים**:
- DRAFT → אפור "טיוטה"
- APPROVED → כחול "מאושר"
- PAID → ירוק "שולם"

### Modal — הפעלת שכר חדש
```
תקופת שכר: [2026-03 ▼]
[ביטול] [הפעל שכר]
```

### `/payroll/runs/:id` → פירוט ריצה

**Header**: תקופה + סטאטוס + כפתורי פעולה (אשר/שולם)

**Summary cards**:
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   3 עובדים   │ │  56,500 ₪   │ │  18,144 ₪   │ │  38,355 ₪   │
│              │ │  ברוטו סה"כ │ │  ניכויים    │ │  נטו סה"כ   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**טבלת תלושים**:
```
עובד        | ת.ז.      | ברוטו    | מס    | ביטוח לאומי | פנסיה | נטו
יוסי כהן   | 123456789 | 22,000 ₪ | 3,539 ₪ | 1,259 ₪  | 1,320 ₪ | 14,201 ₪
מיכל לוי   | 987654321 | 16,500 ₪ | 1,837 ₪ |   944 ₪  |   990 ₪ | 11,668 ₪
אבי מזרחי  | 456789123 | 18,000 ₪ | 2,175 ₪ | 1,030 ₪  | 1,080 ₪ | 12,485 ₪
```

### `/payroll/payslips/:id` → תלוש שכר מפורט

```
╔══════════════════════════════════════╗
║          תלוש שכר - פברואר 2026      ║
║   שם העובד: יוסי כהן               ║
║   ת.ז.: 123456789                   ║
╠══════════════════════════════════════╣
║  שכר ברוטו:              22,000 ₪  ║
║  ─────────────────────────────────  ║
║  מס הכנסה:              (3,539) ₪  ║
║  ביטוח לאומי עובד:      (1,259) ₪  ║
║  פנסיה עובד 6%:         (1,320) ₪  ║
║  ─────────────────────────────────  ║
║  שכר נטו לתשלום:        15,882 ₪  ║
╠══════════════════════════════════════╣
║  פנסיה מעסיק 6.5%:       1,430 ₪  ║
║  פיצויים 8.33%:           1,832 ₪  ║
╚══════════════════════════════════════╝
```
כפתור "הדפס תלוש" (window.print())

### `/payroll/preview` → מחשבון שכר

Form:
- עובד (dropdown מרשימת עובדים)
- לחץ "חשב" → קריאה ל-`/api/payroll/preview/:employeeId`
- הצג תוצאה בפורמט תלוש

---

## Tech Stack

```
React 18 + TypeScript + Tailwind CSS (RTL)
@tanstack/react-query v5 + React Router v6 + Axios + lucide-react
```

### Axios Client
```typescript
// src/lib/api.ts
import axios from 'axios';
export const api = axios.create({ baseURL: 'https://erp-backend-n433.onrender.com' });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('erp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

---

## הנחיות RTL + עברית

- `<html dir="rtl" lang="he">`
- מספרים: `new Intl.NumberFormat('he-IL').format(amount)` + ` ₪`
- תאריכים: `new Date(d).toLocaleDateString('he-IL')`
- תקופה `2026-02` → הצג `פברואר 2026` (חודשים בעברית)

---

## סדר פיתוח מומלץ
1. `src/lib/api.ts` + `src/contexts/AuthContext.tsx`
2. `src/pages/LoginPage.tsx`
3. `src/pages/PayrollRunsPage.tsx`
4. `src/pages/PayrollRunDetailPage.tsx`
5. `src/pages/PayslipPage.tsx` (עם print CSS)
6. `src/pages/PayrollPreviewPage.tsx`
7. `src/components/RunPayrollModal.tsx`
