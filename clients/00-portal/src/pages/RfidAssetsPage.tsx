import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Search, Plus, Pencil, Trash2, X, AlertTriangle, Tag } from 'lucide-react';
import api from '../lib/api';

// ---- Types ----
interface RfidAsset {
  id: string;
  name: string;
  description?: string;
  category: string;
  location?: string;
  assignedToId?: string;
  assignedToName?: string;
  value?: number;
  purchasedAt?: string;
  warrantyUntil?: string;
  status: 'ACTIVE' | 'UNDER_MAINTENANCE' | 'DISPOSED';
  rfidTag?: { epc: string };
}

interface AssetFormData {
  name: string;
  description: string;
  category: string;
  location: string;
  assignedToId: string;
  value: string;
  purchasedAt: string;
  warrantyUntil: string;
}

const DEFAULT_FORM: AssetFormData = {
  name: '',
  description: '',
  category: '',
  location: '',
  assignedToId: '',
  value: '',
  purchasedAt: '',
  warrantyUntil: '',
};

// ---- Styles ----
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  UNDER_MAINTENANCE: 'bg-yellow-100 text-yellow-700',
  DISPOSED: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'פעיל',
  UNDER_MAINTENANCE: 'בתחזוקה',
  DISPOSED: 'בוטל',
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');

// ---- API calls ----
async function getAssets(params: Record<string, string>): Promise<RfidAsset[]> {
  const res = await api.get('/rfid/assets', { params });
  const d = res.data;
  return Array.isArray(d) ? d : Array.isArray(d?.assets) ? d.assets : [];
}

async function createAsset(body: Record<string, string | number>) {
  const res = await api.post('/rfid/assets', body);
  return res.data;
}

async function updateAsset({ id, body }: { id: string; body: Record<string, string | number> }) {
  const res = await api.patch(`/rfid/assets/${id}`, body);
  return res.data;
}

async function deleteAsset(id: string) {
  const res = await api.delete(`/rfid/assets/${id}`);
  return res.data;
}

