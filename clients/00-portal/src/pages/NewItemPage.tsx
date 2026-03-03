import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api';

export default function NewItemPage() {
  const navigate = useNavigate();
  const [sku, setSku]                   = useState('');
  const [name, setName]                 = useState('');
  const [description, setDescription]   = useState('');
  const [categoryId, setCategoryId]     = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('יחידה');
  const [costPrice, setCostPrice]       = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [vatRate, setVatRate]           = useState('0.18');
  const [isService, setIsService]       = useState(false);
  const [barcode, setBarcode]           = useState('');
  const [error, setError]               = useState('');

  const { data: catData } = useQuery({
    queryKey: ['inv-categories'],
    queryFn: () => api.get('/inventory/categories'),
  });
  const categories: any[] = Array.isArray(catData?.data) ? catData.data : Array.isArray(catData) ? catData : [];

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/inventory/products', body),
    onSuccess: (res: any) => {
      const id = res?.data?.id ?? res?.id;
      navigate(id ? `/inventory/items/${id}` : '/inventory/items');
    },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || 'שגיאה ביצירת פריט'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    mutation.mutate({
      sku, name,
      description: description || undefined,
      categoryId: categoryId || undefined,
      unitOfMeasure,
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      vatRate: Number(vatRate),
      isService,
      barcode: barcode || undefined,
    });
  };

  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none";
  const sel = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white";

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/inventory/items')} className="text-gray-400 hover:text-gray-600"><ChevronRight className="w-5 h-5" /></button>
        <h1 className="text-2xl font-bold text-gray-900">פריט חדש</h1>
      </div>
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">פרטי פריט</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">מק"ט <span className="text-red-500">*</span></label><input className={inp} value={sku} onChange={e => setSku(e.target.value)} required placeholder="PRD-001" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">שם פריט <span className="text-red-500">*</span></label><input className={inp} value={name} onChange={e => setName(e.target.value)} required /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label><textarea className={inp} value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
              <select className={sel} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">ללא קטגוריה</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">יחידת מידה</label>
              <select className={sel} value={unitOfMeasure} onChange={e => setUnitOfMeasure(e.target.value)}>
                <option value="יחידה">יחידה</option>
                <option value="ק&quot;ג">ק"ג</option>
                <option value="ליטר">ליטר</option>
                <option value="מטר">מטר</option>
                <option value="קרטון">קרטון</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ברקוד</label><input className={inp} value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="אופציונלי" /></div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="isService" checked={isService} onChange={e => setIsService(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="isService" className="text-sm text-gray-700 cursor-pointer">פריט שירות (ללא מלאי)</label>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">מחירים</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">מחיר קנייה (₪) <span className="text-red-500">*</span></label><input type="number" className={inp} value={costPrice} onChange={e => setCostPrice(e.target.value)} required min="0" step="0.01" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">מחיר מכירה (₪) <span className="text-red-500">*</span></label><input type="number" className={inp} value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} required min="0" step="0.01" /></div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מע"מ</label>
              <select className={sel} value={vatRate} onChange={e => setVatRate(e.target.value)}>
                <option value="0.18">18%</option>
                <option value="0">0% (פטור)</option>
              </select>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
          💡 אחרי יצירת הפריט — הכנס לדף הפריט ולחץ "תיקון מלאי" כדי להוסיף מלאי ראשוני
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending} className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-medium px-6 py-2.5 rounded-lg transition">{mutation.isPending ? 'שומר...' : 'צור פריט'}</button>
          <button type="button" onClick={() => navigate('/inventory/items')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-2.5 rounded-lg transition">ביטול</button>
        </div>
      </form>
    </div>
  );
}
