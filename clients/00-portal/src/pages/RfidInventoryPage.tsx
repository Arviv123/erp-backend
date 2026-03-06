import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  Package,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRightLeft,
} from 'lucide-react';
import api from '../lib/api';

// ---- Types ----
interface RfidProduct {
  productId: string;
  productName: string;
  tagCount: number;
  lastSeen?: string;
}

interface StockItem {
  productId: string;
  productName: string;
  quantity: number;
}

interface InventoryRow {
  productId: string;
  productName: string;
  rfidCount: number;
  systemStock: number;
  diff: number;
  pctDiff: number;
}

interface SyncDiscrepancy {
  productId: string;
  productName: string;
  rfidCount: number;
  systemStock: number;
  adjustment: number;
}

interface SyncResult {
  discrepancies: SyncDiscrepancy[];
  synced: number;
  adjusted: number;
}

// ---- API calls ----
async function getRfidInventory(): Promise<RfidProduct[]> {
  const res = await api.get('/rfid/inventory');
  const d = res.data;
  return Array.isArray(d)
    ? d
    : Array.isArray(d?.products)
    ? d.products
    : [];
}

async function getStockLevels(): Promise<StockItem[]> {
  const res = await api.get('/inventory/stock');
  const d = res.data;
  return Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
}

async function syncInventory(): Promise<SyncResult> {
  const res = await api.post('/rfid/inventory/sync');
  return res.data;
}

// ---- Helpers ----
function buildRows(rfidProducts: RfidProduct[], stockItems: StockItem[]): InventoryRow[] {
  const stockMap = new Map<string, number>();
  for (const s of stockItems) {
    stockMap.set(s.productId, s.quantity);
  }

  // Union of all product IDs
  const allIds = new Set([
    ...rfidProducts.map(p => p.productId),
    ...stockItems.map(s => s.productId),
  ]);

  const rows: InventoryRow[] = [];
  for (const productId of allIds) {
    const rfidEntry = rfidProducts.find(p => p.productId === productId);
    const rfidCount = rfidEntry?.tagCount ?? 0;
    const systemStock = stockMap.get(productId) ?? 0;
    const diff = rfidCount - systemStock;
    const pctDiff = systemStock === 0 ? (rfidCount > 0 ? 100 : 0) : Math.abs(diff / systemStock) * 100;
    rows.push({
      productId,
      productName: rfidEntry?.productName ?? stockItems.find(s => s.productId === productId)?.productName ?? productId,
      rfidCount,
      systemStock,
      diff,
      pctDiff,
    });
  }

  return rows.sort((a, b) => b.pctDiff - a.pctDiff);
}

function rowColor(row: InventoryRow): string {
  if (row.diff === 0) return '';
  if (row.pctDiff <= 10) return 'bg-yellow-50';
  return 'bg-red-50';
}

function StatusCell({ row }: { row: InventoryRow }) {
  if (row.diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
        <CheckCircle className="w-3.5 h-3.5" />
        תואם
      </span>
    );
  }
  if (row.pctDiff <= 10) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-700 font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        סטייה קטנה
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium">
      <XCircle className="w-3.5 h-3.5" />
      אי-התאמה
    </span>
  );
}

// ---- Page ----
export default function RfidInventoryPage() {
  const qc = useQueryClient();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const {
    data: rfidProducts = [],
    isLoading: rfidLoading,
    error: rfidError,
  } = useQuery<RfidProduct[]>({
    queryKey: ['rfid-inventory'],
    queryFn: getRfidInventory,
  });

  const {
    data: stockItems = [],
    isLoading: stockLoading,
  } = useQuery<StockItem[]>({
    queryKey: ['inventory-stock'],
    queryFn: getStockLevels,
  });

  const syncMut = useMutation({
    mutationFn: syncInventory,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['rfid-inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stock'] });
      setSyncResult(result);
    },
  });

  const isLoading = rfidLoading || stockLoading;
  const rows = buildRows(rfidProducts, stockItems);
  const mismatched = rows.filter(r => r.diff !== 0);

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 rounded-lg">
            <Package className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ספירת מלאי RFID</h1>
            <p className="text-sm text-gray-500">השוואה בין ספירת תגיות RFID למלאי המערכת</p>
          </div>
        </div>
        <button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending || isLoading}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
          {syncMut.isPending ? 'מסנכרן...' : 'בצע סנכרון עם מלאי'}
        </button>
      </div>

      {/* Error */}
      {rfidError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">שגיאה בטעינת נתוני מלאי RFID</p>
        </div>
      )}

      {/* Sync error */}
      {syncMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">שגיאה בסנכרון מלאי. נסה שנית.</p>
        </div>
      )}

      {/* Count badge */}
      {!isLoading && (
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 shadow-sm">
            <Package className="w-4 h-4 text-orange-500" />
            <span><span className="font-semibold text-gray-900">{rows.length}</span> מוצרים מוצגים</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-yellow-200 rounded-lg px-3 py-1.5 text-sm text-yellow-700 shadow-sm">
            <AlertTriangle className="w-4 h-4" />
            <span><span className="font-semibold">{mismatched.length}</span> עם אי-התאמה</span>
          </div>
          {syncResult && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm text-green-700 shadow-sm">
              <CheckCircle className="w-4 h-4" />
              <span>סנכרון אחרון: <span className="font-semibold">{syncResult.adjusted}</span> התאמות</span>
            </div>
          )}
        </div>
      )}

      {/* Main comparison table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">השוואת מלאי RFID מול מערכת</h2>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-3">
            <Package className="w-8 h-8" />
            <p className="text-sm">אין נתוני מלאי להצגה</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מוצר</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מלאי RFID</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מלאי מערכת</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">הפרש</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">% סטייה</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.productId} className={`hover:brightness-95 transition ${rowColor(row)}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900">{row.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{row.productId}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold text-blue-700">
                    {row.rfidCount}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold text-gray-700">
                    {row.systemStock}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`font-semibold ${
                        row.diff === 0
                          ? 'text-gray-400'
                          : row.diff > 0
                          ? 'text-blue-600'
                          : 'text-red-600'
                      }`}
                    >
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500 text-xs">
                    {row.diff === 0 ? '—' : `${row.pctDiff.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sync result table */}
      {syncResult && syncResult.discrepancies && syncResult.discrepancies.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-green-100 bg-green-50 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-green-800">
              תוצאות סנכרון — {syncResult.discrepancies.length} התאמות
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מוצר</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">RFID לפני</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מערכת לפני</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">התאמה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {syncResult.discrepancies.map(d => (
                <tr key={d.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{d.productName}</td>
                  <td className="px-4 py-2.5 text-center text-blue-700 font-semibold">{d.rfidCount}</td>
                  <td className="px-4 py-2.5 text-center text-gray-700 font-semibold">{d.systemStock}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        d.adjustment > 0
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {d.adjustment > 0 ? `+${d.adjustment}` : d.adjustment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-green-100 bg-green-50 text-xs text-green-700">
            סך הכל: <span className="font-semibold">{syncResult.synced}</span> מוצרים בודקו,{' '}
            <span className="font-semibold">{syncResult.adjusted}</span> עודכנו במערכת
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span>תואם (הפרש 0)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" />
          <span>סטייה קטנה (עד 10%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span>אי-התאמה משמעותית (מעל 10%)</span>
        </div>
      </div>
    </div>
  );
}
