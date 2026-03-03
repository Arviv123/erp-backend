import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, LogOut, Plus } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/'); };
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-teal-600" />
            <span className="font-bold text-gray-900">CRM — ניהול לקוחות</span>
            <nav className="flex items-center gap-1 mr-4">
              <Link to="/crm" className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${location.pathname === '/crm' ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}>לקוחות</Link>
              <Link to="/crm/customers/new" className={`px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${location.pathname === '/crm/customers/new' ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}><Plus className="w-3.5 h-3.5" />לקוח חדש</Link>
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
