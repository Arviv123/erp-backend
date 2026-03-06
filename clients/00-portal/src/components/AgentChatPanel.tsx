import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  MessageCircle, X, Send, Bot, User, Loader2,
  ChevronDown, RotateCcw, Brain, Sparkles
} from 'lucide-react';
import api from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

interface Provider {
  id: string;
  label: string;
  models: { id: string; label: string }[];
}

const DOMAINS = [
  { id: 'general',     label: 'כללי' },
  { id: 'accounting',  label: 'הנהלת חשבונות' },
  { id: 'hr',          label: 'משאבי אנוש' },
  { id: 'pos',         label: 'קופות' },
  { id: 'crm',         label: 'לקוחות' },
  { id: 'inventory',   label: 'מלאי' },
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-blue-600' : 'bg-purple-600'}`}>
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
      </div>
      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${isUser ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'}`}>
        {msg.loading ? (
          <span className="flex items-center gap-1.5 text-gray-500">
            <Loader2 size={12} className="animate-spin" /> חושב...
          </span>
        ) : (
          <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
        )}
      </div>
    </div>
  );
}

// Suppress unused import warning for MessageCircle — it's kept for potential future use
void MessageCircle;

export default function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [domain, setDomain] = useState('general');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [agentProfileId, setAgentProfileId] = useState<string | null>(null);
  const [agentProfileName, setAgentProfileName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['agent-providers'],
    queryFn: () => api.get('/agents/providers').then(r => r.data?.data ?? r.data ?? []),
  });

  // Set default provider/model when providers load
  useEffect(() => {
    if (providers.length > 0 && !provider) {
      setProvider(providers[0].id);
      setModel(providers[0].models[0]?.id ?? '');
    }
  }, [providers, provider]);

  // Auto-open when URL has profileId param (e.g. from AgentProfilesPage "פתח בצ'אט")
  useEffect(() => {
    const profileId   = searchParams.get('profileId');
    const profileName = searchParams.get('profileName');
    if (profileId) {
      setAgentProfileId(profileId);
      if (profileName) setAgentProfileName(decodeURIComponent(profileName));
      setOpen(true);
      // Clear the param from URL without history entry
      const next = new URLSearchParams(searchParams);
      next.delete('profileId');
      next.delete('profileName');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true };
    setMessages(m => [...m, userMsg, loadingMsg]);
    setInput('');
    setStreaming(true);

    let assistantText = '';

    try {
      const response = await fetch(`${api.defaults.baseURL}/agents/${domain}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: text,
          conversationId,
          provider: provider || undefined,
          model: model || undefined,
          agentProfileId: agentProfileId || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error ?? 'שגיאה בשרת');
      }

      // Get conversationId from header
      const newConvId = response.headers.get('X-Conversation-Id') ?? conversationId;
      if (newConvId) setConversationId(newConvId);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'chunk') {
                  assistantText += event.content;
                  setMessages(m => m.map(msg =>
                    msg.id === 'loading'
                      ? { ...msg, content: assistantText, loading: false }
                      : msg
                  ));
                } else if (event.type === 'done') {
                  setMessages(m => m.map(msg =>
                    msg.id === 'loading'
                      ? { ...msg, id: Date.now().toString(), content: assistantText, loading: false }
                      : msg
                  ));
                } else if (event.type === 'error') {
                  throw new Error(event.message);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(m => m.map(msg =>
        msg.id === 'loading'
          ? { id: Date.now().toString(), role: 'assistant', content: `שגיאה: ${err.message}` }
          : msg
      ));
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const reset = () => {
    setMessages([]);
    setConversationId(null);
    setAgentProfileId(null);
    setAgentProfileName(null);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Get selected provider's models
  const selectedProvider = providers.find(p => p.id === provider);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-full shadow-2xl hover:shadow-purple-500/30 flex items-center justify-center z-50 transition-all hover:scale-110"
        title="סוכן AI"
      >
        <Brain size={24} />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 left-6 w-96 h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden"
      dir="rtl"
    >
      {/* Header */}
      <div className="bg-gradient-to-l from-purple-600 to-blue-600 px-4 py-3 flex items-center gap-3">
        <Brain size={20} className="text-white" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm flex items-center gap-1.5">
            {agentProfileName ? (
              <><Sparkles size={13} className="shrink-0" />{agentProfileName}</>
            ) : 'סוכן AI'}
          </p>
          {!agentProfileId && (
            <div className="flex items-center gap-2">
              {/* Domain select */}
              <select
                value={domain}
                onChange={e => setDomain(e.target.value)}
                className="text-xs bg-white/20 text-white rounded px-1 py-0.5 outline-none cursor-pointer"
              >
                {DOMAINS.map(d => <option key={d.id} value={d.id} className="text-gray-800">{d.label}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={reset} className="text-white/80 hover:text-white p-1" title="שיחה חדשה">
            <RotateCcw size={15} />
          </button>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Provider/Model selector bar */}
      {providers.length > 0 && (
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex items-center gap-2">
          <select
            value={provider}
            onChange={e => {
              setProvider(e.target.value);
              const prov = providers.find(p => p.id === e.target.value);
              setModel(prov?.models[0]?.id ?? '');
            }}
            className="text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white"
          >
            {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <ChevronDown size={12} className="text-gray-400" />
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white flex-1 min-w-0"
          >
            {(selectedProvider?.models ?? []).map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Brain size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">שאל אותי כל שאלה על המערכת</p>
            <div className="mt-4 space-y-2">
              {['מה היתרה בחשבון 1100?', 'סכם מכירות החודש', 'כמה עובדים פעילים?'].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); setTimeout(send, 10); }}
                  className="block w-full text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 hover:bg-blue-100 text-right"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="כתוב הודעה... (Enter לשליחה)"
            rows={1}
            disabled={streaming}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
            style={{ maxHeight: '80px' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="w-9 h-9 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center shrink-0"
          >
            {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 text-center">Enter = שלח · Shift+Enter = שורה חדשה</p>
      </div>
    </div>
  );
}
