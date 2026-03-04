import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Phone, Mail, MapPin } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const TYPE_STYLE: Record<string, string> = { B2B: 'bg-blue-100 text-blue-700', B2C: 'bg-green-100 text-green-700', GOVERNMENT: 'bg-purple-100 text-purple-700' };
const TYPE_LABEL: Record<string, string> = { B2B: 'עסק', B2C: 'פרטי', GOVERNMENT: 'ממשלה' };

const INV_STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700', OVERDUE: 'bg-red-100 text-red-700',
};
const INV_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלח', PAID: 'שולם', OVERDUE: 'פג תוקף',
};

type Tab = 'details' | 'invoices' | 'activity';

async function getCustomer(id: string) { const r = await api.get(`/crm/customers/${id}`); return r.data; }
async function getCustomerInvoices(id: string) { const r = await api.get('/invoices', { params: { customerId: id, pageSize: 50 } }); return r.data; }

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('details');

  const { data: custData, isLoading, error } = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id!), enabled: !!id });
  const { data: invData } = useQuery({ queryKey: ['customer-invoices', id], queryFn: () => getCustomerInvoices(id!), enabled: !!id && tab === 'invoices' });

  const customer = custData?.data ?? custData;
  const invoices: any[] = Array.isArray(invData) ? invData : Array.isArray(invData?.data) ? invData.data : [];

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען...</div>;
  if (error || !customer) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה</div>;

  const totalPaid    = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.totalAmount ?? i.total ?? 0), 0);
  const totalOverdue = invoices.filter(i => i.status === 'OVERDUE').reduce((s, i) => s + (i.totalAmount ?? i.total ?? 0), 0);

  const tabs = [
    { key: 'details' as Tab, label: 'פרטים' },
    { key: 'invoices' as Tab, label: 'חשבוניות' },
    { key: 'activity' as Tab, label: 'פעילות' },
  ];

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/crm')} className="text-gray-400 hover:text-gray-600"><ChevronRight className="w-5 h-5" /></button>
        <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_STYLE[customer.type] ?? ''}`}>{TYPE_LABEL[customer.type] ?? customer.type}</span>
        <span className={`text-xs px-1.5 py-0.5 ${customer.isActive ? 'text-green-600' : 'text-gray-400'}`}>{customer.isActive ? '● פעיל' : '● לא פעיל'}</span>
        <button onClick={() => navigate(`/crm/customers/${id}/statement`)}
          className="mr-auto flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 transition">
          📄 דף חשבון
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 bg-white rounded-t-xl px-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${tab === t.key ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 border-t-0 p-6">
        {/* Details */}
        {tab === 'details' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div><p className="text-gray-400 text-xs mb-0.5">שם</p><p className="font-medium">{customer.name}</p></div>
            <div><p className="text-gray-400 text-xs mb-0.5">סוג</p><p className="font-medium">{TYPE_LABEL[customer.type] ?? customer.type}</p></div>
            {customer.vatNumber && <div><p className="text-gray-400 text-xs mb-0.5">ע.מ. / ח.פ.</p><p className="font-medium">{customer.vatNumber}</p></div>}
            {customer.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400" /><p>{customer.phone}</p></div>}
            {customer.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400" /><p>{customer.email}</p></div>}
            {customer.address && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-gray-400" /><p>{customer.address.street}, {customer.address.city}</p></div>}
            {customer.paymentTerms && <div><p className="text-gray-400 text-xs mb-0.5">תנאי תשלום</p><p className="font-medium">{customer.paymentTerms} ימים</p></div>}
            {customer.notes && <div className="md:col-span-2"><p className="text-gray-400 text-xs mb-0.5">הערות</p><p>{customer.notes}</p></div>}
          </div>
        )}

        {/* Invoices */}
        {tab === 'invoices' && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'שולם', val: fmtCurrency(totalPaid), cls: 'text-green-700' },
                { label: 'פג תוקף', val: fmtCurrency(totalOverdue), cls: 'text-red-600' },
                { label: 'סה"כ חשבוניות', val: String(invoices.length), cls: 'text-gray-900' },
              ].map(c => (
                <div key={c.label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
                  <p className={`font-bold ${c.cls}`}>{c.val}</p>
                </div>
              ))}
            </div>
            {invoices.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">אין חשבוניות</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">מספר</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">תאריך</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">סכום</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">סטאטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2.5">{fmtDate(inv.issueDate)}</td>
                      <td className="px-3 py-2.5 font-medium">{fmtCurrency(inv.totalAmount ?? inv.total ?? 0)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INV_STATUS_STYLE[inv.status] ?? ''}`}>
                          {INV_STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Activity */}
        {tab === 'activity' && (
          <div className="text-gray-400 text-sm text-center py-10">פעילות — בפיתוח</div>
        )}
      </div>
    </div>
  );
}
