import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Package, User, FileText, X } from 'lucide-react';
import api from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductResult {
  id: string;
  name: string;
  sku?: string;
  category?: string;
}

interface CustomerResult {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface InvoiceResult {
  id: string;
  number?: string;
  customerName?: string;
  total?: number;
  status?: string;
}

interface SearchResults {
  products: ProductResult[];
  customers: CustomerResult[];
  invoices: InvoiceResult[];
}

interface FlatResult {
  type: 'product' | 'customer' | 'invoice';
  id: string;
  primary: string;
  secondary?: string;
  to: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenResults(results: SearchResults): FlatResult[] {
  const flat: FlatResult[] = [];

  results.products.forEach(p =>
    flat.push({
      type: 'product',
      id: p.id,
      primary: p.name,
      secondary: p.sku ? `מק"ט: ${p.sku}` : p.category,
      to: `/inventory/items/${p.id}`,
    }),
  );

  results.customers.forEach(c =>
    flat.push({
      type: 'customer',
      id: c.id,
      primary: c.name,
      secondary: c.email ?? c.phone,
      to: `/crm/customers/${c.id}`,
    }),
  );

  results.invoices.forEach(inv =>
    flat.push({
      type: 'invoice',
      id: inv.id,
      primary: inv.number ? `חשבונית #${inv.number}` : `חשבונית ${inv.id.slice(0, 8)}`,
      secondary: inv.customerName ?? (inv.total != null ? `₪${inv.total.toLocaleString('he-IL')}` : undefined),
      to: `/invoices/${inv.id}`,
    }),
  );

  return flat;
}

const SECTION_LABELS: Record<string, string> = {
  product: 'מוצרים',
  customer: 'לקוחות',
  invoice: 'חשבוניות',
};

const SECTION_ICONS: Record<string, React.ElementType> = {
  product: Package,
  customer: User,
  invoice: FileText,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FlatResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // ── Listen for Ctrl+K / Cmd+K and custom event ──
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

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Search with debounce ──
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [productsRes, customersRes, invoicesRes] = await Promise.allSettled([
        api.get('/scan/products', { params: { q, limit: 8 } }),
        api.get('/scan/customers', { params: { q, limit: 8 } }),
        api.get('/invoices', { params: { search: q, pageSize: 5 } }),
      ]);

      const products: ProductResult[] =
        productsRes.status === 'fulfilled'
          ? (productsRes.value.data?.data ?? productsRes.value.data ?? [])
          : [];

      const customers: CustomerResult[] =
        customersRes.status === 'fulfilled'
          ? (customersRes.value.data?.data ?? customersRes.value.data ?? [])
          : [];

      const invoiceData =
        invoicesRes.status === 'fulfilled'
          ? (invoicesRes.value.data?.data ?? invoicesRes.value.data ?? [])
          : [];

      setResults(flattenResults({ products, customers, invoices: invoiceData }));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(-1);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (val.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceTimer.current = setTimeout(() => runSearch(val), 250);
  }

  function handleClose() {
    setOpen(false);
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
  }

  function goToResult(result: FlatResult) {
    navigate(result.to);
    handleClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
      return;
    }
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      goToResult(results[activeIndex]);
    }
  }

  if (!open) return null;

  // Group results by type for section headers
  const sections: Array<{ type: string; items: FlatResult[] }> = [];
  let lastType = '';
  for (const r of results) {
    if (r.type !== lastType) {
      sections.push({ type: r.type, items: [] });
      lastType = r.type;
    }
    sections[sections.length - 1].items.push(r);
  }

  // Compute global index for each item in sections
  let globalIdx = 0;
  const indexedSections = sections.map(s => ({
    ...s,
    items: s.items.map(item => ({ ...item, globalIndex: globalIdx++ })),
  }));

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
              placeholder="חפש מוצרים, לקוחות, חשבוניות..."
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

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto">
            {query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-center text-xs text-slate-400 py-8">
                הקלד לפחות 2 תווים לחיפוש
              </p>
            )}

            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">
                לא נמצאו תוצאות
              </p>
            )}

            {indexedSections.map(section => {
              const SectionIcon = SECTION_ICONS[section.type];
              return (
                <div key={section.type}>
                  {/* Section header */}
                  <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                    <SectionIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {SECTION_LABELS[section.type]}
                    </span>
                  </div>

                  {/* Items */}
                  {section.items.map(item => {
                    const isActive = item.globalIndex === activeIndex;
                    const ItemIcon = SECTION_ICONS[item.type];
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
                          <p className="text-sm font-medium truncate">{item.primary}</p>
                          {item.secondary && (
                            <p className="text-xs text-slate-400 truncate">{item.secondary}</p>
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
