import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';

export default function PlatformLoginPage() {
  const navigate = useNavigate();
  const { login } = usePlatformAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/platform/dashboard', { replace: true });
    } catch {
      setError('פרטי הכניסה שגויים');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)' }}>
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center mb-4 shadow-2xl shadow-violet-900/50">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">פלטפורמת ניהול</h1>
          <p className="text-slate-400 text-sm mt-1">כניסה לממשק בעל הפלטפורמה</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 backdrop-blur shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5" dir="rtl">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@platform.com"
                required
                dir="ltr"
                className="w-full bg-slate-900/60 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                dir="ltr"
                className="w-full bg-slate-900/60 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              />
            </div>

            {error && (
              <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-violet-900/40 active:scale-[0.98]"
            >
              {loading ? 'מתחבר...' : 'כניסה לפלטפורמה'}
            </button>
          </form>

          <div className="border-t border-slate-700/40 mt-6 pt-4 flex items-center justify-between">
            <p className="text-xs text-slate-600">גישה מוגבלת לבעל הפלטפורמה בלבד</p>
            <Link to="/" className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center gap-1">
              ← כניסת עסק
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
