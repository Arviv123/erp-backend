# ERP Dashboard — לוח בקרה ראשי

## מה זו האפליקציה הזאת?
לוח בקרה מנהלתי מרכזי למערכת ERP ישראלית. מציג סיכום מכל המודולים:
הכנסות, עובדים, חשבוניות, שכר, נוכחות — הכל במסך אחד.

---

## חיבור לשרת המרכזי

```
BACKEND_URL = https://erp-backend-n433.onrender.com
```

**⚠️ Cold Start**: בפעם הראשונה שהשרת לא שימש — הבקשה הראשונה לוקחת 30-60 שניות. הצג spinner.

### אותנטיקציה
```
POST /api/users/auth/login
Body: { email, password, tenantId? }
Response: { success: true, data: { token: "JWT...", user: { id, email, role, firstName, lastName } } }
```
שמור token ב-`localStorage.setItem('erp_token', token)`
שלח בכל בקשה: `Authorization: Bearer <token>`

### פרטי כניסה לדמו
```
email:    admin2@test.co.il
password: Admin1234!
tenantId: cmm95megs00014n265h3objd5
```

---

## API Endpoints לדשבורד

```
GET /api/employees?pageSize=5          → רשימת עובדים אחרונים
GET /api/invoices?pageSize=5           → חשבוניות אחרונות
GET /api/payroll/runs                  → ריצות שכר
GET /api/crm/customers?pageSize=5      → לקוחות
GET /api/accounting/trial-balance      → מאזן בוחן
GET /api/hr/leave-requests?status=PENDING  → בקשות חופשה ממתינות
GET /api/attendance?pageSize=10        → נוכחות היום
GET /health                            → בריאות שרת
GET /health/db                         → בריאות DB
```

### פורמט תגובה אחיד
```json
{ "success": true, "data": <payload>, "meta": { "total": 25, "page": 1, "pageSize": 5 } }
{ "success": false, "error": "message" }
```

---

## דאטה שקיים במערכת (לדמו)

### עובדים
- יוסי כהן — מפתח תוכנה בכיר — 22,000 ₪
- מיכל לוי — מנהלת שיווק — 16,500 ₪
- אבי מזרחי — מנהל מכירות — 18,000 ₪

### חשבוניות
- INV-2026-0001: 48,852 ₪ — **PAID**
- INV-2026-0002: 15,222 ₪ — **OVERDUE**
- INV-2026-0003: 20,709 ₪ — SENT
- INV-2026-0004: 34,456 ₪ — **OVERDUE**
- INV-2026-0005: 50,268 ₪ — DRAFT

### שכר
- 2026-01: PAID — 56,500 ₪ ברוטו
- 2026-02: APPROVED — 56,500 ₪ ברוטו

---

## דפים לבנות

### `/` → Login Page
- לוגו ERP + שם "מערכת ERP ישראלית"
- שדות: אימייל, סיסמה, Tenant ID (אופציונלי, collapsible)
- כפתור "כניסה" + כפתור "מלא פרטי דמו"
- הודעת שגיאה ברורה בעברית
- Redirect ל-/dashboard אחרי כניסה

### `/dashboard` → לוח בקרה ראשי
**Header**: שם משתמש + תפקיד + כפתור יציאה

**KPI Cards Row** (4 כרטיסים):
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   סה"כ עובדים   │ │  הכנסות חודש   │ │  חשבוניות פתוחות│ │  שכר ממתין     │
│       3         │ │   169,507 ₪    │ │       3         │ │   56,500 ₪     │
│   פעילים        │ │   ינואר-מרץ    │ │  SENT+OVERDUE   │ │   לאישור       │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

**שורה שנייה** — 2 עמודות:

**טבלת חשבוניות אחרונות** (שמאל):
```
מספר    | לקוח              | סכום      | סטאטוס
INV-001 | טכנולוגיות אלפא  | 48,852 ₪  | 🟢 PAID
INV-002 | גרין גארדן       | 15,222 ₪  | 🔴 OVERDUE
INV-003 | דוד לוי          | 20,709 ₪  | 🔵 SENT
```

**עובדים אחרונים** (ימין):
```
שם         | תפקיד              | שכר
יוסי כהן   | מפתח תוכנה בכיר  | 22,000 ₪
מיכל לוי   | מנהלת שיווק      | 16,500 ₪
אבי מזרחי  | מנהל מכירות      | 18,000 ₪
```

**שורה שלישית** — ריצות שכר + בקשות חופשה ממתינות

---

## Tech Stack

```
React 18 + TypeScript
Tailwind CSS (RTL support)
shadcn/ui (components)
@tanstack/react-query v5
React Router v6
Axios
lucide-react (icons)
```

### הגדרת Axios Client
```typescript
// src/lib/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://erp-backend-n433.onrender.com',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('erp_token');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);
```

---

## הנחיות עיצוב

- **RTL**: `<html dir="rtl" lang="he">` + `className="font-sans"` עם `text-right` כ-default
- **צבעים**: כחול ראשי `#1D4ED8`, אפור `#6B7280`, ירוק הצלחה `#10B981`, אדום שגיאה `#EF4444`
- **עברית**: כל הלייבלים בעברית. מספרים בפורמט ישראלי: `new Intl.NumberFormat('he-IL').format(amount)`
- **מטבע**: `₪` אחרי המספר: `48,852 ₪`
- **תאריכים**: `new Date(date).toLocaleDateString('he-IL')`
- **Badge סטאטוס חשבוניות**:
  - PAID → `bg-green-100 text-green-800`
  - OVERDUE → `bg-red-100 text-red-800`
  - SENT → `bg-blue-100 text-blue-800`
  - DRAFT → `bg-gray-100 text-gray-800`

---

## התחלה מהירה

```bash
npm install
npm run dev
```

פותח על `http://localhost:5173`

## הוראה ל-Claude שמפתח
בנה את האפליקציה כולה. התחל מ:
1. `src/lib/api.ts` — Axios client
2. `src/contexts/AuthContext.tsx` — JWT storage
3. `src/pages/LoginPage.tsx`
4. `src/pages/DashboardPage.tsx`
5. `src/components/KPICard.tsx`, `InvoiceTable.tsx`, `EmployeeList.tsx`

הכל RTL, הכל עברית, הכל מתחבר לבקנד האמיתי.
