import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, DollarSign, Pencil, Building2 } from 'lucide-react';
import api from '../lib/api';
import SalaryUpdateModal from '../components/SalaryUpdateModal';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const GENDER_LABEL: Record<string, string> = { M: 'זכר', F: 'נקבה', OTHER: 'אחר' };
const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'משרה מלאה', PART_TIME: 'משרה חלקית', HOURLY: 'שעתי', CONTRACTOR: 'קבלן',
};

async function getEmployee(id: string) {
  const res = await api.get(`/employees/${id}`);
  return res.data;
}

async function getPayrollPreview(employeeId: string) {
  const res = await api.get(`/payroll/preview/${employeeId}`);
  return res.data;
}

type TabKey = 'details' | 'salary' | 'preview' | 'extras';

// ─── Mobile PIN Section (in Extras tab) ─────────────────────────
function MobilePinSection({ employeeId }: { employeeId: string }) {
  const [pin,    setPin]    = useState('');
  const [done,   setDone]   = useState(false);
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  const handleSet = async () => {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) { setError('PIN חייב להיות 6 ספרות'); return; }
    setError('');
    setSaving(true);
    try {
      await api.post(`/employees/${employeeId}/set-pin`, { pin });
      setDone(true);
      setPin('');
      setTimeout(() => setDone(false), 4000);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'שגיאה בהגדרת PIN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-bold mb-1">📱 כניסה לפורטל עובד מובייל</p>
        <p className="text-xs">
          הגדר PIN בן 6 ספרות לעובד לכניסה לאפליקציה המובייל.
          העובד נכנס עם ת.ז. + PIN בכתובת: <span className="font-mono bg-blue-100 px-1 rounded">/m</span>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-700">הגדרת PIN מובייל</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PIN חדש (6 ספרות)</label>
          <input
            type="text"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="______"
            className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-lg tracking-widest text-center font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            dir="ltr"
          />
        </div>
        {error && <p className="text-red-600 text-xs">{error}</p>}
        {done  && <p className="text-green-600 text-xs">✓ PIN הוגדר בהצלחה!</p>}
        <button
          onClick={handleSet}
          disabled={saving || pin.length !== 6}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          {saving ? 'שומר...' : '🔑 הגדר PIN'}
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500">
        <p className="font-semibold mb-1">קוד חברה לשיתוף עם העובד:</p>
        <p className="font-mono bg-white border rounded px-2 py-1 text-gray-700 text-sm break-all">
          {typeof window !== 'undefined' ? window.location.hostname : 'app.company.com'}/m
        </p>
        <p className="mt-1">העובד יזין: ת.ז. + PIN + קוד חברה (tenantId מה-URL ה-current)</p>
      </div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [showSalaryModal, setShowSalaryModal] = useState(false);

  // Bank edit state
  const [editingBank, setEditingBank] = useState(false);
  const [bankName,      setBankName]      = useState('');
  const [branchCode,    setBranchCode]    = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const { data: empData, isLoading, error, refetch } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => getEmployee(id!),
    enabled: !!id,
  });

  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ['payroll-preview', id],
    queryFn: () => getPayrollPreview(id!),
    enabled: !!id && activeTab === 'preview',
  });

  const employee = empData?.data ?? empData;
  const preview  = previewData?.data ?? previewData;

  const bankMutation = useMutation({
    mutationFn: (data: { bank: string; branchCode: string; accountNumber: string }) =>
      api.patch(`/employees/${id}/bank`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', id] });
      setEditingBank(false);
    },
  });

  const startBankEdit = () => {
    const ba = employee?.bankAccount as any;
    setBankName(ba?.bank ?? '');
    setBranchCode(ba?.branchCode ?? '');
    setAccountNumber(ba?.accountNumber ?? '');
    setEditingBank(true);
  };

  if (isLoading) return <div className="flex items-center justify-center h-60 text-gray-500">טוען עובד...</div>;
  if (error || !employee) return <div className="flex items-center justify-center h-60 text-red-500">שגיאה בטעינת עובד</div>;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details', label: 'פרטים' },
    { key: 'salary',  label: 'שכר' },
    { key: 'preview', label: 'תחזית תלוש' },
    { key: 'extras',  label: '📱 גישה מובייל' },
  ];

  return (
    <div dir="rtl">
      {/* Back */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/employees')} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {employee.firstName} {employee.lastName}
        </h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            employee.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {employee.isActive ? 'פעיל' : 'לא פעיל'}
        </span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-600 text-sm">{employee.jobTitle ?? '—'}</p>
            <p className="text-gray-500 text-sm">{employee.department ?? '—'}</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-400">שכר ברוטו</p>
            <p className="text-xl font-bold text-gray-900">{fmtCurrency(employee.grossSalary)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 bg-white rounded-t-xl px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 border-t-0 p-6">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">שם מלא</p>
              <p className="font-medium">{employee.firstName} {employee.lastName}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">מספר ת.ז.</p>
              <p className="font-medium">{employee.idNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">תאריך לידה</p>
              <p className="font-medium">{fmtDate(employee.birthDate)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">מגדר</p>
              <p className="font-medium">{GENDER_LABEL[employee.gender] ?? employee.gender ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">טלפון</p>
              <p className="font-medium">{employee.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">אימייל אישי</p>
              <p className="font-medium">{employee.personalEmail ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">כתובת</p>
              <p className="font-medium">
                {employee.address
                  ? `${employee.address.street}, ${employee.address.city}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">תאריך תחילת עבודה</p>
              <p className="font-medium">{fmtDate(employee.startDate)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">תפקיד</p>
              <p className="font-medium">{employee.jobTitle ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">מחלקה</p>
              <p className="font-medium">{employee.department ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">סוג העסקה</p>
              <p className="font-medium">{EMPLOYMENT_LABEL[employee.employmentType] ?? employee.employmentType ?? '—'}</p>
            </div>
          </div>

          {/* Bank Account Section */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-700">חשבון בנק לתשלום שכר</h3>
              </div>
              {!editingBank && (
                <button onClick={startBankEdit}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Pencil className="w-3.5 h-3.5" />ערוך
                </button>
              )}
            </div>

            {editingBank ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">בנק</p>
                  <select value={bankName} onChange={e => setBankName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="">בחר בנק...</option>
                    <option value="בנק לאומי">בנק לאומי (10)</option>
                    <option value="בנק הפועלים">בנק הפועלים (12)</option>
                    <option value="בנק מזרחי טפחות">בנק מזרחי טפחות (20)</option>
                    <option value="בנק דיסקונט">בנק דיסקונט (11)</option>
                    <option value="הבנק הבינלאומי">הבנק הבינלאומי (31)</option>
                    <option value="בנק יהב">בנק יהב (04)</option>
                    <option value="בנק אוצר החייל">בנק אוצר החייל (14)</option>
                    <option value="בנק מרכנתיל">בנק מרכנתיל (17)</option>
                    <option value="בנק הדואר">בנק הדואר (09)</option>
                    <option value="אחר">אחר</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">מספר סניף</p>
                  <input value={branchCode} onChange={e => setBranchCode(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="123" maxLength={4} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">מספר חשבון</p>
                  <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="123456789" maxLength={9} />
                </div>
                <div className="md:col-span-3 flex gap-2 mt-1">
                  <button
                    onClick={() => bankMutation.mutate({ bank: bankName, branchCode, accountNumber })}
                    disabled={bankMutation.isPending || !bankName || !branchCode || !accountNumber}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition">
                    {bankMutation.isPending ? 'שומר...' : 'שמור'}
                  </button>
                  <button onClick={() => setEditingBank(false)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-1.5 rounded-lg transition">
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const ba = employee.bankAccount as any;
                return ba?.bank ? (
                  <div className="flex gap-6 text-sm">
                    <div><p className="text-xs text-gray-400">בנק</p><p className="font-medium">{ba.bank}</p></div>
                    <div><p className="text-xs text-gray-400">סניף</p><p className="font-medium">{ba.branchCode}</p></div>
                    <div><p className="text-xs text-gray-400">חשבון</p><p className="font-medium">{ba.accountNumber}</p></div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">לא הוזנו פרטי בנק — לחץ "ערוך" להוספה</p>
                );
              })()
            )}
          </div>
          </>
        )}

        {/* Salary Tab */}
        {activeTab === 'salary' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-gray-500 text-sm">שכר ברוטו נוכחי</p>
                <p className="text-3xl font-bold text-gray-900">{fmtCurrency(employee.grossSalary)}</p>
              </div>
              <button
                onClick={() => setShowSalaryModal(true)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                <DollarSign className="w-4 h-4" />
                עדכן שכר
              </button>
            </div>

            {/* Salary history */}
            {employee.salaryHistory && employee.salaryHistory.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">היסטוריית שכר</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">תאריך</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">שכר קודם</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">שכר חדש</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">סיבה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employee.salaryHistory.map((h: any) => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{fmtDate(h.effectiveDate ?? h.createdAt)}</td>
                        <td className="px-3 py-2">{fmtCurrency(h.previousSalary)}</td>
                        <td className="px-3 py-2 font-medium">{fmtCurrency(h.newSalary)}</td>
                        <td className="px-3 py-2 text-gray-500">{h.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">אין היסטוריית שכר</p>
            )}
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === 'preview' && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">תחזית תלוש שכר</h3>
            {previewLoading ? (
              <div className="text-gray-500 text-sm">מחשב...</div>
            ) : preview ? (
              <div className="max-w-xs bg-gray-50 rounded-lg p-5 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">שכר ברוטו</span>
                  <span className="font-medium">{fmtCurrency(preview.grossSalary)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>מס הכנסה</span>
                  <span>({fmtCurrency(preview.incomeTax)})</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>ביטוח לאומי</span>
                  <span>({fmtCurrency(preview.nationalInsurance)})</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>פנסיה עובד</span>
                  <span>({fmtCurrency(preview.pension)})</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
                  <span>נטו לתשלום</span>
                  <span className="text-green-700">{fmtCurrency(preview.netSalary)}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">לא ניתן לטעון תחזית</p>
            )}
          </div>
        )}

        {/* Extras Tab — Mobile Access + PIN */}
        {activeTab === 'extras' && (
          <MobilePinSection employeeId={employee.id} />
        )}
      </div>

      {/* Salary Modal */}
      {showSalaryModal && (
        <SalaryUpdateModal
          employee={employee}
          onClose={() => setShowSalaryModal(false)}
          onSuccess={() => { setShowSalaryModal(false); refetch(); }}
        />
      )}
    </div>
  );
}
