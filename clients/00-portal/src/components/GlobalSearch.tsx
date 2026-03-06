import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Loader2,
  Package,
  User,
  FileText,
  Users,
  ShoppingCart,
  BookOpen,
  ClipboardList,
  Receipt,
  X,
  LayoutDashboard,
  Settings,
  BarChart2,
  Wallet,
  Building2,
  Truck,
  ChefHat,
  Wifi,
  ScanLine,
  Bot,
  CreditCard,
  Calendar,
  Navigation,
  Calculator,
  Scale,
  TrendingUp,
  Landmark,
  PiggyBank,
  Banknote,
  AlertCircle,
  RefreshCw,
  DollarSign,
  UserCheck,
  UserPlus,
  Briefcase,
  ClipboardCheck,
  Tag,
  Printer,
  MessageSquare,
  Layers,
  GitBranch,
  Shield,
  History,
} from 'lucide-react';
import api from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchItem {
  type: string;
  id: string;
  label: string;
  sublabel?: string;
  extra?: string;
  url: string;
  date?: string;
}

interface SearchGroup {
  type: string;
  label: string;
  items: SearchItem[];
}

interface SearchResponse {
  query: string;
  grouped: SearchGroup[];
  total: number;
}

// ─── Navigation Registry ──────────────────────────────────────────────────────

interface NavPage {
  url: string;
  label: string;
  sublabel: string;
  keywords: string[];
  icon: React.ElementType;
}

