import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Search, User, Activity } from 'lucide-react';
import api from '../lib/api';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'יצירה',
  UPDATE: 'עדכון',
  DELETE: 'מחיקה',
  LOGIN: 'כניסה',
  LOGOUT: 'יציאה',
  APPROVE: 'אישור',
  REJECT: 'דחייה',
  EXPORT: 'ייצוא',
  IMPORT: 'ייבוא',
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  APPROVE: 'bg-emerald-100 text-emerald-700',
  REJECT: 'bg-orange-100 text-orange-700',
  EXPORT: 'bg-teal-100 text-teal-700',
  IMPORT: 'bg-indigo-100 text-indigo-700',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(weekAgoStr());
  const [to, setTo] = useState(todayStr());
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', search, from, to, page],
    queryFn: async () => {
      // GET /api/audit — params: entityType, entityId, userId, action, from, to, page, pageSize
      // The backend returns items array + total in the meta
      const r = await api.get('/audit', {
        params: {
          // search is not a direct param in the backend — we pass it as userId filter if it looks like one,
          // otherwise we use entityType. For a general keyword search we pass it as entityType as a best-effort.
          entityType: search || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: 50,
        },
      });
      // Backend sends: { success, data: items[], meta: { total, page, pageSize } }
      const items: any[] = r.data?.data ?? [];
      const total: number = r.data?.meta?.total ?? items.length;
      return { items, total };
    },
  });

  const logs: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          יומן פעולות (Audit Log)
        </h1>
        <p className="text-sm text-gray-500 mt-1">מעקב אחר כל הפעולות שבוצעו במערכת</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">חיפוש לפי סוג ישות</label>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="EMPLOYEE, INVOICE, CUSTOMER..."
              className="border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
              dir="ltr"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מתאריך</label>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">עד תאריך</label>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="text-sm text-gray-500 self-end pb-2">
          {total} רשומות
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">טוען...</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Activity className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>אין רשומות תואמות</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">זמן</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">משתמש</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">פעולה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">ישות</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">מזהה ישות</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">פרטים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt ?? log.timestamp ?? '').toLocaleString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-gray-700">
                        <User size={12} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">
                          {log.userName ?? log.userId ?? '—'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 font-medium">
                      {log.entityType ?? log.resource ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono truncate max-w-[100px]">
                      {log.entityId ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                      {typeof log.details === 'string'
                        ? log.details
                        : JSON.stringify(log.details ?? log.changes ?? log.metadata ?? {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {(total > 50 || page > 1) && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
          >
            הקודם
          </button>
          <span className="text-sm text-gray-500">עמוד {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < 50}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
          >
            הבא
          </button>
        </div>
      )}
    </div>
  );
}
