import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

async function getLeaveTypes() {
  const r = await api.get('/hr/leave-types');
  return r.data;
}

export default function LeaveTypesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['leave-types'], queryFn: getLeaveTypes });
  const types: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">סוגי חופשה</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
        ) : types.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין סוגי חופשה</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">בתשלום</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ימים מקס/שנה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">דרוש אישור</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">צבע</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {types.map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.isPaid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {t.isPaid ? 'בתשלום' : 'ללא תשלום'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.maxDaysPerYear ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${t.requiresApproval ? 'text-orange-600' : 'text-gray-400'}`}>
                      {t.requiresApproval ? 'כן' : 'לא'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.colorHex && (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: t.colorHex }} />
                        <span className="text-xs text-gray-400 font-mono">{t.colorHex}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
