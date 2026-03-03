import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export default function NewVendorPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: '', businessId: '', vatNumber: '', email: '', phone: '', paymentTerms: '30',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/purchasing/vendors', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      navigate('/purchasing/vendors');
    },
    onError: (e: any) => setError(e.response?.data?.error ?? e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('שם ספק חובה'); return; }
    mutation.mutate({
      name:         form.name,
      businessId:   form.businessId   || undefined,
      vatNumber:    form.vatNumber    || undefined,
      email:        form.email        || undefined,
      phone:        form.phone        || undefined,
      paymentTerms: form.paymentTerms ? `${form.paymentTerms} days` : undefined,
    });
  };

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[key]} placeholder={placeholder}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
    </div>
  );

  return (
    <div dir="rtl" className="max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">← חזרה</button>
        <h1 className="text-2xl font-bold text-gray-900">ספק חדש</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        {field('שם ספק *', 'name', 'text', 'חברה / עוסק...')}

        <div className="grid grid-cols-2 gap-4">
          {field('ח.פ. / ע.מ.', 'businessId', 'text', '51-XXXXXX-X')}
          {field('מס\' מע"מ', 'vatNumber', 'text', 'XXXXXXXXX')}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field('אימייל', 'email', 'email', 'vendor@example.com')}
          {field('טלפון', 'phone', 'tel', '050-1234567')}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תנאי תשלום (ימים)</label>
          <select value={form.paymentTerms} onChange={e => setForm(p => ({ ...p, paymentTerms: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="0">מיידי</option>
            <option value="14">14 ימים</option>
            <option value="30">30 ימים</option>
            <option value="45">45 ימים</option>
            <option value="60">60 ימים</option>
            <option value="90">90 ימים</option>
          </select>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={mutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {mutation.isPending ? 'שומר...' : '💾 שמור ספק'}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