const NAV_REGISTRY: NavPage[] = [
  // ── לוח מחוונים
  { url: '/dashboard',             label: 'לוח מחוונים',             sublabel: 'סקירה כללית של העסק',           keywords: ['dashboard', 'בית', 'ראשי', 'סטטיסטיקות', 'כלים'],  icon: LayoutDashboard },

  // ── חשבוניות מכירה
  { url: '/invoices',              label: 'חשבוניות',                 sublabel: 'רשימת חשבוניות מכירה',          keywords: ['invoice', 'חשבון', 'מכירה', 'לקוח', 'VAT', 'מע"מ'], icon: FileText },
  { url: '/invoices/new',          label: 'חשבונית חדשה',             sublabel: 'הפק חשבונית מכירה חדשה',        keywords: ['invoice new', 'הוצא חשבון', 'חדש'],                  icon: FileText },
  { url: '/receipts',              label: 'קבלות',                    sublabel: 'קבלות תשלום',                   keywords: ['receipt', 'תשלום', 'גביה'],                           icon: Receipt },

  // ── הצעות מחיר והזמנות
  { url: '/quotes',                label: 'הצעות מחיר',               sublabel: 'רשימת הצעות מחיר',              keywords: ['quote', 'הצעה', 'מחיר'],                             icon: ClipboardList },
  { url: '/quotes/new',            label: 'הצעת מחיר חדשה',           sublabel: 'צור הצעת מחיר',                 keywords: ['quote new', 'הצעה חדשה'],                            icon: ClipboardList },
  { url: '/sales-orders',          label: 'הזמנות מכירה',             sublabel: 'ניהול הזמנות לקוחות',           keywords: ['order', 'הזמנה', 'לקוח'],                            icon: ShoppingCart },

  // ── CRM לקוחות
  { url: '/crm/customers',         label: 'לקוחות',                   sublabel: 'ניהול לקוחות CRM',               keywords: ['customer', 'crm', 'לקוח', 'אנשי קשר'],               icon: User },
  { url: '/crm/customers/new',     label: 'לקוח חדש',                 sublabel: 'הוסף לקוח חדש',                 keywords: ['customer new', 'לקוח חדש'],                           icon: UserPlus },

  // ── רכש
  { url: '/purchasing/vendors',    label: 'ספקים',                    sublabel: 'ניהול ספקים',                   keywords: ['vendor', 'ספק', 'סיטונאי'],                           icon: Truck },
  { url: '/purchasing/bills',      label: 'חשבוניות ספק',             sublabel: 'חשבוניות קנייה מספקים',         keywords: ['bill', 'ספק', 'קנייה', 'רכש'],                        icon: Receipt },
  { url: '/purchasing/goods-receipts', label: 'קבלת סחורה מספק',      sublabel: 'רישום קבלת סחורה',              keywords: ['goods receipt', 'קבלה', 'מחסן'],                      icon: Package },

  // ── מלאי
  { url: '/inventory',             label: 'ניהול מלאי',               sublabel: 'מוצרים, רמות מלאי ותנועות',     keywords: ['inventory', 'מלאי', 'מוצר', 'מחסן', 'stock'],        icon: Package },
  { url: '/inventory/receive',     label: 'קבלת סחורה בברקוד',        sublabel: 'סרוק ברקוד לקליטת מלאי',        keywords: ['receive', 'barcode', 'ברקוד', 'קליטה', 'מלאי'],      icon: ScanLine },
  { url: '/inventory/count',       label: 'ספירת מלאי',               sublabel: 'ספירה פיזית עם ברקוד',          keywords: ['count', 'ספירה', 'בדיקה', 'מלאי'],                   icon: ClipboardCheck },

  // ── RFID
  { url: '/rfid',                  label: 'לוח בקרה RFID',            sublabel: 'מעקב אחר תגיות ואירועים',       keywords: ['rfid', 'תגית', 'קורא', 'מעקב'],                      icon: Wifi },
  { url: '/rfid/tags',             label: 'תגיות RFID',               sublabel: 'ניהול תגיות EPC',               keywords: ['rfid tag', 'תגית', 'epc'],                            icon: Tag },
  { url: '/rfid/readers',          label: 'קוראי RFID',               sublabel: 'קוראים מחוברים ומפתחות API',    keywords: ['rfid reader', 'קורא', 'antenna'],                     icon: Wifi },
  { url: '/rfid/assets',           label: 'נכסים (RFID)',              sublabel: 'רישום נכסי החברה',              keywords: ['asset', 'נכס', 'ציוד', 'rfid'],                       icon: Briefcase },
  { url: '/rfid/inventory',        label: 'מלאי RFID',                sublabel: 'ספירת מלאי אוטומטית ב-RFID',   keywords: ['rfid inventory', 'ספירה', 'אוטומטי'],                 icon: Package },

  // ── HR / עובדים
  { url: '/employees',             label: 'עובדים',                   sublabel: 'ניהול תיקי עובדים',             keywords: ['employee', 'עובד', 'כוח אדם', 'hr'],                  icon: Users },
  { url: '/employees/new',         label: 'עובד חדש',                 sublabel: 'הוסף עובד חדש',                 keywords: ['employee new', 'עובד חדש', 'גיוס'],                   icon: UserPlus },
  { url: '/hr/leaves',             label: 'ניהול חופשות',             sublabel: 'בקשות ואישורי חופשה',           keywords: ['leave', 'vacation', 'חופשה', 'מחלה', 'היעדרות'],     icon: Calendar },
  { url: '/hr/attendance',         label: 'נוכחות',                   sublabel: 'שעון נוכחות ודוחות',            keywords: ['attendance', 'נוכחות', 'שעות', 'כניסה', 'יציאה'],   icon: UserCheck },
  { url: '/hr/training',           label: 'הכשרות',                   sublabel: 'תוכניות הכשרה לעובדים',         keywords: ['training', 'הכשרה', 'קורס', 'לימוד'],                 icon: BookOpen },
  { url: '/hr/onboarding',         label: 'קליטת עובדים',             sublabel: 'תהליך קליטה לעובד חדש',         keywords: ['onboarding', 'קליטה', 'חדש'],                         icon: UserPlus },

  // ── שכר ומשאבי אנוש
  { url: '/payroll',               label: 'חישוב שכר',                sublabel: 'הפקת תלושי שכר ישראליים',       keywords: ['payroll', 'שכר', 'תלוש', 'מס הכנסה', 'ביטוח לאומי'], icon: Banknote },
  { url: '/pension',               label: 'ניהול פנסיה',              sublabel: 'קרנות פנסיה וביטוח מנהלים',     keywords: ['pension', 'פנסיה', 'גמל', 'קרן'],                     icon: PiggyBank },

  // ── חשבונאות
  { url: '/accounting/journal',    label: 'יומן חשבונאי',             sublabel: 'רשומות יומן כפולות',            keywords: ['journal', 'יומן', 'פקודה', 'חשבונאות'],              icon: BookOpen },
  { url: '/accounting/accounts',   label: 'תרשים חשבונות',            sublabel: 'חשבונות GL וחשבון חיצוני',      keywords: ['accounts', 'chart of accounts', 'ת"ח', 'GL'],         icon: Layers },
  { url: '/accounting/trial-balance', label: 'מאזן בוחן',             sublabel: 'בדיקת איזון חשבונות',           keywords: ['trial balance', 'מאזן', 'בוחן', 'חובה', 'זכות'],    icon: Scale },
  { url: '/accounting/balance-sheet', label: 'מאזן',                  sublabel: 'דוח מאזן לתאריך',               keywords: ['balance sheet', 'מאזן', 'נכסים', 'התחייבויות'],      icon: Scale },
  { url: '/accounting/profit-loss',label: 'רווח והפסד',               sublabel: 'דוח רווח והפסד לתקופה',        keywords: ['p&l', 'profit loss', 'רווח', 'הפסד', 'הכנסות'],      icon: TrendingUp },
  { url: '/accounting/vat',        label: 'דוח מע"מ',                 sublabel: 'סיכום עסקאות מע"מ',             keywords: ['vat', 'מע"מ', 'מס ערך מוסף', 'תקופה'],               icon: Calculator },
  { url: '/accounting/aging',      label: 'דוח גיל חובות',            sublabel: 'חייבים ומשלמים מתעכבים',        keywords: ['aging', 'חוב', 'גביה', 'פיגור'],                      icon: AlertCircle },
  { url: '/accounting/bank-recon', label: 'פיוס בנק',                 sublabel: 'פיוס תנועות בנקאיות',           keywords: ['bank recon', 'פיוס', 'בנק', 'תנועה'],                 icon: Landmark },
  { url: '/accounting/cash-flow',  label: 'תזרים מזומנים',            sublabel: 'תחזית תזרים מזומנים',           keywords: ['cash flow', 'תזרים', 'מזומן'],                        icon: DollarSign },
  { url: '/ledger',                label: 'כרטסות',                   sublabel: 'כרטסות חשבון מפורטות',          keywords: ['ledger', 'כרטסת', 'חשבון'],                           icon: BookOpen },

  // ── תקציב
  { url: '/budget',                label: 'תקציב',                    sublabel: 'תכנון וניתוח תקציב',            keywords: ['budget', 'תקציב', 'תוכנית', 'תחזית'],               icon: BarChart2 },

  // ── הוצאות
  { url: '/expenses',              label: 'הוצאות',                   sublabel: 'ניהול דוחות הוצאות',            keywords: ['expense', 'הוצאה', 'דוח', 'החזר'],                   icon: Wallet },
  { url: '/petty-cash',            label: 'קופה קטנה',                sublabel: 'ניהול קופה קטנה',               keywords: ['petty cash', 'קופה', 'מזומן', 'הוצאה'],              icon: PiggyBank },

  // ── כרטיסי אשראי
  { url: '/credit-cards',          label: 'כרטיסי אשראי',             sublabel: 'ניהול כרטיסי אשראי חברה',       keywords: ['credit card', 'אשראי', 'כרטיס', 'visa'],             icon: CreditCard },
  { url: '/credit-card-recon',     label: 'פיוס כרטיסי אשראי',        sublabel: 'פיוס עסקאות אשראי',             keywords: ['credit card recon', 'פיוס', 'אשראי'],                icon: RefreshCw },

  // ── תשלומים
  { url: '/batch-payments',        label: 'תשלומים קבוצתיים',         sublabel: 'תשלום לספקים בקבוצה',           keywords: ['batch payment', 'תשלום', 'קבוצה', 'ספק', 'EFT'],    icon: Banknote },
  { url: '/payment-links',         label: 'קישורי תשלום',             sublabel: 'צור קישורים לתשלום מקוון',      keywords: ['payment link', 'קישור', 'תשלום', 'מקוון'],           icon: DollarSign },

  // ── POS קופה
  { url: '/pos',                   label: 'קופה (POS)',                sublabel: 'מסך קופה למכירה',               keywords: ['pos', 'קופה', 'מכירה', 'מוצר'],                      icon: ShoppingCart },
  { url: '/pos/tables',            label: 'ניהול שולחנות',             sublabel: 'פלאן שולחנות מסעדה',            keywords: ['tables', 'שולחן', 'הזמנה', 'מסעדה'],                 icon: Layers },
  { url: '/pos/kitchen',           label: 'מסך מטבח (KDS)',            sublabel: 'תצוגת הזמנות למטבח',            keywords: ['kitchen', 'kds', 'מטבח', 'הזמנה', 'בישול'],          icon: ChefHat },
  { url: '/pos/waiter',            label: 'מלצר',                     sublabel: 'ממשק הזמנות לשולחן',            keywords: ['waiter', 'מלצר', 'שולחן', 'הזמנה'],                  icon: Users },

  // ── חוזים
  { url: '/contracts',             label: 'חוזים',                    sublabel: 'ניהול חוזי שירות',              keywords: ['contract', 'חוזה', 'שירות', 'חידוש'],                icon: FileText },

  // ── מחירונים
  { url: '/price-lists',           label: 'מחירונים',                  sublabel: 'ניהול מחירונים ללקוחות',        keywords: ['price list', 'מחירון', 'מחיר', 'הנחה'],              icon: Tag },

  // ── ניתוח ודוחות
  { url: '/analytics',             label: 'אנליטיקה',                  sublabel: 'דוחות KPI וגרפים',              keywords: ['analytics', 'דוח', 'kpi', 'סטטיסטיקה', 'גרף'],      icon: BarChart2 },
  { url: '/audit',                 label: 'יומן ביקורת',               sublabel: 'לוג פעילות משתמשים',            keywords: ['audit', 'ביקורת', 'לוג', 'היסטוריה'],                icon: History },

  // ── AI סוכנים
  { url: '/agents',                label: 'סוכן AI',                   sublabel: 'שיחה עם סוכן AI חכם',           keywords: ['agent', 'ai', 'בינה מלאכותית', 'chat', 'שיחה'],      icon: Bot },
  { url: '/agents/team',           label: 'צוות סוכנים אוטונומי',      sublabel: '6 סוכנים ניתוח אוטומטי',       keywords: ['agent team', 'צוות', 'אוטונומי', 'ניתוח', 'ai'],     icon: Bot },

  // ── הגדרות
  { url: '/settings',              label: 'הגדרות',                   sublabel: 'הגדרות כלליות של החשבון',       keywords: ['settings', 'הגדרות', 'חשבון', 'פרטים'],             icon: Settings },
  { url: '/settings/users',        label: 'ניהול משתמשים',             sublabel: 'הוספה ועריכת משתמשים',          keywords: ['users', 'משתמשים', 'הרשאות', 'תפקידים'],            icon: Shield },
  { url: '/settings/agents',       label: 'הגדרות AI',                 sublabel: 'בחירת ספק AI ומפתחות API',     keywords: ['ai settings', 'openai', 'claude', 'api key'],         icon: Bot },
  { url: '/settings/whatsapp',     label: 'WhatsApp',                 sublabel: 'חיבור WhatsApp Business',       keywords: ['whatsapp', 'ווטסאפ', 'הודעה', 'sms'],                icon: MessageSquare },
  { url: '/settings/printers',     label: 'מדפסות',                   sublabel: 'הגדרת מדפסות תרמיות',           keywords: ['printer', 'מדפסת', 'תרמית', 'קבלה'],                 icon: Printer },
  { url: '/calendar',              label: 'לוח שנה',                   sublabel: 'חגים וימי עבודה',               keywords: ['calendar', 'חג', 'ינחה', 'תאריך'],                   icon: Calendar },

  // ── ייבוא
  { url: '/bulk-import',           label: 'ייבוא נתונים',              sublabel: 'ייבוא לקוחות/מוצרים מאקסל',    keywords: ['import', 'ייבוא', 'excel', 'אקסל', 'csv'],           icon: GitBranch },
  { url: '/smart-import',          label: 'ייבוא חכם AI',              sublabel: 'ייבוא נתונים עם AI',            keywords: ['smart import', 'ai import', 'ייבוא חכם'],            icon: Bot },

  // ── חשבונית ירוקה
  { url: '/settings/green-invoice', label: 'חשבונית ירוקה',           sublabel: 'חיבור ל-API חשבונית ירוקה',    keywords: ['green invoice', 'חשבונית ירוקה', 'ממשלה', 'רשות המסים'], icon: FileText },

  // ── סניפים
  { url: '/branches',              label: 'ניהול סניפים',              sublabel: 'מספר סניפים ומיקומים',         keywords: ['branch', 'סניף', 'מיקום', 'חנות'],                   icon: Building2 },

  // ── טופס 161
  { url: '/form161',               label: 'טופס 161',                  sublabel: 'סיום העסקה ופיצויים',           keywords: ['161', 'פיצויים', 'סיום', 'פיטורין', 'התפטרות'],     icon: FileText },

  // ── מסופי אשראי
  { url: '/payment-terminal',      label: 'מסופי אשראי',               sublabel: 'ניהול מסופי אשראי',             keywords: ['payment terminal', 'מסוף', 'credit card terminal'],  icon: CreditCard },
];

