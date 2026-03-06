import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Search, Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

// ---- Types ----
interface RfidTag {
  id: string;
  epc: string;
  tagType: 'PRODUCT' | 'ASSET' | 'EMPLOYEE';
  status: 'ACTIVE' | 'LOST' | 'DECOMMISSIONED';
  location?: string;
  productId?: string;
  employeeId?: string;
  assetId?: string;
  assignedName?: string;
}

interface TagFilters {
  search: string;
  type: string;
  status: string;
}

interface TagFormData {
  epc: string;
  tagType: 'PRODUCT' | 'ASSET' | 'EMPLOYEE';
  productId: string;
  employeeId: string;
  assetId: string;
  location: string;
}

const DEFAULT_FORM: TagFormData = {
  epc: '',
  tagType: 'PRODUCT',
  productId: '',
  employeeId: '',
  assetId: '',
  location: '',
};

// ---- Styles ----
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  LOST: 'bg-yellow-100 text-yellow-700',
  DECOMMISSIONED: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'פעיל',
  LOST: 'אבוד',
  DECOMMISSIONED: 'מוסר',
};
const TYPE_STYLE: Record<string, string> = {
  PRODUCT: 'bg-blue-100 text-blue-700',
  ASSET: 'bg-purple-100 text-purple-700',
  EMPLOYEE: 'bg-teal-100 text-teal-700',
};
const TYPE_LABEL: Record<string, string> = {
  PRODUCT: 'מוצר',
  ASSET: 'נכס',
  EMPLOYEE: 'עובד',
};

// ---- API calls ----
async function getTags(params: Record<string, string>) {
  const res = await api.get('/rfid/tags', { params });
  const d = res.data;
  return (Array.isArray(d) ? d : Array.isArray(d?.tags) ? d.tags : []) as RfidTag[];
}

async function createTag(body: Partial<TagFormData>) {
  const res = await api.post('/rfid/tags', body);
  return res.data;
}

async function updateTag({ id, body }: { id: string; body: Partial<TagFormData> }) {
  const res = await api.patch(`/rfid/tags/${id}`, body);
  return res.data;
}

async function decommissionTag(id: string) {
  const res = await api.delete(`/rfid/tags/${id}`);
  return res.data;
}

// ---- Modal ----
function TagModal({
  initial,
  onClose,
  onSave,
  isLoading,
}: {
  initial: Partial<TagFormData> & { id?: string };
  onClose: () => void;
  onSave: (data: TagFormData & { id?: string }) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<TagFormData>({
    epc: initial.epc ?? '',
    tagType: initial.tagType ?? 'PRODUCT',
    productId: initial.productId ?? '',
    employeeId: initial.employeeId ?? '',
    assetId: initial.assetId ?? '',
    location: initial.location ?? '',
  });

  const set = (key: keyof TagFormData, val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, id: initial.id });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {initial.id ? 'עריכת תגית' : 'הוספת תגית חדשה'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">EPC *</label>
            <input
              required
              value={form.epc}
              onChange={e => set('epc', e.target.value)}
              placeholder="e.g. E2003412012345678901234"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">סוג תגית *</label>
            <select
              value={form.tagType}
              onChange={e => set('tagType', e.target.value as TagFormData['tagType'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="PRODUCT">מוצר</option>
              <option value="ASSET">נכס</option>
              <option value="EMPLOYEE">עובד</option>
            </select>
          </div>
          {form.tagType === 'PRODUCT' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">מזהה מוצר</label>
              <input
                value={form.productId}
                onChange={e => set('productId', e.target.value)}
                placeholder="Product ID (אופציונלי)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
          {form.tagType === 'EMPLOYEE' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">מזהה עובד</label>
              <input
                value={form.employeeId}
                onChange={e => set('employeeId', e.target.value)}
                placeholder="Employee ID (אופציונלי)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
          {form.tagType === 'ASSET' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">מזהה נכס</label>
              <input
                value={form.assetId}
                onChange={e => set('assetId', e.target.value)}
                placeholder="Asset ID (אופציונלי)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">מיקום</label>
            <input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="מחסן A, קומה 2..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
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
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
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
export default function RfidTagsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<TagFilters>({ search: '', type: '', status: '' });
  const [modal, setModal] = useState<{ open: boolean; tag?: RfidTag }>({ open: false });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: tags = [], isLoading, error } = useQuery<RfidTag[]>({
    queryKey: ['rfid-tags', filters.type, filters.status],
    queryFn: () =>
      getTags({
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      }),
  });

  const createMut = useMutation({
    mutationFn: createTag,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-tags'] }); setModal({ open: false }); },
  });

  const updateMut = useMutation({
    mutationFn: updateTag,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-tags'] }); setModal({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: decommissionTag,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-tags'] }); setConfirmId(null); },
  });

  const filtered = filters.search
    ? tags.filter(t =>
        t.epc.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.assignedName?.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.location?.toLowerCase().includes(filters.search.toLowerCase())
      )
    : tags;

  const handleSave = (data: TagFormData & { id?: string }) => {
    const payload: Record<string, string> = {
      epc: data.epc,
      tagType: data.tagType,
      ...(data.location ? { location: data.location } : {}),
      ...(data.productId ? { productId: data.productId } : {}),
      ...(data.employeeId ? { employeeId: data.employeeId } : {}),
      ...(data.assetId ? { assetId: data.assetId } : {}),
    };
    if (data.id) {
      updateMut.mutate({ id: data.id, body: payload });
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
          <div className="p-2 bg-blue-50 rounded-lg">
            <Tag className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">תגיות RFID</h1>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          הוסף תגית
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">שגיאה בטעינת תגיות</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש EPC / שם / מיקום"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={filters.type}
          onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        >
          <option value="">כל הסוגים</option>
          <option value="PRODUCT">מוצר</option>
          <option value="ASSET">נכס</option>
          <option value="EMPLOYEE">עובד</option>
        </select>
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        >
          <option value="">כל הסטטוסים</option>
          <option value="ACTIVE">פעיל</option>
          <option value="LOST">אבוד</option>
          <option value="DECOMMISSIONED">מוסר</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">רשימת תגיות</h2>
          <span className="text-xs text-gray-400">{filtered.length} תגיות</span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-gray-400 gap-2">
            <Tag className="w-8 h-8" />
            <p className="text-sm">אין תגיות להצגה</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">EPC</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סוג</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">שיוך</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">מיקום</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סטטוס</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(tag => (
                <tr key={tag.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{tag.epc}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_STYLE[tag.tagType] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABEL[tag.tagType] ?? tag.tagType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{tag.assignedName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{tag.location ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[tag.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[tag.status] ?? tag.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModal({ open: true, tag })}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        title="עריכה"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmId(tag.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="הסרה"
                        disabled={tag.status === 'DECOMMISSIONED'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <TagModal
          initial={modal.tag ?? DEFAULT_FORM}
          onClose={() => setModal({ open: false })}
          onSave={handleSave}
          isLoading={isMutating}
        />
      )}

      {/* Confirm decommission */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">הסרת תגית</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              האם אתה בטוח שברצונך להסיר תגית זו מהמערכת? פעולה זו אינה ניתנת לביטול.
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
                {deleteMut.isPending ? 'מסיר...' : 'הסר תגית'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
