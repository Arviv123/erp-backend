import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ClipboardList, ScanLine, Search, Plus, Trash2,
  CheckCircle2, AlertCircle, Loader2, X,
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
  };
  variant?: { id: string; name: string; sku: string };
}

interface CountItem {
  barcode: string;
  productId: string;
  productName: string;
  sku: string;
  currentStock: number;
  counted: number;
}

interface CountResult {
  barcode?: string;
  productId: string;
  productName: string;
  previousQty: number;
  countedQty: number;
  adjustment: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getStock(product: BarcodeResult['product']): number {
  return (product?.stockLevels ?? []).reduce((s, sl) => s + Number(sl.quantity), 0);
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return <span className="text-xs font-semibold text-green-600">0</span>;
  if (diff < 0)  return <span className="text-xs font-semibold text-red-600">{diff}</span>;
  return <span className="text-xs font-semibold text-blue-600">+{diff}</span>;
}

// ── Results Modal ──────────────────────────────────────────────────────────────

function ResultsModal({
  results,
  onClose,
}: {
  results: CountResult[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-green-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h2 className="font-bold text-gray-900">תוצאות ספירת מלאי</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-right px-5 py-3 font-medium text-gray-600">מוצר</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מלאי קודם</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נספר</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שינוי</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{r.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.barcode ?? r.productId}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.previousQty}</td>
                  <td className="px-4 py-3 text-gray-700">{r.countedQty}</td>
                  <td className="px-4 py-3">
                    <DiffBadge diff={r.adjustment} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {results.filter(r => r.adjustment !== 0).length} מוצרים עם שינויים
          </div>
          <button
            onClick={onClose}
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function StockCountPage() {
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeResult | null>(null);
  const [barcodeError, setBarcodeError] = useState('');
  const [counted, setCounted] = useState(0);

  // Count list
  const [countItems, setCountItems] = useState<CountItem[]>([]);

  // Results modal
  const [results, setResults] = useState<CountResult[] | null>(null);

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
        setCounted(getStock(data.product)); // default = current stock
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

  function addToCount() {
    if (!barcodeResult?.product) return;
    const product = barcodeResult.product;
    const barcode = manualBarcode.trim();
    const currentStock = getStock(product);

    const existing = countItems.findIndex(i => i.barcode === barcode || i.productId === product.id);
    if (existing >= 0) {
      setCountItems(prev =>
        prev.map((item, idx) => idx === existing ? { ...item, counted } : item)
      );
    } else {
      setCountItems(prev => [
        ...prev,
        {
          barcode,
          productId: product.id,
          productName: product.name,
          sku: barcodeResult.variant?.sku ?? product.sku,
          currentStock,
          counted,
        },
      ]);
    }

    // Reset
    setBarcodeResult(null);
    setManualBarcode('');
    setBarcodeError('');
    setCounted(0);
    setTimeout(() => manualInputRef.current?.focus(), 50);
  }

  function removeItem(idx: number) {
    setCountItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateCounted(idx: number, v: number) {
    setCountItems(prev => prev.map((item, i) => i === idx ? { ...item, counted: v } : item));
  }

  const itemsWithDiff = countItems.filter(i => i.counted !== i.currentStock).length;

  // Submit count
  const submitCount = useMutation({
    mutationFn: () =>
      api.post('/inventory/count', {
        items: countItems.map(i => ({
          barcode: i.barcode || undefined,
          productId: i.productId,
          qty: i.counted,
        })),
      }),
    onSuccess: (res) => {
      const resData = res.data?.data ?? res.data;
      // Build results from response or derive locally
      const builtResults: CountResult[] = countItems.map(item => {
        const match = Array.isArray(resData)
          ? resData.find((r: any) => r.productId === item.productId)
          : null;
        return {
          barcode: item.barcode,
          productId: item.productId,
          productName: item.productName,
          previousQty: match?.previousQty ?? item.currentStock,
          countedQty: match?.countedQty ?? item.counted,
          adjustment: (match?.adjustment ?? (item.counted - item.currentStock)),
        };
      });
      setResults(builtResults);
      setCountItems([]);
      showToast('success', 'ספירת המלאי נשלחה בהצלחה');
    },
    onError: () => showToast('error', 'שגיאה בשליחת הספירה'),
  });

  return (
    <div dir="rtl" className="h-full">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {results && (
        <ResultsModal results={results} onClose={() => setResults(null)} />
      )}

      {/* Page title */}
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-indigo-100 p-2 rounded-xl">
          <ClipboardList className="w-6 h-6 text-indigo-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">ספירת מלאי פיזית</h1>
          <p className="text-sm text-gray-400">סרוק פריטים וספור כמויות בפועל</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-200px)] min-h-[500px]">
        {/* ── Left panel: Scanner + product entry ── */}
        <div className="lg:w-2/5 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-indigo-500" />
              סריקת ברקוד
            </h2>

            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-700 rounded-xl py-4 hover:bg-indigo-100 transition mb-4 text-sm font-medium"
            >
              <ScanLine className="w-5 h-5" />
              פתח מצלמה / USB
            </button>

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

            {barcodeError && (
              <div className="mt-3 flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {barcodeError}
              </div>
            )}
          </div>

          {/* Product found card */}
          {barcodeResult?.product && (
            <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-sm p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <ClipboardList className="w-5 h-5 text-indigo-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{barcodeResult.product.name}</h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {barcodeResult.variant?.sku ?? barcodeResult.product.sku}
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <div>
                      <p className="text-xs text-gray-400">מלאי נוכחי</p>
                      <p className="text-lg font-bold text-gray-900">
                        {getStock(barcodeResult.product)}
                      </p>
                    </div>
                    <div className="h-10 border-r border-gray-200" />
                    <div>
                      <p className="text-xs text-gray-400">מלאי נספר</p>
                      <input
                        type="number"
                        min={0}
                        value={counted}
                        onChange={e => setCounted(Math.max(0, Number(e.target.value)))}
                        className="w-24 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-sm">
                  הפרש:{' '}
                  <DiffBadge diff={counted - getStock(barcodeResult.product)} />
                </span>
                <button
                  onClick={addToCount}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium transition"
                >
                  <Plus size={15} />
                  הוסף לספירה
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: Count list ── */}
        <div className="lg:w-3/5 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              רשימת ספירה
            </h2>
            {countItems.length > 0 && (
              <span className="text-xs text-gray-500">
                {countItems.length} מוצרים
                {itemsWithDiff > 0 && (
                  <> | <span className="text-red-600 font-medium">{itemsWithDiff} עם הפרשים</span></>
                )}
              </span>
            )}
          </div>

          {countItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3">
              <ClipboardList className="w-12 h-12" />
              <p className="text-sm">סרוק פריט להוספה לספירה</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">מוצר</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">מלאי נוכחי</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-24">נספר</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">הפרש</th>
                      <th className="px-4 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {countItems.map((item, idx) => {
                      const diff = item.counted - item.currentStock;
                      return (
                        <tr key={idx} className={`hover:bg-gray-50 ${diff !== 0 ? 'bg-yellow-50/40' : ''}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-xs">{item.productName}</p>
                            <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 text-xs font-medium">
                            {item.currentStock}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              value={item.counted}
                              onChange={e => updateCounted(idx, Math.max(0, Number(e.target.value)))}
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <DiffBadge diff={diff} />
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary + actions */}
              <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold">{countItems.length}</span> מוצרים
                  {itemsWithDiff > 0 && (
                    <>
                      {' '}|{' '}
                      <span className="font-semibold text-red-600">{itemsWithDiff}</span> עם הפרשים
                    </>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCountItems([])}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 transition"
                  >
                    נקה
                  </button>
                  <button
                    onClick={() => submitCount.mutate()}
                    disabled={submitCount.isPending || countItems.length === 0}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 text-sm font-semibold disabled:opacity-40 transition"
                  >
                    {submitCount.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    שלח ספירה
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
