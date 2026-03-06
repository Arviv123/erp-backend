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

  // ── Build indexed groups from API response ───────────────────────────────────
  function buildIndexed(grouped: SearchGroup[]): { groups: IndexedGroup[]; flat: IndexedItem[] } {
    const flat: IndexedItem[] = [];
    const indexedGroups: IndexedGroup[] = grouped.map(g => ({
      ...g,
      items: g.items.map(item => {
        const indexed: IndexedItem = { ...item, globalIndex: flat.length };
        flat.push(indexed);
        return indexed;
      }),
    }));
    return { groups: indexedGroups, flat };
  }

  // ── Unified search call ──────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string, types: string) => {
    if (q.trim().length < 2) {
      setGroups([]);
      setFlatItems([]);
      setLoading(false);
      setSearchError(null);
      return;
    }
    setLoading(true);
    setSearchError(null);
    try {
      const res = await api.get('/search', { params: { q, types, limit: 10 }, timeout: 10000 });
      const data: SearchResponse = res.data?.data ?? res.data;
      const { groups: g, flat } = buildIndexed(data.grouped ?? []);
      setGroups(g);
      setFlatItems(flat);
    } catch (err: any) {
      setGroups([]);
      setFlatItems([]);
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
    if (val.trim().length < 2) {
      setGroups([]);
      setFlatItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const typesParam = FILTERS.find(f => f.key === activeFilter)?.types ?? 'all';
    debounceTimer.current = setTimeout(() => runSearch(val, typesParam), 250);
  }

  // ── Filter button click ──────────────────────────────────────────────────────
  function handleFilterChange(filterKey: string) {
    setActiveFilter(filterKey);
    setActiveIndex(-1);
    if (query.trim().length >= 2) {
      const typesParam = FILTERS.find(f => f.key === filterKey)?.types ?? 'all';
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setLoading(true);
      runSearch(query, typesParam);
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

  function goToResult(item: SearchItem) {
    navigate(item.url);
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
              placeholder="חפש לקוחות, חשבוניות, עובדים, מוצרים..."
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
            {query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-center text-xs text-slate-400 py-8">
                הקלד לפחות 2 תווים לחיפוש
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
              const GroupIcon = getIcon(group.items[0]?.type ?? group.type);
              return (
                <div key={group.type}>
                  {/* Section header */}
                  <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                    <GroupIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>

                  {/* Items */}
                  {group.items.map(item => {
                    const isActive = item.globalIndex === activeIndex;
                    const ItemIcon = getIcon(item.type);
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
                            isActive ? 'bg-blue-100' : 'bg-slate-100'
                          }`}
                        >
                          <ItemIcon className="w-3.5 h-3.5" />
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
