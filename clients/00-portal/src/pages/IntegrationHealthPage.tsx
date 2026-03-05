import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle, AlertTriangle, XCircle, RefreshCw,
  ArrowRight, ShoppingCart, FileText, Truck, CreditCard,
  Users, Building2, Receipt,
} from 'lucide-react';
import api from '../lib/api';

interface ModuleHealth {
  module:      string;
  description: string;
  total:       number;
  synced:      number;
  unsynced:    number;
  syncRate:    number;
  status:      'OK' | 'WARNING' | 'ERROR';
}

interface HealthData {
  overallStatus: 'OK' | 'WARNING' | 'ERROR';
  modules:       ModuleHealth[];
}

const MODULE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  invoices:       { icon: FileText,    label: 'חשבוניות',        color: 'blue'   },
  payments:       { icon: CreditCard,  label: 'תשלומים',         color: 'green'  },
  bills:          { icon: Receipt,     label: 'חשבוניות ספק',    color: 'purple' },
  'bill-payments':{ icon: ArrowRight,  label: 'תשלומי ספקים',    color: 'indigo' },
  payroll:        { icon: Users,       label: 'שכר',             color: 'pink'   },
  pos:            { icon: ShoppingCart,label: 'קופה רושמת',      color: 'orange' },
  'goods-receipt':{ icon: Truck,       label: 'קבלת סחורה',      color: 'teal'   },
};

const statusConfig = {
  OK:      { icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200', label: 'תקין'  },
  WARNING: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'אזהרה' },
  ERROR:   { icon: XCircle,       color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',   label: 'שגיאה' },
};

const colorMap: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  pink:   'bg-pink-100 text-pink-700',
  orange: 'bg-orange-100 text-orange-700',
  teal:   'bg-teal-100 text-teal-700',
};

function ProgressBar({ value, status }: { value: number; status: string }) {
  const barColor = status === 'OK' ? 'bg-green-500' : status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={`${barColor} h-2 rounded-full transition-all duration-500`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ModuleCard({ m }: { m: ModuleHealth }) {
  const meta   = MODULE_META[m.module] ?? { icon: Building2, label: m.module, color: 'blue' };
  const s      = statusConfig[m.status];
  const Icon   = meta.icon;
  const SIcon  = s.icon;

  return (
    <div className={`border rounded-xl p-5 ${s.bg} ${s.border}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[meta.color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">{meta.label}</p>
            <p className="text-xs text-gray-500">{m.description}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
          <SIcon className="w-4 h-4" />
          <span>{s.label}</span>
        </div>
      </div>

      <ProgressBar value={m.syncRate} status={m.status} />

      <div className="flex justify-between text-xs mt-2 text-gray-600">
        <span>מסונכרן: <strong className="text-gray-800">{m.synced.toLocaleString()}</strong></span>
        <span className="font-bold text-lg text-gray-800">{m.syncRate}%</span>
        {m.unsynced > 0 ? (
          <span className="text-red-600 font-medium">חסר: {m.unsynced.toLocaleString()}</span>
        ) : (
          <span>סה"כ: {m.total.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

export default function IntegrationHealthPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<HealthData>({
    queryKey: ['integration-health'],
    queryFn: async () => {
      const res = await api.get('/accounting/integration-health');
      return res.data.data;
    },
    refetchInterval: 60_000,
  });

  const overall = data?.overallStatus ?? 'OK';
  const s = statusConfig[overall];
  const SIcon = s.icon;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">בריאות אינטגרציות</h1>
          <p className="text-sm text-gray-500 mt-1">
            סנכרון בין כל מודולי המערכת לספרי החשבונות
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          רענן
        </button>
      </div>

      {/* Overall Status Banner */}
      {data && (
        <div className={`rounded-xl border-2 p-5 flex items-center gap-4 ${s.bg} ${s.border}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${s.bg}`}>
            <SIcon className={`w-7 h-7 ${s.color}`} />
          </div>
          <div>
            <p className={`text-lg font-bold ${s.color}`}>
              {overall === 'OK'      ? 'כל המערכות מסונכרנות' :
               overall === 'WARNING' ? 'ישנן אינטגרציות חלקיות' :
                                       'ישנן אינטגרציות שנכשלו'}
            </p>
            <p className="text-sm text-gray-600">
              {data.modules.filter(m => m.status === 'OK').length} / {data.modules.length} מודולים תקינים
            </p>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-5 h-32 animate-pulse bg-gray-50" />
          ))}
        </div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-6 text-center text-red-600">
          <XCircle className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium">שגיאה בטעינת נתוני הבריאות</p>
        </div>
      )}

      {/* Module Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.modules.map(m => <ModuleCard key={m.module} m={m} />)}
        </div>
      )}

      {/* Legend */}
      <div className="border rounded-xl p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">מה בודקים?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-600">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <span><strong>תקין (100%)</strong> — כל הרשומות יצרו פקודת יומן בהנה"ח</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
            <span><strong>אזהרה (חלקי)</strong> — חלק מהרשומות חסרות ב-GL. ייתכן שנוצרו לפני האינטגרציה</span>
          </div>
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <span><strong>שגיאה (0%)</strong> — אין סנכרון כלל. בדוק הגדרות חשבונות בסיס</span>
          </div>
        </div>
      </div>
    </div>
  );
}
