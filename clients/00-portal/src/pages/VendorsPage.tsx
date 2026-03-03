import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Building2 } from 'lucide-react';
import api from '../lib/api';

async function getVendors(search: string) {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  const r = await api.get(`/purchasing/vendors${q}`);
  return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
}

export default function VendorsPage() {
  const [search, setSearch] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => getVendors(search),
  });

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ספקים</h1>
        <Link to="/purchasing/vendors/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> ספק חדש
        </Link>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="חפש ספק..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {(data as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Building2 className="w-8 h-8" />
              <p className="text-sm">אין ספקים. <Link to="/purchasing/vendors/new" className="text-blue-600 hover:underline">הוסף ספק</Link></p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">שם ספק</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">ח.פ.</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">מע&quot;מ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">טלפון</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">אימייל</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">תנאי תשלום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data as any[]).map((v: any) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        {v.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.businessId ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.vatNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{v.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{v.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{v.paymentTerms ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
