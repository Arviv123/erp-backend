import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, LogOut, Plus } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-gray-900">ניהול עובדים</span>
            <nav className="flex items-center gap-1 mr-4">
              <Link
                to="/employees"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  location.pathname === '/employees'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                עובדים
              </Link>
              <Link
                to="/employees/new"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${
                  location.pathname === '/employees/new'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                עובד חדש
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {user?.firstName} {user?.lastName}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition"
            >
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
