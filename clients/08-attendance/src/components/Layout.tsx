import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Clock, LogOut } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/'); };
  const navLink = (to: string, label: string) => (
    <Link to={to} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${loc.pathname === to ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</Link>
  );
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-gray-900">שעון נוכחות</span>
            <nav className="flex items-center gap-1 mr-4">
              {navLink('/attendance', 'כניסה / יציאה')}
              {navLink('/attendance/summary', 'סיכום חודשי')}
              {navLink('/attendance/manager', 'דוח מנהל')}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.firstName} {user?.lastName}</span>
            <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition"><LogOut className="w-4 h-4" />יציאה</button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
