import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Star, StarOff, Search, X, Check, Tag,
} from 'lucide-react';
import api from '../lib/api';

// ── helpers ────────────────────────────────────────────────────────────────

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(n);

type PriceListType = 'STANDARD' | 'WHOLESALE' | 'RETAIL' | 'VIP' | 'PROMOTIONAL';

const TYPE_LABEL: Record<PriceListType, string> = {
  STANDARD: 'רגיל',
  WHOLESALE: 'סיטונאי',
  RETAIL: 'קמעונאי',
  VIP: 'VIP',
  PROMOTIONAL: 'מבצע',
};

const TYPE_COLOR: Record<PriceListType, string> = {
  STANDARD: 'bg-gray-100 text-gray-700',
  WHOLESALE: 'bg-blue-100 text-blue-700',
  RETAIL: 'bg-green-100 text-green-700',
  VIP: 'bg-purple-100 text-purple-700',
  PROMOTIONAL: 'bg-orange-100 text-orange-700',
};

// ── types ──────────────────────────────────────────────────────────────────

interface PriceListItem {
  id: string;
  productId: string;
  product: { name: string; sku: string };
  unitPrice: number;
  minQuantity: number;
  discountPercent: number;
}

interface PriceList {
  id: string;
  name: string;
  type: PriceListType;
  isDefault: boolean;
  description?: string;
  currency: string;
  items: PriceListItem[];
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice?: number;
}

// ── empty form ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  type: 'STANDARD' as PriceListType,
  description: '',
  currency: 'ILS',
  isDefault: false,
};

// ── ProductSearchDropdown ──────────────────────────────────────────────────

