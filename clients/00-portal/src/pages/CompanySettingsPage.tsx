import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Image, FileText, CreditCard } from 'lucide-react';
import api from '../lib/api';

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

async function getSettings() {
  const r = await api.get('/settings/company');
  return r.data.data ?? r.data;
}

export default function CompanySettingsPage() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'invoice'>('company');

  const { data, isLoading } = useQuery({ queryKey: ['company-settings'], queryFn: getSettings });

  const [form, setForm] = useState({
    name: '', businessNumber: '', vatNumber: '', phone: '', email: '', logoUrl: '',
    address: { street: '', city: '', zip: '', country: 'ישראל' },
    invoiceSettings: {
      defaultPaymentTerms: '', defaultVatRate: 0.18, invoiceFooter: '',
      bankDetails: '', showItemCodes: true, showBarcode: false,
    },
  });

  useEffect(() => {
    if (data) {
      const addr = (data.address as any) ?? {};
      const invSettings = (data.settings as any)?.invoiceSettings ?? {};
      setForm({
        name:           data.name ?? '',
        businessNumber: data.businessNumber ?? '',
        vatNumber:      data.vatNumber ?? '',
        phone:          data.phone ?? '',
        email:          data.email ?? '',
        logoUrl:        data.logoUrl ?? '',
        address: {
          street:  addr.street  ?? '',
          city:    addr.city    ?? '',
          zip:     addr.zip     ?? '',
          country: addr.country ?? 'ישראל',
        },
        invoiceSettings: {
          defaultPaymentTerms: invSettings.defaultPaymentTerms ?? 'שוטף + 30',
          defaultVatRate:      invSettings.defaultVatRate      ?? 0.18,
          invoiceFooter:       invSettings.invoiceFooter       ?? '',
          bankDetails:         invSettings.bankDetails         ?? '',
          showItemCodes:       invSettings.showItemCodes       ?? true,
          showBarcode:         invSettings.showBarcode         ?? false,
        },
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (body: any) => api.patch('/settings/company', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    mutation.mutate({
      ...form,
      invoiceSettings: form.invoiceSettings,
    });
  };

  const set = (field: string, val: any) => setForm(p => ({ ...p, [field]: val }));
  const setAddr = (field: string, val: string) =>
    setForm(p => ({ ...p, address: { ...p.address, [field]: val } }));
  const setInv = (field: string, val: any) =>
    setForm(p => ({ ...p, invoiceSettings: { ...p.invoiceSettings, [field]: val } }));

  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>;

  const tabs = [
    { id: 'company' as const, label: 'פרטי החברה', icon: Building2 },
    { id: 'invoice' as const, label: 'הגדרות מסמכים', icon: FileText },
  ];

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הגדרות חברה</h1>
          <p className="text-sm text-gray-500 mt-0.5">פרטי העסק שיופיעו בחשבוניות ומסמכים</p>
        </div>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white px-5 py-2 rounded-xl text-sm font-medium transition"
        >
          <Save className="w-4 h-4" />
          {mutation.isPending ? 'שומר...' : saved ? '✓ נשמר!' : 'שמור שינויים'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === tab.id
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'company' && (
        <div className="space-y-5">
          {/* Logo preview */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Image className="w-4 h-4" /> לוגו החברה
            </h3>
            <div className="flex items-center gap-5">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="לוגו" className="w-full h-full object-contain p-1" />
                ) : (
                  <Building2 className="w-10 h-10 text-gray-300" />
                )}
              </div>
              <div className="flex-1">
                <label className={labelCls}>כתובת URL של הלוגו</label>
                <input
                  className={inputCls}
                  placeholder="https://example.com/logo.png"
                  value={form.logoUrl}
                  onChange={e => set('logoUrl', e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  הזן כתובת URL של תמונת הלוגו (PNG/SVG מומלץ, רקע שקוף)
                </p>
              </div>
            </div>
          </div>

          {/* Basic info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> פרטי העסק
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>שם העסק / חברה</label>
                <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>ח.פ. / ע.מ.</label>
                <input className={inputCls} placeholder="123456789" value={form.businessNumber}
                  onChange={e => set('businessNumber', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>מספר מע"מ</label>
                <input className={inputCls} placeholder="123456789" value={form.vatNumber}
                  onChange={e => set('vatNumber', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>טלפון</label>
                <input className={inputCls} placeholder="03-1234567" value={form.phone}
                  onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>אימייל</label>
                <input className={inputCls} type="email" placeholder="info@company.co.il" value={form.email}
                  onChange={e => set('email', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">כתובת</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>רחוב ומספר</label>
                <input className={inputCls} placeholder="הרצל 1" value={form.address.street}
                  onChange={e => setAddr('street', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>עיר</label>
                <input className={inputCls} placeholder="תל אביב" value={form.address.city}
                  onChange={e => setAddr('city', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>מיקוד</label>
                <input className={inputCls} placeholder="6100101" value={form.address.zip}
                  onChange={e => setAddr('zip', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>מדינה</label>
                <input className={inputCls} value={form.address.country}
                  onChange={e => setAddr('country', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'invoice' && (
        <div className="space-y-5">
          {/* Payment defaults */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> הגדרות תשלום ברירת מחדל
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>תנאי תשלום ברירת מחדל</label>
                <select className={inputCls + ' bg-white'}
                  value={form.invoiceSettings.defaultPaymentTerms}
                  onChange={e => setInv('defaultPaymentTerms', e.target.value)}
                >
                  <option value="שוטף">שוטף</option>
                  <option value="שוטף + 30">שוטף + 30</option>
                  <option value="שוטף + 45">שוטף + 45</option>
                  <option value="שוטף + 60">שוטף + 60</option>
                  <option value="COD">מזומן בעת מסירה</option>
                  <option value="מראש">תשלום מראש</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>שיעור מע"מ (%)</label>
                <input
                  type="number" className={inputCls} min="0" max="100" step="1"
                  value={Math.round(form.invoiceSettings.defaultVatRate * 100)}
                  onChange={e => setInv('defaultVatRate', Number(e.target.value) / 100)}
                />
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">פרטי בנק לחשבוניות</h3>
            <div>
              <label className={labelCls}>פרטי חשבון בנק (יופיע בתחתית החשבונית)</label>
              <textarea
                className={inputCls + ' h-20 resize-none'}
                placeholder="בנק לאומי | סניף 123 | חשבון 456789&#10;IBAN: IL123456789"
                value={form.invoiceSettings.bankDetails}
                onChange={e => setInv('bankDetails', e.target.value)}
              />
            </div>
          </div>

          {/* Footer text */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">טקסט תחתית המסמך</h3>
            <div>
              <label className={labelCls}>הערות / תנאים כלליים (יופיעו בתחתית כל מסמך)</label>
              <textarea
                className={inputCls + ' h-24 resize-none'}
                placeholder="תנאים כלליים: תשלום בתוך 30 יום. כל מחלוקת תוגש לבית משפט בתל אביב."
                value={form.invoiceSettings.invoiceFooter}
                onChange={e => setInv('invoiceFooter', e.target.value)}
              />
            </div>
          </div>

          {/* Display options */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">הגדרות תצוגה</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox" className="w-4 h-4 rounded accent-teal-600"
                  checked={form.invoiceSettings.showItemCodes}
                  onChange={e => setInv('showItemCodes', e.target.checked)}
                />
                <span className="text-sm text-gray-700">הצג מק"ט / קוד פריט בחשבוניות</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox" className="w-4 h-4 rounded accent-teal-600"
                  checked={form.invoiceSettings.showBarcode}
                  onChange={e => setInv('showBarcode', e.target.checked)}
                />
                <span className="text-sm text-gray-700">הצג ברקוד בחשבוניות</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {mutation.isError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          שגיאה בשמירה. נסה שנית.
        </div>
      )}
    </div>
  );
}
