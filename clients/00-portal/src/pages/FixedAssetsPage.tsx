/**
 * FixedAssetsPage — ניהול רכוש קבוע ופחת
 * Manages fixed assets and depreciation per Israeli accounting standards.
 * Supports: Straight-Line (קו ישר) + Declining Balance (יתרה פוחתת)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package, Plus, TrendingDown, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Trash2,
} from 'lucide-react';
import api from '../lib/api';

const fmtC = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const CATEGORIES = ['מחשבים וציוד', 'רכבים', 'ריהוט ואבזור', 'מכונות וציוד', 'נדל"ן', 'תוכנות', 'אחר'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE:           { label: 'פעיל',     color: 'bg-green-100 text-green-800' },
  DISPOSED:         { label: 'מסולק',    color: 'bg-gray-100 text-gray-600' },
  UNDER_MAINTENANCE:{ label: 'בתחזוקה', color: 'bg-yellow-100 text-yellow-800' },
};

const METHOD_LABELS: Record<string, string> = {
  STRAIGHT_LINE:     'קו ישר',
  DECLINING_BALANCE: 'יתרה פוחתת',
};

// ─── New Asset Form ──────────────────────────────────────────────────────────
function NewAssetModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: '', name: '', category: CATEGORIES[0],
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchasePrice: '', salvageValue: '0',
    usefulLifeYears: '5', depreciationMethod: 'STRAIGHT_LINE',
    notes: '',
  });
  const [err, setErr] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/assets', {
      ...form,
      purchaseDate:   new Date(form.purchaseDate).toISOString(),
      purchasePrice:  Number(form.purchasePrice),
      salvageValue:   Number(form.salvageValue),
      usefulLifeYears: Number(form.usefulLifeYears),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      onClose();
    },
    onError: (e: any) => setErr(e?.response?.data?.error || e.message),
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Monthly depreciation preview
  const monthly = form.purchasePrice && form.usefulLifeYears
    ? (Number(form.purchasePrice) - Number(form.salvageValue)) / (Number(form.usefulLifeYears) * 12)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" dir="rtl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Package className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-gray-900">נכס חדש — רכוש קבוע</h2>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">שם הנכס *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">קוד נכס *</label>
            <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="FA-001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">קטגוריה *</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">תאריך רכישה *</label>
            <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">עלות רכישה ₪ *</label>
            <input type="number" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">ערך שייר ₪</label>
            <input type="number" value={form.salvageValue} onChange={e => set('salvageValue', e.target.value)} min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">אורך חיים שימושיים (שנים) *</label>
            <input type="number" value={form.usefulLifeYears} onChange={e => set('usefulLifeYears', e.target.value)} min="1" max="100"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">שיטת פחת</label>
            <select value={form.depreciationMethod} onChange={e => set('depreciationMethod', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="STRAIGHT_LINE">קו ישר — Straight-Line</option>
              <option value="DECLINING_BALANCE">יתרה פוחתת — Declining Balance</option>
            </select>
          </div>
          {monthly > 0 && (
            <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              פחת חודשי משוער: <strong>{fmtC(monthly)}</strong>
              {' '}({fmtC(monthly * 12)} לשנה)
            </div>
          )}
          {err && (
            <div className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            ביטול
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.code || !form.purchasePrice}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg font-medium"
          >
            {mutation.isPending ? 'שומר...' : 'שמור נכס'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Depreciation Schedule Modal ────────────────────────────────────────────
function ScheduleModal({ asset, onClose }: { asset: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['asset-schedule', asset.id],
    queryFn: () => api.get(`/assets/${asset.id}/schedule`).then(r => r.data?.data ?? r.data),
  });

  const schedule: any[] = data?.schedule ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">{asset.name} — לוח פחת</h2>
            <p className="text-xs text-gray-500">{METHOD_LABELS[asset.depreciationMethod]} | {asset.usefulLifeYears} שנים</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">טוען...</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">תקופה</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">פחת חודשי</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">פחת מצטבר</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">ערך פנקסני</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {schedule.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-right text-gray-700">{row.period}</td>
                    <td className="px-3 py-1.5 text-left font-mono text-red-600">{fmtC(row.depreciation)}</td>
                    <td className="px-3 py-1.5 text-left font-mono text-orange-600">{fmtC(row.cumulativeDepreciation)}</td>
                    <td className="px-3 py-1.5 text-left font-mono text-blue-700 font-semibold">{fmtC(row.bookValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function FixedAssetsPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [scheduleAsset, setScheduleAsset] = useState<any>(null);
  const [depPeriod, setDepPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [depMsg, setDepMsg] = useState('');

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['fixed-assets'],
    queryFn: () => api.get('/assets?pageSize=200').then(r => r.data?.data ?? r.data),
  });

  const assets: any[] = Array.isArray(rawData) ? rawData
    : Array.isArray(rawData?.data) ? rawData.data : [];

  const summaryQuery = useQuery({
    queryKey: ['assets-summary'],
    queryFn: () => api.get('/assets/reports/summary').then(r => r.data?.data ?? r.data),
  });
  const summary = summaryQuery.data ?? {};

  const bulkDeprMut = useMutation({
    mutationFn: () => api.post('/assets/depreciate/bulk', { period: depPeriod }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      setDepMsg(`✅ פחת פורסם ל-${d?.posted ?? 0} נכסים בתקופה ${depPeriod}`);
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['assets-summary'] });
    },
    onError: (e: any) => setDepMsg(`❌ ${e?.response?.data?.error || e.message}`),
  });

  const totalCost  = summary.totalCost     ?? assets.reduce((s: number, a: any) => s + Number(a.purchasePrice), 0);
  const totalAccum = summary.totalAccumulated ?? assets.reduce((s: number, a: any) => s + (a.accumulatedDepreciation ?? 0), 0);
  const totalBook  = summary.totalBookValue ?? totalCost - totalAccum;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            רכוש קבוע ופחת
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול נכסים, פחת ועלות פנקסנית</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          נכס חדש
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">עלות מקורית</p>
          <p className="text-xl font-bold text-gray-900">{fmtC(totalCost)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">פחת נצבר</p>
          <p className="text-xl font-bold text-red-600">({fmtC(totalAccum)})</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">ערך פנקסני נטו</p>
          <p className="text-xl font-bold text-blue-700">{fmtC(totalBook)}</p>
        </div>
      </div>

      {/* Bulk Depreciation Panel */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <TrendingDown className="w-5 h-5 text-amber-600 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-amber-900 text-sm">פרסום פחת חודשי</p>
          <p className="text-xs text-amber-700">יפרסם פחת לכל הנכסים הפעילים לתקופה הנבחרת</p>
        </div>
        <input
          type="month" value={depPeriod}
          onChange={e => setDepPeriod(e.target.value.slice(0,7))}
          className="border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-amber-400 outline-none"
        />
        <button
          onClick={() => { setDepMsg(''); bulkDeprMut.mutate(); }}
          disabled={bulkDeprMut.isPending}
          className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {bulkDeprMut.isPending ? 'מפרסם...' : 'פרסם פחת'}
        </button>
        {depMsg && (
          <p className={`text-xs font-medium w-full ${depMsg.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>
            {depMsg}
          </p>
        )}
      </div>

      {/* Assets Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">טוען...</div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <Package className="w-8 h-8" />
            <p className="text-sm">אין נכסים. הוסף את הנכס הראשון.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">קוד</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">שם הנכס</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">קטגוריה</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">שיטה</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">עלות</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">פחת נצבר</th>
                <th className="px-4 py-3 text-left font-semibold text-blue-700">ערך פנקסני</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">סטאטוס</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assets.map((asset: any) => {
                const accum    = asset.accumulatedDepreciation ?? 0;
                const book     = asset.bookValue ?? (Number(asset.purchasePrice) - accum);
                const pctAccum = Number(asset.purchasePrice) > 0
                  ? Math.round(accum / Number(asset.purchasePrice) * 100) : 0;
                const st       = STATUS_LABELS[asset.status] ?? STATUS_LABELS.ACTIVE;

                return (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{asset.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{asset.name}</p>
                      <p className="text-xs text-gray-400">{new Date(asset.purchaseDate).toLocaleDateString('he-IL')}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{asset.category}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{METHOD_LABELS[asset.depreciationMethod]}</td>
                    <td className="px-4 py-3 text-left font-mono text-gray-900">{fmtC(Number(asset.purchasePrice))}</td>
                    <td className="px-4 py-3 text-left">
                      <span className="font-mono text-red-600 text-xs">({fmtC(accum)})</span>
                      {pctAccum > 0 && (
                        <div className="mt-1 h-1.5 bg-gray-100 rounded-full w-20">
                          <div
                            className={`h-1.5 rounded-full ${pctAccum >= 100 ? 'bg-gray-400' : pctAccum > 75 ? 'bg-orange-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(pctAccum, 100)}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left font-mono font-bold text-blue-700">{fmtC(book)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setScheduleAsset(asset)}
                        className="text-blue-400 hover:text-blue-600 text-xs border border-blue-200 rounded px-2 py-0.5"
                        title="לוח פחת"
                      >
                        לוח פחת
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Footer totals */}
            <tfoot>
              <tr className="bg-gray-900 text-white">
                <td colSpan={4} className="px-4 py-3 font-bold text-sm">
                  סה"כ {assets.length} נכסים
                </td>
                <td className="px-4 py-3 text-left font-mono font-bold">{fmtC(totalCost)}</td>
                <td className="px-4 py-3 text-left font-mono text-red-300">({fmtC(totalAccum)})</td>
                <td className="px-4 py-3 text-left font-mono font-bold text-blue-300">{fmtC(totalBook)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Israeli accounting note */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">שיטות פחת מקובלות בישראל (תקינה ישראלית + IFRS)</p>
        <p>• <strong>קו ישר (Straight-Line)</strong>: פחת שנתי = (עלות − ערך שייר) ÷ שנות שימוש. המקובלת ביותר.</p>
        <p>• <strong>יתרה פוחתת (Declining Balance)</strong>: 2× שיעור הקו הישר מהיתרה הפנקסנית. מאיצה פחת בשנים ראשונות.</p>
        <p className="mt-1">שיעורי פחת מקסימליים לצרכי מס (פקודת מס הכנסה, ס' 21): מחשבים 33%, רכבים 15%, ריהוט 6–10%, מבנים 4%.</p>
      </div>

      {showNew && <NewAssetModal onClose={() => setShowNew(false)} />}
      {scheduleAsset && <ScheduleModal asset={scheduleAsset} onClose={() => setScheduleAsset(null)} />}
    </div>
  );
}
