import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api';

async function createItem(body: Record<string, unknown>) {
  const r = await api.post('/inventory/items', body);
  return r.data;
}

export default function NewItemPage() {
  const navigate = useNavigate();
  const [sku, setSku]                 = useState('');
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]       = useState('');
  const [unit, setUnit]               = useState('UNIT');
  const [costPrice, setCostPrice]     = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [vatRate, setVatRate]         = useState('0.18');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStockLevel, setMinStockLevel] = useState('5');
  const [error, setError]             = useState('');

  const mutation = useMutation({
    mutationFn: createItem,
    onSuccess: (res: any) => {
      const id = res?.id ?? res?.data?.id;
      navigate(id ? `/inventory/items/${id}` : '/inventory/items');
    },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || 'שגיאה ביצירת פריט'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    mutation.mutate({
      sku, name, description: description || undefined, category,
      unit, costPrice: Number(costPrice), sellingPrice: Number(sellingPrice),
      vatRate: Number(vatRate), currentStock: Number(currentStock),
      minStockLevel: Number(minStockLevel), isActive: true,
    });
  };

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none";
  const selectCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white";
  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>{children}</div>
  );

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
            <Field label="מק&quot;ט (SKU)" required><input className={inputCls} value={sku} onChange={e => setSku(e.target.value)} required placeholder="PRD-001" /></Field>
            <Field label="שם פריט" required><input className={inputCls} value={name} onChange={e => setName(e.target.value)} required /></Field>
            <div className="md:col-span-2"><Field label="תיאור"><textarea className={inputCls} value={description} onChange={e => setDescription(e.target.value)} rows={2} /></Field></div>
            <Field label="קטגוריה" required>
              <select className={selectCls} value={category} onChange={e => setCategory(e.target.value)} required>
                <option value="">בחר קטגוריה...</option>
                <option value="אלקטרוניקה">אלקטרוניקה</option>
                <option value="מזון">מזון</option>
                <option value="משרד">משרד</option>
                <option value="ציוד">ציוד</option>
                <option value="תוכנה">תוכנה</option>
                <option value="אחר">אחר</option>
              </select>
            </Field>
            <Field label="יחידת מידה" required>
              <select className={selectCls} value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="UNIT">יחידה</option>
                <option value="KG">ק"ג</option>
                <option value="LITER">ליטר</option>
                <option value="METER">מטר</option>
                <option value="BOX">קרטון</option>
              </select>
            </Field>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">מחירים</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="מחיר קנייה (₪)" required><input type="number" className={inputCls} value={costPrice} onChange={e => setCostPrice(e.target.value)} required min="0" step="0.01" /></Field>
            <Field label="מחיר מכירה (₪)" required><input type="number" className={inputCls} value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} required min="0" step="0.01" /></Field>
            <Field label="מע&quot;מ (%)"><input type="number" className={inputCls} value={vatRate} onChange={e => setVatRate(e.target.value)} step="0.01" /></Field>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">מלאי</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="מלאי נוכחי"><input type="number" className={inputCls} value={currentStock} onChange={e => setCurrentStock(e.target.value)} min="0" /></Field>
            <Field label="מלאי מינימלי להתראה"><input type="number" className={inputCls} value={minStockLevel} onChange={e => setMinStockLevel(e.target.value)} min="0" /></Field>
          </div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-medium px-6 py-2.5 rounded-lg transition">
            {mutation.isPending ? 'שומר...' : 'צור פריט'}
          </button>
          <button type="button" onClick={() => navigate('/inventory/items')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-2.5 rounded-lg transition">ביטול</button>
        </div>
      </form>
    </div>
  );
}
