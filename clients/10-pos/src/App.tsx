import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import SalesSummaryPage from './pages/SalesSummaryPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

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
            <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />
            <Route path="/pos/sales" element={<ProtectedRoute><SalesHistoryPage /></ProtectedRoute>} />
            <Route path="/pos/summary" element={<ProtectedRoute><SalesSummaryPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/pos" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
