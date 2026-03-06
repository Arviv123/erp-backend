import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Clock, Play, Plus, Edit2, Trash2,
  CheckCircle, XCircle, Calendar, Zap, RefreshCw,
  ChevronDown, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ───────────────────────────────────────────────────────────────────────

interface AgentProfile {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Schedule {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  isEnabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failure';
  lastRunError?: string;
  nextRunAt?: string;
  runCount: number;
  agentProfile?: AgentProfile;
}

interface ScheduleRun {
  id: string;
  startedAt: string;
  status: 'success' | 'failure';
  tokenCount?: number;
  response?: string;
}

type Frequency = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'custom';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    // future (next run)
    const absDiff = Math.abs(diff);
    const mins = Math.floor(absDiff / 60_000);
    if (mins < 1) return 'תוך שניות';
    if (mins < 60) return `בעוד ${mins} דקות`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `בעוד ${hrs} שעות`;
    return `בעוד ${Math.floor(hrs / 24)} ימים`;
  }
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  return `לפני ${Math.floor(hrs / 24)} ימים`;
}

function humanCron(cron: string): string {
  if (cron === '0 8 * * 1-5') return 'כל יום חול בשעה 08:00';
  if (cron === '0 9 * * 1') return 'כל שני בשעה 09:00';
  if (cron === '0 0 * * *') return 'כל יום בחצות';
  if (cron === '0 0 1 * *') return 'פעם בחודש ב-1 לחודש';

  const hourlyMatch = cron.match(/^0 \*\/(\d+) \* \* \*$/);
  if (hourlyMatch) return `כל ${hourlyMatch[1]} שעות`;

  const dailyMatch = cron.match(/^(\d+) (\d+) \* \* \*$/);
  if (dailyMatch) {
    const h = dailyMatch[2].padStart(2, '0');
    const m = dailyMatch[1].padStart(2, '0');
    return `כל יום בשעה ${h}:${m}`;
  }

  const weeklyMatch = cron.match(/^(\d+) (\d+) \* \* ([\d,]+)$/);
  if (weeklyMatch) {
    const h = weeklyMatch[2].padStart(2, '0');
    const m = weeklyMatch[1].padStart(2, '0');
    const DAYS: Record<string, string> = {
      '0': 'ראשון', '1': 'שני', '2': 'שלישי',
      '3': 'רביעי', '4': 'חמישי', '5': 'שישי', '6': 'שבת',
    };
    const days = weeklyMatch[3].split(',').map(d => DAYS[d] ?? d).join(', ');
    return `כל ${days} בשעה ${h}:${m}`;
  }

  const monthlyMatch = cron.match(/^(\d+) (\d+) (\d+) \* \*$/);
  if (monthlyMatch) {
    const h = monthlyMatch[2].padStart(2, '0');
    const m = monthlyMatch[1].padStart(2, '0');
    return `ב-${monthlyMatch[3]} לחודש בשעה ${h}:${m}`;
  }

  return cron;
}

function buildCron(
  freq: Frequency,
  hour: number,
  minute: number,
  days: number[],
  dayOfMonth: number,
  everyHours: number,
): string {
  if (freq === 'daily') return `${minute} ${hour} * * *`;
  if (freq === 'weekly') return `${minute} ${hour} * * ${days.length > 0 ? days.join(',') : '1'}`;
  if (freq === 'monthly') return `${minute} ${hour} ${dayOfMonth} * *`;
  if (freq === 'hourly') return `0 */${everyHours} * * *`;
  return '0 8 * * 1-5';
}

const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  indigo: 'bg-indigo-500',
  gray: 'bg-gray-500',
};

// ── Schedule Form Modal ─────────────────────────────────────────────────────────

interface ScheduleFormModalProps {
  initial?: Schedule;
  onClose: () => void;
}

