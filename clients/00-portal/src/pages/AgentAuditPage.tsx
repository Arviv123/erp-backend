import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield, AlertTriangle, CheckCircle2, Info, RefreshCw,
  Users, FileText, Package, BookOpen, DollarSign, Clock,
  ShoppingBag, Truck, Box, Settings, Radio, AlertCircle,
  ChevronRight, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditIssue {
  severity: 'critical' | 'warning' | 'info';
  description: string;
  count: number;
  path?: string;
}

interface AuditCategory {
  key: string;
  name: string;
  icon: string;
  status: 'ok' | 'warning' | 'critical';
  issueCount: number;
  issues: AuditIssue[];
  checkedAt: string;
}

interface AuditReport {
  tenantId: string;
  generatedAt: string;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  categories: AuditCategory[];
}

// ─── Icon Map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Users, FileText, Package, BookOpen, DollarSign, Clock,
  ShoppingBag, Truck, Box, Settings, Radio,
};

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Shield;
  return <Icon className={className} />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({ severity, count }: { severity: AuditIssue['severity']; count: number }) {
  if (severity === 'critical') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
      <AlertCircle size={11} /> {count} קריטי
    </span>
  );
  if (severity === 'warning') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
      <AlertTriangle size={11} /> {count} אזהרה
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
      <Info size={11} /> {count} מידע
    </span>
  );
}

function CategoryCard({ cat, onNavigate }: { cat: AuditCategory; onNavigate: (path: string) => void }) {
  const [expanded, setExpanded] = useState(cat.status !== 'ok');

  const borderColor = cat.status === 'critical' ? 'border-red-300' : cat.status === 'warning' ? 'border-amber-300' : 'border-green-200';
  const bgHeader   = cat.status === 'critical' ? 'bg-red-50' : cat.status === 'warning' ? 'bg-amber-50' : 'bg-green-50';
  const iconColor  = cat.status === 'critical' ? 'text-red-600' : cat.status === 'warning' ? 'text-amber-600' : 'text-green-600';
  const statusIcon = cat.status === 'critical'
    ? <AlertCircle size={18} className="text-red-500" />
    : cat.status === 'warning'
      ? <AlertTriangle size={18} className="text-amber-500" />
      : <CheckCircle2 size={18} className="text-green-500" />;

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`} dir="rtl">
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 ${bgHeader} text-right`}
        onClick={() => setExpanded(e => !e)}
      >
        <CategoryIcon name={cat.icon} className={`w-5 h-5 ${iconColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-800">{cat.name}</span>
          {cat.issueCount > 0 && (
            <span className="mr-2 text-xs text-gray-500">{cat.issueCount} ממצאים</span>
          )}
        </div>
        {statusIcon}
        <ChevronRight
          size={16}
          className={`text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100 bg-white">
          {cat.issues.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-green-600">
              <CheckCircle2 size={15} /> הכל תקין — אין ממצאים
            </div>
          ) : (
            cat.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 shrink-0">
                  {issue.severity === 'critical' && <AlertCircle size={15} className="text-red-500" />}
                  {issue.severity === 'warning'  && <AlertTriangle size={15} className="text-amber-500" />}
                  {issue.severity === 'info'     && <Info size={15} className="text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{issue.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SeverityBadge severity={issue.severity} count={issue.count} />
                  {issue.path && (
                    <button
                      onClick={() => onNavigate(issue.path!)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      title="עבור לדף"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Bar ─────────────────────────────────────────────────────────────

function SummaryBar({ report }: { report: AuditReport }) {
  const okCount = report.categories.filter(c => c.status === 'ok').length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" dir="rtl">
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
          <AlertCircle size={20} className="text-red-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-red-600">{report.criticalCount}</p>
          <p className="text-xs text-gray-500">ממצאים קריטיים</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
          <AlertTriangle size={20} className="text-amber-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-amber-600">{report.warningCount}</p>
          <p className="text-xs text-gray-500">אזהרות</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Info size={20} className="text-blue-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-blue-600">
            {report.totalIssues - report.criticalCount - report.warningCount}
          </p>
          <p className="text-xs text-gray-500">הערות מידע</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={20} className="text-green-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-green-600">{okCount}</p>
          <p className="text-xs text-gray-500">קטגוריות תקינות</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentAuditPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'ok'>('all');

  const { data: report, isLoading, isFetching, dataUpdatedAt } = useQuery<AuditReport>({
    queryKey: ['agent-audit'],
    queryFn: () => api.get('/agents/audit').then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agent-audit'] });

  const filteredCategories = report?.categories.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  }) ?? [];

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL') : '';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">צוות סוכני ביקורת</h1>
            <p className="text-sm text-gray-500">סריקת נתונים חסרים ובעיות איכות בכל מודולי המערכת</p>
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
            הרץ ביקורת
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw size={32} className="animate-spin text-purple-500" />
          <p className="text-gray-500 text-sm">מריץ ביקורת מלאה על כל מודולי המערכת...</p>
        </div>
      ) : report ? (
        <>
          <SummaryBar report={report} />

          {/* Filter Tabs */}
          <div className="flex items-center gap-2">
            {[
              { key: 'all',      label: 'הכל',      count: report.categories.length },
              { key: 'critical', label: 'קריטי',    count: report.categories.filter(c => c.status === 'critical').length },
              { key: 'warning',  label: 'אזהרות',   count: report.categories.filter(c => c.status === 'warning').length },
              { key: 'ok',       label: 'תקין',     count: report.categories.filter(c => c.status === 'ok').length },
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

          {/* Category Cards */}
          <div className="space-y-3">
            {filteredCategories.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">אין קטגוריות בסינון זה</div>
            ) : (
              filteredCategories.map(cat => (
                <CategoryCard key={cat.key} cat={cat} onNavigate={navigate} />
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
          <p>לחץ "הרץ ביקורת" לסריקת המערכת</p>
        </div>
      )}
    </div>
  );
}