function ProductSearchDropdown({
  onSelect,
}: {
  onSelect: (p: ProductOption) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<ProductOption[]>({
    queryKey: ['product-search', q],
    queryFn: async () => {
      if (!q || q.length < 2) return [];
      const r = await api.get('/scan/products', { params: { q } });
      return Array.isArray(r.data) ? r.data : r.data?.data ?? [];
    },
    enabled: q.length >= 2,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={'חיפוש מוצר לפי שם / מק"ט'}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {open && data && data.length > 0 && (
        <div className="absolute z-50 right-0 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {data.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-right px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
              onClick={() => { onSelect(p); setQ(''); setOpen(false); }}
            >
              <div className="font-medium text-gray-900">{p.name}</div>
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <span>{p.sku}</span>
                {p.sellingPrice != null && (
                  <span className="text-blue-600">{fmtILS(Number(p.sellingPrice))}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AddItemRow ─────────────────────────────────────────────────────────────

function AddItemRow({
  priceListId,
  onDone,
}: {
  priceListId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [unitPrice, setUnitPrice] = useState('');
  const [minQuantity, setMinQuantity] = useState('1');
  const [discountPercent, setDiscountPercent] = useState('0');

  const addItem = useMutation({
    mutationFn: () =>
      api.post(`/price-lists/${priceListId}/items`, {
        productId: selectedProduct!.id,
        unitPrice: parseFloat(unitPrice),
        minQuantity: parseInt(minQuantity, 10) || 1,
        discountPercent: parseFloat(discountPercent) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      qc.invalidateQueries({ queryKey: ['price-list', priceListId] });
      setSelectedProduct(null);
      setUnitPrice('');
      setMinQuantity('1');
      setDiscountPercent('0');
      onDone();
    },
  });

  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-2.5" colSpan={2}>
        {selectedProduct ? (
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900">{selectedProduct.name}</span>
            <span className="text-xs text-gray-400">{selectedProduct.sku}</span>
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <ProductSearchDropdown onSelect={p => {
            setSelectedProduct(p);
            if (p.sellingPrice) setUnitPrice(String(p.sellingPrice));
          }} />
        )}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-400 italic">—</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          placeholder="מחיר"
          value={unitPrice}
          onChange={e => setUnitPrice(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          placeholder="%"
          value={discountPercent}
          onChange={e => setDiscountPercent(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          placeholder="כמות"
          value={minQuantity}
          onChange={e => setMinQuantity(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!selectedProduct || !unitPrice || addItem.isPending}
            onClick={() => addItem.mutate()}
            className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {addItem.isPending ? '...' : 'הוסף'}
          </button>
          <button type="button" onClick={onDone} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── ItemRow ────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  priceListId,
}: {
  item: PriceListItem;
  priceListId: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(item.unitPrice));
  const [discount, setDiscount] = useState(String(item.discountPercent));

  const updateItem = useMutation({
    mutationFn: () =>
      api.put(`/price-lists/${priceListId}/items/${item.id}`, {
        unitPrice: parseFloat(price),
        discountPercent: parseFloat(discount) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      qc.invalidateQueries({ queryKey: ['price-list', priceListId] });
      setEditing(false);
    },
  });

  const removeItem = useMutation({
    mutationFn: () => api.delete(`/price-lists/${priceListId}/items/${item.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      qc.invalidateQueries({ queryKey: ['price-list', priceListId] });
    },
  });

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">{item.product.name}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.product.sku}</td>
      <td className="px-4 py-2.5 text-sm text-gray-500">—</td>
      <td className="px-4 py-2.5 text-sm">
        {editing ? (
          <input
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-medium text-blue-700 hover:underline"
          >
            {fmtILS(Number(item.unitPrice))}
          </button>
        )}
      </td>
      <td className="px-4 py-2.5 text-sm">
        {editing ? (
          <input
            type="number"
            value={discount}
            onChange={e => setDiscount(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <span className={item.discountPercent > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>
            {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-500">
        {item.minQuantity > 1 ? item.minQuantity : '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => updateItem.mutate()}
                disabled={updateItem.isPending}
                className="text-green-600 hover:text-green-800"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setPrice(String(item.unitPrice)); setDiscount(String(item.discountPercent)); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-gray-400 hover:text-blue-600"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => removeItem.mutate()}
            disabled={removeItem.isPending}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── CreatePriceListModal ───────────────────────────────────────────────────

function CreatePriceListModal({
  initial,
  onClose,
}: {
  initial?: PriceList;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          description: initial.description ?? '',
          currency: initial.currency,
          isDefault: initial.isDefault,
        }
      : { ...EMPTY_FORM }
  );

  const save = useMutation({
    mutationFn: () =>
      initial
        ? api.patch(`/price-lists/${initial.id}`, form)
        : api.post('/price-lists', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      onClose();
    },
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {initial ? 'עריכת מחירון' : 'מחירון חדש'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם המחירון</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="למשל: מחירון לקוחות VIP"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוג</label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {(Object.keys(TYPE_LABEL) as PriceListType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="תיאור אופציונלי"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מטבע</label>
            <select
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="ILS">₪ שקל חדש (ILS)</option>
              <option value="USD">$ דולר אמריקאי (USD)</option>
              <option value="EUR">€ אירו (EUR)</option>
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => set('isDefault', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">הגדר כברירת מחדל</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save.mutate()}
            disabled={!form.name || save.isPending}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40"
          >
            {save.isPending ? 'שומר...' : initial ? 'שמור שינויים' : 'צור מחירון'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PriceListsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<PriceList | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);

  // fetch all price lists
  const { data: listsRaw, isLoading } = useQuery<PriceList[]>({
    queryKey: ['price-lists'],
    queryFn: async () => {
      const r = await api.get('/price-lists');
      return Array.isArray(r.data) ? r.data : r.data?.data ?? [];
    },
  });

  const lists: PriceList[] = listsRaw ?? [];

  // fetch selected detail
  const { data: detail } = useQuery<PriceList>({
    queryKey: ['price-list', selectedId],
    queryFn: async () => {
      const r = await api.get(`/price-lists/${selectedId}`);
      return r.data;
    },
    enabled: !!selectedId,
  });

  const selected = detail ?? lists.find(l => l.id === selectedId) ?? null;

  const deletePL = useMutation({
    mutationFn: (id: string) => api.delete(`/price-lists/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      if (selectedId === id) setSelectedId(null);
    },
  });

  const setDefault = useMutation({
    mutationFn: (pl: PriceList) => api.patch(`/price-lists/${pl.id}`, { isDefault: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
    setShowAddItem(false);
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      {(showCreate || editTarget) && (
        <CreatePriceListModal
          initial={editTarget ?? undefined}
          onClose={() => { setShowCreate(false); setEditTarget(null); }}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tag className="w-6 h-6 text-blue-600" />
          מחירונים
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          מחירון חדש
        </button>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left panel: list ── */}
        <div className="w-1/3 space-y-3">
          {isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-400">
              טוען מחירונים...
            </div>
          ) : lists.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-400">
              אין מחירונים. צור מחירון ראשון.
            </div>
          ) : (
            lists.map(pl => (
              <div
                key={pl.id}
                onClick={() => handleSelect(pl.id)}
                className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition hover:shadow-md ${
                  selectedId === pl.id
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm truncate">{pl.name}</span>
                      {pl.isDefault && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          ברירת מחדל
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[pl.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[pl.type] ?? pl.type}
                      </span>
                      <span className="text-xs text-gray-400">{pl.items?.length ?? 0} מוצרים</span>
                      <span className="text-xs text-gray-400">{pl.currency}</span>
                    </div>
                  </div>
                </div>

                {pl.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{pl.description}</p>
                )}

                <div className="flex items-center gap-2 mt-3 border-t border-gray-100 pt-2" onClick={e => e.stopPropagation()}>
                  {!pl.isDefault && (
                    <button
                      onClick={() => setDefault.mutate(pl)}
                      className="text-gray-400 hover:text-yellow-500 transition"
                      title="הגדר כברירת מחדל"
                    >
                      <StarOff className="w-4 h-4" />
                    </button>
                  )}
                  {pl.isDefault && (
                    <Star className="w-4 h-4 text-yellow-500" />
                  )}
                  <button
                    onClick={() => setEditTarget(pl)}
                    className="text-gray-400 hover:text-blue-600 transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`למחוק את המחירון "${pl.name}"?`))
                        deletePL.mutate(pl.id);
                    }}
                    className="text-gray-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Right panel: detail ── */}
        <div className="flex-1">
          {!selectedId ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
              <Tag className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">בחר מחירון מהרשימה לצפייה ועריכה</p>
            </div>
          ) : !selected ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
              טוען...
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${TYPE_COLOR[selected.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABEL[selected.type] ?? selected.type}
                    </span>
                    <span className="text-xs text-gray-400">{selected.currency}</span>
                    {selected.isDefault && (
                      <span className="flex items-center gap-1 text-xs text-yellow-600 font-medium">
                        <Star className="w-3.5 h-3.5" /> ברירת מחדל
                      </span>
                    )}
                  </div>
                  {selected.description && (
                    <p className="text-sm text-gray-500 mt-2">{selected.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!selected.isDefault && (
                    <button
                      onClick={() => setDefault.mutate(selected)}
                      className="flex items-center gap-1.5 text-xs border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 text-gray-600"
                    >
                      <StarOff className="w-3.5 h-3.5" />
                      הגדר כברירת מחדל
                    </button>
                  )}
                  <button
                    onClick={() => setEditTarget(selected)}
                    className="flex items-center gap-1.5 text-xs border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 text-gray-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    ערוך
                  </button>
                </div>
              </div>

              {/* Items table */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  מוצרים במחירון ({selected.items?.length ?? 0})
                </h3>
                <button
                  onClick={() => setShowAddItem(v => !v)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  הוסף מוצר
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">מוצר</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">מקט</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">מחיר רגיל</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">מחיר מחירון</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">הנחה %</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">כמות מינימום</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {showAddItem && (
                      <AddItemRow
                        priceListId={selected.id}
                        onDone={() => setShowAddItem(false)}
                      />
                    )}
                    {(!selected.items || selected.items.length === 0) && !showAddItem ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                          אין מוצרים במחירון זה. לחץ "הוסף מוצר" כדי להתחיל.
                        </td>
                      </tr>
                    ) : (
                      (selected.items ?? []).map(item => (
                        <ItemRow key={item.id} item={item} priceListId={selected.id} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
