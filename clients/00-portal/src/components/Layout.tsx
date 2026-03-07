import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import type { ModuleKey } from '../lib/modules';
import api from '../lib/api';
import GlobalSearch from './GlobalSearch';
import {
  LayoutDashboard, Users, FileText, BookOpen, UserCheck,
  Umbrella, Clock, Package, ChevronDown, ChevronLeft,
  LogOut, Building2, Menu, X, Shield, Briefcase, Upload, Bell,
  CheckCircle, AlertTriangle, Info, CreditCard, Search, RefreshCw,
  ClipboardList, Tag, Monitor, Truck, DollarSign, Brain,
  MessageCircle, ShieldCheck, Wifi, ScanLine, Bot,
} from 'lucide-react';

// ─── Page name map for breadcrumb ─────────────────────────────────────────────

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'לוח בקרה',
  '/invoices': 'חשבוניות',
  '/invoices/new': 'חשבונית חדשה',
  '/invoices/aging': 'גיל חוב',
  '/quotes': 'הצעות מחיר',
  '/quotes/new': 'הצעה חדשה',
  '/sales-orders': 'הזמנות מכירה',
  '/recurring-invoices': 'חשבוניות חוזרות',
  '/receipts': 'קבלות',
  '/documents': 'מסמכים',
  '/accounting': 'הנהלת חשבונות',
  '/accounting/accounts': 'תרשים חשבונות',
  '/accounting/transactions': 'יומן',
  '/accounting/trial-balance': 'מאזן בוחן',
  '/accounting/reports/pl': 'רווח והפסד',
  '/accounting/reports/balance-sheet': 'מאזן',
  '/accounting/reports/vat': 'מע"מ 83',
  '/accounting/reports/cash-flow': 'תזרים מזומנים',
  '/accounting/ledger-cards': 'כרטסות',
  '/accounting/ledger': 'כרטסת חשבון',
  '/accounting/credit-card-recon': 'התאמת כרטיס אשראי',
  '/accounting/bank-recon': 'התאמת בנק',
  '/accounting/fixed-assets': 'רכוש קבוע',
  '/accounting/expenses': 'הוצאות',
  '/accounting/budget': 'תקציב',
  '/purchasing/vendors': 'ספקים',
  '/purchasing/vendors/new': 'ספק חדש',
  '/purchasing/orders': 'הזמנות רכש',
  '/purchasing/goods-receipts': 'קבלת סחורה',
  '/purchasing/bills': 'חשבוניות ספקים',
  '/purchasing/bills/new': 'חשבונית ספק חדשה',
  '/purchasing/ap-aging': 'גיל חוב AP',
  '/price-lists': 'מחירונים',
  '/petty-cash': 'קופה קטנה',
  '/integration-health': 'בריאות אינטגרציות',
  '/batch-entry': 'קליטת מנה מהירה',
  '/crm/customers': 'לקוחות',
  '/crm/customers/new': 'לקוח חדש',
  '/employees': 'עובדים',
  '/employees/new': 'עובד חדש',
  '/payroll': 'ניהול שכר',
  '/payroll/worksheet': 'גיליון שכר',
  '/payroll/payslips': 'תלושי שכר',
  '/payroll/preview': 'מחשבון שכר',
  '/payroll/report102': 'דוח 102',
  '/payroll/form106': 'טופס 106',
  '/payroll/form126': 'טופס 126',
  '/payroll/reports': 'מחולל דוחות',
  '/hr': 'משאבי אנוש',
  '/hr/leave-requests': 'בקשות חופשה',
  '/hr/leave-balance': 'יתרות חופשה',
  '/hr/leave-types': 'סוגי חופשה',
  '/hr/holidays': 'חגים',
  '/attendance': 'שעון נוכחות',
  '/attendance/summary': 'סיכום חודשי',
  '/attendance/manager': 'דוח מנהל',
  '/inventory': 'מלאי',
  '/inventory/items': 'פריטים',
  '/inventory/items/new': 'פריט חדש',
  '/inventory/movements': 'תנועות מלאי',
  '/pos': 'קופה רושמת',
  '/pos/tables': 'ניהול שולחנות',
  '/pos/waiter': 'ממשק מלצר',
  '/pos/kitchen': 'תצוגת מטבח',
  '/pos/cash': 'ניהול קופה',
  '/pos/payment-terminals': 'מסופי תשלום',
  '/pos/promotions': 'מבצעים',
  '/pos/loyalty': 'נאמנות',
  '/pos/gift-cards': 'כרטיסי מתנה',
  '/pos/z-report': 'דוח X/Z',
  '/pos/analytics': 'אנליטיקס',
  '/branches': 'ענפים',
  '/smart-import': 'ייבוא חכם',
  '/employee': 'פורטל עובד',
  '/employee/payslips': 'תלושים שלי',
  '/employee/form101': 'טופס 101',
  '/employee/leave': 'בקשות חופשה',
  '/admin/permissions': 'הרשאות',
  '/settings/agents': 'סוכני AI',
  '/notifications': 'הודעות ועדכונים',
  '/audit-log': 'יומן פעולות',
  '/rfid': 'לוח בקרה RFID',
  '/rfid/tags': 'תגיות RFID',
  '/rfid/readers': 'קוראי RFID',
  '/rfid/assets': 'נכסים',
  '/rfid/inventory': 'ספירת מלאי RFID',
  '/inventory/receive': 'קבלת סחורה',
  '/inventory/count': 'ספירת מלאי',
  '/agents/team': 'צוות סוכנים',
  '/agents/profiles': 'סוכנים מותאמים אישית',
  '/agents/conversations': 'היסטוריית שיחות',
  '/agents/builder': 'בונה סוכנים',
  '/agents/schedules': 'אוטומציות',
  '/agents/audit': 'צוות סוכני ביקורת',
  '/agents/software-audit': 'בדיקת שלמות תוכנה',
};

