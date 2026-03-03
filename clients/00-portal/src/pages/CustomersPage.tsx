import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Phone, Mail, ChevronLeft } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const TYPE_STYLE: Record<string, string> = {
  B2B: 'bg-blue-100 text-blue-700',
  B2C: 'bg-green-100 text-green-700',
  GOVERNMENT: 'bg-purple-100 text-purple-700',
};
const TYPE_LABEL: Record<string, string> = {
  B2B: 'עסק', B2C: 'פרטי', GOVERNMENT: 'ממשלה',
};

interface Customer {
  id: string;
  name: string;
  type: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  _count?: { invoices: number };
  totalRevenue?: number;
}

async function getCustomers(params: Record<string, string>) {
  const res = await api.get('/crm/customers', { params });
  return res.data;
}

export default function CustomersPage() {
  const [search, setSearch]   = useState('');
  const [type, setType]       = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['crm-customers', { type }],
    queryFn: () => getCustomers(type ? { type } : {}),
  });

  const customers: Customer[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const filtered = search
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.includes(search) || c.phone?.includes(search)
      )
    : customers;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">לקוחות</h1>
        <Link to="/crm/customers/new"
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          + לקוח חדש
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם / טלפון / אימייל"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
        <select value={type} onChange={e => setType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white">
          <option value="">כל הסוגים</option>
          <option value="B2B">עסק (B2B)</option>
          <option value="B2C">פרטי (B2C)</option>
          <option value="GOVERNMENT">ממשלה</option>
        </select>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">טוען לקוחות...</div>
      ) : error ? (
        <div className="flex items-center justify-center h-40 text-red-500">שגיאה בטעינת נתונים</div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400">אין לקוחות להצגה</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((customer) => (
            <div key={customer.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${TYPE_STYLE[customer.type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {TYPE_LABEL[customer.type] ?? customer.type}
                  </span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${customer.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                  {customer.isActive ? '● פעיל' : '● לא פעיל'}
                </span>
              </div>

              {/* Contact */}
              <div className="space-y-1 mb-4 text-sm text-gray-600">
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  חשבוניות: <span className="font-medium text-gray-700">{customer._count?.invoices ?? 0}</span>
                </div>
                <Link to={`/crm/customers/${customer.id}`}
                  className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-xs font-medium">
                  פרטים
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
