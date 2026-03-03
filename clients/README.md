# ERP Frontend Clients

10 אפליקציות React נפרדות, כולן מתממשקות עם שרת ERP מרכזי.

## שרת מרכזי
```
https://erp-backend-n433.onrender.com
```

## פרטי כניסה (דמו)
```
email:    admin2@test.co.il
password: Admin1234!
tenantId: cmm95megs00014n265h3objd5
```

---

## הפרויקטים

| תיקייה | אפליקציה | תיאור |
|--------|----------|-------|
| [01-dashboard](./01-dashboard) | לוח בקרה | סקירה כללית של כל המערכת |
| [02-employees](./02-employees) | עובדים | ניהול עובדים, שכר, היסטוריה |
| [03-payroll](./03-payroll) | שכר | ריצות שכר, תלושים, אישורים |
| [04-invoices](./04-invoices) | חשבוניות | יצירה, שליחה, גביה, גיל חובות |
| [05-accounting](./05-accounting) | הנה"ח | יומן, מאזן, רווח/הפסד, מע"מ |
| [06-crm](./06-crm) | CRM | לקוחות, אנשי קשר, מכירות |
| [07-hr](./07-hr) | HR | חופשות, מחלה, לוח חגים |
| [08-attendance](./08-attendance) | נוכחות | שעון כניסה/יציאה, דוחות |
| [09-inventory](./09-inventory) | מלאי | פריטים, תנועות, התראות |
| [10-pos](./10-pos) | קופה | נקודת מכירה, קבלות |

---

## איך להתחיל פרויקט חדש

1. **פתח את התיקייה** בVSCode: `code ./01-dashboard`
2. **פתח שיחת Claude חדשה** — Claude יקרא את `CLAUDE.md` אוטומטית
3. **תן לClaude לבנות**: "בנה את האפליקציה לפי ה-CLAUDE.md"
4. **הרץ**: `npm install && npm run dev`

---

## Tech Stack משותף לכל הפרויקטים

```
React 18 + TypeScript
Tailwind CSS (RTL — dir="rtl" lang="he")
@tanstack/react-query v5
React Router v6
Axios (עם interceptor לJWT)
lucide-react (icons)
react-hook-form + zod (forms)
```

## Axios Client משותף (העתק לכל פרויקט)

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

## הערות חשובות

- **Cold Start**: השרת על Render.com (free tier) — הבקשה הראשונה לוקחת 30-60 שניות
- **RTL**: כל האפליקציות עברית מימין לשמאל
- **JWT**: תוקף 7 ימים, מאוחסן ב-localStorage
- **RBAC**: תפקידים — EMPLOYEE < SALESPERSON < HR_MANAGER < ACCOUNTANT < ADMIN
