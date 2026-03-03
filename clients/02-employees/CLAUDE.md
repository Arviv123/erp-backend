## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP Employees — ניהול עובדים

## מה זו האפליקציה?
אפליקציית ניהול עובדים מלאה: רשימה, הוספה, עריכת שכר, היסטוריית שכר, תצוגת תלוש.
מיועדת ל-HR Manager ומעלה.

---

## חיבור לשרת המרכזי

```
BACKEND_URL = https://erp-backend-n433.onrender.com
```

**⚠️ Cold Start**: הבקשה הראשונה לוקחת 30-60 שניות — הצג "מתחבר לשרת..." עם spinner.

### אותנטיקציה
```
POST /api/users/auth/login
Body: { "email": "admin2@test.co.il", "password": "Admin1234!", "tenantId": "cmm95megs00014n265h3objd5" }
Response: { success: true, data: { token: "JWT...", user: { id, email, role, firstName, lastName } } }
```
שמור: `localStorage.setItem('erp_token', token)`
Header: `Authorization: Bearer <token>`

### פרטי כניסה לדמו
```
email:    admin2@test.co.il
password: Admin1234!
tenantId: cmm95megs00014n265h3objd5
```

---

## API Endpoints

### עובדים
```
GET    /api/employees                     → רשימה עם pagination
       Query: page, pageSize, department, isActive
       Response: data[] עם meta.total

GET    /api/employees/:id                 → עובד + היסטוריית שכר
       Response: { ...employee, salaryHistory: [] }

POST   /api/employees                     → יצירת עובד חדש (HR_MANAGER+)
       Body: ראה schema למטה

PATCH  /api/employees/:id/salary         → עדכון שכר (HR_MANAGER+)
       Body: { grossSalary: number, reason?: string }

DELETE /api/employees/:id                 → ביטול פעילות (soft delete)
```

### שכר preview
```
GET    /api/payroll/preview/:employeeId   → חישוב שכר בלי לשמור
       Response: { grossSalary, incomeTax, nationalInsurance, pension, netSalary, breakdown }
```

### Schema — יצירת עובד
```typescript
{
  firstName:       string           // שם פרטי
  lastName:        string           // שם משפחה
  idNumber:        string           // 9 ספרות בדיוק
  birthDate:       string           // ISO datetime "1990-01-15T00:00:00.000Z"
  gender:          "M" | "F" | "OTHER"
  address: {
    street:        string
    city:          string
    zip?:          string
  }
  phone:           string           // "052-1234567"
  personalEmail:   string           // email
  startDate:       string           // ISO datetime
  jobTitle:        string
  department:      string
  employmentType:  "FULL_TIME" | "PART_TIME" | "HOURLY" | "CONTRACTOR"
  grossSalary:     number           // שכר ברוטו
  taxCredits:      number           // ברירת מחדל 2.25
  pensionFund?:    string           // שם קרן פנסיה
  pensionEmployee: number           // % עובד, ברירת מחדל 6.0
  pensionEmployer: number           // % מעסיק, ברירת מחדל 6.5
  severancePay:    number           // % פיצויים, ברירת מחדל 8.33
  // אופציונלי - יצירת משתמש מערכת
  createUser?:     boolean
  userEmail?:      string
  userPassword?:   string          // מינ' 8 תווים
  userRole?:       "EMPLOYEE" | "HR_MANAGER" | "ACCOUNTANT" | "ADMIN"
}
```

---

## דאטה קיים לדמו

```
יוסי כהן     | מפתח תוכנה בכיר | טכנולוגיה  | 22,000 ₪ | FULL_TIME
מיכל לוי     | מנהלת שיווק    | שיווק      | 16,500 ₪ | FULL_TIME
אבי מזרחי    | מנהל מכירות    | מכירות     | 18,000 ₪ | FULL_TIME
```

---

## דפים לבנות

### `/` → Login
שדות email + password + tenantId (optional). כפתור "מלא דמו".

