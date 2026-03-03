import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
const DEMO = { email: 'admin2@test.co.il', password: 'Admin1234!', tenantId: 'cmm95megs00014n265h3objd5' };
export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
  const [tenantId, setTenantId] = useState(DEMO.tenantId);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password, tenantId || undefined); }
    catch (err: any) { setError(err?.response?.data?.error || err?.message || 'שגיאת התחברות'); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8"><div className="text-4xl mb-2">⏰</div><h1 className="text-2xl font-bold text-gray-900">שעון נוכחות</h1><p className="text-gray-500 text-sm mt-1">מערכת נוכחות עובדים</p></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">מזהה טנאנט <span className="text-gray-400 font-normal">(אופציונלי)</span></label><input type="text" value={tenantId} onChange={e => setTenantId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" /></div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          {loading && <p className="text-center text-sm text-gray-500">מתחבר לשרת... (עשוי לקחת 30-60 שניות בהפעלה ראשונה)</p>}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg px-4 py-2.5 transition">{loading ? 'מתחבר...' : 'התחברות'}</button>
        </form>
      </div>
    </div>
  );
}