function getPageTitle(pathname: string): string {
  // Try exact match first
  if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
  // Try prefix match (longest prefix wins)
  const keys = Object.keys(PAGE_NAMES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.startsWith(key)) return PAGE_NAMES[key];
  }
  return 'מערכת ERP';
}

// ─── Nav types ────────────────────────────────────────────────────────────────

interface NavChild {
  label: string;
  to: string;
  divider?: string;
}

interface NavItem {
  label: string;
  module: ModuleKey | 'ADMIN';
  to?: string;
  icon: React.ElementType;
  children?: NavChild[];
  group?: string; // group label rendered above this section
}

// ─── Navigation config ───────────────────────────────────────────────────────

const NAV: NavItem[] = [
  // ── [no group] ──
  {
    label: 'לוח בקרה',
    to: '/dashboard',
    icon: LayoutDashboard,
    module: 'DASHBOARD',
  },

  // ── כספים ──
  {
    label: 'מכירות',
    icon: FileText,
    module: 'INVOICES',
    group: 'כספים',
    children: [
      { label: 'חשבוניות', to: '/invoices' },
      { label: 'חשבונית חדשה', to: '/invoices/new' },
      { label: 'הצעות מחיר', to: '/quotes', divider: 'הצעות' },
      { label: 'הצעה חדשה', to: '/quotes/new' },
      { label: 'הזמנות מכירה', to: '/sales-orders', divider: 'הזמנות' },
      { label: 'חשבוניות חוזרות', to: '/recurring-invoices' },
      { label: 'קבלות', to: '/receipts', divider: 'תשלומים' },
      { label: 'מסמכים', to: '/documents' },
      { label: 'גיל חוב', to: '/invoices/aging', divider: 'דוחות' },
    ],
  },
  {
    label: 'הנה"ח',
    icon: BookOpen,
    module: 'ACCOUNTING',
    children: [
      { label: 'לוח בקרה', to: '/accounting' },
      { label: 'תרשים חשבונות', to: '/accounting/accounts' },
      { label: 'יומן', to: '/accounting/transactions' },
      { label: 'מאזן בוחן', to: '/accounting/trial-balance', divider: 'דוחות' },
      { label: 'רווח והפסד', to: '/accounting/reports/pl' },
      { label: 'מאזן', to: '/accounting/reports/balance-sheet' },
      { label: 'מע"מ 83', to: '/accounting/reports/vat' },
      { label: 'תזרים', to: '/accounting/reports/cash-flow' },
      { label: 'כרטסות', to: '/accounting/ledger-cards', divider: 'כרטסות' },
      { label: 'כרטסת חשבון', to: '/accounting/ledger' },
      { label: 'התאמת כ.אשראי', to: '/accounting/credit-card-recon' },
      { label: 'התאמת בנק', to: '/accounting/bank-recon' },
      { label: 'רכוש קבוע', to: '/accounting/fixed-assets', divider: 'נכסים' },
      { label: 'הוצאות', to: '/accounting/expenses' },
      { label: 'תקציב', to: '/accounting/budget' },
      { label: 'מחירונים', to: '/price-lists', divider: 'שונות' },
      { label: 'קופה קטנה', to: '/petty-cash' },
      { label: 'קליטת מנה מהירה', to: '/batch-entry' },
      { label: 'בריאות אינטגרציות', to: '/integration-health' },
    ],
  },
  {
    label: 'רכש',
    icon: Truck,
    module: 'ACCOUNTING',
    children: [
      { label: 'ספקים', to: '/purchasing/vendors' },
      { label: 'ספק חדש', to: '/purchasing/vendors/new' },
      { label: 'הזמנות רכש', to: '/purchasing/orders', divider: 'הזמנות' },
      { label: 'קבלת סחורה', to: '/purchasing/goods-receipts' },
      { label: 'חשבוניות ספקים', to: '/purchasing/bills', divider: 'חשבוניות' },
      { label: 'חשבונית ספק חדשה', to: '/purchasing/bills/new' },
      { label: 'גיל חוב AP', to: '/purchasing/ap-aging' },
    ],
  },
  {
    label: 'לקוחות',
    icon: UserCheck,
    module: 'CRM',
    children: [
      { label: 'רשימת לקוחות', to: '/crm/customers' },
      { label: 'לקוח חדש', to: '/crm/customers/new' },
    ],
  },

  // ── עובדים ──
  {
    label: 'עובדים ושכר',
    icon: Users,
    module: 'EMPLOYEES',
    group: 'עובדים',
    children: [
      { label: 'עובדים', to: '/employees' },
      { label: 'עובד חדש', to: '/employees/new' },
      { label: 'גיליון שכר', to: '/payroll/worksheet', divider: 'שכר' },
      { label: 'לוח בקרה שכר', to: '/payroll' },
      { label: 'תלושי שכר', to: '/payroll/payslips' },
      { label: 'מחשבון שכר', to: '/payroll/preview' },
      { label: 'דוח 102', to: '/payroll/report102', divider: 'דוחות שכר' },
      { label: 'טופס 106', to: '/payroll/form106' },
      { label: 'טופס 126', to: '/payroll/form126' },
      { label: 'מחולל דוחות', to: '/payroll/reports' },
    ],
  },
  {
    label: 'משאבי אנוש',
    icon: Umbrella,
    module: 'HR',
    children: [
      { label: 'לוח בקרה HR', to: '/hr' },
      { label: 'בקשות חופשה', to: '/hr/leave-requests', divider: 'חופשות' },
      { label: 'יתרות חופשה', to: '/hr/leave-balance' },
      { label: 'סוגי חופשה', to: '/hr/leave-types' },
      { label: 'חגים', to: '/hr/holidays' },
    ],
  },
  {
    label: 'נוכחות',
    icon: Clock,
    module: 'ATTENDANCE',
    children: [
      { label: 'שעון נוכחות', to: '/attendance' },
      { label: 'סיכום חודשי', to: '/attendance/summary' },
      { label: 'דוח מנהל', to: '/attendance/manager' },
    ],
  },

  // ── תפעול ──
  {
    label: 'מלאי',
    icon: Package,
    module: 'INVENTORY',
    group: 'תפעול',
    children: [
      { label: 'לוח בקרה', to: '/inventory' },
      { label: 'פריטים', to: '/inventory/items' },
      { label: 'פריט חדש', to: '/inventory/items/new' },
      { label: 'תנועות מלאי', to: '/inventory/movements' },
      { label: 'קבלת סחורה בברקוד', to: '/inventory/receive', divider: 'תהליכים' },
      { label: 'ספירת מלאי', to: '/inventory/count' },
    ],
  },
  {
    label: 'RFID',
    icon: Wifi,
    module: 'INVENTORY',
    group: 'תפעול',
    children: [
      { label: 'לוח בקרה', to: '/rfid' },
      { label: 'תגיות RFID', to: '/rfid/tags' },
      { label: 'קוראים', to: '/rfid/readers' },
      { label: 'נכסים', to: '/rfid/assets' },
      { label: 'ספירת מלאי RFID', to: '/rfid/inventory' },
    ],
  },
  {
    label: 'קופה',
    icon: Monitor,
    module: 'POS',
    children: [
      { label: 'קופה רושמת', to: '/pos' },
      { label: 'ניהול שולחנות', to: '/pos/tables', divider: 'מסעדה' },
      { label: 'ממשק מלצר', to: '/pos/waiter' },
      { label: 'תצוגת מטבח', to: '/pos/kitchen' },
      { label: 'ניהול קופה/משמרת', to: '/pos/cash', divider: 'ניהול' },
      { label: 'מסופי תשלום', to: '/pos/payment-terminals' },
      { label: 'מבצעים', to: '/pos/promotions', divider: 'מועדון לקוחות' },
      { label: 'נאמנות', to: '/pos/loyalty' },
      { label: 'כרטיסי מתנה', to: '/pos/gift-cards' },
      { label: 'דוח X/Z', to: '/pos/z-report', divider: 'דוחות' },
      { label: 'אנליטיקס', to: '/pos/analytics' },
    ],
  },
  {
    label: 'ענפים',
    icon: Building2,
    module: 'ACCOUNTING',
    to: '/branches',
  },
  {
    label: 'ייבוא חכם',
    icon: Upload,
    module: 'ACCOUNTING',
    to: '/smart-import',
  },

  // ── ניהול ──
  {
    label: 'פורטל עובד',
    icon: Briefcase,
    module: 'DASHBOARD',
    group: 'ניהול',
    children: [
      { label: 'לוח אישי', to: '/employee' },
      { label: 'תלושים שלי', to: '/employee/payslips' },
      { label: 'טופס 101', to: '/employee/form101' },
      { label: 'בקשות חופשה', to: '/employee/leave' },
    ],
  },
  {
    label: 'הרשאות',
    icon: Shield,
    module: 'ADMIN',
    to: '/admin/permissions',
    group: undefined,
  },
  {
    label: 'סוכני AI',
    icon: Brain,
    module: 'ACCOUNTING',
    children: [
      { label: 'צ\'אט AI', to: '/agents' },
      { label: 'היסטוריית שיחות', to: '/agents/conversations' },
      { label: 'סוכנים מותאמים', to: '/agents/profiles' },
      { label: 'בונה סוכנים', to: '/agents/builder' },
      { label: 'אוטומציות', to: '/agents/schedules' },
      { label: 'צוות סוכנים אוטונומי', to: '/agents/team' },
      { label: 'צוות סוכני ביקורת', to: '/agents/audit' },
      { label: 'בדיקת שלמות תוכנה', to: '/agents/software-audit' },
      { label: 'הגדרות סוכנים', to: '/settings/agents' },
    ],
  },
  {
    label: 'הודעות ועדכונים',
    icon: MessageCircle,
    module: 'ACCOUNTING',
    to: '/notifications',
    group: undefined,
  },
  {
    label: 'יומן פעולות',
    icon: ShieldCheck,
    module: 'ACCOUNTING',
    to: '/audit-log',
    group: undefined,
  },
];

