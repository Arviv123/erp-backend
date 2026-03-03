import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api';

async function createCustomer(body: Record<string, unknown>) {
  const res = await api.post('/crm/customers', body);
  return res.data;
}

export default function NewCustomerPage() {
  const navigate = useNavigate();
  const [name, setName]           = useState('');
  const [type, setType]           = useState<'B2B'|'B2C'|'GOVERNMENT'>('B2B');
  const [vatNumber, setVatNumber] = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [street, setStreet]       = useState('');
  const [city, setCity]           = useState('');
  const [zip, setZip]             = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [notes, setNotes]         = useState('');
  const [error, setError]         = useState('');

  const mutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (res: any) => {
      const id = res?.id ?? res?.data?.id;
      navigate(id ? `/crm/customers/${id}` : '/crm');
    },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || 'שגיאה ביצירת לקוח'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    mutation.mutate({
      name, type, vatNumber: vatNumber || undefined, phone: phone || undefined,
      email: email || undefined,
      address: street ? { street, city, zip: zip || undefined } : undefined,
      paymentTerms: paymentTerms ? Number(paymentTerms) : undefined,
      notes: notes || undefined,
    });
  };

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none";
  const selectCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white";

  const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>{children}</div>
  );

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/crm')} className="text-gray-400 hover:text-gray-600"><ChevronRight className="w-5 h-5" /></button>
        <h1 className="text-2xl font-bold text-gray-900">לקוח חדש</h1>
      </div>
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        {/* Basic info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">פרטים בסיסיים</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="שם לקוח" required><input className={inputCls} value={name} onChange={e => setName(e.target.value)} required /></Field>
            <Field label="סוג לקוח" required>
              <select className={selectCls} value={type} onChange={e => setType(e.target.value as any)}>
                <option value="B2B">עסק (B2B)</option>
                <option value="B2C">פרטי (B2C)</option>
                <option value="GOVERNMENT">ממשלה</option>
              </select>
            </Field>
            <Field label="ע.מ. / ח.פ."><input className={inputCls} value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="אופציונלי" /></Field>
          </div>
        </div>
        {/* Contact */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">פרטי קשר</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="טלפון"><input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="03-5551234" /></Field>
            <Field label="אימייל"><input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} /></Field>
          </div>
        </div>
        {/* Address */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">כתובת</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="רחוב"><input className={inputCls} value={street} onChange={e => setStreet(e.target.value)} /></Field>
            <Field label="עיר"><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} /></Field>
            <Field label="מיקוד"><input className={inputCls} value={zip} onChange={e => setZip(e.target.value)} /></Field>
          </div>
        </div>
        {/* Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">הגדרות</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="תנאי תשלום (ימים)"><input type="number" className={inputCls} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="30" /></Field>
            <div className="md:col-span-2"><Field label="הערות"><textarea className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></Field></div>
          </div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-medium px-6 py-2.5 rounded-lg transition">
            {mutation.isPending ? 'שומר...' : 'צור לקוח'}
          </button>
          <button type="button" onClick={() => navigate('/crm')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-2.5 rounded-lg transition">ביטול</button>
        </div>
      </form>
    </div>
  );
}
