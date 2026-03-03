import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingCart, History, BarChart2, LogOut } from 'lucide-react';

const navItems = [
  { to: '/pos', label: 'קופה', icon: ShoppingCart },
  { to: '/pos/sales', label: 'מכירות', icon: History },
  { to: '/pos/summary', label: 'סיכום', icon: BarChart2 },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <header className="bg-indigo-700 text-white flex items-center justify-between px-4 py-2.5 shadow">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5" />
          <span className="font-bold text-sm">קופה רושמת ERP</span>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                  isActive ? 'bg-white/20 text-white' : 'text-indigo-200 hover:bg-white/10'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-indigo-200">{user?.email ?? ''}</span>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="flex items-center gap-1 text-xs text-indigo-200 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 p-4 overflow-auto">
        {children}
      </main>
    </div>
  );
}
