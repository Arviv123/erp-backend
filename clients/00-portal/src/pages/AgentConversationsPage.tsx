import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Trash2,
  Edit2,
  Bot,
  User,
  ChevronRight,
  X,
  Clock,
  Hash,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentProfile {
  name: string;
  icon: string;
  color: string;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  domain: string | null;
  provider: string | null;
  model: string | null;
  agentProfile: AgentProfile | null;
  _count: { messages: number };
  updatedAt: string;
  createdAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationDetail extends ConversationSummary {
  messages: Message[];
}

interface ConversationListResponse {
  data: ConversationSummary[];
  meta: { total: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דק'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע'`;
  return `לפני ${Math.floor(hrs / 24)} ימים`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getConversationTitle(conv: ConversationSummary): string {
  if (conv.title) return conv.title;
  return `שיחה ללא כותרת`;
}

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  claude:    { label: 'Claude',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  anthropic: { label: 'Claude',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  openai:    { label: 'OpenAI',  cls: 'bg-green-100 text-green-700 border-green-200' },
  gemini:    { label: 'Gemini',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  grok:      { label: 'Grok',    cls: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const PROFILE_COLOR_BG: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-800',
  green:  'bg-green-100 text-green-800',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
  red:    'bg-red-100 text-red-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  pink:   'bg-pink-100 text-pink-800',
  teal:   'bg-teal-100 text-teal-800',
};

function profileColorClass(color?: string | null): string {
  return PROFILE_COLOR_BG[color ?? ''] ?? 'bg-gray-100 text-gray-700';
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ConversationSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="animate-pulse rounded-lg p-3 bg-gray-100">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── Conversation Row ──────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  isSelected,
  isRenaming,
  onSelect,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: {
  conv: ConversationSummary;
  isSelected: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (title: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(conv.title ?? '');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(conv.title ?? '');
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [isRenaming, conv.title]);

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onRenameSubmit(renameValue.trim());
    } else if (e.key === 'Escape') {
      onRenameCancel();
    }
  };

  const providerKey = (conv.provider ?? '').toLowerCase();
  const providerBadge = PROVIDER_BADGE[providerKey];
  const title = getConversationTitle(conv);

  return (
    <div
      className={`relative group rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 border border-blue-200'
          : 'hover:bg-gray-50 border border-transparent'
      }`}
      onClick={() => { if (!isRenaming) onSelect(); }}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => onRenameSubmit(renameValue.trim())}
              onClick={e => e.stopPropagation()}
              className="w-full text-sm font-medium border border-blue-400 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            />
          ) : (
            <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
          )}
        </div>

        {/* Three-dot menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
            className={`p-1 rounded transition-opacity ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } text-gray-400 hover:text-gray-700`}
          >
            <span className="text-xs leading-none font-bold tracking-tighter">···</span>
          </button>

          {menuOpen && (
            <div
              className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { setMenuOpen(false); onRenameStart(); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                <Edit2 size={12} /> שנה שם
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 size={12} /> מחק
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {/* Agent profile badge */}
        {conv.agentProfile && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${profileColorClass(conv.agentProfile.color)}`}
          >
            {conv.agentProfile.icon} {conv.agentProfile.name}
          </span>
        )}

        {/* Provider badge */}
        {providerBadge && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${providerBadge.cls}`}
          >
            {providerBadge.label}
          </span>
        )}

        {/* Message count */}
        <span className="flex items-center gap-0.5 text-xs text-gray-400">
          <Hash size={10} />
          {conv._count.messages}
        </span>

        {/* Time */}
        <span className="flex items-center gap-0.5 text-xs text-gray-400 mr-auto">
          <Clock size={10} />
          {relativeTime(conv.updatedAt)}
        </span>
      </div>

      {/* Overlay to close menu on outside click */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white mt-0.5 ${
          isUser ? 'bg-blue-500' : 'bg-gray-500'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-gray-100 text-gray-900 rounded-tl-sm'
          }`}
        >
          {message.content}
        </div>
        <span className="text-xs text-gray-400">
          {formatDate(message.createdAt)} {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AgentConversationsPage() {
  const qc = useQueryClient();

  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [page]                        = useState(1);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [showDetail, setShowDetail]   = useState(false); // mobile: show detail panel
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: listData,
    isLoading: listLoading,
  } = useQuery<ConversationListResponse>({
    queryKey: ['agent-conversations', debouncedSearch, page],
    queryFn: () =>
      api
        .get('/agents/conversations', {
          params: { search: debouncedSearch, page, pageSize: 30 },
        })
        .then(r => {
          const raw = r.data;
          if (raw && typeof raw === 'object' && 'data' in raw) return raw as ConversationListResponse;
          return { data: Array.isArray(raw) ? raw : [], meta: { total: 0 } };
        }),
  });

  const conversations = listData?.data ?? [];
  const total = listData?.meta?.total ?? 0;

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery<ConversationDetail>({
    queryKey: ['agent-conversation', selectedId],
    queryFn: () =>
      api.get(`/agents/conversations/${selectedId}`).then(r => {
        const raw = r.data;
        return (raw && typeof raw === 'object' && 'messages' in raw) ? raw : raw?.data ?? raw;
      }),
    enabled: !!selectedId,
  });

  // Scroll to bottom when detail loads
  useEffect(() => {
    if (detail?.messages?.length) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [detail?.messages?.length, selectedId]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const deleteConv = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/conversations/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['agent-conversations'] });
      if (selectedId === id) {
        setSelectedId(null);
        setShowDetail(false);
      }
    },
  });

  const renameConv = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch(`/agents/conversations/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-conversations'] });
      qc.invalidateQueries({ queryKey: ['agent-conversation', renamingId] });
      setRenamingId(null);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setShowDetail(true);
    setRenamingId(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('האם למחוק את השיחה? הפעולה אינה ניתנת לביטול.')) {
      deleteConv.mutate(id);
    }
  }, [deleteConv]);

  const handleRenameSubmit = useCallback((id: string, title: string) => {
    if (!title) {
      setRenamingId(null);
      return;
    }
    renameConv.mutate({ id, title });
  }, [renameConv]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
  }, []);

  const handleDetailDelete = () => {
    if (!selectedId) return;
    handleDelete(selectedId);
  };

  const handleDetailRename = () => {
    if (!selectedId) return;
    setRenamingId(selectedId);
  };

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="flex flex-col h-full min-h-0">

      {/* Page header */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-4">
        <Link
          to="/agents"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronRight size={16} className="rotate-180" />
          חזרה לסוכנים
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          היסטוריית שיחות
        </h1>
        {total > 0 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {total} שיחות
          </span>
        )}
      </div>

      {/* Search bar */}
      <div className="flex-shrink-0 mb-3 relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חפש לפי כותרת או תוכן..."
          className="w-full border border-gray-300 rounded-xl pr-9 pl-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">

        {/* Left panel — conversation list (hidden on mobile when detail is open) */}
        <div
          className={`
            flex-shrink-0 w-full md:w-80 lg:w-96 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden
            ${showDetail ? 'hidden md:flex' : 'flex'}
          `}
        >
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {listLoading ? (
              <ConversationSkeleton />
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                <MessageSquare className="w-8 h-8 opacity-40" />
                <p className="text-sm">לא נמצאו שיחות</p>
                {debouncedSearch && (
                  <p className="text-xs text-gray-400">נסה חיפוש אחר</p>
                )}
              </div>
            ) : (
              conversations.map(conv => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedId === conv.id}
                  isRenaming={renamingId === conv.id}
                  onSelect={() => handleSelect(conv.id)}
                  onRenameStart={() => setRenamingId(conv.id)}
                  onRenameSubmit={title => handleRenameSubmit(conv.id, title)}
                  onRenameCancel={handleRenameCancel}
                  onDelete={() => handleDelete(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right panel — conversation detail */}
        <div
          className={`
            flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden
            ${!showDetail ? 'hidden md:flex' : 'flex'}
          `}
        >
          {!selectedId ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <MessageSquare className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">בחר שיחה מהרשימה</p>
              <p className="text-xs text-gray-300">השיחה תוצג כאן</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50">

                {/* Back button (mobile) */}
                <button
                  onClick={() => setShowDetail(false)}
                  className="md:hidden flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 ml-1"
                >
                  <ChevronRight size={16} />
                  סגור
                </button>

                {/* Title + badge */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {selectedConv?.agentProfile ? (
                    <span
                      className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${profileColorClass(selectedConv.agentProfile.color)}`}
                    >
                      {selectedConv.agentProfile.icon} {selectedConv.agentProfile.name}
                    </span>
                  ) : (
                    <Bot size={16} className="text-gray-400 flex-shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {selectedConv ? getConversationTitle(selectedConv) : '...'}
                  </span>
                  {selectedConv?.model && (
                    <span className="flex-shrink-0 text-xs text-gray-400 font-mono hidden sm:inline">
                      {selectedConv.model}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={handleDetailRename}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Edit2 size={12} /> שנה שם
                  </button>
                  <button
                    onClick={handleDetailDelete}
                    disabled={deleteConv.isPending}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={12} /> מחק שיחה
                  </button>
                </div>
              </div>

              {/* Rename inline in detail header (when triggered from detail) */}
              {renamingId === selectedId && (
                <div className="flex-shrink-0 px-4 py-2 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <Edit2 size={13} className="text-blue-500 flex-shrink-0" />
                  <input
                    autoFocus
                    defaultValue={selectedConv?.title ?? ''}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameSubmit(selectedId, (e.target as HTMLInputElement).value.trim());
                      if (e.key === 'Escape') handleRenameCancel();
                    }}
                    onBlur={e => handleRenameSubmit(selectedId, e.target.value.trim())}
                    className="flex-1 text-sm border border-blue-300 rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="כותרת השיחה..."
                  />
                  <button onClick={handleRenameCancel} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {detailLoading ? (
                  <div className="flex flex-col gap-3 animate-pulse">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`flex gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />
                        <div
                          className={`h-10 rounded-2xl bg-gray-200 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : !detail?.messages?.length ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                    <MessageSquare className="w-8 h-8 opacity-30" />
                    <p className="text-sm">אין הודעות בשיחה זו</p>
                  </div>
                ) : (
                  <>
                    {detail.messages.map((msg, idx) => (
                      <MessageBubble key={idx} message={msg} />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Detail footer — conversation meta */}
              {detail && (
                <div className="flex-shrink-0 px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Hash size={11} />
                    {detail._count?.messages ?? detail.messages?.length ?? 0} הודעות
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    נוצר: {formatDate(detail.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    עודכן: {formatDate(detail.updatedAt)} {formatTime(detail.updatedAt)}
                  </span>
                  {detail.domain && (
                    <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                      {detail.domain}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
