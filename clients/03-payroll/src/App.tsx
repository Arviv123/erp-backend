import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import PayrollRunsPage from './pages/PayrollRunsPage';
import PayrollRunDetailPage from './pages/PayrollRunDetailPage';
import PayslipPage from './pages/PayslipPage';
import PayrollPreviewPage from './pages/PayrollPreviewPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">טוען...</div>;
  if (!token) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/payroll" element={<ProtectedRoute><PayrollRunsPage /></ProtectedRoute>} />
            <Route path="/payroll/runs/:id" element={<ProtectedRoute><PayrollRunDetailPage /></ProtectedRoute>} />
            <Route path="/payroll/payslips/:id" element={<ProtectedRoute><PayslipPage /></ProtectedRoute>} />
            <Route path="/payroll/preview" element={<ProtectedRoute><PayrollPreviewPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/payroll" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
