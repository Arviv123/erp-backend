import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Plus, Trash2, CheckCircle2, AlertCircle, Eye, EyeOff,
  Loader2, Zap, Brain
} from 'lucide-react';
import api from '../lib/api';

interface ApiKey {
  id: string;
  provider: string;
  label: string;
  isActive: boolean;
  createdAt: string;
}

interface Provider {
  id: string;
  label: string;
  models: { id: string; label: string }[];
}

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: '🟠',
  openai:    '🟢',
  gemini:    '🔵',
  grok:      '⚫',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'border-orange-200 bg-orange-50',
  openai:    'border-green-200 bg-green-50',
  gemini:    'border-blue-200 bg-blue-50',
  grok:      'border-gray-200 bg-gray-50',
};

function AddKeyModal({
  providers,
  onClose,
}: {
  providers: Provider[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(providers[0]?.id ?? 'anthropic');
  const [apiKey, setApiKey]     = useState('');
  const [label, setLabel]       = useState('');
  const [show, setShow]         = useState(false);
  const [toast, setToast]       = useState<'success' | 'error' | null>(null);

  const save = useMutation({
    mutationFn: () => api.post('/agents/keys', { provider, apiKey, label: label || provider }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-keys'] });
      setToast('success');
      setTimeout(() => { setToast(null); onClose(); }, 1200);
    },
    onError: () => { setToast('error'); setTimeout(() => setToast(null), 2500); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" dir="rtl">
        <h2 className="text-lg font-bold text-gray-900 mb-5">הוסף מפתח API</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ספק AI</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>
                  {PROVIDER_ICONS[p.id]} {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תווית (אופציונלי)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={`מפתח ${provider}`}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מפתח API</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-... / AIza... / xai-..."
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none pl-10 font-mono"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">המפתח מוצפן ומאוחסן בצורה מאובטחת בשרת</p>
          </div>
        </div>

        {toast === 'success' && (
          <div className="mt-3 flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={16} /> נשמר בהצלחה
          </div>
        )}
        {toast === 'error' && (
          <div className="mt-3 flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={16} /> שגיאה בשמירה
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save.mutate()}
            disabled={!apiKey || save.isPending}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
            שמור מפתח
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

export default function AgentSettingsPage() {
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'fail'>>({});

  const { data: keys = [], isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ['agent-keys'],
    queryFn: () => api.get('/agents/keys').then(r => r.data?.data ?? r.data ?? []),
  });

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['agent-providers'],
    queryFn: () => api.get('/agents/providers').then(r => r.data?.data ?? r.data ?? []),
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-keys'] }),
  });

  const testKey = async (id: string) => {
    setTestingId(id);
    try {
      await api.post(`/agents/keys/${id}/test`);
      setTestResults(r => ({ ...r, [id]: 'ok' }));
    } catch {
      setTestResults(r => ({ ...r, [id]: 'fail' }));
    } finally {
      setTestingId(null);
    }
  };

  // Group keys by provider
  const keysByProvider: Record<string, ApiKey | undefined> = {};
  keys.forEach(k => { keysByProvider[k.provider] = k; });

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      {showAddModal && (
        <AddKeyModal providers={providers} onClose={() => setShowAddModal(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            הגדרות סוכני AI
          </h1>
          <p className="text-sm text-gray-500 mt-1">חבר מפתחות API של ספקי AI כדי להפעיל את הסוכנים</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
        >
          <Plus size={16} /> הוסף מפתח
        </button>
      </div>

      {/* Security note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-blue-800">
        <Key className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">אבטחת מפתחות</p>
          <p className="text-xs text-blue-600 mt-0.5">
            המפתחות מוצפנים עם AES-256-GCM ומאוחסנים בשרת. הם לעולם אינם מוצגים חזרה, רק מאפשרים שיחות.
          </p>
        </div>
      </div>

      {/* Provider cards */}
      {keysLoading ? (
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : (
        <div className="space-y-4">
          {providers.map(provider => {
            const key = keysByProvider[provider.id];
            const testResult = testResults[key?.id ?? ''];
            const isTesting = testingId === key?.id;
            return (
              <div
                key={provider.id}
                className={`rounded-xl border-2 p-5 ${key ? PROVIDER_COLORS[provider.id] : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{PROVIDER_ICONS[provider.id]}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{provider.label}</h3>
                      <p className="text-xs text-gray-500">{provider.models.length} מודלים זמינים</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {key ? (
                      <>
                        <span className="flex items-center gap-1 text-xs text-green-700 font-medium bg-green-100 px-2 py-1 rounded-full">
                          <CheckCircle2 size={12} /> מחובר
                        </span>
                        {testResult === 'ok' && (
                          <span className="text-xs text-green-600 font-medium">✓ תקין</span>
                        )}
                        {testResult === 'fail' && (
                          <span className="text-xs text-red-600 font-medium">✗ שגיאה</span>
                        )}
                        <button
                          onClick={() => testKey(key.id)}
                          disabled={isTesting}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                        >
                          {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                          בדוק
                        </button>
                        <button
                          onClick={() => { if (window.confirm('למחוק את המפתח?')) deleteKey.mutate(key.id); }}
                          className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                        >
                          <Trash2 size={12} /> מחק
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 bg-white border border-blue-200 px-3 py-1.5 rounded-lg"
                      >
                        <Plus size={12} /> חבר
                      </button>
                    )}
                  </div>
                </div>

                {/* Models list */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {provider.models.map(m => (
                    <span key={m.id} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                      {m.id}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
