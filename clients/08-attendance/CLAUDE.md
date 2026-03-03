## ⚠️ התחל כאן — לפני כל דבר אחר

**העתק 3 קבצים** מהתיקייה `../_shared/src/` ישירות לפרויקט זה:
```bash
cp ../_shared/src/lib/api.ts src/lib/api.ts
cp ../_shared/src/contexts/AuthContext.tsx src/contexts/AuthContext.tsx
cp ../_shared/src/pages/LoginPage.tsx src/pages/LoginPage.tsx
```

קרא גם את `../_shared/PATTERNS.md` — כל דפוסי הקוד האחידים (data extraction, RTL, formatting).

---


# ERP Attendance — מערכת נוכחות

## מה זו האפליקציה?
מערכת שעון נוכחות: כניסה/יציאה, סיכום שעות חודשי, דוחות מנהל.
תומכת ב-GPS tracking ומיועדת לשימוש יומי על ידי עובדים.

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
POST   /api/attendance/clock-in              → כניסה לעבודה
       Body: {
         employeeId: string,
         gpsLocation?: { lat: number, lng: number },
         notes?: string
       }

POST   /api/attendance/clock-out             → יציאה מעבודה
       Body: {
         employeeId: string,
         breakMinutes?: number,   // דקות הפסקה
         notes?: string
       }

GET    /api/attendance                        → כל רשומות הנוכחות (HR_MANAGER+)
       Query: employeeId, from, to, page, pageSize

GET    /api/attendance/summary/:employeeId   → סיכום חודשי לעובד
       Query: month (YYYY-MM, ברירת מחדל = חודש נוכחי)
       Response: {
         employeeId, month,
         daysWorked, totalHours, totalMinutes,
         logs: [{ date, clockIn, clockOut, breakMinutes }]
       }
```

---

## דאטה קיים

אין רשומות נוכחות היסטוריות (הממשק ייצור אותן בזמן שימוש אמיתי).
עובדים קיימים:
```
יוסי כהן   (ID: cmm98jhvm000ay0fwtde3jl06)
מיכל לוי   (ID: cmm98jmuy000dy0fwmh88yt99)
אבי מזרחי  (ID: cmm98js39000gy0fwon35z6to)
```

---

## דפים לבנות

### `/` → Login

### `/attendance` → לוח בקרה נוכחות

**עמוד ראשי** — מציג שעון ופעולות מהירות:

```
┌───────────────────────────────────────────────────┐
│              שעון נוכחות                           │
│         יום שלישי, 02/03/2026                      │
│              ⏰  09:34:22                           │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │         בחר עובד לכניסה/יציאה              │  │
│  │    [יוסי כהן ▼]                             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [🟢 כניסה לעבודה]    [🔴 יציאה מעבודה]          │
│                                                   │
│  הפסקה: [___] דקות  (ביציאה בלבד)               │
└───────────────────────────────────────────────────┘
```

**סטאטוס נוכחות היום** (קטן מתחת):
```
יוסי כהן  — נכנס 08:15 — עדיין בפנים
מיכל לוי  — נכנסה 08:30 — יצאה 17:00 (7.5 שעות)
אבי מזרחי — טרם נכנס
```

### `/attendance/summary` → סיכום חודשי

Employee picker + Month picker

```
סיכום נוכחות — יוסי כהן — פברואר 2026
══════════════════════════════
ימי עבודה:    0 / 20
שעות סה"כ:   0 שעות
ממוצע לתאריך: -
```

אחרי שיש דאטה:
```
תאריך    | כניסה | יציאה | הפסקה | שעות
02/03/26 | 08:15 | 17:00 | 30 דק | 8.25
03/03/26 | 09:00 | 18:00 | 45 דק | 8.25
```

### `/attendance/manager` → דוח מנהל (HR_MANAGER+)

**Filters**: עובד + חודש + חיפוש

**טבלה** של כל רשומות הנוכחות:
```
עובד      | תאריך    | כניסה | יציאה | שעות  | הפסקה
יוסי כהן | 02/03/26 | 08:15 | 17:00 | 8.25  | 30 דק
```

Export לExcel כפתור (download CSV)

---

## Tech Stack

```
React 18 + TypeScript + Tailwind CSS (RTL)
@tanstack/react-query v5 + React Router v6 + Axios + lucide-react
```

---

## הנחיות מיוחדות

- **שעון חי**: `setInterval` לשעון ב-UI, מתעדכן כל שניה
- **GPS**: `navigator.geolocation.getCurrentPosition()` → שלח ב-body
- **שעות**: הצג כ-`8:15` (שעות:דקות), לא עשרוני
- **תאריך/שעה**: `new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })`

---

## סדר פיתוח
1. `src/lib/api.ts` + Auth
2. `src/pages/LoginPage.tsx`
3. `src/pages/AttendancePage.tsx` (clock in/out + live clock)
4. `src/pages/SummaryPage.tsx` (monthly summary)
5. `src/pages/ManagerViewPage.tsx` (HR only)
