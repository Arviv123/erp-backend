import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Plus, Pencil, Trash2, Copy, Check, X, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import api from '../lib/api';

// ---- Types ----
interface RfidReader {
  id: string;
  name: string;
  location: string;
  readerType: 'FIXED' | 'HANDHELD' | 'PORTAL' | 'TUNNEL';
  ipAddress?: string;
  isActive: boolean;
  lastPingAt?: string;
  apiKey?: string;
}

interface ReaderFormData {
  name: string;
  location: string;
  readerType: 'FIXED' | 'HANDHELD' | 'PORTAL' | 'TUNNEL';
  ipAddress: string;
}

const DEFAULT_FORM: ReaderFormData = {
  name: '',
  location: '',
  readerType: 'FIXED',
  ipAddress: '',
};

// ---- Styles ----
const TYPE_STYLE: Record<string, string> = {
  FIXED: 'bg-blue-100 text-blue-700',
  HANDHELD: 'bg-purple-100 text-purple-700',
  PORTAL: 'bg-green-100 text-green-700',
  TUNNEL: 'bg-orange-100 text-orange-700',
};
const TYPE_LABEL: Record<string, string> = {
  FIXED: 'קבוע',
  HANDHELD: 'נייד',
  PORTAL: 'פורטל',
  TUNNEL: 'מנהרה',
};

// ---- API calls ----
async function getReaders(): Promise<RfidReader[]> {
  const res = await api.get('/rfid/readers');
  const d = res.data;
  return Array.isArray(d) ? d : Array.isArray(d?.readers) ? d.readers : [];
}

async function createReader(body: ReaderFormData): Promise<{ reader: RfidReader; apiKey: string }> {
  const res = await api.post('/rfid/readers', body);
  return res.data;
}

async function updateReader({ id, body }: { id: string; body: Partial<ReaderFormData> }) {
  const res = await api.patch(`/rfid/readers/${id}`, body);
  return res.data;
}

async function deleteReader(id: string) {
  const res = await api.delete(`/rfid/readers/${id}`);
  return res.data;
}

// ---- Copy button ----
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: ignore
    }
  };
  return (
    <button
      onClick={handleCopy}
      title="העתק"
      className="p-1 text-gray-400 hover:text-gray-700 transition"
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ---- Modal ----
function ReaderModal({
  initial,
  onClose,
  onSave,
  isLoading,
}: {
  initial: Partial<ReaderFormData> & { id?: string };
  onClose: () => void;
  onSave: (data: ReaderFormData & { id?: string }) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<ReaderFormData>({
    name: initial.name ?? '',
    location: initial.location ?? '',
    readerType: initial.readerType ?? 'FIXED',
    ipAddress: initial.ipAddress ?? '',
  });

  const set = (key: keyof ReaderFormData, val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {initial.id ? 'עריכת קורא' : 'הוספת קורא חדש'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); onSave({ ...form, id: initial.id }); }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">שם קורא *</label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="קורא כניסה ראשי"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">מיקום *</label>
            <input
              required
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="שער כניסה, מחסן A..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">סוג קורא *</label>
            <select
              value={form.readerType}
              onChange={e => set('readerType', e.target.value as ReaderFormData['readerType'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="FIXED">קבוע (FIXED)</option>
              <option value="HANDHELD">נייד (HANDHELD)</option>
              <option value="PORTAL">פורטל (PORTAL)</option>
              <option value="TUNNEL">מנהרה (TUNNEL)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">כתובת IP</label>
            <input
              value={form.ipAddress}
              onChange={e => set('ipAddress', e.target.value)}
              placeholder="192.168.1.100"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isLoading ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Page ----
export default function RfidReadersPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; reader?: RfidReader }>({ open: false });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<{ readerName: string; key: string } | null>(null);

  const { data: readers = [], isLoading, error } = useQuery<RfidReader[]>({
    queryKey: ['rfid-readers'],
    queryFn: getReaders,
  });

  const createMut = useMutation({
    mutationFn: createReader,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['rfid-readers'] });
      setModal({ open: false });
      if (result?.apiKey) {
        setNewApiKey({ readerName: result.reader?.name ?? 'קורא חדש', key: result.apiKey });
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: updateReader,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-readers'] }); setModal({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteReader,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rfid-readers'] }); setConfirmId(null); },
  });

  const handleSave = (data: ReaderFormData & { id?: string }) => {
    const { id, ...body } = data;
    if (id) {
      updateMut.mutate({ id, body });
    } else {
      createMut.mutate(body as ReaderFormData);
    }
  };

  const isMutating = createMut.isPending || updateMut.isPending;

  const fmtPing = (ts?: string) => {
    if (!ts) return 'לא ידוע';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'לפני פחות מדקה';
    if (mins < 60) return `לפני ${mins} דקות`;
    const hrs = Math.floor(mins / 60);
    return `לפני ${hrs} שעות`;
  };

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Radio className="w-5 h-5 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">קוראי RFID</h1>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          הוסף קורא
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">שגיאה בטעינת קוראים</p>
        </div>
      )}

      {/* New API Key callout */}
      {newApiKey && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">
                קורא "{newApiKey.readerName}" נוצר בהצלחה
              </p>
              <p className="text-xs text-amber-700 mb-3">
                שמור את מפתח ה-API — לא יוצג שוב!
              </p>
              <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-gray-800 break-all">{newApiKey.key}</code>
                <CopyButton text={newApiKey.key} />
              </div>
            </div>
            <button onClick={() => setNewApiKey(null)} className="text-amber-600 hover:text-amber-800 mr-3">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-52">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-5" />
              <div className="h-3 bg-gray-100 rounded mb-2" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : readers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
          <Radio className="w-10 h-10" />
          <p>אין קוראים רשומים במערכת</p>
          <button
            onClick={() => setModal({ open: true })}
            className="text-purple-600 hover:text-purple-800 text-sm font-medium"
          >
            + הוסף קורא ראשון
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {readers.map(reader => (
            <div key={reader.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
              {/* Top */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{reader.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{reader.location}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_STYLE[reader.readerType] ?? 'bg-gray-100 text-gray-600'}`}>
                  {TYPE_LABEL[reader.readerType] ?? reader.readerType}
                </span>
              </div>

              {/* IP */}
              {reader.ipAddress && (
                <p className="text-xs font-mono text-gray-500 mb-3">{reader.ipAddress}</p>
              )}

              {/* Status */}
              <div className="flex items-center gap-2 mb-4">
                {reader.isActive ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-green-700 font-medium">פעיל</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500">לא פעיל</span>
                  </>
                )}
                <span className="text-xs text-gray-400 mr-auto">
                  עדכון: {fmtPing(reader.lastPingAt)}
                </span>
              </div>

              {/* API Key */}
              {reader.apiKey && (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 mb-4">
                  <code className="text-xs font-mono text-gray-600 truncate flex-1">
                    {'•'.repeat(20)}
                  </code>
                  <CopyButton text={reader.apiKey} />
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-gray-100 pt-3 flex items-center gap-2">
                <button
                  onClick={() => setModal({ open: true, reader })}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  עריכה
                </button>
                <button
                  onClick={() => setConfirmId(reader.id)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition mr-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  מחיקה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <ReaderModal
          initial={modal.reader ?? DEFAULT_FORM}
          onClose={() => setModal({ open: false })}
          onSave={handleSave}
          isLoading={isMutating}
        />
      )}

      {/* Confirm delete */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">מחיקת קורא</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              האם אתה בטוח שברצונך למחוק קורא זה? כל האירועים המשויכים יישמרו.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                ביטול
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteMut.isPending ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
