import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield, AlertTriangle, CheckCircle2, Info, RefreshCw,
  Users, FileText, Package, BookOpen, DollarSign, Clock,
  Truck, Monitor, Settings, Wifi, Brain, CreditCard,
  Umbrella, Tag, Building2, MessageCircle, Briefcase,
  Box, Bell, ChevronRight, AlertCircle, BarChart3, Database,
} from 'lucide-react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SoftwareIssue {
  severity: 'critical' | 'warning' | 'info';
  description: string;
  detail?: string;
  module: string;
}

interface ModuleReport {
  key: string;
  name: string;
  icon: string;
  status: 'ok' | 'warning' | 'critical';
  score: number;
  totalChecks: number;
  passedChecks: number;
  issues: SoftwareIssue[];
}

interface SoftwareAuditReport {
  generatedAt: string;
  overallScore: number;
  totalModules: number;
  totalChecks: number;
  passedChecks: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  modules: ModuleReport[];
}

// ─── Icon Map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Users, FileText, Package, BookOpen, DollarSign, Clock,
  Truck, Monitor, Settings, Wifi, Brain, CreditCard,
  Umbrella, Tag, Building2, MessageCircle, Briefcase,
  Box, Bell, Shield, BarChart: BarChart3, Database,
  ShoppingBag: Package, RefreshCw,
  UserCheck: Users,
};

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Shield;
  return <Icon className={className} />;
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const progress = (score / 100) * c;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={`${progress} ${c - progress}`}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-400">מתוך 100</span>
      </div>
    </div>
  );
}

// ─── Module Card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: ModuleReport }) {
  const [expanded, setExpanded] = useState(mod.status !== 'ok');

  const borderColor = mod.status === 'critical' ? 'border-red-300' :
                      mod.status === 'warning' ? 'border-amber-300' : 'border-green-200';
  const bgHeader = mod.status === 'critical' ? 'bg-red-50' :
                   mod.status === 'warning' ? 'bg-amber-50' : 'bg-green-50';
  const iconColor = mod.status === 'critical' ? 'text-red-600' :
                    mod.status === 'warning' ? 'text-amber-600' : 'text-green-600';

  const scoreColor = mod.score >= 80 ? 'text-green-600' :
                     mod.score >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = mod.score >= 80 ? 'bg-green-100' :
                  mod.score >= 60 ? 'bg-amber-100' : 'bg-red-100';

  const statusIcon = mod.status === 'critical'
    ? <AlertCircle size={18} className="text-red-500" />
    : mod.status === 'warning'
      ? <AlertTriangle size={18} className="text-amber-500" />
      : <CheckCircle2 size={18} className="text-green-500" />;

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`} dir="rtl">
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 ${bgHeader} text-right`}
        onClick={() => setExpanded(e => !e)}
      >
        <ModuleIcon name={mod.icon} className={`w-5 h-5 ${iconColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-800">{mod.name}</span>
          <span className="mr-2 text-xs text-gray-500">
            {mod.passedChecks}/{mod.totalChecks} בדיקות עברו
          </span>
        </div>
        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${scoreBg} ${scoreColor}`}>
          {mod.score}%
        </span>
        {statusIcon}
        <ChevronRight
          size={16}
          className={`text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100 bg-white">
          {mod.issues.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-green-600">
              <CheckCircle2 size={15} /> הכל תקין — אין ממצאים
            </div>
          ) : (
            mod.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 shrink-0">
                  {issue.severity === 'critical' && <AlertCircle size={15} className="text-red-500" />}
                  {issue.severity === 'warning'  && <AlertTriangle size={15} className="text-amber-500" />}
                  {issue.severity === 'info'     && <Info size={15} className="text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{issue.description}</p>
                  {issue.detail && (
                    <p className="text-xs text-gray-500 mt-0.5">{issue.detail}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  issue.severity === 'critical' ? 'text-red-700 bg-red-100' :
                  issue.severity === 'warning' ? 'text-amber-700 bg-amber-100' :
                  'text-blue-700 bg-blue-100'
                }`}>
                  {issue.severity === 'critical' ? 'קריטי' :
                   issue.severity === 'warning' ? 'אזהרה' : 'מידע'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function SummaryStats({ report }: { report: SoftwareAuditReport }) {
  const okCount = report.modules.filter(m => m.status === 'ok').length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3" dir="rtl">
      {[
        { label: 'מודולים', value: report.totalModules, icon: Package, color: 'text-purple-600', bg: 'bg-purple-100' },
        { label: 'בדיקות עברו', value: `${report.passedChecks}/${report.totalChecks}`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
        { label: 'קריטיים', value: report.criticalCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
        { label: 'אזהרות', value: report.warningCount, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
        { label: 'תקינים', value: okCount, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
      ].map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
            <s.icon size={18} className={s.color} />
          </div>
          <div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SoftwareAuditPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'ok'>('all');

  const { data: report, isLoading, isFetching, dataUpdatedAt } = useQuery<SoftwareAuditReport>({
    queryKey: ['software-audit'],
    queryFn: () => api.get('/agents/software-audit').then(r => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['software-audit'] });

  const filteredModules = report?.modules.filter(m => {
    if (filter === 'all') return true;
    return m.status === filter;
  }) ?? [];

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL') : '';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">בדיקת שלמות תוכנה</h1>
            <p className="text-sm text-gray-500">סריקת כל מודולי המערכת — backend, frontend, DB, ניווט</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-gray-400">עודכן: {lastUpdated}</span>}
          <button
            onClick={refresh}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            הרץ בדיקה
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw size={32} className="animate-spin text-purple-500" />
          <p className="text-gray-500 text-sm">סורק את כל מודולי התוכנה...</p>
        </div>
      ) : report ? (
        <>
          {/* Score + Stats */}
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center">
              <ScoreRing score={report.overallScore} />
              <p className="text-sm font-semibold text-gray-700 mt-2">ציון כללי</p>
            </div>
            <div className="flex-1">
              <SummaryStats report={report} />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2">
            {[
              { key: 'all',      label: 'הכל',    count: report.modules.length },
              { key: 'critical', label: 'קריטי',  count: report.modules.filter(m => m.status === 'critical').length },
              { key: 'warning',  label: 'אזהרות', count: report.modules.filter(m => m.status === 'warning').length },
              { key: 'ok',       label: 'תקין',   count: report.modules.filter(m => m.status === 'ok').length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                <span className={`text-xs rounded-full px-1.5 ${filter === tab.key ? 'bg-white/20' : 'bg-gray-100'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Module Cards */}
          <div className="space-y-3">
            {filteredModules.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">אין מודולים בסינון זה</div>
            ) : (
              filteredModules.map(mod => (
                <ModuleCard key={mod.key} mod={mod} />
              ))
            )}
          </div>

          <p className="text-xs text-gray-400 text-left">
            דוח נוצר: {new Date(report.generatedAt).toLocaleString('he-IL')}
          </p>
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <Shield size={40} className="mx-auto mb-3 opacity-30" />
          <p>לחץ "הרץ בדיקה" לסריקת שלמות התוכנה</p>
        </div>
      )}
    </div>
  );
}
