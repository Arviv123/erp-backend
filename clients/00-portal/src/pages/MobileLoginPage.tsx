/**
 * MobileLoginPage — כניסת עובד עם ת.ז. + PIN 6 ספרות
 * Full-screen mobile-first UI, RTL Hebrew
 *
 * URL: /m/login   (or /m?redirect=...)
 * Public route — no auth required
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mobileApi } from '../lib/mobileApi';
import { useMobileAuth } from '../contexts/MobileAuthContext';

const COMPANY_CODE_HINT = 'קוד חברה (מסופק ע"י המעסיק)';

export default function MobileLoginPage() {
  const navigate  = useNavigate();
  const { login } = useMobileAuth();

  const [tenantId,  setTenantId]  = useState('');
  const [idNumber,  setIdNumber]  = useState('');
  const [pin,       setPin]       = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (idNumber.length !== 9) { setError('ת.ז. חייבת להיות 9 ספרות'); return; }
    if (pin.length !== 6)      { setError('PIN חייב להיות 6 ספרות'); return; }

    setLoading(true);
    try {
      const res = await mobileApi.post('/employees/mobile-login', { idNumber, pin, tenantId });
      const { token, employee } = res.data?.data ?? res.data;
      login(token, employee);
      navigate('/m/home', { replace: true });
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'שגיאה בכניסה. בדוק את הפרטים.');
    } finally {
      setLoading(false);
    }
  };

  // PIN keypad
  const pressPad = (d: string) => {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < 6) setPin(p => p + d);
  };

  const padDigits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 flex flex-col items-center justify-center px-4 py-8">

      {/* Logo / title */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-2xl font-black text-blue-700">ESS</span>
        </div>
        <h1 className="text-2xl font-bold text-white">פורטל עובד</h1>
        <p className="text-blue-200 text-sm mt-1">כניסה מאובטחת לעובדים</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Company code */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 text-right">קוד חברה</label>
            <input
              type="text"
              placeholder={COMPANY_CODE_HINT}
              value={tenantId}
              onChange={e => setTenantId(e.target.value.trim())}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
              dir="ltr"
              autoComplete="organization"
            />
          </div>

          {/* ID number */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 text-right">מספר ת.ז.</label>
            <input
              type="tel"
              placeholder="9 ספרות"
              value={idNumber}
              maxLength={9}
              onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg text-center tracking-widest focus:ring-2 focus:ring-blue-500 outline-none"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          {/* PIN display */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 text-right">PIN אישי (6 ספרות)</label>
            <div className="flex justify-center gap-2 mb-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-colors ${
                    i < pin.length
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-transparent'
                  }`}
                >
                  {i < pin.length ? '●' : '○'}
                </div>
              ))}
            </div>

            {/* PIN Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {padDigits.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => d && pressPad(d)}
                  className={`h-14 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
                    d === ''
                      ? 'opacity-0 cursor-default'
                      : d === '⌫'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-900 hover:bg-blue-50 hover:text-blue-700 border border-gray-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !tenantId || idNumber.length !== 9 || pin.length !== 6}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl text-base transition-all active:scale-98"
          >
            {loading ? 'מתחבר...' : 'כניסה →'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          שכחת PIN? פנה לצוות משאבי אנוש
        </p>
      </div>
    </div>
  );
}