### `/employees` → רשימת עובדים
**Toolbar**: חיפוש טקסט + filter מחלקה + filter פעיל/לא + כפתור "הוסף עובד" (HR_MANAGER+)

**טבלה**:
```
שם מלא     | תפקיד              | מחלקה     | שכר ברוטו | סטאטוס | פעולות
יוסי כהן  | מפתח תוכנה בכיר  | טכנולוגיה | 22,000 ₪  | פעיל   | [צפה] [עדכן שכר]
מיכל לוי  | מנהלת שיווק      | שיווק     | 16,500 ₪  | פעיל   | [צפה] [עדכן שכר]
```

**Pagination**: 20 שורות בדף

### `/employees/new` → הוספת עובד
Form עם כל השדות מה-schema. Validation בזמן אמת.
Sections:
1. פרטים אישיים (שם, ת.ז., תאריך לידה, מין, כתובת, טלפון, אימייל)
2. פרטי עבודה (תאריך התחלה, תפקיד, מחלקה, סוג העסקה)
3. שכר ופנסיה (שכר ברוטו, נקודות זיכוי, פנסיה)
4. משתמש מערכת (checkbox "צור משתמש מערכת" → יפתח שדות email+password+role)

### `/employees/:id` → פרופיל עובד
**Header**: שם + תפקיד + מחלקה + badge פעיל/לא פעיל

**Tabs**:
- **פרטים**: כל הפרטים האישיים + פרטי עבודה
- **שכר**: שכר ברוטו נוכחי + כפתור "עדכן שכר" + היסטוריית שכר בטבלה
- **תחזית תלוש**: קריאה ל-`/api/payroll/preview/:id` + הצגת חישוב:
  ```
  ברוטו:          22,000 ₪
  מס הכנסה:      (3,539) ₪
  ביטוח לאומי:   (1,259) ₪
  פנסיה עובד:    (1,320) ₪
  ─────────────────────────
  נטו לתשלום:    14,202 ₪
  ```
- **תוספות וניכויים**: (שדה ריק לעת עתה)

### Modal — עדכון שכר
```
שכר נוכחי: 22,000 ₪
שכר חדש:   [______] ₪
סיבה:      [______________]
[ביטול] [עדכן שכר]
```

---

## Tech Stack

```
React 18 + TypeScript
Tailwind CSS (RTL)
@tanstack/react-query v5
React Router v6
Axios
lucide-react (icons)
react-hook-form (לפורמים)
zod (validation)
```

### Axios Client
```typescript
// src/lib/api.ts
import axios from 'axios';
export const api = axios.create({ baseURL: 'https://erp-backend-n433.onrender.com' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) { localStorage.removeItem('erp_token'); window.location.href = '/'; }
  return Promise.reject(err);
});
```

---

## הנחיות עיצוב

- **RTL**: `<html dir="rtl" lang="he">` — כל layout מימין לשמאל
- **מטבע**: `new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(22000)`
- **תאריכים**: `new Date(date).toLocaleDateString('he-IL')`
- **Badge מגדר**: M=זכר, F=נקבה, OTHER=אחר
- **Badge סטאטוס**: פעיל=ירוק, לא פעיל=אפור
- **Badge סוג עסקה**: FULL_TIME=משרה מלאה, PART_TIME=חלקית, HOURLY=שעתי, CONTRACTOR=קבלן

---

## התחלה מהירה

```bash
npm install
npm run dev
# פותח על http://localhost:5173
```

## הוראה ל-Claude שמפתח
בנה את האפליקציה כולה. סדר פיתוח מומלץ:
1. `src/lib/api.ts` + `src/contexts/AuthContext.tsx`
2. `src/pages/LoginPage.tsx`
3. `src/pages/EmployeesPage.tsx` (list + filter + pagination)
4. `src/pages/NewEmployeePage.tsx` (form)
5. `src/pages/EmployeeDetailPage.tsx` (tabs: פרטים, שכר, תחזית)
6. `src/components/SalaryUpdateModal.tsx`
