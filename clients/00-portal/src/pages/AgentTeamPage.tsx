import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Brain, Cpu, Package, TrendingUp, ShoppingCart, Users, Truck,
  Loader2, Play, AlertCircle, CheckCircle2, Clock, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentDef {
  type: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  color: string;
}

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

const BORDER_COLOR: Record<string, string> = {
  blue:   'border-blue-400',
  green:  'border-green-400',
  purple: 'border-purple-400',
  orange: 'border-orange-400',
  red:    'border-red-400',
  indigo: 'border-indigo-400',
};

const BG_ICON: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  red:    'bg-red-100 text-red-700',
  indigo: 'bg-indigo-100 text-indigo-700',
};

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  return `לפני ${Math.floor(hrs / 24)} ימים`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
          <Loader2 size={11} className="animate-spin" /> פועל
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={11} /> הושלם
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
          <AlertCircle size={11} /> נכשל
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
          <Clock size={11} /> לא הופעל
        </span>
      );
  }
}

// ── Queries ────────────────────────────────────────────────────────────────────

async function fetchAgents(): Promise<AgentDef[]> {
  const r = await api.get('/agents/team/agents');
  const d = r.data;
  return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
}

async function fetchTasks(): Promise<AgentTask[]> {
  const r = await api.get('/agents/team/tasks', { params: { limit: 20 } });
  const d = r.data;
  return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
}

// ── Agent Card ─────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  latestTask,
  onRun,
  isRunning,
}: {
  agent: AgentDef;
  latestTask?: AgentTask;
  onRun: () => void;
  isRunning: boolean;
}) {
  const color = agent.color || 'blue';
  const status = latestTask?.status ?? 'idle';
  const alerts      = latestTask?.findings?.alerts?.slice(0, 3) ?? [];
  const insights    = latestTask?.findings?.insights?.slice(0, 3) ?? [];

  return (
    <div className={`bg-white rounded-xl border-2 shadow-sm p-5 flex flex-col gap-3 ${BORDER_COLOR[color] ?? 'border-gray-200'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${BG_ICON[color] ?? 'bg-gray-100 text-gray-700'}`}>
            {AGENT_ICONS[agent.type] ?? <Cpu className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{agent.name}</h3>
            <p className="text-xs text-gray-400">{agent.nameEn}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">{agent.description}</p>

      {/* Last run time */}
      {latestTask && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Clock size={11} />
          ריצה אחרונה: {relativeTime(latestTask.startedAt)}
        </p>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <ul className="space-y-1">
          {alerts.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertCircle size={11} className="mt-0.5 shrink-0 text-red-500" />
              <span className="line-clamp-1">{a}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <ul className="space-y-1">
          {insights.map((ins, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-blue-700">
              <span className="mt-0.5 shrink-0 text-blue-500 font-bold">•</span>
              <span className="line-clamp-1">{ins}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Run button */}
      <div className="pt-1 flex items-center justify-between mt-auto">
        {latestTask && (
          <Link
            to={`/agents/tasks/${latestTask.id}`}
            className="text-xs text-blue-600 hover:underline"
          >
            צפה בפרטים
          </Link>
        )}
        <button
          onClick={onRun}
          disabled={isRunning || status === 'running'}
          className="mr-auto flex items-center gap-1.5 bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition"
        >
          {isRunning || status === 'running' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          הרץ
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AgentTeamPage() {
  const qc = useQueryClient();
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data: agents = [], isLoading: agentsLoading } = useQuery<AgentDef[]>({
    queryKey: ['agent-team-agents'],
    queryFn: fetchAgents,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<AgentTask[]>({
    queryKey: ['agent-team-tasks'],
    queryFn: fetchTasks,
    refetchInterval: 10_000,
  });

  // Latest task per agent type
  const latestByType: Record<string, AgentTask> = {};
  tasks.forEach(t => {
    if (!latestByType[t.agentType] || new Date(t.startedAt) > new Date(latestByType[t.agentType].startedAt)) {
      latestByType[t.agentType] = t;
    }
  });

  // Run all (coordinator)
  const runAll = useMutation({
    mutationFn: () => api.post('/agents/team/run'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-team-tasks'] });
      showToast('success', 'הצוות הופעל בהצלחה');
    },
    onError: () => showToast('error', 'שגיאה בהפעלת הצוות'),
  });

  // Run single agent
  const runSingle = async (agentType: string) => {
    setRunningAgent(agentType);
    try {
      await api.post(`/agents/team/${agentType}/run`);
      qc.invalidateQueries({ queryKey: ['agent-team-tasks'] });
      showToast('success', `הסוכן הופעל בהצלחה`);
    } catch {
      showToast('error', 'שגיאה בהפעלת הסוכן');
    } finally {
      setRunningAgent(null);
    }
  };

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  const isLoading = agentsLoading || tasksLoading;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-l from-blue-700 to-indigo-800 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-3 rounded-xl">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">צוות סוכנים חכמים</h1>
              <p className="text-blue-200 text-sm mt-0.5">
                {agents.length} סוכנים פעילים · {tasks.length} משימות אחרונות
              </p>
            </div>
          </div>

          <button
            onClick={() => runAll.mutate()}
            disabled={runAll.isPending}
            className="flex items-center gap-2 bg-white text-blue-800 font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-50 disabled:opacity-60 transition shadow"
          >
            {runAll.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            הרץ את כל הצוות
          </button>
        </div>
      </div>

      {/* Agent cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>טוען סוכנים...</span>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Cpu className="w-8 h-8" />
          <p>לא נמצאו סוכנים</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <AgentCard
              key={agent.type}
              agent={agent}
              latestTask={latestByType[agent.type]}
              onRun={() => runSingle(agent.type)}
              isRunning={runningAgent === agent.type}
            />
          ))}
        </div>
      )}

      {/* Latest tasks table */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">משימות אחרונות</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סוכן</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סטטוס</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">סיכום</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">זמן התחלה</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.slice(0, 20).map(task => {
                const agentDef = agents.find(a => a.type === task.agentType);
                return (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">
                          {AGENT_ICONS[task.agentType] ?? <Cpu size={14} />}
                        </span>
                        <span className="font-medium text-gray-900 text-xs">
                          {agentDef?.name ?? task.agentType}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-xs">
                      <span className="line-clamp-1 text-xs">{task.summary || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                      {relativeTime(task.startedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <Link
                        to={`/agents/tasks/${task.id}`}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        פרטים ←
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
