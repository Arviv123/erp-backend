import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import InventoryDashboardPage from './pages/InventoryDashboardPage';
import ItemsPage from './pages/ItemsPage';
import NewItemPage from './pages/NewItemPage';
import ItemDetailPage from './pages/ItemDetailPage';
import MovementsPage from './pages/MovementsPage';

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
            <Route path="/inventory" element={<ProtectedRoute><InventoryDashboardPage /></ProtectedRoute>} />
            <Route path="/inventory/items" element={<ProtectedRoute><ItemsPage /></ProtectedRoute>} />
            <Route path="/inventory/items/new" element={<ProtectedRoute><NewItemPage /></ProtectedRoute>} />
            <Route path="/inventory/items/:id" element={<ProtectedRoute><ItemDetailPage /></ProtectedRoute>} />
            <Route path="/inventory/movements" element={<ProtectedRoute><MovementsPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/inventory" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
