import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tag, Check, X } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

type PromotionType = 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'BUY_X_GET_Y' | 'FREE_SHIPPING';
type PromotionScope = 'ALL' | 'CATEGORY' | 'PRODUCT';

const TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE_DISCOUNT: 'הנחה באחוזים',
  FIXED_DISCOUNT: 'הנחה קבועה',
  BUY_X_GET_Y: 'קנה X קבל Y',
  FREE_SHIPPING: 'משלוח חינם',
};

const SCOPE_LABELS: Record<PromotionScope, string> = {
  ALL: 'הכל',
  CATEGORY: 'קטגוריה',
  PRODUCT: 'מוצר',
};

interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  discountValue: number;
  minPurchase: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
  scope: PromotionScope;
}

interface PromotionFormData {
  name: string;
  type: PromotionType;
  discountValue: string;
  minPurchase: string;
  startDate: string;
  endDate: string;
  scope: PromotionScope;
  isActive: boolean;
}

const EMPTY_FORM: PromotionFormData = {
  name: '',
  type: 'PERCENTAGE_DISCOUNT',
  discountValue: '',
  minPurchase: '',
  startDate: '',
  endDate: '',
  scope: 'ALL',
  isActive: true,
};

export default function POSPromotionsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: promotions = [], isLoading } = useQuery<Promotion[]>({
    queryKey: ['pos-promotions'],
    queryFn: async () => {
      const res = await api.get('/pos/promotions');
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/pos/promotions', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-promotions'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setError('');
    },
    onError: () => setError('שגיאה ביצירת המבצע'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      api.patch(`/pos/promotions/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-promotions'] });
      setEditId(null);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setError('');
    },
    onError: () => setError('שגיאה בעדכון המבצע'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pos/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-promotions'] });
      setDeleteConfirm(null);
    },
  });

  const toggleActive = (promo: Promotion) => {
    updateMutation.mutate({ id: promo.id, body: { isActive: !promo.isActive } });
  };

  const openEdit = (promo: Promotion) => {
    setEditId(promo.id);
    setForm({
      name: promo.name,
      type: promo.type,
      discountValue: String(promo.discountValue),
      minPurchase: String(promo.minPurchase),
      startDate: promo.startDate ? promo.startDate.slice(0, 10) : '',
      endDate: promo.endDate ? promo.endDate.slice(0, 10) : '',
      scope: promo.scope,
      isActive: promo.isActive,
    });
    setShowForm(true);
    setError('');
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('שם המבצע הוא שדה חובה'); return; }
    if (!form.discountValue || isNaN(Number(form.discountValue))) { setError('ערך הנחה חייב להיות מספר'); return; }
    const body = {
      name: form.name.trim(),
      type: form.type,
      discountValue: Number(form.discountValue),
      minPurchase: Number(form.minPurchase) || 0,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      scope: form.scope,
      isActive: form.isActive,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="text-blue-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-900">מבצעים</h1>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); setError(''); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            הוסף מבצע
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            {editId ? 'עריכת מבצע' : 'הוסף מבצע חדש'}
          </h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם המבצע</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="שם המבצע"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סוג</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as PromotionType }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.entries(TYPE_LABELS) as [PromotionType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ערך הנחה {form.type === 'PERCENTAGE_DISCOUNT' ? '(%)' : '(₪)'}
              </label>
              <input
                type="number"
                min="0"
                value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מינימום רכישה (₪)</label>
              <input
                type="number"
                min="0"
                value={form.minPurchase}
                onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך התחלה</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך סיום</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">היקף</label>
              <select
                value={form.scope}
                onChange={e => setForm(f => ({ ...f, scope: e.target.value as PromotionScope }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.entries(SCOPE_LABELS) as [PromotionScope, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">פעיל</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-60"
            >
              {isPending ? 'שומר...' : editId ? 'שמור שינויים' : 'הוסף מבצע'}
            </button>
            <button
              onClick={cancelForm}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : promotions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Tag size={40} className="mx-auto mb-3 opacity-40" />
            <p>אין מבצעים. לחץ "הוסף מבצע" כדי להתחיל.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">שם</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סוג</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">ערך הנחה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">מינ' רכישה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">תחילה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סיום</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">פעיל</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {promotions.map((promo) => (
                  <tr key={promo.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{promo.name}</td>
                    <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[promo.type] ?? promo.type}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {promo.type === 'PERCENTAGE_DISCOUNT'
                        ? `${promo.discountValue}%`
                        : promo.type === 'FREE_SHIPPING'
                        ? '—'
                        : fmtCurrency(promo.discountValue)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {promo.minPurchase > 0 ? fmtCurrency(promo.minPurchase) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(promo.startDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(promo.endDate)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(promo)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          promo.isActive ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                        title={promo.isActive ? 'כבה מבצע' : 'הפעל מבצע'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            promo.isActive ? 'translate-x-[-18px]' : 'translate-x-[-2px]'
                          }`}
                        />
                      </button>
                      <span className={`mr-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        promo.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {promo.isActive ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(promo)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ערוך"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(promo.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="מחק"
                        >
                          <Trash2 size={15} />
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

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" dir="rtl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">מחיקת מבצע</h3>
            <p className="text-gray-600 mb-5 text-sm">האם למחוק את המבצע? פעולה זו אינה ניתנת לביטול.</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm disabled:opacity-60 flex items-center gap-1"
              >
                <Trash2 size={14} />
                {deleteMutation.isPending ? 'מוחק...' : 'מחק'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
