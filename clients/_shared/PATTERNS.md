# דפוסי קוד אחידים — ERP Frontend

## כלל ברזל: העתק, אל תמציא

בתחילת **כל** פרויקט חדש — העתק 3 קבצים אלה ישירות מ-`../_shared/src/`:
```
_shared/src/lib/api.ts          → src/lib/api.ts
_shared/src/contexts/AuthContext.tsx → src/contexts/AuthContext.tsx
_shared/src/pages/LoginPage.tsx → src/pages/LoginPage.tsx
```

---

## 1. מבנה תגובת API

השרת תמיד מחזיר:
```json
{ "success": true, "data": <payload>, "meta": { "total": 25, "page": 1 } }
```

ה-interceptor ב-api.ts **מפשיל אוטומטית** → `res.data = payload`

### שליפת נתונים בדפים

```typescript
// רשימה (מערך)
const { data } = useQuery({ queryKey: ['key'], queryFn: getItems });
const items = Array.isArray(data?.data) ? data.data : [];

// אובייקט בודד
const { data } = useQuery({ queryKey: ['key', id], queryFn: () => getItem(id) });
const item = data?.data;   // object או undefined
```

### אחרי mutation

```typescript
const mutation = useMutation({
  mutationFn: createItem,
  onSuccess: (res) => {
    const newItem = res.data;  // ← האובייקט שנוצר (interceptor כבר פשיל)
    navigate(`/items/${newItem.id}`);
  }
});
```

---

## 2. localStorage keys

```
erp_token   ← JWT token
erp_user    ← JSON של { id, email, role, firstName, lastName }
```

**לא** `token` / `user` — תמיד `erp_token` / `erp_user`.

---

## 3. React Query pattern

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query
const { data, isLoading, error } = useQuery({
  queryKey: ['invoices', { status, page }],
  queryFn:  () => getInvoices({ status, page }),
});

// Mutation + invalidate
const qc = useQueryClient();
const mutation = useMutation({
  mutationFn: createInvoice,
  onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  onError:    (err: any) => setError(err.response?.data?.error || 'שגיאה'),
});
```

---

## 4. RTL + עברית

```tsx
// index.html
<html dir="rtl" lang="he">

// פורמט מספרים
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

// פורמט תאריך
const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

// Tailwind RTL: text-right, space-x-reverse, mr/ml הפוכים
```

---

## 5. Badge סטאטוסים חשבוניות

```typescript
const STATUS_STYLE: Record<string, string> = {
  DRAFT:     'bg-gray-100 text-gray-600',
  SENT:      'bg-blue-100 text-blue-700',
  PAID:      'bg-green-100 text-green-700',
  OVERDUE:   'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-400 line-through',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלח', PAID: 'שולם', OVERDUE: 'פג תוקף', CANCELLED: 'בוטל',
};
```

---

## 6. Error handling בלוגין

```typescript
try {
  await login(email, password, tenantId || undefined);
} catch (err: any) {
  const msg = err?.response?.data?.error || err?.message || 'שגיאת התחברות';
  setError(msg);
}
```

---

## 7. App.tsx boilerplate

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">טוען...</div>;
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            {/* הוסף routes ספציפיים למודול */}
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```