// ---- Modal ----
function AssetModal({
  initial,
  onClose,
  onSave,
  isLoading,
}: {
  initial: Partial<AssetFormData> & { id?: string };
  onClose: () => void;
  onSave: (data: AssetFormData & { id?: string }) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<AssetFormData>({
    name: initial.name ?? '',
    description: initial.description ?? '',
    category: initial.category ?? '',
    location: initial.location ?? '',
    assignedToId: initial.assignedToId ?? '',
    value: initial.value ?? '',
    purchasedAt: initial.purchasedAt ?? '',
    warrantyUntil: initial.warrantyUntil ?? '',
  });

  const set = (key: keyof AssetFormData, val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {initial.id ? 'עריכת נכס' : 'הוספת נכס חדש'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); onSave({ ...form, id: initial.id }); }}
          className="p-5 space-y-4 overflow-y-auto flex-1"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">שם נכס *</label>
              <input
                required
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="מחשב נייד Dell XPS 15"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">תיאור</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={2}
                placeholder="תיאור קצר..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">קטגוריה *</label>
              <input
                required
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="ציוד IT, רהיטים..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">מיקום</label>
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="חדר 201, מחסן..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">אחראי (ID עובד)</label>
              <input
                value={form.assignedToId}
                onChange={e => set('assignedToId', e.target.value)}
                placeholder="Employee ID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ערך (₪)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.value}
                onChange={e => set('value', e.target.value)}
                placeholder="5000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">תאריך רכישה</label>
              <input
                type="date"
                value={form.purchasedAt}
                onChange={e => set('purchasedAt', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">אחריות עד</label>
              <input
                type="date"
                value={form.warrantyUntil}
                onChange={e => set('warrantyUntil', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {isLoading ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Page ----
export default function RfidAssetsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [modal, setModal] = useState<{ open: boolean; asset?: RfidAsset }>({ open: false });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: assets = [], isLoading, error } = useQuery<RfidAsset[]>({
    queryKey: ['rfid-assets', status, category],
    queryFn: () =>
      getAssets({
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      }),
  });

  const createMut = useMutation({
    mutationFn: createAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-assets'] }); setModal({ open: false }); },
  });

  const updateMut = useMutation({
    mutationFn: updateAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-assets'] }); setModal({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-assets'] }); setConfirmId(null); },
  });

  const filtered = search
    ? assets.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.category.toLowerCase().includes(search.toLowerCase()) ||
        a.location?.toLowerCase().includes(search.toLowerCase()) ||
        a.rfidTag?.epc.toLowerCase().includes(search.toLowerCase())
      )
    : assets;

  const handleSave = (data: AssetFormData & { id?: string }) => {
    const { id, ...rest } = data;
    const payload: Record<string, string | number> = {
      name: rest.name,
      category: rest.category,
      ...(rest.description ? { description: rest.description } : {}),
      ...(rest.location ? { location: rest.location } : {}),
      ...(rest.assignedToId ? { assignedToId: rest.assignedToId } : {}),
      ...(rest.value ? { value: parseFloat(rest.value) } : {}),
      ...(rest.purchasedAt ? { purchasedAt: rest.purchasedAt } : {}),
      ...(rest.warrantyUntil ? { warrantyUntil: rest.warrantyUntil } : {}),
    };
    if (id) {
      updateMut.mutate({ id, body: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isMutating = createMut.isPending || updateMut.isPending;

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <Box className="w-5 h-5 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">נכסים</h1>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          הוסף נכס
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">שגיאה בטעינת נכסים</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש שם / קטגוריה / מיקום / EPC"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
        >
          <option value="">כל הסטטוסים</option>
          <option value="ACTIVE">פעיל</option>
          <option value="UNDER_MAINTENANCE">בתחזוקה</option>
          <option value="DISPOSED">בוטל</option>
        </select>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="סנן קטגוריה"
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">רשימת נכסים</h2>
          <span className="text-xs text-gray-400">{filtered.length} נכסים</span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-gray-400 gap-2">
            <Box className="w-8 h-8" />
            <p className="text-sm">אין נכסים להצגה</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">שם</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">קטגוריה</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">מיקום</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">ערך</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">אחראי</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">סטטוס</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">תגית RFID</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(asset => (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{asset.name}</p>
                      {asset.description && (
                        <p className="text-xs text-gray-400 truncate max-w-[180px]">{asset.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{asset.category}</td>
                    <td className="px-4 py-2.5 text-gray-500">{asset.location ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {asset.value ? fmtCurrency(asset.value) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {asset.assignedToName ?? (asset.assignedToId ? asset.assignedToId : '—')}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[asset.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[asset.status] ?? asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {asset.rfidTag ? (
                        <span className="flex items-center gap-1 font-mono text-xs text-blue-700">
                          <Tag className="w-3 h-3" />
                          {asset.rfidTag.epc}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">לא משויך</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModal({ open: true, asset })}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                          title="עריכה"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmId(asset.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="בטל"
                          disabled={asset.status === 'DISPOSED'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Warranty expiry info */}
      {!isLoading && assets.length > 0 && (() => {
        const soon = assets.filter(a => {
          if (!a.warrantyUntil || a.status === 'DISPOSED') return false;
          const days = (new Date(a.warrantyUntil).getTime() - Date.now()) / 86400000;
          return days > 0 && days <= 30;
        });
        return soon.length > 0 ? (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {soon.length} נכסים עם אחריות שפגה/עומדת לפוג בתוך 30 יום
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {soon.map(a => `${a.name} (${fmtDate(a.warrantyUntil)})`).join(' • ')}
              </p>
            </div>
          </div>
        ) : null;
      })()}

      {/* Modal */}
      {modal.open && (
        <AssetModal
          initial={
            modal.asset
              ? {
                  id: modal.asset.id,
                  name: modal.asset.name,
                  description: modal.asset.description,
                  category: modal.asset.category,
                  location: modal.asset.location,
                  assignedToId: modal.asset.assignedToId,
                  value: modal.asset.value?.toString(),
                  purchasedAt: modal.asset.purchasedAt?.slice(0, 10),
                  warrantyUntil: modal.asset.warrantyUntil?.slice(0, 10),
                }
              : DEFAULT_FORM
          }
          onClose={() => setModal({ open: false })}
          onSave={handleSave}
          isLoading={isMutating}
        />
      )}

      {/* Confirm dispose */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">ביטול נכס</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              האם אתה בטוח שברצונך לבטל נכס זה? הוא יסומן כ"בוטל" במערכת.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                ביטול
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteMut.isPending ? 'מבטל...' : 'בטל נכס'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