function ScheduleFormModal({ initial, onClose }: ScheduleFormModalProps) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial);

  const { data: profiles = [] } = useQuery<AgentProfile[]>({
    queryKey: ['agent-profiles'],
    queryFn: () => api.get('/agents/profiles').then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    }),
  });

  const { data: providers = [] } = useQuery<{ id: string; label: string }[]>({
    queryKey: ['agent-providers'],
    queryFn: () => api.get('/agents/providers').then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    }),
  });

  // parse initial cron for defaults
  function parseCronFreq(cron?: string): Frequency {
    if (!cron) return 'daily';
    if (/^0 \*\/\d+ \* \* \*$/.test(cron)) return 'hourly';
    if (/^\d+ \d+ \* \* [\d,\-]+$/.test(cron) && !/^\d+ \d+ \* \* \*$/.test(cron)) return 'weekly';
    if (/^\d+ \d+ \d+ \* \*$/.test(cron)) return 'monthly';
    if (/^\d+ \d+ \* \* \*$/.test(cron)) return 'daily';
    return 'custom';
  }

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [agentProfileId, setAgentProfileId] = useState(initial?.agentProfile?.id ?? '');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [aiProvider, setAiProvider] = useState('');
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [freq, setFreq] = useState<Frequency>(parseCronFreq(initial?.cronExpression));
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [everyHours, setEveryHours] = useState(4);
  const [customCron, setCustomCron] = useState(initial?.cronExpression ?? '0 8 * * 1-5');
  const [toast, setToast] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const cronValue = freq === 'custom' ? customCron : buildCron(freq, hour, minute, selectedDays, dayOfMonth, everyHours);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        description: description || undefined,
        cronExpression: cronValue,
        isEnabled,
        agentProfileId: agentProfileId || undefined,
        taskPrompt,
        aiProvider: aiProvider || undefined,
      };
      if (isEdit && initial) {
        return api.patch(`/agents/schedules/${initial.id}`, payload);
      }
      return api.post('/agents/schedules', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      setToast('success');
      setTimeout(() => { setToast(null); onClose(); }, 1000);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'שגיאה בשמירה';
      setErrorMsg(msg);
      setToast('error');
      setTimeout(() => setToast(null), 3000);
    },
  });

  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function toggleDay(d: number) {
    setSelectedDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort(),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" dir="rtl">
        <h2 className="text-lg font-bold text-gray-900 mb-5">
          {isEdit ? 'עריכת אוטומציה' : 'אוטומציה חדשה'}
        </h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              שם האוטומציה <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="סריקת מלאי יומית"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="תיאור קצר של האוטומציה"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Agent profile */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוכן AI</label>
            <select
              value={agentProfileId}
              onChange={e => setAgentProfileId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">ברירת מחדל</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">תדירות</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                ['daily', 'מדי יום'],
                ['weekly', 'כל שבוע'],
                ['monthly', 'כל חודש'],
                ['hourly', 'כל שעות X'],
                ['custom', 'מותאם אישית'],
              ] as [Frequency, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFreq(val)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    freq === val
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Daily / weekly / monthly — time picker */}
            {(freq === 'daily' || freq === 'weekly' || freq === 'monthly') && (
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-gray-500">שעה:</label>
                <select
                  value={hour}
                  onChange={e => setHour(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-gray-400">:</span>
                <select
                  value={minute}
                  onChange={e => setMinute(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
            )}

            {freq === 'weekly' && (
              <div className="flex flex-wrap gap-1.5">
                {DAYS_HE.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-full text-xs font-medium border transition ${
                      selectedDays.includes(i)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {d.slice(0, 2)}
                  </button>
                ))}
              </div>
            )}

            {freq === 'monthly' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">יום בחודש:</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={e => setDayOfMonth(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-16 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            )}

            {freq === 'hourly' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">כל</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={everyHours}
                  onChange={e => setEveryHours(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-16 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <label className="text-xs text-gray-500">שעות</label>
              </div>
            )}

            {freq === 'custom' && (
              <div>
                <input
                  type="text"
                  value={customCron}
                  onChange={e => setCustomCron(e.target.value)}
                  placeholder="0 8 * * 1-5"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  dir="ltr"
                />
                <a
                  href="https://crontab.guru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                >
                  crontab.guru — עוזר לכתיבת ביטויי cron
                </a>
              </div>
            )}

            {freq !== 'custom' && (
              <p className="text-xs text-blue-600 mt-2 font-mono bg-blue-50 px-2 py-1 rounded">
                {cronValue} — {humanCron(cronValue)}
              </p>
            )}
          </div>

          {/* Task prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              משימה לסוכן <span className="text-red-500">*</span>
            </label>
            <textarea
              value={taskPrompt}
              onChange={e => setTaskPrompt(e.target.value)}
              rows={4}
              placeholder="נתח את מצב המלאי ודווח על מוצרים שמתחת לנקודת ההזמנה המינימלית..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* AI Provider override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ספק AI (אופציונלי)</label>
            <select
              value={aiProvider}
              onChange={e => setAiProvider(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">ברירת מחדל</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">{isEnabled ? 'מופעל' : 'מושבת'}</span>
          </div>
        </div>

        {toast === 'success' && (
          <div className="mt-3 flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle size={16} /> נשמר בהצלחה
          </div>
        )}
        {toast === 'error' && (
          <div className="mt-3 flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save.mutate()}
            disabled={!name || !taskPrompt || save.isPending}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
            {isEdit ? 'שמור שינויים' : 'צור אוטומציה'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Runs Panel ──────────────────────────────────────────────────────────────────

function RunsPanel({ scheduleId }: { scheduleId: string }) {
  const { data: runs = [], isLoading } = useQuery<ScheduleRun[]>({
    queryKey: ['schedule-runs', scheduleId],
    queryFn: () =>
      api.get(`/agents/schedules/${scheduleId}/runs`).then(r => {
        const d = r.data;
        return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-xs py-3 px-4">
        <Loader2 size={13} className="animate-spin" /> טוען ריצות...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-xs text-gray-400 py-3 px-4">לא נמצאו ריצות קודמות</div>
    );
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50 rounded-b-xl">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        ריצות אחרונות
      </div>
      <div className="divide-y divide-gray-100">
        {runs.slice(0, 5).map(run => (
          <div key={run.id} className="px-4 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">{relativeTime(run.startedAt)}</span>
              {run.status === 'success' ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle size={10} /> הצליח
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  <XCircle size={10} /> נכשל
                </span>
              )}
            </div>
            {run.tokenCount !== undefined && (
              <span className="text-xs text-gray-400">{run.tokenCount.toLocaleString()} טוקנים · </span>
            )}
            {run.response && (
              <span className="text-xs text-gray-600 line-clamp-2">
                {run.response.slice(0, 100)}{run.response.length > 100 ? '...' : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Schedule Card ───────────────────────────────────────────────────────────────

interface ScheduleCardProps {
  schedule: Schedule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => Promise<void>;
}

function ScheduleCard({ schedule, onEdit, onDelete, onToggle, onRun }: ScheduleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      await onRun();
      setRunResult({ text: 'הסוכן הריץ את המשימה בהצלחה', type: 'success' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'שגיאה בהרצת המשימה';
      setRunResult({ text: msg, type: 'error' });
    } finally {
      setRunning(false);
    }
  }

  const dotColor = schedule.agentProfile?.color ? (COLOR_DOT[schedule.agentProfile.color] ?? 'bg-gray-400') : 'bg-gray-400';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Top row: toggle + name + action buttons */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Toggle */}
            <button
              type="button"
              onClick={onToggle}
              title={schedule.isEnabled ? 'כבה' : 'הפעל'}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                schedule.isEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  schedule.isEnabled ? 'translate-x-[18px]' : 'translate-x-1'
                }`}
              />
            </button>
            {/* Name */}
            <h3 className="font-semibold text-gray-900 text-sm truncate">{schedule.name}</h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
              title="עריכה"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
              title="מחיקה"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Description */}
        {schedule.description && (
          <p className="text-xs text-gray-500">{schedule.description}</p>
        )}

        {/* Agent profile badge */}
        {schedule.agentProfile && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-xs text-gray-600 font-medium">
              {schedule.agentProfile.icon} {schedule.agentProfile.name}
            </span>
          </div>
        )}

        {/* Cron */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock size={12} className="text-gray-400" />
          <span>{humanCron(schedule.cronExpression)}</span>
        </div>

        {/* Last run */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>ריצה אחרונה: {relativeTime(schedule.lastRunAt)}</span>
          {schedule.lastRunStatus === 'success' && (
            <span className="inline-flex items-center gap-1 text-green-700 font-medium">
              <CheckCircle size={11} /> הצליח
            </span>
          )}
          {schedule.lastRunStatus === 'failure' && (
            <span className="inline-flex items-center gap-1 text-red-700 font-medium">
              <XCircle size={11} /> נכשל
            </span>
          )}
          {!schedule.lastRunStatus && (
            <span className="text-gray-400">— לא רץ</span>
          )}
        </div>

        {/* Next run + run count */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Zap size={11} /> ריצה הבאה: {relativeTime(schedule.nextRunAt)}
          </span>
          <span>{schedule.runCount.toLocaleString()} ריצות</span>
        </div>

        {/* Run result */}
        {runResult && (
          <div
            className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
              runResult.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {runResult.type === 'success' ? (
              <CheckCircle size={13} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
            )}
            <span>{runResult.text}</span>
          </div>
        )}

        {/* Bottom buttons */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            ריצות אחרונות
          </button>

          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {running ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            הרץ עכשיו
          </button>
        </div>
      </div>

      {/* Runs panel */}
      {expanded && <RunsPanel scheduleId={schedule.id} />}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────

export default function AgentSchedulePage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ['agent-schedules'],
    queryFn: () =>
      api.get('/agents/schedules').then(r => {
        const d = r.data;
        return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      }),
    refetchInterval: 30_000,
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.patch(`/agents/schedules/${id}`, { isEnabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-schedules'] }),
    onError: () => showToastMsg('error', 'שגיאה בעדכון המצב'),
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      showToastMsg('success', 'האוטומציה נמחקה');
    },
    onError: () => showToastMsg('error', 'שגיאה במחיקה'),
  });

  function showToastMsg(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleRun(id: string) {
    await api.post(`/agents/schedules/${id}/run`);
    qc.invalidateQueries({ queryKey: ['agent-schedules'] });
  }

  function handleDelete(schedule: Schedule) {
    if (window.confirm(`למחוק את האוטומציה "${schedule.name}"?`)) {
      deleteSchedule.mutate(schedule.id);
    }
  }

  function openCreate() {
    setEditTarget(null);
    setShowModal(true);
  }

  function openEdit(schedule: Schedule) {
    setEditTarget(schedule);
    setShowModal(true);
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Modals */}
      {showModal && (
        <ScheduleFormModal
          initial={editTarget ?? undefined}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-600" />
            אוטומציות סוכנים
          </h1>
          <p className="text-sm text-gray-500 mt-1">הגדר משימות מתוזמנות שירוצו אוטומטית</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 text-sm font-medium shadow-sm transition"
        >
          <Plus size={16} /> הוסף אוטומציה
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>טוען אוטומציות...</span>
        </div>
      ) : schedules.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">אין אוטומציות מוגדרות</h3>
          <p className="text-sm text-gray-400 mb-5">צור את הראשונה!</p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} /> צור אוטומציה ראשונה
          </button>
        </div>
      ) : (
        /* Schedule cards grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {schedules.map(schedule => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onEdit={() => openEdit(schedule)}
              onDelete={() => handleDelete(schedule)}
              onToggle={() =>
                toggleEnabled.mutate({ id: schedule.id, isEnabled: !schedule.isEnabled })
              }
              onRun={() => handleRun(schedule.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
