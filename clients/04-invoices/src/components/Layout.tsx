import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FileText, List, PieChart, LogOut, Plus } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const nav = [
    { to: '/invoices', label: 'חשבוניות', icon: List },
    { to: '/invoices/new', label: 'חשבונית חדשה', icon: Plus },
    { to: '/invoices/aging', label: 'גיל חובות', icon: PieChart },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <FileText size={20} />
            </div>
            <h1 className="text-lg font-bold text-gray-800">ניהול חשבוניות</h1>
          </div>

          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.name || user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-500 transition"
              title="התנתק"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
