## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP HR — ניהול משאבי אנוש וחופשות

## מה זו האפליקציה?
מערכת HR לניהול בקשות חופשה, לוח חגים ישראלי, יתרות חופשה ואישורים.
כוללת תמיכה בכל סוגי ההיעדרות: חופשה, מחלה, לידה, אבל, גיבוש.

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
GET    /api/hr/leave-types                        → סוגי חופשה
POST   /api/hr/leave-types                        → יצירת סוג (HR_MANAGER+)
       Body: { name, isPaid, maxDaysPerYear?, requiresApproval, colorHex }

POST   /api/hr/leave-requests                     → בקשת חופשה חדשה
       Body: { employeeId, leaveTypeId, startDate, endDate, notes? }

GET    /api/hr/leave-requests                     → כל הבקשות
       Query: employeeId, status (PENDING/APPROVED/REJECTED), page, pageSize

PATCH  /api/hr/leave-requests/:id/approve         → אישור (HR_MANAGER+)
PATCH  /api/hr/leave-requests/:id/reject          → דחייה (HR_MANAGER+)
       Body: { reason: string }

GET    /api/hr/employees/:id/leave-balance        → יתרת חופשה לעובד

GET    /api/hr/holidays                           → לוח חגים
       Query: year (ברירת מחדל: שנה נוכחית)
```

---

## דאטה קיים

### סוגי חופשה (5)
| שם | שכר | ימים מקס/שנה | צבע |
|----|-----|-------------|-----|
| חופשה שנתית | כן | 18 | #3B82F6 |
| מחלה | כן | 30 | #EF4444 |
| חופשת לידה | כן | 84 | #EC4899 |
| אבל | כן | 7 | #6B7280 |
| יום גיבוש | כן | 2 | #10B981 |

### בקשות חופשה (3)
| עובד | סוג | תאריכים | ימים | סטאטוס |
|------|-----|---------|------|--------|
| יוסי כהן | חופשה שנתית | 15-20/02/26 | 4 | ✅ APPROVED |
| מיכל לוי | מחלה | 03-04/02/26 | 2 | ✅ APPROVED |
| אבי מזרחי | יום גיבוש | 15/03/26 | 1 | ⏳ PENDING |

### עובדים
```
יוסי כהן    (ID: cmm98jhvm000ay0fwtde3jl06)
מיכל לוי    (ID: cmm98jmuy000dy0fwmh88yt99)
אבי מזרחי   (ID: cmm98js39000gy0fwon35z6to)
```

---

## דפים לבנות

### `/` → Login

### `/hr` → לוח בקרה HR

**KPI Cards**:
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  3 עובדים   │ │  1 ממתין     │ │ 7 ימי חופשה │ │  החגים הבאים │
│  פעילים     │ │  לאישור     │ │  נוצלו השנה │ │  פסח 13/04  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**בקשות ממתינות לאישור** (אם יש):
```
אבי מזרחי — יום גיבוש — 15/03/2026 (יום אחד) [אשר] [דחה]
```

### `/hr/leave-requests` → כל בקשות החופשה

**Filters**: עובד + סטאטוס + סוג חופשה + תאריך

**טבלה**:
```
עובד       | סוג חופשה    | מתאריך  | עד תאריך  | ימים | סטאטוס | פעולות
יוסי כהן  | חופשה שנתית | 15/02/26 | 20/02/26  |  4   | ✅ אושר |
מיכל לוי  | מחלה         | 03/02/26 | 04/02/26  |  2   | ✅ אושר |
אבי מזרחי | יום גיבוש    | 15/03/26 | 15/03/26  |  1   | ⏳ ממתין | [אשר] [דחה]
```

**כפתור**: "+ בקשת חופשה חדשה"

### Modal — בקשת חופשה
```
עובד:         [יוסי כהן ▼]
סוג חופשה:   [חופשה שנתית ▼]
מתאריך:      [__/__/____]
עד תאריך:    [__/__/____]
ימי עסקים:   יחושב אוטומטית
הערות:       [__________]
[ביטול] [שלח בקשה]
```

### `/hr/leave-requests/:id` → פרטי בקשה

פרטים + היסטוריית אישורים + כפתורי פעולה

### Modal — דחיית בקשה
```
סיבת דחייה: [__________________________]
[ביטול] [דחה בקשה]
```

### `/hr/leave-balance` → יתרות חופשה

Dropdown עובד + בחירת שנה:

```
יתרת חופשה — יוסי כהן — 2026
══════════════════════════════
סוג חופשה     | ימים מקס | נוצל | נותר
חופשה שנתית   | 18       | 4    | 14
מחלה          | 30       | 0    | 30
חופשת לידה    | 84       | 0    | 84
אבל           | 7        | 0    | 7
יום גיבוש     | 2        | 0    | 2
```

Progress bars לכל שורה.

### `/hr/holidays` → לוח חגים ישראלי

Year picker + לוח שנה/רשימה:

```
חגי ישראל 2026
═══════════════
מרץ
  14/03/26  פורים
  13/04/26  פסח (ערב)
  14/04/26  פסח א
  20/04/26  פסח ז
  21/04/26  פסח ח
...
```

### `/hr/leave-types` → ניהול סוגי חופשה (HR_MANAGER+)

טבלה + כפתור "+ סוג חדש" + modal ליצירה/עריכה

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
3. `src/pages/HRDashboardPage.tsx`
4. `src/pages/LeaveRequestsPage.tsx`
5. `src/pages/LeaveBalancePage.tsx`
6. `src/pages/HolidaysPage.tsx`
7. `src/pages/LeaveTypesPage.tsx`
8. `src/components/NewLeaveRequestModal.tsx`
9. `src/components/RejectModal.tsx`
