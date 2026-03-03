import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, LayoutGrid, List, Scale, TrendingUp, BarChart2, Receipt, LogOut } from 'lucide-react';

const navItems = [
  { to: '/accounting', label: 'לוח בקרה', icon: LayoutGrid },
  { to: '/accounting/accounts', label: 'תרשים חשבונות', icon: List },
  { to: '/accounting/transactions', label: 'יומן', icon: BookOpen },
  { to: '/accounting/trial-balance', label: 'מאזן בוחן', icon: Scale },
  { to: '/accounting/reports/pl', label: 'רו"ה', icon: TrendingUp },
  { to: '/accounting/reports/balance-sheet', label: 'מאזן', icon: BarChart2 },
  { to: '/accounting/reports/vat', label: 'מע"מ', icon: Receipt },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <header className="bg-teal-700 text-white flex items-center justify-between px-4 py-2.5 shadow">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5" />
          <span className="font-bold text-sm">הנהלת חשבונות ERP</span>
        </div>
        <nav className="flex items-center gap-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end
              className={({ isActive }) =>
                `flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition ${
                  isActive ? 'bg-white/20 text-white' : 'text-teal-200 hover:bg-white/10'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-teal-200">{user?.email ?? ''}</span>
          <button onClick={() => { logout(); navigate('/'); }}
            className="text-teal-200 hover:text-white transition">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
