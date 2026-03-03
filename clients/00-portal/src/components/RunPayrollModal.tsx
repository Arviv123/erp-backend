/**
 * RunPayrollModal — הפעלת שכר חדש
 *
 * שלב 1: בחירת תקופה
 * שלב 2: adjustments לכל עובד (שע"נ, נסיעות, הבראה, בונוס, ניכוי ידני)
 * שלב 3: אישור + הרצה
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ChevronRight, ChevronLeft, AlertTriangle, Play } from 'lucide-react';
import api from '../lib/api';

interface Adjustment {
  overtime125Hours:    number;
  overtime150Hours:    number;
  travelWorkDays:      number;
  includeRecuperation: boolean;
  bonusAmount:         number;
  manualDeduction:     number;
}

const defaultAdj = (): Adjustment => ({
  overtime125Hours:    0,
  overtime150Hours:    0,
  travelWorkDays:      21,
  includeRecuperation: false,
  bonusAmount:         0,
  manualDeduction:     0,
});

const fmtC = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export default function RunPayrollModal({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment>>({});
  const [error, setError] = useState('');
  const qc = useQueryClient();

  // Load employees for step 2
  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-payroll'],
    queryFn: () => api.get('/employees?isActive=true&pageSize=200').then(r => r.data),
    enabled: step >= 2,
  });
  const employees: any[] = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];

  // Init adjustments for all employees if not set
  const getAdj = (empId: string): Adjustment =>
    adjustments[empId] ?? defaultAdj();

  const setAdj = (empId: string, field: keyof Adjustment, value: number | boolean) => {
    setAdjustments(prev => ({
      ...prev,
      [empId]: { ...getAdj(empId), [field]: value },
    }));
  };

  const mutation = useMutation({
    mutationFn: () => api.post('/payroll/run', {
      period,
      adjustments: Object.fromEntries(
        Object.entries(adjustments).filter(([, adj]) =>
          adj.overtime125Hours > 0 || adj.overtime150Hours > 0 ||
          adj.travelWorkDays !== 21 || adj.includeRecuperation ||
          adj.bonusAmount > 0 || adj.manualDeduction > 0
        )
      ),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || 'שגיאה בהפעלת שכר');
      setStep(3);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">הפעלת שכר חדש</h2>
          <div className="flex items-center gap-4">
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 text-xs">
              {[1, 2, 3].map(s => (
                <div key={s} className={`flex items-center gap-1.5 ${s > 1 ? 'mr-1' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s ? 'bg-indigo-600 text-white' :
                    step > s  ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>{s}</div>
                  <span className="text-gray-500 hidden sm:inline">
                    {s === 1 ? 'תקופה' : s === 2 ? 'תוספות' : 'אישור'}
                  </span>
                  {s < 3 && <ChevronLeft className="w-3 h-3 text-gray-300" />}
                </div>
              ))}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Period ── */}
          {step === 1 && (
            <div className="max-w-sm">
              <p className="text-sm text-gray-600 mb-5">
                בחר את תקופת השכר להפעלה. כל העובדים הפעילים ייכללו.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                תקופת שכר <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                שכר חודש זה ישולם עד ה-9 ל{period.split('-')[1] === '12' ? 'ינואר' : '...'} {
                  period.split('-')[1] === '12'
                    ? Number(period.split('-')[0]) + 1
                    : Number(period.split('-')[0])
                }
              </p>

              <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1.5">
                <p className="font-semibold">⚠ לפני הפעלת שכר:</p>
                <ul className="list-disc list-inside space-y-1 mr-2">
                  <li>וודא שנתוני העובדים (שכר, נקודות זיכוי, פנסיה) מעודכנים</li>
                  <li>שכר מינימום 2026: 6,300 ₪/חודש — עובד מתחת לכך יסומן</li>
                  <li>בשלב הבא תוכל להזין שעות נוספות, נסיעות, בונוסים</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 2: Adjustments per employee ── */}
          {step === 2 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                הזן תוספות לכל עובד לחודש <strong>{period}</strong>.
                שדות ריקים = ברירת מחדל (21 ימי נסיעה, 0 שעות נוספות).
              </p>

              {empLoading ? (
                <div className="flex items-center justify-center h-32 text-gray-400">טוען עובדים...</div>
              ) : employees.length === 0 ? (
                <div className="text-center text-red-600 py-4">לא נמצאו עובדים פעילים</div>
              ) : (
                <div className="space-y-3">
                  {/* Column headers */}
                  <div className="grid grid-cols-[180px_1fr] gap-3 text-xs font-semibold text-gray-500 uppercase pb-1 border-b border-gray-200">
                    <span>עובד</span>
                    <div className="grid grid-cols-6 gap-1.5">
                      <span>שע"נ 125%</span>
                      <span>שע"נ 150%</span>
                      <span>ימי נסיעה</span>
                      <span>הבראה</span>
                      <span>בונוס ₪</span>
                      <span>ניכוי ידני ₪</span>
                    </div>
                  </div>

                  {employees.map((emp: any) => {
                    const adj = getAdj(emp.id);
                    return (
                      <div key={emp.id} className="grid grid-cols-[180px_1fr] gap-3 items-center py-1.5 border-b border-gray-50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{fmtC(Number(emp.grossSalary))}</p>
                          {Number(emp.grossSalary) < 6300 && (
                            <span className="text-xs text-red-500 flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              מתחת לשכר מינימום
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-6 gap-1.5">
                          <input
                            type="number" min={0} step={0.5} placeholder="0"
                            value={adj.overtime125Hours || ''}
                            onChange={e => setAdj(emp.id, 'overtime125Hours', Number(e.target.value))}
                            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none w-full"
                          />
                          <input
                            type="number" min={0} step={0.5} placeholder="0"
                            value={adj.overtime150Hours || ''}
                            onChange={e => setAdj(emp.id, 'overtime150Hours', Number(e.target.value))}
                            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none w-full"
                          />
                          <input
                            type="number" min={0} max={31} placeholder="21"
                            value={adj.travelWorkDays !== 21 ? adj.travelWorkDays : ''}
                            onChange={e => setAdj(emp.id, 'travelWorkDays', Number(e.target.value) || 21)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none w-full"
                          />
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={adj.includeRecuperation}
                              onChange={e => setAdj(emp.id, 'includeRecuperation', e.target.checked)}
                              className="w-4 h-4 accent-indigo-600"
                              title="כלול הבראה חודשית (1/12)"
                            />
                          </div>
                          <input
                            type="number" min={0} placeholder="0"
                            value={adj.bonusAmount || ''}
                            onChange={e => setAdj(emp.id, 'bonusAmount', Number(e.target.value))}
                            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-indigo-400 outline-none w-full"
                          />
                          <input
                            type="number" min={0} placeholder="0"
                            value={adj.manualDeduction || ''}
                            onChange={e => setAdj(emp.id, 'manualDeduction', Number(e.target.value))}
                            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-orange-400 outline-none w-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Confirmation ── */}
          {step === 3 && (
            <div className="max-w-md">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-5">
                <p className="font-semibold text-indigo-800 mb-3">סיכום הפעלת שכר</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">תקופה:</span>
                    <span className="font-medium">{period}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">מספר עובדים:</span>
                    <span className="font-medium">{employees.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">עובדים עם תוספות:</span>
                    <span className="font-medium">{Object.keys(adjustments).filter(id =>
                      adjustments[id].overtime125Hours > 0 ||
                      adjustments[id].overtime150Hours > 0 ||
                      adjustments[id].bonusAmount > 0 ||
                      adjustments[id].includeRecuperation
                    ).length}</span>
                  </div>
                </div>
              </div>

              {/* Minimum wage warnings */}
              {employees.filter(e => Number(e.grossSalary) < 6300).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm">
                  <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    אזהרת שכר מינימום
                  </div>
                  <p className="text-red-600 text-xs">
                    העובדים הבאים מתחת לשכר מינימום (6,300 ₪):
                  </p>
                  <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                    {employees.filter(e => Number(e.grossSalary) < 6300).map(e => (
                      <li key={e.id}>{e.firstName} {e.lastName} — {fmtC(Number(e.grossSalary))}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">לאחר ההפעלה:</p>
                <ul className="list-disc list-inside space-y-0.5 mr-2">
                  <li>הריצה תיווצר בסטאטוס "טיוטה"</li>
                  <li>בדוק את תלושי השכר לפני אישור</li>
                  <li>לאחר אישור — שלם עד ה-9 לחודש הבא</li>
                  <li>שלח דוח ניכויים לרשות המסים עד ה-15</li>
                </ul>
              </div>

              {error && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={() => step > 1 ? setStep(s => (s - 1) as 1 | 2 | 3) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <ChevronRight className="w-4 h-4" />
            {step === 1 ? 'ביטול' : 'חזור'}
          </button>

          <button
            onClick={() => {
              if (step < 3) setStep(s => (s + 1) as 1 | 2 | 3);
              else mutation.mutate();
            }}
            disabled={mutation.isPending || (step === 1 && !period) || (step === 2 && empLoading)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium px-5 py-2 rounded-lg transition text-sm"
          >
            {step === 3
              ? (mutation.isPending
                  ? <>מעבד...</>
                  : <><Play className="w-4 h-4" />הפעל שכר</>
                )
              : <>המשך<ChevronLeft className="w-4 h-4" /></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
