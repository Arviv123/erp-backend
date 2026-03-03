import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HRDashboardPage from './pages/HRDashboardPage';
import LeaveRequestsPage from './pages/LeaveRequestsPage';
import LeaveBalancePage from './pages/LeaveBalancePage';
import HolidaysPage from './pages/HolidaysPage';
import LeaveTypesPage from './pages/LeaveTypesPage';

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
            <Route path="/hr" element={<ProtectedRoute><HRDashboardPage /></ProtectedRoute>} />
            <Route path="/hr/leave-requests" element={<ProtectedRoute><LeaveRequestsPage /></ProtectedRoute>} />
            <Route path="/hr/leave-balance" element={<ProtectedRoute><LeaveBalancePage /></ProtectedRoute>} />
            <Route path="/hr/holidays" element={<ProtectedRoute><HolidaysPage /></ProtectedRoute>} />
            <Route path="/hr/leave-types" element={<ProtectedRoute><LeaveTypesPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/hr" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
