import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Brain, Package, TrendingUp, ShoppingCart, Users, Truck, Cpu,
  ChevronRight, Loader2, AlertCircle, Lightbulb, CheckCircle2,
  Clock, Trash2,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentTask {
  id: string;
  agentType: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  summary: string;
  findings?: {
    alerts?: string[];
    insights?: string[];
    recommendations?: string[];
    agents?: { type: string; summary: string }[];
  };
  startedAt: string;
  completedAt?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ReactNode> = {
  inventory:   <Package    className="w-6 h-6" />,
  finance:     <TrendingUp className="w-6 h-6" />,
  sales:       <ShoppingCart className="w-6 h-6" />,
  hr:          <Users      className="w-6 h-6" />,
  purchasing:  <Truck      className="w-6 h-6" />,
  coordinator: <Brain      className="w-6 h-6" />,
};

const AGENT_NAMES: Record<string, string> = {
  inventory:   'סוכן מלאי',
  finance:     'סוכן פיננסי',
  sales:       'סוכן מכירות',
  hr:          'סוכן משאבי אנוש',
  purchasing:  'סוכן רכש',
  coordinator: 'רכז — מנהל הצוות',
};

const AGENT_ICON_BG: Record<string, string> = {
  inventory:   'bg-orange-100 text-orange-700',
  finance:     'bg-green-100 text-green-700',
  sales:       'bg-blue-100 text-blue-700',
  hr:          'bg-purple-100 text-purple-700',
  purchasing:  'bg-yellow-100 text-yellow-700',
  coordinator: 'bg-indigo-100 text-indigo-700',
};

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
          <Loader2 size={13} className="animate-spin" /> פועל
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium bg-green-100 text-green-700 px-3 py-1 rounded-full">
          <CheckCircle2 size={13} /> הושלם
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium bg-red-100 text-red-700 px-3 py-1 rounded-full">
          <AlertCircle size={13} /> נכשל
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
          <Clock size={13} /> לא הופעל
        </span>
      );
  }
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AgentTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<AgentTask>({
    queryKey: ['agent-task', id],
    queryFn: async () => {
      const r = await api.get(`/agents/team/tasks/${id}`);
      return r.data?.data ?? r.data;
    },
    enabled: !!id,
  });

  const deleteTask = useMutation({
    mutationFn: () => api.delete(`/agents/team/tasks/${id}`),
    onSuccess: () => navigate(-1),
  });

  if (isLoading) {
    return (
      <div dir="rtl" className="flex items-center justify-center h-60 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>טוען פרטי משימה...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center h-60 text-red-500 gap-2">
        <AlertCircle className="w-8 h-8" />
        <p>שגיאה בטעינת המשימה</p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:underline mt-1"
        >
          חזור
        </button>
      </div>
    );
  }

  const task = data;
  const alerts          = task.findings?.alerts         ?? [];
  const insights        = task.findings?.insights       ?? [];
  const recommendations = task.findings?.recommendations ?? [];
  const subAgents       = task.findings?.agents         ?? [];
  const isCoordinator   = task.agentType === 'coordinator';
  const iconBg          = AGENT_ICON_BG[task.agentType] ?? 'bg-gray-100 text-gray-700';

  return (
    <div dir="rtl" className="space-y-5 max-w-3xl">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`p-2 rounded-xl ${iconBg}`}>
              {AGENT_ICONS[task.agentType] ?? <Cpu className="w-6 h-6" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {AGENT_NAMES[task.agentType] ?? task.agentType}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <StatusBadge status={task.status} />
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock size={11} />
                  {fmtDateTime(task.startedAt)}
                  {task.completedAt && ` — ${fmtDateTime(task.completedAt)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {task.summary && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-blue-600 mb-2 uppercase tracking-wide">סיכום</p>
          <p className="text-gray-800 leading-relaxed">{task.summary}</p>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <h2 className="font-semibold text-red-800 text-sm">התראות</h2>
            <span className="text-xs bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full font-medium">
              {alerts.length}
            </span>
          </div>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                <span className="mt-1 text-red-500 font-bold shrink-0">!</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-600" />
            <h2 className="font-semibold text-yellow-800 text-sm">תובנות</h2>
            <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full font-medium">
              {insights.length}
            </span>
          </div>
          <ul className="space-y-2">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-yellow-900">
                <span className="mt-1 text-yellow-500 font-bold shrink-0">•</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <h2 className="font-semibold text-green-800 text-sm">המלצות</h2>
            <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-medium">
              {recommendations.length}
            </span>
          </div>
          <ul className="space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-green-900">
                <CheckCircle2 size={14} className="mt-0.5 text-green-500 shrink-0" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sub-agent results (coordinator only) */}
      {isCoordinator && subAgents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-800 text-sm">תוצאות סוכנים</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {subAgents.map((sa, i) => {
              const bg = AGENT_ICON_BG[sa.type] ?? 'bg-gray-100 text-gray-700';
              return (
                <div key={i} className="px-5 py-4 flex items-start gap-3">
                  <div className={`p-1.5 rounded-lg shrink-0 ${bg}`}>
                    {AGENT_ICONS[sa.type] ?? <Cpu size={14} />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-0.5">
                      {AGENT_NAMES[sa.type] ?? sa.type}
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">{sa.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete button */}
      <div className="pt-2 border-t border-gray-200 flex justify-end">
        <button
          onClick={() => {
            if (window.confirm('האם למחוק את המשימה?')) deleteTask.mutate();
          }}
          disabled={deleteTask.isPending}
          className="flex items-center gap-2 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-40 transition"
        >
          {deleteTask.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
          מחק משימה
        </button>
      </div>
    </div>
  );
}
