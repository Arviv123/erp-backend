import { useQuery } from '@tanstack/react-query';
import { Wifi, Tag, Radio, Activity, AlertTriangle, ArrowDownCircle, ArrowUpCircle, MinusCircle } from 'lucide-react';
import api from '../lib/api';

interface RfidDashboard {
  totalTags: number;
  totalReaders: number;
  recentEvents: RfidEvent[];
  lostTags: LostTag[];
  unregisteredEpcs: string[];
}

interface RfidEvent {
  id: string;
  epc: string;
  direction: 'IN' | 'OUT' | 'INTERNAL';
  readerName: string;
  timestamp: string;
}

interface LostTag {
  id: string;
  epc: string;
  lastSeenAt: string;
  assignedName?: string;
}

const DIRECTION_BADGE: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  IN: {
    label: 'כניסה',
    cls: 'bg-green-100 text-green-700',
    icon: <ArrowDownCircle className="w-3.5 h-3.5" />,
  },
  OUT: {
    label: 'יציאה',
    cls: 'bg-red-100 text-red-700',
    icon: <ArrowUpCircle className="w-3.5 h-3.5" />,
  },
  INTERNAL: {
    label: 'פנימי',
    cls: 'bg-gray-100 text-gray-600',
    icon: <MinusCircle className="w-3.5 h-3.5" />,
  },
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function getDashboard(): Promise<RfidDashboard> {
  const res = await api.get('/rfid/dashboard');
  return res.data;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-3 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-gray-200" />
      <div className="flex-1">
        <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-12 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default function RfidDashboardPage() {
  const { data, isLoading, error } = useQuery<RfidDashboard>({
    queryKey: ['rfid-dashboard'],
    queryFn: getDashboard,
    refetchInterval: 10000,
  });

  const todayEvents = data?.recentEvents ?? [];
  const lostTags = data?.lostTags ?? [];
  const unknownEpcs = data?.unregisteredEpcs ?? [];

  const stats = [
    {
      label: 'סה"כ תגיות',
      value: data?.totalTags ?? 0,
      icon: <Tag className="w-5 h-5 text-blue-600" />,
      color: 'bg-blue-50',
    },
    {
      label: 'קוראים פעילים',
      value: data?.totalReaders ?? 0,
      icon: <Radio className="w-5 h-5 text-purple-600" />,
      color: 'bg-purple-50',
    },
    {
      label: 'אירועים היום',
      value: todayEvents.length,
      icon: <Activity className="w-5 h-5 text-green-600" />,
      color: 'bg-green-50',
    },
    {
      label: 'תגיות שנעלמו',
      value: lostTags.length,
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      color: 'bg-red-50',
    },
  ];

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Wifi className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">לוח בקרה RFID</h1>
          <p className="text-sm text-gray-500">מתעדכן אוטומטית כל 10 שניות</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">שגיאה בטעינת נתוני RFID. בדוק חיבור לשרת.</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map(s => (
              <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-3">
                <div className={`p-2 rounded-lg ${s.color}`}>{s.icon}</div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                </div>
              </div>
            ))}
      </div>

      {/* Recent events table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">אירועים אחרונים</h2>
          <span className="text-xs text-gray-400">עשרת האירועים האחרונים</span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded" />
            ))}
          </div>
        ) : todayEvents.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            אין אירועים להצגה
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">EPC</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">קורא</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">כיוון</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">זמן</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todayEvents.slice(0, 10).map(ev => {
                const dir = DIRECTION_BADGE[ev.direction] ?? DIRECTION_BADGE.INTERNAL;
                return (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{ev.epc}</td>
                    <td className="px-4 py-2.5 text-gray-600">{ev.readerName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${dir.cls}`}>
                        {dir.icon}
                        {dir.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtTime(ev.timestamp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Alerts section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Unknown EPCs */}
        <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-orange-100 bg-orange-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-orange-800">תגיות לא רשומות</h2>
            {unknownEpcs.length > 0 && (
              <span className="mr-auto bg-orange-200 text-orange-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {unknownEpcs.length}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-6 bg-gray-100 rounded" />
              ))}
            </div>
          ) : unknownEpcs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">אין תגיות לא מוכרות</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {unknownEpcs.map(epc => (
                <li key={epc} className="px-4 py-2.5 font-mono text-xs text-gray-700 hover:bg-orange-50">
                  {epc}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lost tags */}
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-semibold text-red-800">תגיות שנעלמו (24+ שעות)</h2>
            {lostTags.length > 0 && (
              <span className="mr-auto bg-red-200 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {lostTags.length}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-6 bg-gray-100 rounded" />
              ))}
            </div>
          ) : lostTags.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">אין תגיות שנעלמו</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {lostTags.map(tag => (
                <li key={tag.id} className="px-4 py-2.5 hover:bg-red-50">
                  <p className="font-mono text-xs text-gray-700">{tag.epc}</p>
                  {tag.assignedName && (
                    <p className="text-xs text-gray-500">{tag.assignedName}</p>
                  )}
                  <p className="text-xs text-red-500 mt-0.5">
                    נראתה לאחרונה: {new Date(tag.lastSeenAt).toLocaleString('he-IL')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
