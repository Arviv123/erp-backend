/**
 * MobileLoginPage — כניסת עובד עם ת.ז. + PIN 6 ספרות
 * Full-screen mobile-first UI, RTL Hebrew
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mobileApi } from '../lib/mobileApi';
import { useMobileAuth } from '../contexts/MobileAuthContext';

export default function MobileLoginPage() {
  const navigate  = useNavigate();
  const { login } = useMobileAuth();
  const [searchParams] = useSearchParams();

  const [tenantId,  setTenantId]  = useState(searchParams.get('t') ?? '');
  const [idNumber,  setIdNumber]  = useState('');
  const [pin,       setPin]       = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [step,      setStep]      = useState<'tenant'|'id'|'pin'>( searchParams.get('t') ? 'id' : 'tenant');

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await mobileApi.post('/employees/mobile-login', { idNumber, pin, tenantId });
      const { token, employee } = res.data;
      login(token, employee);
      navigate('/m/home', { replace: true });
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'שגיאה בכניסה. בדוק את הפרטים.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const pressPad = (d: string) => {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < 6) {
      const next = pin + d;
      setPin(next);
      if (next.length === 6) setTimeout(() => handleSubmit(), 300);
    }
  };

  const padDigits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const canNext = step === 'tenant' ? tenantId.trim().length > 5
    : step === 'id' ? idNumber.length === 9
    : pin.length === 6;

  return (
    <div dir="rtl" className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg,#1e3a8a 0%,#1d4ed8 45%,#2563eb 100%)' }}>

      {/* Top hero */}
      <div className="flex flex-col items-center justify-center pt-16 pb-10 px-6 text-center">
        {/* Logo circle */}
        <div className="w-20 h-20 rounded-[24px] bg-white/15 backdrop-blur flex items-center justify-center mb-5 shadow-xl border border-white/20">
          <span className="text-3xl font-black text-white tracking-tight">ESS</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">פורטל עובד</h1>
        <p className="text-blue-200 text-sm mt-1 font-medium">כניסה מאובטחת</p>

        {/* Progress dots */}
        <div className="flex gap-2 mt-6">
          {['tenant','id','pin'].map((s,i) => (
            <div key={s} className={`rounded-full transition-all duration-300 ${
              step === s ? 'w-6 h-2 bg-white' : i < ['tenant','id','pin'].indexOf(step) ? 'w-2 h-2 bg-white/60' : 'w-2 h-2 bg-white/25'
            }`} />
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 bg-white rounded-t-[32px] px-6 pt-8 pb-6 flex flex-col shadow-[0_-8px_40px_rgba(0,0,0,0.15)]">

        {/* ── Step 1: Tenant ── */}
        {step === 'tenant' && (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">שלב 1</p>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">קוד החברה</h2>
            <p className="text-gray-400 text-sm mb-6">הזן את קוד החברה שקיבלת מהמעסיק</p>
            <input
              type="text"
              dir="ltr"
              autoFocus
              value={tenantId}
              onChange={e => setTenantId(e.target.value.trim())}
              placeholder="cm..."
              className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-2xl px-5 py-4 text-lg font-mono text-gray-900 outline-none transition-colors"
            />
            {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
            <div className="flex-1" />
            <button
              onClick={() => { setError(''); setStep('id'); }}
              disabled={!canNext}
              className="w-full bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-[0.98] shadow-lg shadow-blue-200"
            >
              המשך →
            </button>
          </div>
        )}

        {/* ── Step 2: ID number ── */}
        {step === 'id' && (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">שלב 2</p>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">מספר תעודת זהות</h2>
            <p className="text-gray-400 text-sm mb-6">9 ספרות, ללא ספרת ביקורת</p>
            <input
              type="tel"
              dir="ltr"
              autoFocus
              inputMode="numeric"
              maxLength={9}
              value={idNumber}
              onChange={e => setIdNumber(e.target.value.replace(/\D/g,''))}
              placeholder="123456789"
              className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-2xl px-5 py-4 text-2xl font-mono tracking-[0.2em] text-center text-gray-900 outline-none transition-colors"
            />
            {/* Progress bar */}
            <div className="w-full h-1 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(idNumber.length/9)*100}%` }} />
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">{idNumber.length}/9 ספרות</p>
            {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
            <div className="flex-1" />
            <div className="flex gap-3">
              <button onClick={() => setStep('tenant')} className="px-5 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold">
                ← חזרה
              </button>
              <button
                onClick={() => { setError(''); setStep('pin'); }}
                disabled={!canNext}
                className="flex-1 bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-[0.98] shadow-lg shadow-blue-200"
              >
                המשך →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: PIN ── */}
        {step === 'pin' && (
          <div className="flex flex-col flex-1">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">שלב 3</p>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">קוד PIN אישי</h2>
            <p className="text-gray-400 text-sm mb-5">6 ספרות — נקבע ע"י מחלקת משאבי אנוש</p>

            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-6">
              {Array.from({length:6},(_,i)=>(
                <div key={i} className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl transition-all duration-150 ${
                  i < pin.length
                    ? 'bg-blue-600 shadow-lg shadow-blue-200 scale-105'
                    : 'bg-gray-100 border-2 border-gray-200'
                }`}>
                  {i < pin.length && <span className="text-white text-2xl leading-none">●</span>}
                </div>
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3">
              {padDigits.map((d,i)=>(
                <button
                  key={i}
                  type="button"
                  onClick={() => d && pressPad(d)}
                  disabled={loading}
                  className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-90 ${
                    d==='' ? 'opacity-0 cursor-default' :
                    d==='⌫' ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 text-xl' :
                    'bg-gray-50 text-gray-900 hover:bg-blue-50 hover:text-blue-700 border border-gray-100 shadow-sm'
                  }`}
                >
                  {loading && i===10 ? '...' : d}
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-4 py-3 text-center font-medium">
                {error}
              </div>
            )}

            <button onClick={() => setStep('id')} className="mt-4 text-gray-400 text-sm text-center">
              ← חזרה
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-5 pb-2">
          שכחת PIN? פנה למחלקת משאבי אנוש
        </p>
      </div>
    </div>
  );
}
