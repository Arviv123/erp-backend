import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import InvoicesListPage from './pages/InvoicesListPage';
import NewInvoicePage from './pages/NewInvoicePage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import AgingReportPage from './pages/AgingReportPage';
import { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">טוען...</div>;
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (token) return <Navigate to="/invoices" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/invoices" element={<InvoicesListPage />} />
              <Route path="/invoices/new" element={<NewInvoicePage />} />
              <Route path="/invoices/aging" element={<AgingReportPage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