// ─── Local nav search ─────────────────────────────────────────────────────────

function searchNavPages(q: string): NavPage[] {
  if (q.trim().length < 1) return [];
  const lower = q.trim().toLowerCase();
  return NAV_REGISTRY.filter(p => {
    const haystack = [p.label, p.sublabel, ...p.keywords].join(' ').toLowerCase();
    return haystack.includes(lower);
  }).slice(0, 5);
}

// ─── Filter definitions ───────────────────────────────────────────────────────

interface FilterDef {
  key: string;
  label: string;
  types: string;
}

const FILTERS: FilterDef[] = [
  { key: 'all',          label: 'הכל',            types: 'all' },
  { key: 'invoices',     label: 'חשבוניות',        types: 'invoices' },
  { key: 'bills',        label: 'חשבוניות ספק',    types: 'bills' },
  { key: 'quotes',       label: 'הצעות מחיר',      types: 'quotes' },
  { key: 'sales_orders', label: 'הזמנות',          types: 'sales_orders' },
  { key: 'customers',    label: 'לקוחות',          types: 'customers' },
  { key: 'vendors',      label: 'ספקים',           types: 'vendors' },
  { key: 'employees',    label: 'עובדים',          types: 'employees' },
  { key: 'products',     label: 'מוצרים',          types: 'products' },
  { key: 'accounts',     label: 'חשבונות GL',      types: 'accounts' },
];

