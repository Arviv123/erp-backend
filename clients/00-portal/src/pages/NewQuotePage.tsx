import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Save, Send, Loader2, Search, X } from 'lucide-react';

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

interface QuoteLine {
  description: string;
  productId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discount: number;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sellingPrice?: number;
  vatRate?: number;
  unitOfMeasure?: string;
}

const emptyLine = (): QuoteLine => ({
  description: '',
  productId: '',
  sku: '',
  quantity: 1,
  unitPrice: 0,
  vatRate: 0.18,
  discount: 0,
});

const inputCls =
  'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none';
const headerInputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none';

function getDefaultExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// ─── Customer Autocomplete ────────────────────────────────────────────────────
function CustomerAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (c: Customer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await api.get('/scan/customers', { params: { q, limit: 8 } });
      const data: Customer[] = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  const handleSelect = (c: Customer) => {
    onSelect(c);
    onChange(c.name);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="הקלד שם לקוח לחיפוש..."
          className={`${headerInputCls} pr-9`}
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
        )}
        {value && !loading && (
          <button
            type="button"
            onClick={() => { onChange(''); onSelect({ id: '', name: '' }); setResults([]); setOpen(false); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full right-0 z-50 w-full bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden mt-0.5">
          {results.map((c) => (
            <div
              key={c.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(c); }}
              className="px-4 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 last:border-0"
            >
              <div className="font-medium text-gray-800 text-sm">{c.name}</div>
              <div className="text-xs text-gray-400 flex gap-3 mt-0.5">
                {c.email && <span>{c.email}</span>}
                {c.phone && <span>{c.phone}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Product Autocomplete for line descriptions ────────────────────────────────
function ProductAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    try {
      const res = await api.get('/scan/products', { params: { q, limit: 10 } });
      const data: Product[] = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    }
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  // Barcode scanner: rapid keystrokes followed by Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
      const barcode = barcodeBuffer.current;
      barcodeBuffer.current = '';
      if (barcode.length > 4) {
        // Treat as barcode scan
        e.preventDefault();
        api.get('/scan/products', { params: { q: barcode, limit: 1 } })
          .then((res) => {
            const data: Product[] = Array.isArray(res.data) ? res.data
              : Array.isArray(res.data?.data) ? res.data.data : [];
            if (data.length > 0) {
              onSelect(data[0]);
              onChange(data[0].name);
              setOpen(false);
            }
          })
          .catch(() => {});
        return;
      }
      // Regular enter — select first suggestion
      if (results.length > 0) {
        onSelect(results[0]);
        onChange(results[0].name);
        setOpen(false);
      }
    } else {
      if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
      barcodeBuffer.current += e.key;
      barcodeTimerRef.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
    }
  };

  const handleSelect = (p: Product) => {
    onSelect(p);
    onChange(p.name);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder="תיאור / חיפוש פריט..."
        className={inputCls}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full right-0 z-50 w-full min-w-[280px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden mt-0.5">
          {results.map((p) => (
            <div
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm truncate">{p.name}</div>
                {p.sku && <div className="text-xs text-gray-400">מקט: {p.sku}</div>}
              </div>
              {p.sellingPrice != null && (
                <div className="text-xs font-bold text-blue-700 shrink-0">{fmt(p.sellingPrice)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function NewQuotePage() {
  const navigate = useNavigate();

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [expiryDate, setExpiryDate] = useState(getDefaultExpiryDate());
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([emptyLine()]);
  const [error, setError] = useState('');

  const handleSelectCustomer = (c: Customer) => {
    setCustomerId(c.id);
    if (c.name) setCustomerSearch(c.name);
  };

  const updateLine = useCallback((idx: number, field: keyof QuoteLine, value: string | number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }, []);

  const applyProduct = useCallback((idx: number, p: Product) => {
    setLines((prev) => {
      const updated = prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              description: p.name,
              productId: p.id,
              sku: p.sku ?? l.sku,
              unitPrice: p.sellingPrice ?? l.unitPrice,
              vatRate: p.vatRate ?? 0.18,
            }
          : l
      );
      if (idx === prev.length - 1) return [...updated, emptyLine()];
      return updated;
    });
  }, []);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Calculations
  const lineCalcs = lines.map((l) => {
    const gross = l.quantity * l.unitPrice;
    const discAmt = gross * (l.discount / 100);
    const net = gross - discAmt;
    const vatAmt = net * l.vatRate;
    return { net, vatAmt, total: net + vatAmt };
  });

  const subtotal = lineCalcs.reduce((s, l) => s + l.net, 0);
  const vatTotal = lineCalcs.reduce((s, l) => s + l.vatAmt, 0);
  const grandTotal = subtotal + vatTotal;

  const saveMutation = useMutation({
    mutationFn: async (andSend: boolean) => {
      const validLines = lines
        .filter((l) => l.description.trim() && l.quantity > 0 && l.unitPrice >= 0)
        .map((l) => ({
          description: l.description,
          productId: l.productId || undefined,
          sku: l.sku || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
          discount: l.discount || undefined,
        }));

      const payload: Record<string, unknown> = {
        customerId,
        expiryDate,
        lines: validLines,
      };
      if (notes.trim()) payload.notes = notes.trim();
      if (terms.trim()) payload.terms = terms.trim();

      const res = await api.post('/quotes', payload);
      const quote = res.data?.data ?? res.data;
      if (andSend && quote?.id) {
        await api.post(`/quotes/${quote.id}/send`);
      }
      return quote;
    },
    onSuccess: (quote) => navigate(`/quotes/${quote.id ?? quote}`),
    onError: (err: any) =>
      setError(err.response?.data?.error || err.response?.data?.message || 'שגיאה בשמירה'),
  });

  const valid =
    customerId &&
    expiryDate &&
    lines.some((l) => l.description.trim() && l.quantity > 0 && l.unitPrice >= 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">הצעת מחיר חדשה</h2>
        <button
          onClick={() => navigate('/quotes')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← חזרה לרשימה
        </button>
      </div>

      {/* Header fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
            <CustomerAutocomplete
              value={customerSearch}
              onChange={setCustomerSearch}
              onSelect={handleSelectCustomer}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך פקיעת תוקף *</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={headerInputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="הערות להצעת המחיר..."
              className={`${headerInputCls} resize-none`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תנאים</label>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={2}
              placeholder="תנאים וסייגים..."
              className={`${headerInputCls} resize-none`}
            />
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-medium text-gray-700">פריטים / שירותים</h3>
          <button
            onClick={addLine}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus size={16} /> הוסף שורה
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-medium w-7">#</th>
                <th className="px-3 py-2 text-right font-medium">תיאור</th>
                <th className="px-3 py-2 text-right font-medium w-24">מקט</th>
                <th className="px-3 py-2 text-right font-medium w-20">כמות</th>
                <th className="px-3 py-2 text-right font-medium w-28">מחיר יחידה</th>
                <th className="px-3 py-2 text-right font-medium w-20">הנחה %</th>
                <th className="px-3 py-2 text-right font-medium w-20">מע"מ %</th>
                <th className="px-3 py-2 text-left font-medium w-28">סה"כ שורה</th>
                <th className="px-3 py-2 w-9"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, idx) => {
                const calc = lineCalcs[idx];
                return (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-400 text-center">{idx + 1}</td>

                    {/* Description with product search */}
                    <td className="px-3 py-2">
                      <ProductAutocomplete
                        value={line.description}
                        onChange={(v) => updateLine(idx, 'description', v)}
                        onSelect={(p) => applyProduct(idx, p)}
                      />
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-2">
                      <input
                        value={line.sku}
                        onChange={(e) => updateLine(idx, 'sku', e.target.value)}
                        placeholder="מקט"
                        className={inputCls}
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0.001}
                        step={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', +e.target.value)}
                        className={inputCls + ' text-center'}
                      />
                    </td>

                    {/* Unit price */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, 'unitPrice', +e.target.value)}
                        className={inputCls + ' text-center'}
                      />
                    </td>

                    {/* Discount */}
                    <td className="px-3 py-2">
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={line.discount}
                          onChange={(e) => updateLine(idx, 'discount', +e.target.value)}
                          className={inputCls + ' text-center pr-5'}
                        />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                      </div>
                    </td>

                    {/* VAT */}
                    <td className="px-3 py-2">
                      <select
                        value={line.vatRate}
                        onChange={(e) => updateLine(idx, 'vatRate', +e.target.value)}
                        className={inputCls + ' bg-white text-center'}
                      >
                        <option value={0.18}>18%</option>
                        <option value={0}>0%</option>
                      </select>
                    </td>

                    {/* Line total */}
                    <td className="px-3 py-2 text-left font-medium text-gray-800">
                      {fmt(calc.net)}
                      {line.discount > 0 && (
                        <div className="text-xs text-red-500">
                          -{fmt(line.quantity * line.unitPrice * (line.discount / 100))}
                        </div>
                      )}
                    </td>

                    {/* Remove */}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="text-gray-300 hover:text-red-400 transition disabled:opacity-20"
                      >
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
          <div className="flex justify-end">
            <div className="text-sm space-y-1 min-w-[240px]">
              <div className="flex justify-between">
                <span className="text-gray-500">סכום ביניים:</span>
                <span className="font-medium">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">מע"מ:</span>
                <span className="font-medium">{fmt(vatTotal)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-bold text-gray-800">סה"כ:</span>
                <span className="font-bold text-lg text-blue-700">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => saveMutation.mutate(false)}
          disabled={!valid || saveMutation.isPending}
          className="bg-gray-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          שמור כטיוטה
        </button>
        <button
          onClick={() => saveMutation.mutate(true)}
          disabled={!valid || saveMutation.isPending}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          שמור ושלח
        </button>
        <button
          onClick={() => navigate('/quotes')}
          className="px-6 py-2.5 rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
