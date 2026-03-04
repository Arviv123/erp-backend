import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import platformApi from '../../lib/platformApi';
import PlatformLayout from '../../components/PlatformLayout';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';

interface PlatformAdminRecord {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export default function PlatformAdminsPage() {
  const { admin: currentAdmin } = usePlatformAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ email: '', password: '', name: '' });
  const [newError, setNewError] = useState('');
  const [newLoading, setNewLoading] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<PlatformAdminRecord | null>(null);

  const { data: admins = [], isLoading } = useQuery<PlatformAdminRecord[]>({
    queryKey: ['platform-admins'],
    queryFn: async () => (await platformApi.get('/admins')).data ?? [],
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => platformApi.patch(`/admins/${id}/deactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-admins'] }); setConfirmDeactivate(null); },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => platformApi.patch(`/admins/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-admins'] }),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewError(''); setNewLoading(true);
    try {
      await platformApi.post('/admins', newForm);
      qc.invalidateQueries({ queryKey: ['platform-admins'] });
      setNewForm({ email: '', password: '', name: '' });
      setShowNew(false);
    } catch (err: any) {
      setNewError(err.response?.data?.error ?? 'שגיאה ביצירת מנהל');
    } finally {
      setNewLoading(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNewForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <PlatformLayout>
      <div className="px-6 py-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">מנהלי פלטפורמה</h1>
            <p className="text-slate-400 text-sm mt-0.5">בעלי גישה לממשק ניהול הפלטפורמה</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="text-base leading-none">+</span> מנהל חדש
          </button>
        </div>

        {/* Warning */}
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
          <div>
            <p className="text-amber-300 font-semibold text-sm">אזהרת אבטחה</p>
            <p className="text-amber-400/80 text-xs mt-0.5">מנהלי פלטפורמה יש להם גישה מלאה לכל הנתונים בכל העסקים. הוסף מנהלים חדשים בזהירות מרבית.</p>
          </div>
        </div>

        {/* Admins list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-slate-800/30 rounded-2xl h-20 animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {admins.map(admin => (
              <div key={admin.id} className={`bg-slate-900/50 border rounded-2xl p-5 flex items-center gap-4 transition ${
                admin.isActive ? 'border-slate-800/60' : 'border-slate-800/30 opacity-60'
              }`}>
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  admin.isActive
                    ? 'bg-gradient-to-br from-violet-700 to-indigo-800'
                    : 'bg-slate-700'
                }`}>
                  <span className="text-white font-bold text-lg">{admin.name[0]}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold">{admin.name}</p>
                    {admin.id === currentAdmin?.id && (
                      <span className="text-[10px] bg-violet-600/20 text-violet-300 border border-violet-600/30 px-2 py-0.5 rounded-full">אתה</span>
                    )}
                    {!admin.isActive && (
                      <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">לא פעיל</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm" dir="ltr">{admin.email}</p>
                  <p className="text-slate-600 text-xs mt-0.5">
                    נוצר: {new Date(admin.createdAt).toLocaleDateString('he-IL')}
                    {admin.lastLoginAt && <> · כניסה אחרונה: {new Date(admin.lastLoginAt).toLocaleDateString('he-IL')}</>}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0">
                  {admin.id !== currentAdmin?.id && (
                    admin.isActive ? (
                      <button
                        onClick={() => setConfirmDeactivate(admin)}
                        className="text-slate-500 hover:text-red-400 text-sm px-3 py-2 rounded-xl hover:bg-red-900/10 transition"
                      >
                        השבת
                      </button>
                    ) : (
                      <button
                        onClick={() => activateMutation.mutate(admin.id)}
                        className="text-slate-500 hover:text-emerald-400 text-sm px-3 py-2 rounded-xl hover:bg-emerald-900/10 transition"
                      >
                        הפעל
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New admin modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white">מנהל פלטפורמה חדש</h3>
              <button onClick={() => setShowNew(false)} className="text-slate-500 hover:text-white transition w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {[
                { label: 'שם מלא *', key: 'name' },
                { label: 'אימייל *', key: 'email', type: 'email' },
                { label: 'סיסמה *', key: 'password', type: 'password' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                  <input type={type ?? 'text'} value={(newForm as any)[key]} onChange={set(key)} required
                    dir={type ? 'ltr' : 'rtl'}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              ))}
              {newError && <p className="text-red-400 text-sm">{newError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl text-sm transition">ביטול</button>
                <button type="submit" disabled={newLoading} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                  {newLoading ? 'יוצר...' : 'צור מנהל'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {confirmDeactivate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl" dir="rtl">
            <h3 className="text-base font-bold text-white mb-2">השבתת מנהל</h3>
            <p className="text-slate-400 text-sm mb-5">
              האם להשבית את <strong className="text-white">{confirmDeactivate.name}</strong>?<br />
              <span className="text-slate-500 text-xs">הגישה שלו לפלטפורמה תיחסם מיידית.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeactivate(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl text-sm transition">ביטול</button>
              <button
                onClick={() => deactivateMutation.mutate(confirmDeactivate.id)}
                disabled={deactivateMutation.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition"
              >
                השבת
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformLayout>
  );
}