// ─── Icon map ─────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ElementType> = {
  invoice:     FileText,
  bill:        Receipt,
  customer:    User,
  vendor:      Users,
  employee:    User,
  product:     Package,
  quote:       ClipboardList,
  account:     BookOpen,
  sales_order: ShoppingCart,
  nav:         Navigation,
};

function getIcon(type: string): React.ElementType {
  return TYPE_ICONS[type] ?? FileText;
}

// ─── Flat item with global index ──────────────────────────────────────────────

interface IndexedItem extends SearchItem {
  globalIndex: number;
}

interface IndexedGroup {
  type: string;
  label: string;
  items: IndexedItem[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [groups, setGroups]           = useState<IndexedGroup[]>([]);
  const [flatItems, setFlatItems]     = useState<IndexedItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchError, setSearchError]   = useState<string | null>(null);

  const inputRef       = useRef<HTMLInputElement>(null);
  const debounceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate       = useNavigate();

  // ── Listen for Ctrl+K / Cmd+K and custom event ──────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    }
    function handleCustomEvent() {
      setOpen(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('global-search-open', handleCustomEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('global-search-open', handleCustomEvent);
    };
  }, []);

  // Auto-focus when opened ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery('');
      setGroups([]);
      setFlatItems([]);
      setActiveIndex(-1);
      setActiveFilter('all');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Build indexed groups from API response + nav results ─────────────────────
  function buildIndexed(
    grouped: SearchGroup[],
    navPages: NavPage[],
    filterKey: string,
  ): { groups: IndexedGroup[]; flat: IndexedItem[] } {
    const flat: IndexedItem[] = [];

    // Nav pages first (only when filter is 'all')
    const allGroups: IndexedGroup[] = [];
    if (filterKey === 'all' && navPages.length > 0) {
      const navItems: IndexedItem[] = navPages.map(p => {
        const item: IndexedItem = {
          type:        'nav',
          id:          p.url,
          label:       p.label,
          sublabel:    p.sublabel,
          url:         p.url,
          globalIndex: flat.length,
        };
        flat.push(item);
        return item;
      });
      allGroups.push({ type: 'nav', label: 'ניווט מהיר', items: navItems });
    }

    // Data results
    const dataGroups: IndexedGroup[] = grouped.map(g => ({
      ...g,
      items: g.items.map(item => {
        const indexed: IndexedItem = { ...item, globalIndex: flat.length };
        flat.push(indexed);
        return indexed;
      }),
    }));

    return { groups: [...allGroups, ...dataGroups], flat };
  }

