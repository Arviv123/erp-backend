import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Save, Send, Loader2, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import SearchSelect from '../components/SearchSelect';

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

interface Line {
  description:     string;
  sku:             string;
  barcode:         string;
  unit:            string;
  quantity:        number;
  unitPrice:       number;
  discountPercent: number;
  vatRate:         number;
  notes:           string;
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  unitOfMeasure?: string;
  sellingPrice?: number;
  costPrice?: number;
  vatRate?: number;
  category?: string | { name: string } | null;
  stockQuantity?: number;
  stockLevels?: { quantity: number }[];
}

const emptyLine = (): Line => ({
  description: '', sku: '', barcode: '', unit: 'יח',
  quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 0.18, notes: '',
});

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none';
const headerInputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none';

// ─── New Item Quick-Create Modal ──────────────────────────────────────────────
function NewItemModal({
  initialName,
  onCreated,
  onClose,
}: {
  initialName: string;
  onCreated: (product: Product) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name,     setName]     = useState(initialName);
  const [sku,      setSku]      = useState('');
  const [barcode,  setBarcode]  = useState('');
  const [unit,     setUnit]     = useState('יח');
  const [price,    setPrice]    = useState('');
  const [vatRate,  setVatRate]  = useState(0.18);
  const [category, setCategory] = useState('');
  const [err,      setErr]      = useState('');

  const { isPending, mutate } = useMutation({
    mutationFn: () => api.post('/inventory/products', {
      name:          name.trim(),
      sku:           sku.trim() || `SKU-${Date.now()}`,
      barcode:       barcode.trim() || undefined,
      unitOfMeasure: unit.trim() || 'יחידה',
      costPrice:     0,
      sellingPrice:  parseFloat(price) || 0,
      vatRate,
      isService:     true,
    }),
    onSuccess: res => {
      const item: Product = res.data?.data ?? res.data;
      qc.invalidateQueries({ queryKey: ['inventory-items-search'] });
      onCreated(item);
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? 'שגיאה ביצירת הפריט'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">➕ הקמת פריט חדש בקטלוג</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">שם הפריט / שירות *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">מחיר מכירה ₪ *</label>
              <input type="number" min={0} step={0.01} value={price} onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">יחידת מידה</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {['יח','שעה','חודש','ק"ג','מ"ר','ל','ס"מ','ערכה','מנה'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">מקט (אופציונלי)</label>
              <input value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ברקוד (אופציונלי)</label>
              <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="1234567890"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">קטגוריה</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="שירותים, מוצרים..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">מעמ</label>
              <select value={vatRate} onChange={e => setVatRate(+e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value={0.18}>18%</option>
                <option value={0}>0% (פטור)</option>
                <option value={0.17}>17%</option>
              </select>
            </div>
          </div>

          {err && <p className="text-red-600 text-xs">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg">
            ביטול
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending || !name.trim() || !price}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold px-5 py-2 rounded-lg transition-all">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            הוסף לקטלוג ולחשבונית
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Search Autocomplete ────────────────────────────────────────────────
function DescriptionAutocomplete({
  value,
  onChange,
  onSelectProduct,
  onCreateNew,
  items,
  placeholder = 'תיאור פריט / שירות...',
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectProduct: (p: Product) => void;
  onCreateNew: (name: string) => void;
  items: Product[];
  placeholder?: string;
  onBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hi,   setHi]   = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = value.trim().length >= 1
    ? items.filter(p => {
        const q = value.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q)
        );
      }).slice(0, 10)
    : [];

  // Total items in dropdown = suggestions + optional "create new" row
  const showCreate = value.trim().length >= 2;
  const totalItems = suggestions.length + (showCreate ? 1 : 0);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = (p: Product) => { onSelectProduct(p); setOpen(false); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || totalItems === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHi(h => Math.min(h + 1, totalItems - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (hi < suggestions.length) select(suggestions[hi]);
      else { onCreateNew(value.trim()); setOpen(false); }
    }
    if (e.key === 'Escape') { setOpen(false); }
  };

  const dropdownOpen = open && value.trim().length >= 1 && (suggestions.length > 0 || showCreate);

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => { if (value.trim()) setOpen(true); }}
          onKeyDown={handleKeyDown}
          onBlur={onBlur}
          placeholder={placeholder}
          className={inputCls}
        />
        {value.trim() && (
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
        )}
      </div>

      {dropdownOpen && (
        <div className="absolute top-full right-0 z-50 w-full min-w-[300px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden mt-0.5">
          {/* Matching items */}
          {suggestions.map((p, i) => (
            <div
              key={p.id}
              onMouseDown={e => { e.preventDefault(); select(p); }}
              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none border-b border-gray-50 ${
                i === hi ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm truncate">{p.name}</div>
                <div className="text-[11px] text-gray-400 flex gap-2 mt-0.5">
                  {p.sku     && <span>מקט: {p.sku}</span>}
                  {p.barcode && <span>ברקוד: {p.barcode}</span>}
                  {p.category && <span className="text-blue-400">{typeof p.category === 'string' ? p.category : (p.category as any)?.name}</span>}
                </div>
              </div>
              <div className="shrink-0 text-left">
                {p.sellingPrice != null && (
                  <div className="font-bold text-blue-700 text-xs">{fmt(p.sellingPrice)}</div>
                )}
                {p.unit && <div className="text-[11px] text-gray-400">{p.unit}</div>}
                {p.stockQuantity != null && (
                  <div className={`text-[11px] ${p.stockQuantity <= 0 ? 'text-red-400' : 'text-emerald-500'}`}>
                    מלאי: {p.stockQuantity}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* "Create new item" row */}
          {showCreate && (
            <div
              onMouseDown={e => { e.preventDefault(); onCreateNew(value.trim()); setOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none ${
                hi === suggestions.length ? 'bg-emerald-50' : 'hover:bg-emerald-50'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Plus size={12} className="text-emerald-600" />
              </div>
              <div>
                <span className="text-sm font-semibold text-emerald-700">הוסף לקטלוג: </span>
                <span className="text-sm text-emerald-800">"{value.trim()}"</span>
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="px-3 py-1 bg-gray-50 text-[10px] text-gray-400 text-center border-t border-gray-100">
              ↑↓ לניווט · Enter לבחירה · Esc לסגירה
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function NewInvoicePage() {
  const navigate = useNavigate();
  const [customerId,    setCustomerId]    = useState('');
  const [date,          setDate]          = useState(new Date().toISOString().slice(0, 10));
  const [dueDate,       setDueDate]       = useState('');
  const [notes,         setNotes]         = useState('');
  const [reference,     setReference]     = useState('');
  const [paymentTerms,  setPaymentTerms]  = useState('שוטף + 30');
  const [discountPct,   setDiscountPct]   = useState(0);
  const [lines,         setLines]         = useState<Line[]>([emptyLine()]);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [error,         setError]         = useState('');
  const [newItemModal,  setNewItemModal]  = useState<{ name: string; lineIdx: number } | null>(null);

  const qc = useQueryClient();

  // Fetch customers
  const { data: custData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/crm/customers'),
  });
  const customers: any[] = Array.isArray(custData?.data) ? custData.data
    : Array.isArray(custData?.data?.data) ? custData.data.data : [];

  // Fetch inventory items for autocomplete
  const { data: itemsData } = useQuery({
    queryKey: ['inventory-items-search'],
    queryFn: () => api.get('/inventory/products', { params: { pageSize: 1000 } }),
    staleTime: 5 * 60_000,
  });
  const allItemsRaw: any[] = Array.isArray(itemsData?.data?.data) ? itemsData.data.data
    : Array.isArray(itemsData?.data) ? itemsData.data : [];
  // Normalize API response: stockLevels → stockQuantity, unitOfMeasure → unit
  const allItems: Product[] = allItemsRaw.map((p: any) => ({
    ...p,
    unit: p.unit ?? p.unitOfMeasure,
    stockQuantity: p.stockQuantity ?? (p.stockLevels ?? []).reduce((s: number, l: any) => s + (l.quantity ?? 0), 0),
  }));

  const saveMutation = useMutation({
    mutationFn: async (andSend: boolean) => {
      const validLines = lines.filter(l => l.description && l.unitPrice >= 0 && l.quantity > 0);
      const payload = {
        customerId,
        date,
        dueDate,
        notes:           notes || undefined,
        paymentTerms:    paymentTerms || undefined,
        reference:       reference || undefined,
        discountPercent: discountPct || undefined,
        lines:           validLines,
      };
      const res = await api.post('/invoices', payload);
      const inv = res.data?.data ?? res.data;
      if (andSend && inv?.id) {
        await api.post(`/invoices/${inv.id}/send`);
      }
      return inv;
    },
    onSuccess: inv => navigate(`/invoices/${inv.id ?? inv}`),
    onError:   (err: any) => setError(err.response?.data?.error || err.response?.data?.message || 'שגיאה בשמירה'),
  });

  // Update a line field + auto-add empty line when last row gets description
  const updateLine = useCallback((idx: number, field: keyof Line, value: string | number) => {
    setLines(prev => {
      const updated = prev.map((l, i) => i === idx ? { ...l, [field]: value } : l);
      // Auto-add new row when description is entered on the last row
      if (idx === prev.length - 1 && field === 'description' && value && !prev[idx].description) {
        return [...updated, emptyLine()];
      }
      return updated;
    });
  }, []);

  // Apply a selected product to a line
  const applyProduct = useCallback((idx: number, product: Product) => {
    setLines(prev => {
      const updated = prev.map((l, i) => i === idx ? {
        ...l,
        description:  product.name,
        sku:          product.sku ?? l.sku,
        barcode:      product.barcode ?? l.barcode,
        unit:         product.unit ?? product.unitOfMeasure ?? 'יח',
        unitPrice:    product.sellingPrice ?? l.unitPrice,
        vatRate:      product.vatRate ?? 0.18,
      } : l);
      // Auto-add new row if this was the last one
      if (idx === prev.length - 1) return [...updated, emptyLine()];
      return updated;
    });
  }, []);

  // Barcode lookup: when barcode field is filled, search for exact match
  const handleBarcodeLookup = useCallback((idx: number, barcode: string) => {
    updateLine(idx, 'barcode', barcode);
    if (!barcode.trim()) return;
    const match = allItems.find(p =>
      (p.barcode ?? '').toLowerCase() === barcode.trim().toLowerCase()
    );
    if (match) applyProduct(idx, match);
  }, [allItems, updateLine, applyProduct]);

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Calculations
  const lineSubtotals = lines.map(l => {
    const gross   = l.quantity * l.unitPrice;
    const discAmt = gross * (l.discountPercent / 100);
    const net     = gross - discAmt;
    const vatAmt  = net * l.vatRate;
    return { gross, discAmt, net, vatAmt, total: net + vatAmt };
  });

  const subtotal       = lineSubtotals.reduce((s, l) => s + l.net, 0);
  const overallDiscAmt = subtotal * (discountPct / 100);
  const afterDisc      = subtotal - overallDiscAmt;
  const vatTotal       = lineSubtotals.reduce((s, l) => s + l.vatAmt, 0) * (1 - discountPct / 100);
  const grandTotal     = afterDisc + vatTotal;

  const valid = customerId && date && dueDate && lines.some(l => l.description && l.unitPrice >= 0 && l.quantity > 0);

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-xl font-bold text-gray-800">חשבונית חדשה</h2>

      {/* Header fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
            <SearchSelect
              value={customerId}
              onChange={setCustomerId}
              placeholder="חפש לקוח..."
              options={customers.map((c: any) => ({ value: c.id, label: c.name, sublabel: c.phone ?? c.email }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חשבונית *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={headerInputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך לתשלום *</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={headerInputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תנאי תשלום</label>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className={headerInputCls + ' bg-white'}>
              <option value="שוטף">שוטף</option>
              <option value="שוטף + 30">שוטף + 30</option>
              <option value="שוטף + 45">שוטף + 45</option>
              <option value="שוטף + 60">שוטף + 60</option>
              <option value="COD">מזומן בעת מסירה</option>
              <option value="מראש">תשלום מראש</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר הזמנה / אסמכתא</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="PO-1234" className={headerInputCls} />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={headerInputCls} />
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-700">פריטים</h3>
            {allItems.length > 0 && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {allItems.length} פריטים בקטלוג
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAdvanced ? 'הסתר עמודות נוספות' : 'הצג מקט / ברקוד / יחידה'}
            </button>
            <button
              onClick={() => setLines(prev => [...prev, emptyLine()])}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={16} /> הוסף שורה
            </button>
          </div>
        </div>

        {/* Search hint */}
        {allItems.length > 0 && (
          <div className="px-4 py-2 bg-blue-50/60 border-b border-blue-100 text-xs text-blue-600">
            💡 התחל להקליד בשדה "תיאור פריט" — ייצג רשימת פריטים מהקטלוג בזמן אמת (חיפוש לפי שם, מקט, ברקוד)
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-medium w-7">#</th>
                {showAdvanced && <th className="px-3 py-2 text-right font-medium w-28">מקט</th>}
                {showAdvanced && <th className="px-3 py-2 text-right font-medium w-32">ברקוד</th>}
                <th className="px-3 py-2 text-right font-medium">תיאור פריט</th>
                {showAdvanced && <th className="px-3 py-2 text-right font-medium w-16">יחידה</th>}
                <th className="px-3 py-2 text-right font-medium w-20">כמות</th>
                <th className="px-3 py-2 text-right font-medium w-28">מחיר יחידה</th>
                <th className="px-3 py-2 text-right font-medium w-20">הנחה %</th>
                <th className="px-3 py-2 text-right font-medium w-20">מעמ %</th>
                <th className="px-3 py-2 text-left font-medium w-28">סהכ שורה</th>
                <th className="px-3 py-2 w-9"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, idx) => {
                const lt = lineSubtotals[idx];
                const isLast = idx === lines.length - 1;
                return (
                  <tr key={idx} className={`hover:bg-gray-50/50 ${isLast ? 'bg-blue-50/20' : ''}`}>
                    <td className="px-3 py-2 text-gray-400 text-center">{idx + 1}</td>

                    {/* SKU */}
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <input value={line.sku} onChange={e => updateLine(idx, 'sku', e.target.value)}
                          placeholder="12345" className={inputCls} />
                      </td>
                    )}

                    {/* Barcode with lookup */}
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <input
                          value={line.barcode}
                          onChange={e => handleBarcodeLookup(idx, e.target.value)}
                          placeholder="789012345678"
                          title="הזן ברקוד — פריט יאותר אוטומטית"
                          className={inputCls}
                        />
                      </td>
                    )}

                    {/* Description — inline autocomplete with create-new */}
                    <td className="px-3 py-2">
                      <DescriptionAutocomplete
                        value={line.description}
                        onChange={v => updateLine(idx, 'description', v)}
                        onSelectProduct={p => applyProduct(idx, p)}
                        onCreateNew={name => setNewItemModal({ name, lineIdx: idx })}
                        items={allItems}
                      />
                    </td>

                    {/* Unit */}
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <input value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)}
                          placeholder="יח" className={inputCls} />
                      </td>
                    )}

                    {/* Quantity */}
                    <td className="px-3 py-2">
                      <input type="number" min={0.001} step={1} value={line.quantity}
                        onChange={e => updateLine(idx, 'quantity', +e.target.value)}
                        className={inputCls + ' text-center'} />
                    </td>

                    {/* Unit price */}
                    <td className="px-3 py-2">
                      <input type="number" min={0} step={0.01} value={line.unitPrice}
                        onChange={e => updateLine(idx, 'unitPrice', +e.target.value)}
                        className={inputCls + ' text-center'} />
                    </td>

                    {/* Discount % */}
                    <td className="px-3 py-2">
                      <div className="relative">
                        <input type="number" min={0} max={100} step={1} value={line.discountPercent}
                          onChange={e => updateLine(idx, 'discountPercent', +e.target.value)}
                          className={inputCls + ' text-center pr-5'} />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                      </div>
                    </td>

                    {/* VAT */}
                    <td className="px-3 py-2">
                      <select value={line.vatRate}
                        onChange={e => updateLine(idx, 'vatRate', +e.target.value)}
                        className={inputCls + ' bg-white text-center'}>
                        <option value={0.18}>18%</option>
                        <option value={0}>0%</option>
                        <option value={0.17}>17%</option>
                      </select>
                    </td>

                    {/* Line total */}
                    <td className="px-3 py-2 text-left font-medium text-gray-800">
                      {fmt(lt.net)}
                      {lt.discAmt > 0 && (
                        <div className="text-xs text-red-500">-{fmt(lt.discAmt)}</div>
                      )}
                    </td>

                    {/* Remove */}
                    <td className="px-3 py-2">
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        className="text-gray-300 hover:text-red-400 transition disabled:opacity-20">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 p-5 bg-gray-50">
          <div className="flex justify-between items-start">
            {/* Overall discount */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 font-medium">הנחה כללית על החשבונית:</label>
              <div className="relative">
                <input
                  type="number" min={0} max={100} step={1} value={discountPct}
                  onChange={e => setDiscountPct(+e.target.value)}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-blue-500 outline-none pr-5"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
              </div>
              {discountPct > 0 && (
                <span className="text-sm text-red-600">-{fmt(overallDiscAmt)}</span>
              )}
            </div>

            {/* Summary */}
            <div className="text-sm space-y-1 min-w-[240px]">
              <div className="flex justify-between">
                <span className="text-gray-500">סכום לפני מעמ:</span>
                <span className="font-medium">{fmt(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>הנחה כללית ({discountPct}%):</span>
                  <span>-{fmt(overallDiscAmt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">מעמ:</span>
                <span className="font-medium">{fmt(vatTotal)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-bold text-gray-800">סהכ לתשלום:</span>
                <span className="font-bold text-lg text-blue-700">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">{error}</div>}

      {/* New item quick-create modal */}
      {newItemModal && (
        <NewItemModal
          initialName={newItemModal.name}
          onCreated={product => {
            applyProduct(newItemModal.lineIdx, product);
            setNewItemModal(null);
          }}
          onClose={() => setNewItemModal(null)}
        />
      )}

      <div className="flex gap-3">
        <button onClick={() => saveMutation.mutate(false)} disabled={!valid || saveMutation.isPending}
          className="bg-gray-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-700 transition disabled:opacity-50 flex items-center gap-2">
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          שמור כטיוטה
        </button>
        <button onClick={() => saveMutation.mutate(true)} disabled={!valid || saveMutation.isPending}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          שמור ושלח
        </button>
      </div>
    </div>
  );
}
