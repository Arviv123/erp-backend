import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Package, ScanLine, Search, Plus, Trash2, CheckCircle2,
  AlertCircle, Loader2, ShoppingBag, X,
} from 'lucide-react';
import api from '../lib/api';
import BarcodeScanner from '../components/BarcodeScanner';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BarcodeResult {
  type: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    stockLevels?: { quantity: number; warehouseId: string }[];
    costPrice?: number;
  };
  variant?: {
    id: string;
    name: string;
    sku: string;
  };
}

interface ReceiveItem {
  barcode: string;
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitCost: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

function getStock(product: BarcodeResult['product']): number {
  return (product?.stockLevels ?? []).reduce((s, sl) => s + Number(sl.quantity), 0);
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onDismiss }: { msg: string; type: 'success' | 'error'; onDismiss: () => void }) {
  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span>{msg}</span>
      <button onClick={onDismiss} className="ml-1 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function InventoryReceivePage() {
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeResult | null>(null);
  const [barcodeError, setBarcodeError] = useState('');

  // Product entry form
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);

  // Receive list
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const manualInputRef = useRef<HTMLInputElement>(null);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // Look up barcode
  async function lookupBarcode(code: string) {
    if (!code.trim()) return;
    setSearching(true);
    setBarcodeError('');
    setBarcodeResult(null);
    try {
      const r = await api.get(`/inventory/barcode/${encodeURIComponent(code.trim())}`);
      const data: BarcodeResult = r.data?.data ?? r.data;
      if (!data?.product) {
        setBarcodeError('ברקוד לא נמצא');
      } else {
        setBarcodeResult(data);
        setQty(1);
        setUnitCost(Number(data.product?.costPrice ?? 0));
      }
    } catch {
      setBarcodeError('ברקוד לא נמצא');
    } finally {
      setSearching(false);
    }
  }

  function handleScan(code: string) {
    setShowScanner(false);
    setManualBarcode(code);
    lookupBarcode(code);
  }

  function handleManualSearch(e: React.FormEvent) {
    e.preventDefault();
    lookupBarcode(manualBarcode);
  }

  function addToList() {
    if (!barcodeResult?.product) return;
    const product = barcodeResult.product;
    const barcode = manualBarcode.trim();

    // If already in list, update qty+cost
    const existing = receiveItems.findIndex(i => i.barcode === barcode || i.productId === product.id);
    if (existing >= 0) {
      setReceiveItems(prev =>
        prev.map((item, idx) =>
          idx === existing ? { ...item, qty: item.qty + qty, unitCost } : item
        )
      );
    } else {
      setReceiveItems(prev => [
        ...prev,
        {
          barcode,
          productId: product.id,
          productName: product.name,
          sku: barcodeResult.variant?.sku ?? product.sku,
          qty,
          unitCost,
        },
      ]);
    }

    // Reset form
    setBarcodeResult(null);
    setManualBarcode('');
    setBarcodeError('');
    setQty(1);
    setUnitCost(0);
    setTimeout(() => manualInputRef.current?.focus(), 50);
  }

  function removeItem(idx: number) {
    setReceiveItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItemQty(idx: number, v: number) {
    setReceiveItems(prev => prev.map((item, i) => i === idx ? { ...item, qty: v } : item));
  }

  function updateItemCost(idx: number, v: number) {
    setReceiveItems(prev => prev.map((item, i) => i === idx ? { ...item, unitCost: v } : item));
  }

  const totalCost = receiveItems.reduce((s, i) => s + i.qty * i.unitCost, 0);

  // Submit receive
  const confirmReceive = useMutation({
    mutationFn: () =>
      api.post('/inventory/receive', {
        items: receiveItems.map(i => ({
          barcode: i.barcode || undefined,
          productId: i.productId,
          qty: i.qty,
          unitCost: i.unitCost,
        })),
      }),
    onSuccess: () => {
      setReceiveItems([]);
      showToast('success', `נקלטו ${receiveItems.length} פריטים בהצלחה`);
    },
    onError: () => showToast('error', 'שגיאה בקליטת הסחורה'),
  });

  return (
    <div dir="rtl" className="h-full">
      {toast && (
        <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {/* Page title */}
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-green-100 p-2 rounded-xl">
          <ShoppingBag className="w-6 h-6 text-green-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">קליטת סחורה</h1>
          <p className="text-sm text-gray-400">סרוק ברקוד והוסף לרשימת קליטה</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-200px)] min-h-[500px]">
        {/* ── Left panel: Scanner + product entry ── */}
        <div className="lg:w-2/5 flex flex-col gap-4">
          {/* Scanner card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-indigo-500" />
              סריקת ברקוד
            </h2>

            {/* Open scanner button */}
            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-700 rounded-xl py-4 hover:bg-indigo-100 transition mb-4 text-sm font-medium"
            >
              <ScanLine className="w-5 h-5" />
              פתח מצלמה / USB
            </button>

            {/* Manual entry */}
            <form onSubmit={handleManualSearch} className="flex gap-2">
              <input
                ref={manualInputRef}
                type="text"
                value={manualBarcode}
                onChange={e => setManualBarcode(e.target.value)}
                placeholder="הכנס ברקוד ידנית..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={searching || !manualBarcode.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-40 transition"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                חפש
              </button>
            </form>

            {/* Error */}
            {barcodeError && (
              <div className="mt-3 flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {barcodeError}
              </div>
            )}
          </div>

          {/* Product found card */}
          {barcodeResult?.product && (
            <div className="bg-white rounded-xl border-2 border-green-300 shadow-sm p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Package className="w-5 h-5 text-green-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{barcodeResult.product.name}</h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {barcodeResult.variant?.sku ?? barcodeResult.product.sku}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    מלאי נוכחי: <span className="font-semibold text-gray-700">{getStock(barcodeResult.product)}</span> יחידות
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">כמות</label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={e => setQty(Math.max(1, Number(e.target.value)))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">עלות ליחידה (₪)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={unitCost}
                    onChange={e => setUnitCost(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-gray-500">
                  סה"כ: <span className="font-semibold text-gray-900">{fmtCurrency(qty * unitCost)}</span>
                </span>
                <button
                  onClick={addToList}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium transition"
                >
                  <Plus size={15} />
                  הוסף לרשימה
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: Receive list ── */}
        <div className="lg:w-3/5 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              רשימת קליטה
              {receiveItems.length > 0 && (
                <span className="mr-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {receiveItems.length} פריטים
                </span>
              )}
            </h2>
            {receiveItems.length > 0 && (
              <button
                onClick={() => setReceiveItems([])}
                className="text-xs text-gray-400 hover:text-red-500 transition"
              >
                נקה רשימה
              </button>
            )}
          </div>

          {receiveItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3">
              <Package className="w-12 h-12" />
              <p className="text-sm">סרוק פריט להוספה לרשימה</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">מוצר</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">ברקוד</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-20">כמות</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-24">עלות ליחידה</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">סה"כ עלות</th>
                      <th className="px-4 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receiveItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900 text-xs">{item.productName}</p>
                          <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                          {item.barcode || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={e => updateItemQty(idx, Math.max(1, Number(e.target.value)))}
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unitCost}
                            onChange={e => updateItemCost(idx, Number(e.target.value))}
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900 text-xs">
                          {fmtCurrency(item.qty * item.unitCost)}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-gray-300 hover:text-red-500 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total row + action buttons */}
              <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500">סה"כ לקליטה</p>
                  <p className="text-xl font-bold text-gray-900">{fmtCurrency(totalCost)}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setReceiveItems([])}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 transition"
                  >
                    נקה רשימה
                  </button>
                  <button
                    onClick={() => confirmReceive.mutate()}
                    disabled={confirmReceive.isPending || receiveItems.length === 0}
                    className="flex items-center gap-2 bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 text-sm font-semibold disabled:opacity-40 transition"
                  >
                    {confirmReceive.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    אשר קבלה
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