  // ── Unified search call ──────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string, types: string, filterKey: string) => {
    const navPages = filterKey === 'all' ? searchNavPages(q) : [];

    if (q.trim().length < 2) {
      // Still show nav results for single-char
      const { groups: g, flat } = buildIndexed([], navPages, filterKey);
      setGroups(g);
      setFlatItems(flat);
      setLoading(false);
      setSearchError(null);
      return;
    }

    setLoading(true);
    setSearchError(null);
    try {
      const res = await api.get('/search', { params: { q, types, limit: 10 }, timeout: 10000 });
      const data: SearchResponse = res.data?.data ?? res.data;
      const { groups: g, flat } = buildIndexed(data.grouped ?? [], navPages, filterKey);
      setGroups(g);
      setFlatItems(flat);
    } catch (err: any) {
      const { groups: g, flat } = buildIndexed([], navPages, filterKey);
      setGroups(g);
      setFlatItems(flat);
      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        setSearchError('החיפוש ארך זמן רב מדי — נסה שנית');
      } else if (err?.response?.status === 401) {
        setSearchError('נדרשת התחברות מחדש');
      } else {
        setSearchError('שגיאה בחיפוש — נסה שנית');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Debounced handler for input changes ──────────────────────────────────────
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(-1);
    setSearchError(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // Show nav results immediately (no debounce)
    if (activeFilter === 'all') {
      const navPages = searchNavPages(val);
      const { groups: g, flat } = buildIndexed([], navPages, activeFilter);
      setGroups(g);
      setFlatItems(flat);
    }

    if (val.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const typesParam = FILTERS.find(f => f.key === activeFilter)?.types ?? 'all';
    debounceTimer.current = setTimeout(() => runSearch(val, typesParam, activeFilter), 250);
  }

  // ── Filter button click ──────────────────────────────────────────────────────
  function handleFilterChange(filterKey: string) {
    setActiveFilter(filterKey);
    setActiveIndex(-1);
    if (query.trim().length >= 1) {
      const typesParam = FILTERS.find(f => f.key === filterKey)?.types ?? 'all';
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setLoading(query.trim().length >= 2);
      runSearch(query, typesParam, filterKey);
    }
  }

  // ── Close / navigate ─────────────────────────────────────────────────────────
  function handleClose() {
    setOpen(false);
    setQuery('');
    setGroups([]);
    setFlatItems([]);
    setActiveIndex(-1);
    setSearchError(null);
  }

  // Fix legacy URLs from older backend versions
  function normalizeUrl(url: string): string {
    if (url.startsWith('/customers/')) return url.replace('/customers/', '/crm/customers/');
    if (url === '/customers') return '/crm/customers';
    if (url.startsWith('/vendors/') || url === '/vendors') return '/purchasing/vendors';
    if (url.startsWith('/bills/') || url === '/bills') return '/purchasing/bills';
    return url;
  }

  function goToResult(item: SearchItem) {
    navigate(normalizeUrl(item.url));
    handleClose();
  }

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
      return;
    }
    if (flatItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < flatItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      goToResult(flatItems[activeIndex]);
    }
  }

