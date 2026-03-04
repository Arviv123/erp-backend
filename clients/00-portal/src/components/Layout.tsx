import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import type { ModuleKey } from '../lib/modules';
import {
  LayoutDashboard, Users, DollarSign, FileText, BookOpen, UserCheck,
  Umbrella, Clock, Package, ShoppingCart, ChevronDown, ChevronLeft,
  LogOut, Building2, Menu, X, Shield, Briefcase
} from 'lucide-react';

interface NavItem {
  label: string;
  module: ModuleKey | 'ADMIN';
  to?: string;
  icon: any;
  children?: { label: string; to: string }[];
}

const NAV: NavItem[] = [
  { label: 'לוח בקרה', to: '/dashboard', icon: LayoutDashboard, module: 'DASHBOARD' },
  {
    label: 'עובדים', icon: Users, module: 'EMPLOYEES',
    children: [
      { label: 'רשימת עובדים', to: '/employees' },
      { label: 'עובד חדש', to: '/employees/new' },
    ],
  },
  {
    label: 'שכר', icon: DollarSign, module: 'PAYROLL',
    children: [
      { label: 'גיליון שכר ★', to: '/payroll/worksheet' },
      { label: 'לוח בקרה שכר', to: '/payroll' },
      { label: 'כלל התלושים', to: '/payroll/payslips' },
      { label: 'מחשבון שכר', to: '/payroll/preview' },
      { label: 'דוח 102', to: '/payroll/report102' },
      { label: 'טופס 106', to: '/payroll/form106' },
      { label: 'טופס 126 — שנתי', to: '/payroll/form126' },
      { label: 'מחולל דוחות ★', to: '/payroll/reports' },
    ],
  },
  {
    label: 'חשבוניות', icon: FileText, module: 'INVOICES',
    children: [
      { label: 'כל החשבוניות', to: '/invoices' },
      { label: 'חשבונית חדשה', to: '/invoices/new' },
      { label: 'דוח גיל חוב', to: '/invoices/aging' },
    ],
  },
  {
    label: 'הנה"ח', icon: BookOpen, module: 'ACCOUNTING',
    children: [
      { label: 'לוח בקרה', to: '/accounting' },
      { label: 'תרשים חשבונות', to: '/accounting/accounts' },
      { label: 'יומן', to: '/accounting/transactions' },
      { label: 'מאזן בוחן', to: '/accounting/trial-balance' },
      { label: 'רווח והפסד', to: '/accounting/reports/pl' },
      { label: 'מאזן', to: '/accounting/reports/balance-sheet' },
      { label: 'מע"מ — טופס 83', to: '/accounting/reports/vat' },
      { label: 'תזרים מזומנים', to: '/accounting/reports/cash-flow' },
    ],
  },
  {
    label: 'רכש', icon: ShoppingCart, module: 'ACCOUNTING',
    children: [
      { label: 'ספקים', to: '/purchasing/vendors' },
      { label: 'ספק חדש', to: '/purchasing/vendors/new' },
      { label: 'חשבוניות ספקים', to: '/purchasing/bills' },
      { label: 'חשבונית ספק חדשה', to: '/purchasing/bills/new' },
      { label: 'גיל חוב — AP', to: '/purchasing/ap-aging' },
    ],
  },
  {
    label: 'CRM', icon: UserCheck, module: 'CRM',
    children: [
      { label: 'לקוחות', to: '/crm/customers' },
      { label: 'לקוח חדש', to: '/crm/customers/new' },
    ],
  },
  {
    label: 'HR', icon: Umbrella, module: 'HR',
    children: [
      { label: 'לוח בקרה HR', to: '/hr' },
      { label: 'בקשות חופשה', to: '/hr/leave-requests' },
      { label: 'יתרות חופשה', to: '/hr/leave-balance' },
      { label: 'חגים', to: '/hr/holidays' },
      { label: 'סוגי חופשה', to: '/hr/leave-types' },
    ],
  },
  {
    label: 'נוכחות', icon: Clock, module: 'ATTENDANCE',
    children: [
      { label: 'שעון נוכחות', to: '/attendance' },
      { label: 'סיכום חודשי', to: '/attendance/summary' },
      { label: 'דוח מנהל', to: '/attendance/manager' },
    ],
  },
  {
    label: 'מלאי', icon: Package, module: 'INVENTORY',
    children: [
      { label: 'לוח בקרה', to: '/inventory' },
      { label: 'פריטים', to: '/inventory/items' },
      { label: 'פריט חדש', to: '/inventory/items/new' },
      { label: 'תנועות', to: '/inventory/movements' },
    ],
  },
  {
    label: 'קופה', icon: ShoppingCart, module: 'POS',
    children: [
      { label: 'קופה רושמת', to: '/pos' },
      { label: 'היסטוריית מכירות', to: '/pos/sales' },
      { label: 'סיכום מכירות', to: '/pos/summary' },
    ],
  },
  {
    label: 'פורטל עובד', icon: Briefcase, module: 'DASHBOARD',
    children: [
      { label: 'לוח בקרה אישי', to: '/employee' },
      { label: 'תלושי שכר שלי', to: '/employee/payslips' },
      { label: 'טופס 101 דיגיטלי', to: '/employee/form101' },
      { label: 'בקשות חופשה', to: '/employee/leave' },
    ],
  },
  // Admin-only
  { label: 'הרשאות', to: '/admin/permissions', icon: Shield, module: 'ADMIN' },
];

function NavSection({ item, onClose }: { item: NavItem; onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  if (item.to) {
    return (
      <NavLink to={item.to} onClick={onClose}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
            isActive ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}>
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
      </NavLink>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition">
        <span className="flex items-center gap-3">
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {item.label}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mr-7 mt-0.5 space-y-0.5 border-r border-slate-700 pr-2">
          {item.children!.map(child => (
            <NavLink key={child.to} to={child.to} onClick={onClose}
              className={({ isActive }) =>
                `block px-3 py-1.5 rounded-lg text-xs transition ${
                  isActive ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { hasModule } = usePermissions();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };

  const isAdmin = user?.role === 'ADMIN';
  const visibleNav = NAV.filter(item => {
    if (item.module === 'ADMIN') return isAdmin;
    return hasModule(item.module as ModuleKey);
  });

  const sidebar = (
    <div className="flex flex-col h-full bg-slate-800">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-white text-sm leading-tight">מערכת ERP</p>
          <p className="text-xs text-slate-400 leading-tight">חשבשבת</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visibleNav.map(item => (
          <NavSection key={item.label} item={item} onClose={() => setMobileOpen(false)} />
        ))}
      </nav>

      <div className="border-t border-slate-700 px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.name || user?.email || ''}</p>
            <p className="text-xs text-slate-400">{user?.role ?? ''}</p>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white transition p-1 rounded">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" dir="rtl">
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-56 h-full">{sidebar}</div>
          <button className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between bg-slate-800 px-4 py-3">
          <button onClick={() => setMobileOpen(true)} className="text-white">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-white font-bold text-sm">מערכת ERP</span>
          <button onClick={() => setMobileOpen(false)} className="text-white opacity-0">
            <X className="w-5 h-5" />
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
