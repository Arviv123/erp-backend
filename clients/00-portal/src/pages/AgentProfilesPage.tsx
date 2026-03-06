import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Edit2, Trash2, Brain, Zap, ChevronRight } from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  domain?: string;
  provider?: string;
  model?: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
}

type ProfileFormData = {
  name: string;
  description: string;
  systemPrompt: string;
  icon: string;
  color: string;
  provider: string;
  isDefault: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { value: 'blue',   bg: 'bg-blue-500' },
  { value: 'green',  bg: 'bg-green-500' },
  { value: 'purple', bg: 'bg-purple-500' },
  { value: 'orange', bg: 'bg-orange-500' },
  { value: 'red',    bg: 'bg-red-500' },
];

const PROVIDERS = [
  { value: '',          label: 'ברירת מחדל' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini',    label: 'Gemini' },
  { value: 'grok',      label: 'Grok' },
];

function colorClasses(color?: string): string {
  switch (color) {
    case 'blue':   return 'bg-blue-100 text-blue-600';
    case 'green':  return 'bg-green-100 text-green-600';
    case 'purple': return 'bg-purple-100 text-purple-600';
    case 'orange': return 'bg-orange-100 text-orange-600';
    case 'red':    return 'bg-red-100 text-red-600';
    default:       return 'bg-slate-100 text-slate-600';
  }
}

const EMPTY_FORM: ProfileFormData = {
  name: '',
  description: '',
  systemPrompt: '',
  icon: '🤖',
  color: 'blue',
  provider: '',
  isDefault: false,
};

// ── Profile Card ───────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: AgentProfile;
  onEdit: (p: AgentProfile) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${colorClasses(profile.color)}`}>
          {profile.icon || <Bot className="w-6 h-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-800 text-base leading-tight">{profile.name}</h3>
            {profile.isDefault && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                כברירת מחדל
              </span>
            )}
          </div>
          {profile.description && (
            <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{profile.description}</p>
          )}
        </div>
      </div>

      {/* Provider/Model badge */}
      {profile.provider && (
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
            {profile.provider}
            {profile.model ? ` / ${profile.model}` : ''}
          </span>
        </div>
      )}

      {/* System prompt preview */}
      {profile.systemPrompt && (
        <p className="text-xs text-slate-400 line-clamp-2 border-t border-slate-100 pt-3 leading-relaxed">
          {profile.systemPrompt}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 mt-auto">
        <button
          onClick={() => navigate(`/agents?profileId=${profile.id}`)}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Brain className="w-4 h-4" />
          הפעל בצ'אט
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(profile)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="ערוך"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(profile.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="מחק"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function ProfileModal({
  initial,
  onClose,
}: {
  initial: AgentProfile | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = initial !== null;

  const [form, setForm] = useState<ProfileFormData>(
    isEdit
      ? {
          name:         initial.name,
          description:  initial.description ?? '',
          systemPrompt: initial.systemPrompt ?? '',
          icon:         initial.icon ?? '🤖',
          color:        initial.color ?? 'blue',
          provider:     initial.provider ?? '',
          isDefault:    initial.isDefault,
        }
      : EMPTY_FORM
  );

  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? api.patch(`/agents/profiles/${initial!.id}`, form)
        : api.post('/agents/profiles', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-profiles'] });
      onClose();
    },
    onError: () => setError('שגיאה בשמירת הסוכן. נסה שוב.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('שם הסוכן הוא שדה חובה.'); return; }
    if (!form.systemPrompt.trim()) { setError('הוראות הסוכן הן שדה חובה.'); return; }
    save.mutate();
  }

  function set<K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? 'עריכת סוכן' : 'הוספת סוכן חדש'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-medium leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">
              שם הסוכן <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder='לדוגמה: "סוכן מכירות מומחה"'
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">תיאור קצר</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="תאר בקצרה את המומחיות של הסוכן"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
            />
          </div>

          {/* System Prompt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">
              הוראות הסוכן / System Prompt <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-slate-400">מה הסוכן יידע וכיצד יתנהג? (פרומט מערכת)</p>
            <textarea
              rows={8}
              value={form.systemPrompt}
              onChange={e => set('systemPrompt', e.target.value)}
              placeholder={`אתה סוכן מומחה למכירות ב-[שם חברה]. תפקידך לנתח מגמות מכירות, לזהות הזדמנויות ולהמליץ על פעולות. תמיד השב בעברית...`}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y font-mono leading-relaxed"
            />
          </div>

          {/* Icon + Color row */}
          <div className="flex gap-4">
            {/* Icon */}
            <div className="flex flex-col gap-1.5 w-24">
              <label className="text-sm font-medium text-slate-700">אייקון</label>
              <input
                type="text"
                value={form.icon}
                onChange={e => set('icon', e.target.value.slice(-2))}
                maxLength={2}
                className="border border-slate-200 rounded-lg px-3 py-2 text-2xl text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-sm font-medium text-slate-700">צבע</label>
              <div className="flex items-center gap-2 mt-1">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set('color', c.value)}
                    className={`w-8 h-8 rounded-full ${c.bg} transition-transform ${
                      form.color === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">ספק AI</label>
            <select
              value={form.provider}
              onChange={e => set('provider', e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* isDefault */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => set('isDefault', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-sm text-slate-700">הגדר כברירת מחדל</span>
          </label>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={save.isPending}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {save.isPending ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
        <Bot className="w-8 h-8 text-blue-400" />
      </div>
      <div className="text-center">
        <p className="text-slate-700 font-semibold text-base">אין סוכנים מותאמים אישית</p>
        <p className="text-slate-400 text-sm mt-1">
          צור סוכן ראשון עם מומחיות ייחודית לצרכי העסק שלך
        </p>
      </div>
      <button
        onClick={onCreate}
        className="mt-2 flex items-center gap-2 bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        הוסף סוכן חדש
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AgentProfilesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentProfile | null>(null);

  const { data: profiles = [], isLoading, isError } = useQuery<AgentProfile[]>({
    queryKey: ['agent-profiles'],
    queryFn: () => api.get('/agents/profiles').then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/profiles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-profiles'] }),
  });

  function handleEdit(profile: AgentProfile) {
    setEditTarget(profile);
    setModalOpen(true);
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm('האם למחוק את הסוכן? פעולה זו אינה הפיכה.');
    if (confirmed) deleteMutation.mutate(id);
  }

  function handleOpenCreate() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setEditTarget(null);
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
              <Brain className="w-7 h-7 text-blue-600" />
              סוכנים מותאמים אישית
            </h1>
            <p className="text-slate-500 text-sm mt-1">הגדר סוכנים עם מומחיות ייחודית</p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            הוסף סוכן חדש
          </button>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <Zap className="w-5 h-5 animate-pulse" />
            <span>טוען סוכנים...</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-24">
            <p className="text-red-500 text-sm">שגיאה בטעינת הנתונים. נסה לרענן את הדף.</p>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {profiles.length === 0 ? (
              <EmptyState onCreate={handleOpenCreate} />
            ) : (
              profiles.map(profile => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <ProfileModal
          initial={editTarget}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