// ─── Notification types ───────────────────────────────────────────────────────

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  INVOICE_DUE: 'חשבונית לתשלום',
  PAYMENT_RECEIVED: 'תשלום התקבל',
  LOW_STOCK: 'מלאי נמוך',
  LEAVE_REQUEST: 'בקשת חופשה',
  PAYROLL_READY: 'שכר מוכן',
  SYSTEM: 'מערכת',
};

const NOTIFICATION_TYPE_ICONS: Record<string, React.ElementType> = {
  INVOICE_DUE: FileText,
  PAYMENT_RECEIVED: CheckCircle,
  LOW_STOCK: Package,
  LEAVE_REQUEST: Umbrella,
  PAYROLL_READY: DollarSign,
  SYSTEM: Info,
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return 'כרגע';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `לפני ${diffMins} דק'`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  const diffDays = Math.floor(diffHours / 24);
  return `לפני ${diffDays} ימים`;
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: { link?: string };
}

function NotificationBell() {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notificationsData, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await api.get('/notifications', {
        params: { isRead: false, limit: 20 },
      });
      return res.data?.data ?? res.data ?? [];
    },
    refetchInterval: 60_000,
  });

  const notifications: Notification[] = notificationsData ?? [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  const markOneRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    if (panelOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [panelOpen]);

  function handleNotificationClick(n: Notification) {
    markOneRead.mutate(n.id);
    if (n.data?.link) navigate(n.data.link);
    setPanelOpen(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setPanelOpen(p => !p)}
        className="relative p-2 text-slate-500 hover:text-slate-800 transition rounded-lg hover:bg-slate-100"
        aria-label="התראות"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-sm text-slate-800">התראות</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs text-blue-600 hover:text-blue-800 transition disabled:opacity-50"
              >
                סמן הכל כנקרא
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading && (
              <div className="py-8 text-center text-sm text-slate-400">טוען...</div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">אין התראות</div>
            )}

            {!isLoading &&
              notifications.map(n => {
                const IconComp = NOTIFICATION_TYPE_ICONS[n.type] ?? Info;
                const typeLabel = NOTIFICATION_TYPE_LABELS[n.type] ?? n.type;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-right hover:bg-slate-50 transition border-b border-slate-50 last:border-0 ${
                      !n.isRead ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <IconComp className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">{typeLabel}</span>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 truncate">{n.body}</p>
                    </div>
                    {!n.isRead && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GroupHeader ───────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          {label}
        </span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
    </div>
  );
}

// ─── NavSection ───────────────────────────────────────────────────────────────

function NavSection({ item, onClose }: { item: NavItem; onClose?: () => void }) {
  const location = useLocation();

  // Determine if any child is active so we can auto-open
  const hasActiveChild = item.children?.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/')) ?? false;
  const [open, setOpen] = useState(hasActiveChild);

  // Sync open state when active child changes (e.g. navigate externally)
  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        onClick={onClose}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
            isActive
              ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/30'
              : 'text-slate-300 hover:bg-slate-700/80 hover:text-white'
          }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(p => !p)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
          open && hasActiveChild
            ? 'text-white bg-slate-700/60'
            : 'text-slate-300 hover:bg-slate-700/80 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-3">
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {item.label}
        </span>
        <span className={`transition-transform duration-200 ${open ? 'rotate-0' : ''}`}>
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
          )}
        </span>
      </button>

      {open && (
        <div className="mr-7 mt-1 space-y-0.5 border-r-2 border-slate-700 pr-2">
          {item.children!.map(child => (
            <React.Fragment key={child.to}>
              {child.divider && (
                <div className="px-2 pt-2.5 pb-0.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {child.divider}
                </div>
              )}
              <NavLink
                to={child.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `block px-3 py-1.5 rounded-md text-xs transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow shadow-blue-900/30'
                      : 'text-slate-400 hover:bg-slate-700/70 hover:text-white'
                  }`}
              >
                {child.label}
              </NavLink>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── User avatar initials ────────────────────────────────────────────────────

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'מנהל מערכת',
  MANAGER: 'מנהל',
  ACCOUNTANT: 'רואה חשבון',
  CASHIER: 'קופאי',
  SALESPERSON: 'איש מכירות',
  HR_MANAGER: 'מנהל משאבי אנוש',
  PAYROLL_ADMIN: 'מנהל שכר',
  EMPLOYEE: 'עובד',
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { hasModule } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  function openGlobalSearch() {
    window.dispatchEvent(new Event('global-search-open'));
  }

  const isAdmin = user?.role === 'ADMIN';
  const visibleNav = NAV.filter(item => {
    if (item.module === 'ADMIN') return isAdmin;
    return hasModule(item.module as ModuleKey);
  });

  const pageTitle = getPageTitle(location.pathname);
  const initials = getInitials(user?.name, user?.email);
  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? '';

  // Build sidebar nav with group headers inserted
  function renderNavItems(onClose?: () => void) {
    const elements: React.ReactNode[] = [];
    let lastGroup: string | undefined = '__none__'; // sentinel so first item's group always triggers header

    for (const item of visibleNav) {
      const itemGroup = item.group; // undefined means "inherit previous group" except at boundary
      if (itemGroup !== undefined && itemGroup !== lastGroup) {
        elements.push(<GroupHeader key={`group-${itemGroup}`} label={itemGroup} />);
        lastGroup = itemGroup;
      }
      elements.push(
        <NavSection key={item.label} item={item} onClose={onClose} />
      );
    }
    return elements;
  }

  const sidebar = (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' }}>
      {/* Logo / Company */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
               style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight tracking-tight">מערכת ERP</p>
            <p className="text-[11px] text-blue-400 leading-tight font-medium">חשבשבת</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
        {renderNavItems(() => setMobileOpen(false))}
      </nav>

      {/* Footer — user info + logout */}
      <div className="border-t border-slate-700/60 px-3 py-3">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white shadow"
               style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
            {initials}
          </div>
          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {user?.name || user?.email || ''}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight">{roleLabel}</p>
          </div>
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-red-400 transition p-1.5 rounded-lg hover:bg-slate-700/60"
            aria-label="התנתק"
            title="התנתק"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-60 h-full flex-shrink-0">{sidebar}</div>
          <button
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="סגור תפריט"
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between bg-slate-800 px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white p-1"
            aria-label="פתח תפריט"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-white font-bold text-sm">מערכת ERP</span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={openGlobalSearch}
              className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition"
              aria-label="חיפוש"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Desktop top header */}
        <header className="hidden md:flex items-center bg-white border-b border-slate-200 px-6 py-0 h-14 gap-4">
          {/* Page title / breadcrumb */}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-slate-800 truncate">{pageTitle}</h1>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Global search button */}
            <button
              onClick={openGlobalSearch}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition text-slate-500 hover:text-slate-700 text-sm"
              aria-label="חיפוש גלובלי"
            >
              <Search className="w-4 h-4" />
              <span className="text-xs text-slate-400">חיפוש...</span>
              <kbd className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-400 shadow-sm">
                Ctrl+K
              </kbd>
            </button>

            {/* Notification bell */}
            <NotificationBell />

            {/* User avatar + name */}
            <div className="flex items-center gap-2 mr-1 pl-3 border-r border-slate-200">
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-700 leading-tight truncate max-w-[120px]">
                  {user?.name || user?.email || ''}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">{roleLabel}</p>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white shadow-sm"
                   style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto bg-slate-50">
          {children}
        </main>
      </div>

      {/* Global search modal */}
      <GlobalSearch />
    </div>
  );
}
