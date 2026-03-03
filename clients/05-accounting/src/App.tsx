import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import AccountingDashboardPage from './pages/AccountingDashboardPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import JournalPage from './pages/JournalPage';
import TrialBalancePage from './pages/TrialBalancePage';
import PLReportPage from './pages/PLReportPage';
import BalanceSheetPage from './pages/BalanceSheetPage';
import VATReportPage from './pages/VATReportPage';

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
            <Route path="/accounting" element={<ProtectedRoute><AccountingDashboardPage /></ProtectedRoute>} />
            <Route path="/accounting/accounts" element={<ProtectedRoute><ChartOfAccountsPage /></ProtectedRoute>} />
            <Route path="/accounting/transactions" element={<ProtectedRoute><JournalPage /></ProtectedRoute>} />
            <Route path="/accounting/trial-balance" element={<ProtectedRoute><TrialBalancePage /></ProtectedRoute>} />
            <Route path="/accounting/reports/pl" element={<ProtectedRoute><PLReportPage /></ProtectedRoute>} />
            <Route path="/accounting/reports/balance-sheet" element={<ProtectedRoute><BalanceSheetPage /></ProtectedRoute>} />
            <Route path="/accounting/reports/vat" element={<ProtectedRoute><VATReportPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/accounting" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