  if (!open) return null;

  const hasResults = groups.some(g => g.items.length > 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[9991] flex items-start justify-center pt-20 px-4"
        dir="rtl"
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="חיפוש גלובלי"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
            {loading ? (
              <Loader2 className="w-5 h-5 text-slate-400 flex-shrink-0 animate-spin" />
            ) : (
              <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="חפש דפים, לקוחות, חשבוניות, מוצרים, הגדרות..."
              className="flex-1 text-sm outline-none text-slate-800 placeholder:text-slate-400 bg-transparent"
              autoComplete="off"
            />
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 transition flex-shrink-0"
              aria-label="סגור"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 overflow-x-auto">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => handleFilterChange(f.key)}
                className={`flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition ${
                  activeFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="max-h-[480px] overflow-y-auto">
            {query.trim().length === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">
                הקלד לחיפוש דפים, נתונים, או הגדרות
              </p>
            )}

            {query.trim().length > 0 && query.trim().length < 2 && !hasResults && (
              <p className="text-center text-xs text-slate-400 py-8">
                הקלד לפחות 2 תווים לחיפוש נתונים
              </p>
            )}

            {searchError && (
              <p className="text-center text-xs text-red-500 py-8">{searchError}</p>
            )}

            {!loading && !searchError && query.trim().length >= 2 && !hasResults && (
              <p className="text-center text-xs text-slate-400 py-8">
                לא נמצאו תוצאות עבור &quot;{query}&quot;
              </p>
            )}

            {groups.map(group => {
              const isNavGroup = group.type === 'nav';
              const GroupIcon = isNavGroup ? Navigation : getIcon(group.items[0]?.type ?? group.type);
              return (
                <div key={group.type}>
                  {/* Section header */}
                  <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                    <GroupIcon className={`w-3.5 h-3.5 ${isNavGroup ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${isNavGroup ? 'text-blue-500' : 'text-slate-400'}`}>
                      {group.label}
                    </span>
                  </div>

                  {/* Items */}
                  {group.items.map(item => {
                    const isActive = item.globalIndex === activeIndex;
                    const ItemIcon = isNavGroup
                      ? (NAV_REGISTRY.find(p => p.url === item.url)?.icon ?? Navigation)
                      : getIcon(item.type);
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => goToResult(item)}
                        onMouseEnter={() => setActiveIndex(item.globalIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-right transition ${
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isActive
                              ? 'bg-blue-100'
                              : isNavGroup
                                ? 'bg-blue-50'
                                : 'bg-slate-100'
                          }`}
                        >
                          <ItemIcon className={`w-3.5 h-3.5 ${isNavGroup && !isActive ? 'text-blue-500' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {(item.sublabel || item.extra) && (
                            <p className="text-xs text-slate-400 truncate">
                              {item.sublabel}
                              {item.sublabel && item.extra ? ' · ' : ''}
                              {item.extra}
                            </p>
                          )}
                        </div>
                        {isNavGroup && (
                          <span className="text-[10px] text-blue-400 flex-shrink-0 font-mono">{item.url}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <span>↑↓ ניווט</span>
            <span>·</span>
            <span>Enter בחר</span>
            <span>·</span>
            <span>Esc סגור</span>
          </div>
        </div>
      </div>
    </>
  );
}
