import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, X, AlertCircle, ScanLine } from 'lucide-react';
import api from '../lib/api';
import BarcodeScanner from '../components/BarcodeScanner';

const CART_KEY = 'erp_pos_cart';
const VAT_RATE = 0.18;

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unitOfMeasure: string;
}

function loadCart(): CartItem[] {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '[]'); } catch { return []; }
}
function saveCart(cart: CartItem[]) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
}

async function ensureSession(): Promise<string> {
  // 1. Check for open session
  const sessionsRes = await api.get('/pos/sessions?status=OPEN&pageSize=1');
  const sessions: any[] = Array.isArray(sessionsRes.data)
    ? sessionsRes.data
    : Array.isArray(sessionsRes.data?.data)
    ? sessionsRes.data.data
    : [];
  if (sessions.length > 0) return sessions[0].id;

  // 2. Get or create terminal
  const terminalsRes = await api.get('/pos/terminals?pageSize=1');
  const terminals: any[] = Array.isArray(terminalsRes.data)
    ? terminalsRes.data
    : Array.isArray(terminalsRes.data?.data)
    ? terminalsRes.data.data
    : [];

  let terminalId: string;
  if (terminals.length > 0) {
    terminalId = terminals[0].id;
  } else {
    const newTerminal = await api.post('/pos/terminals', { name: 'קופה ראשית', type: 'POS' });
    terminalId = newTerminal.data.id ?? newTerminal.data?.data?.id;
  }

  // 3. Open session
  const sessionRes = await api.post('/pos/sessions/open', { terminalId, openingFloat: 0 });
  return sessionRes.data.id ?? sessionRes.data?.data?.id;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // Initialize POS session on mount
  useEffect(() => {
    ensureSession()
      .then(id => setSessionId(id))
      .catch(() => setSessionError('לא ניתן לפתוח סשן קופה — בדוק הרשאות'));
  }, []);

  const { data } = useQuery({
    queryKey: ['pos-products'],
    queryFn: () => api.get('/inventory/products?isActive=true&pageSize=200').then(r => r.data),
    staleTime: 60_000,
  });
  const products: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

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

  const categories = Array.from(new Set(
    products.map((p: any) => p.category?.name).filter(Boolean)
  ));

  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name?.includes(search) || p.sku?.includes(search) || p.barcode?.includes(search);
    const matchCat = !category || p.category?.name === category;
    return matchSearch && matchCat;
  });

  const getStock = (p: any) =>
    (p.stockLevels ?? []).reduce((s: number, sl: any) => s + Number(sl.quantity ?? 0), 0);

  const addToCart = useCallback((p: any) => {
    setCart(prev => {
      const existing = prev.find(c => c.productId === p.id);
      if (existing) {
        return prev.map(c => c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        productId: p.id,
        name: p.name,
        unitPrice: Number(p.sellingPrice ?? 0),
        quantity: 1,
        unitOfMeasure: p.unitOfMeasure ?? 'יחידה',
      }];
    });
  }, []);

  const changeQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(c => c.productId === productId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.productId !== productId));
  };

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = subtotal + vat;
  const change = payMethod === 'CASH' && cashReceived ? Number(cashReceived) - total : 0;

  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('אין סשן פעיל');
      return api.post('/pos/transactions', {
        sessionId,
        lines: cart.map(c => ({
          productId: c.productId,
          description: c.name,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          discount: 0,
          vatRate: VAT_RATE,
        })),
        paymentMethod: payMethod,
        amountPaid: payMethod === 'CASH' && cashReceived ? Number(cashReceived) : total,
      });
    },
    onSuccess: () => {
      setCart([]);
      sessionStorage.removeItem(CART_KEY);
      setShowConfirm(false);
      setCashReceived('');
      setSuccessMsg('המכירה בוצעה בהצלחה!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error || err?.message || 'שגיאה בביצוע מכירה');
      setTimeout(() => setErrorMsg(''), 4000);
    },
  });

  const handleConfirmSale = () => {
    if (cart.length === 0) return;
    saleMutation.mutate();
  };

  const handleBarcodeScan = useCallback((code: string) => {
    const found = products.find((p: any) =>
      p.barcode === code || p.sku === code
    );
    if (found) {
      addToCart(found);
      setShowScanner(false);
      setSuccessMsg(`נוסף לעגלה: ${found.name}`);
      setTimeout(() => setSuccessMsg(''), 2000);
    } else {
      setSearch(code); // fallback: put code in search bar
      setShowScanner(false);
      setErrorMsg(`ברקוד "${code}" לא נמצא — מחפש...`);
      setTimeout(() => setErrorMsg(''), 3000);
    }
  }, [products, addToCart]);

  return (
    <div dir="rtl" className="flex gap-4 h-[calc(100vh-60px)]">
      {/* Session error banner */}
      {sessionError && (
        <div className="fixed top-4 right-4 left-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2 z-40 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {sessionError}
        </div>
      )}

      {/* Session initializing indicator */}
      {!sessionId && !sessionError && (
        <div className="fixed top-4 right-1/2 translate-x-1/2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 z-40 text-sm text-indigo-700">
          פותח סשן קופה...
        </div>
      )}

      {/* Left panel — products */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search & filter bar */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="חיפוש פריט / ברקוד..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowScanner(true)}
            title="סרוק ברקוד"
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">ברקוד</span>
          </button>
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
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              {products.length === 0 ? 'טוען פריטים...' : 'לא נמצאו פריטים'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((p: any) => {
                const stock = getStock(p);
                const reorderPoint = p.stockLevels?.[0]?.reorderPoint ?? 0;
                const lowStock = stock <= reorderPoint && reorderPoint > 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="bg-white border border-gray-200 rounded-xl p-3 text-right hover:border-indigo-400 hover:shadow-md transition group"
                  >
                    <p className="text-sm font-semibold text-gray-900 leading-tight mb-1 group-hover:text-indigo-700">{p.name}</p>
                    <p className="text-xs text-gray-400 mb-2">{p.category?.name ?? ''}</p>
                    <p className="text-base font-bold text-indigo-600">{fmtCurrency(Number(p.sellingPrice ?? 0))}</p>
                    <p className="text-xs text-gray-400">{p.unitOfMeasure ?? 'יחידה'}</p>
                    {lowStock && (
                      <span className="text-xs text-red-500 mt-1 block">מלאי נמוך: {stock}</span>
                    )}
                  </button>
                );
              })}
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
              <div key={item.productId} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{fmtCurrency(item.unitPrice)} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(item.productId, -1)} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                  <button onClick={() => changeQty(item.productId, 1)} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeFromCart(item.productId)} className="w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center text-red-400">
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
            disabled={cart.length === 0 || !sessionId}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 rounded-lg transition text-sm"
          >
            {!sessionId ? 'מאתחל קופה...' : 'בצע מכירה'}
          </button>
        </div>
      </div>

      {/* Barcode Scanner modal */}
      {showScanner && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

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
                <div key={item.productId} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.name} × {item.quantity}</span>
                  <span className="font-medium">{fmtCurrency(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold text-indigo-700">
                <span>סה"כ</span>
                <span>{fmtCurrency(total)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              אמצעי תשלום: {payMethod === 'CASH' ? 'מזומן' : payMethod === 'CREDIT_CARD' ? 'אשראי' : 'העברה'}
            </p>
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
