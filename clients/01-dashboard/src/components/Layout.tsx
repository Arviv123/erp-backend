import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, LogOut } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-gray-900">מערכת ERP — לוח בקרה</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{user?.firstName} {user?.lastName}</span>
              <span className="text-gray-400 mr-2">{user?.role}</span>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition">
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
