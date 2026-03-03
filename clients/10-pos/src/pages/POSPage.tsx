import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, X } from 'lucide-react';
import api from '../lib/api';

const CART_KEY = 'erp_pos_cart';
const VAT_RATE = 0.18;

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

interface CartItem {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unit: string;
}

interface SalePayload {
  items: { itemId: string; quantity: number; unitPrice: number }[];
  paymentMethod: 'CASH' | 'CREDIT_CARD' | 'TRANSFER';
  notes?: string;
}

async function getProducts() {
  const r = await api.get('/inventory/items?isActive=true&pageSize=200');
  return r.data;
}

async function postSale(payload: SalePayload) {
  const r = await api.post('/pos/sales', payload);
  return r.data;
}

const UNIT_LABEL: Record<string, string> = { UNIT: 'יחידה', KG: 'ק"ג', LITER: 'ליטר', METER: 'מטר', BOX: 'קרטון' };

function loadCart(): CartItem[] {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '[]'); } catch { return []; }
}
function saveCart(cart: CartItem[]) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [payMethod, setPayMethod] = useState<'CASH' | 'CREDIT_CARD' | 'TRANSFER'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data } = useQuery({ queryKey: ['pos-products'], queryFn: getProducts, staleTime: 60_000 });
  const products: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  // persist cart to sessionStorage
  useEffect(() => saveCart(cart), [cart]);

  // keyboard: Escape = close confirm, Enter = confirm sale
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowConfirm(false);
      if (e.key === 'Enter' && showConfirm) handleConfirmSale();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const categories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean)));

  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name.includes(search) || p.sku?.includes(search);
    const matchCat = !category || p.category === category;
    return matchSearch && matchCat;
  });

  const addToCart = useCallback((p: any) => {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === p.id);
      if (existing) {
        return prev.map(c => c.itemId === p.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { itemId: p.id, name: p.name, unitPrice: p.sellingPrice, quantity: 1, unit: p.unit }];
    });
  }, []);

  const changeQty = (itemId: string, delta: number) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(c => c.itemId !== itemId));
  };

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = subtotal + vat;
  const change = payMethod === 'CASH' && cashReceived ? Number(cashReceived) - total : 0;

  const saleMutation = useMutation({
    mutationFn: postSale,
    onSuccess: () => {
      setCart([]);
      sessionStorage.removeItem(CART_KEY);
      setShowConfirm(false);
      setCashReceived('');
      setSuccessMsg('המכירה בוצעה בהצלחה!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error || 'שגיאה בביצוע מכירה');
      setTimeout(() => setErrorMsg(''), 4000);
    },
  });

  const handleConfirmSale = () => {
    if (cart.length === 0) return;
    saleMutation.mutate({
      items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity, unitPrice: c.unitPrice })),
      paymentMethod: payMethod,
    });
  };

  return (
    <div dir="rtl" className="flex gap-4 h-[calc(100vh-60px)]">
      {/* Left panel — products */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search & filter bar */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="חיפוש פריט..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="">כל הקטגוריות</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">לא נמצאו פריטים</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="bg-white border border-gray-200 rounded-xl p-3 text-right hover:border-indigo-400 hover:shadow-md transition group"
                >
                  <p className="text-sm font-semibold text-gray-900 leading-tight mb-1 group-hover:text-indigo-700">{p.name}</p>
                  <p className="text-xs text-gray-400 mb-2">{p.category ?? ''}</p>
                  <p className="text-base font-bold text-indigo-600">{fmtCurrency(p.sellingPrice)}</p>
                  <p className="text-xs text-gray-400">{UNIT_LABEL[p.unit] ?? p.unit}</p>
                  {p.currentStock <= p.minStockLevel && (
                    <span className="text-xs text-red-500 mt-1 block">מלאי נמוך: {p.currentStock}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — cart */}
      <div className="w-80 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <ShoppingCart className="w-4 h-4 text-indigo-600" />
          <h2 className="font-semibold text-gray-800 text-sm">עגלה</h2>
          <span className="mr-auto text-xs text-gray-400">{cart.length} פריטים</span>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">נקה</button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-300">
              <ShoppingCart className="w-8 h-8 mb-2" />
              <p className="text-sm">העגלה ריקה</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.itemId} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{fmtCurrency(item.unitPrice)} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(item.itemId, -1)} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                  <button onClick={() => changeQty(item.itemId, 1)} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeFromCart(item.itemId)} className="w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center text-red-400">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>לפני מע"מ</span><span>{fmtCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>מע"מ (18%)</span><span>{fmtCurrency(vat)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
            <span>סה"כ לתשלום</span><span className="text-indigo-700">{fmtCurrency(total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="px-4 pb-3 space-y-2">
          <div className="grid grid-cols-3 gap-1">
            {([['CASH', 'מזומן', Banknote], ['CREDIT_CARD', 'אשראי', CreditCard], ['TRANSFER', 'העברה', CreditCard]] as const).map(([val, label, Icon]) => (
              <button
                key={val}
                onClick={() => setPayMethod(val)}
                className={`flex flex-col items-center py-1.5 rounded-lg border text-xs transition ${
                  payMethod === val
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 mb-0.5" />
                {label}
              </button>
            ))}
          </div>

          {payMethod === 'CASH' && (
            <div>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="סכום שהתקבל"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
              />
              {cashReceived && change >= 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">עודף: {fmtCurrency(change)}</p>
              )}
            </div>
          )}

          {successMsg && <p className="text-xs text-green-600 font-medium">{successMsg}</p>}
          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

          <button
            onClick={() => setShowConfirm(true)}
            disabled={cart.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 rounded-lg transition text-sm"
          >
            בצע מכירה
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">אישור מכירה</h3>
              <button onClick={() => setShowConfirm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-2 mb-4">
              {cart.map(item => (
                <div key={item.itemId} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.name} × {item.quantity}</span>
                  <span className="font-medium">{fmtCurrency(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold text-indigo-700">
                <span>סה"כ</span>
                <span>{fmtCurrency(total)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">אמצעי תשלום: {payMethod === 'CASH' ? 'מזומן' : payMethod === 'CREDIT_CARD' ? 'אשראי' : 'העברה'}</p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmSale}
                disabled={saleMutation.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2 rounded-lg text-sm transition"
              >
                {saleMutation.isPending ? 'מבצע...' : 'אישור (Enter)'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                ביטול (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
