import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api';

async function createEmployee(body: Record<string, unknown>) {
  const res = await api.post('/employees', body);
  return res.data;
}

export default function NewEmployeePage() {
  const navigate = useNavigate();

  // Personal
  const [firstName,     setFirstName]     = useState('');
  const [lastName,      setLastName]      = useState('');
  const [idNumber,      setIdNumber]      = useState('');
  const [birthDate,     setBirthDate]     = useState('');
  const [gender,        setGender]        = useState<'M'|'F'|'OTHER'>('M');
  const [phone,         setPhone]         = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [street,        setStreet]        = useState('');
  const [city,          setCity]          = useState('');
  const [zip,           setZip]           = useState('');

  // Job
  const [startDate,       setStartDate]       = useState('');
  const [jobTitle,        setJobTitle]        = useState('');
  const [department,      setDepartment]      = useState('');
  const [employmentType,  setEmploymentType]  = useState<'FULL_TIME'|'PART_TIME'|'HOURLY'|'CONTRACTOR'>('FULL_TIME');

  // Salary
  const [grossSalary,     setGrossSalary]     = useState('');
  const [taxCredits,      setTaxCredits]      = useState('2.25');
  const [pensionFund,     setPensionFund]     = useState('');
  const [pensionEmployee, setPensionEmployee] = useState('6');
  const [pensionEmployer, setPensionEmployer] = useState('6.5');
  const [severancePay,    setSeverancePay]    = useState('8.33');

  // System user
  const [createUser, setCreateUser] = useState(false);
  const [userEmail,  setUserEmail]  = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole,   setUserRole]   = useState<'EMPLOYEE'|'HR_MANAGER'|'ACCOUNTANT'|'ADMIN'>('EMPLOYEE');

  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: (res: any) => {
      const id = res?.id ?? res?.data?.id;
      navigate(id ? `/employees/${id}` : '/employees');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || 'שגיאה ביצירת עובד');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const body: Record<string, unknown> = {
      firstName,
      lastName,
      idNumber,
      birthDate: birthDate ? new Date(birthDate).toISOString() : undefined,
      gender,
      phone,
      personalEmail,
      address: { street, city, zip: zip || undefined },
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      jobTitle,
      department,
      employmentType,
      grossSalary: Number(grossSalary),
      taxCredits: Number(taxCredits),
      pensionFund: pensionFund || undefined,
      pensionEmployee: Number(pensionEmployee),
      pensionEmployer: Number(pensionEmployer),
      severancePay: Number(severancePay),
    };

    if (createUser) {
      body.createUser = true;
      body.userEmail = userEmail;
      body.userPassword = userPassword;
      body.userRole = userRole;
    }

    mutation.mutate(body);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4">
      <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );

  const Field = ({
    label, required, children,
  }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none";
  const selectCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white";

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/employees')} className="text-gray-400 hover:text-gray-600">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">הוספת עובד חדש</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Section 1 — Personal */}
        <Section title="פרטים אישיים">
          <Field label="שם פרטי" required>
            <input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)} required />
          </Field>
          <Field label="שם משפחה" required>
            <input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} required />
          </Field>
          <Field label="מספר ת.ז." required>
            <input className={inputCls} value={idNumber} onChange={e => setIdNumber(e.target.value)} required maxLength={9} placeholder="9 ספרות" />
          </Field>
          <Field label="תאריך לידה" required>
            <input type="date" className={inputCls} value={birthDate} onChange={e => setBirthDate(e.target.value)} required />
          </Field>
          <Field label="מגדר" required>
            <select className={selectCls} value={gender} onChange={e => setGender(e.target.value as 'M'|'F'|'OTHER')}>
              <option value="M">זכר</option>
              <option value="F">נקבה</option>
              <option value="OTHER">אחר</option>
            </select>
          </Field>
          <Field label="טלפון" required>
            <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} required placeholder="052-1234567" />
          </Field>
          <Field label="אימייל אישי" required>
            <input type="email" className={inputCls} value={personalEmail} onChange={e => setPersonalEmail(e.target.value)} required />
          </Field>
          <Field label="רחוב" required>
            <input className={inputCls} value={street} onChange={e => setStreet(e.target.value)} required />
          </Field>
          <Field label="עיר" required>
            <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} required />
          </Field>
          <Field label="מיקוד">
            <input className={inputCls} value={zip} onChange={e => setZip(e.target.value)} />
          </Field>
        </Section>

        {/* Section 2 — Job */}
        <Section title="פרטי עבודה">
          <Field label="תאריך התחלה" required>
            <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </Field>
          <Field label="תפקיד" required>
            <input className={inputCls} value={jobTitle} onChange={e => setJobTitle(e.target.value)} required />
          </Field>
          <Field label="מחלקה" required>
            <input className={inputCls} value={department} onChange={e => setDepartment(e.target.value)} required placeholder="טכנולוגיה / שיווק / מכירות..." />
          </Field>
          <Field label="סוג העסקה" required>
            <select className={selectCls} value={employmentType} onChange={e => setEmploymentType(e.target.value as any)}>
              <option value="FULL_TIME">משרה מלאה</option>
              <option value="PART_TIME">משרה חלקית</option>
              <option value="HOURLY">שעתי</option>
              <option value="CONTRACTOR">קבלן</option>
            </select>
          </Field>
        </Section>

        {/* Section 3 — Salary */}
        <Section title="שכר ופנסיה">
          <Field label="שכר ברוטו (₪)" required>
            <input type="number" className={inputCls} value={grossSalary} onChange={e => setGrossSalary(e.target.value)} required min="0" />
          </Field>
          <Field label="נקודות זיכוי מס">
            <input type="number" className={inputCls} value={taxCredits} onChange={e => setTaxCredits(e.target.value)} step="0.25" />
          </Field>
          <Field label="קרן פנסיה">
            <input className={inputCls} value={pensionFund} onChange={e => setPensionFund(e.target.value)} placeholder="שם הקרן (אופציונלי)" />
          </Field>
          <Field label="% פנסיה עובד">
            <input type="number" className={inputCls} value={pensionEmployee} onChange={e => setPensionEmployee(e.target.value)} step="0.5" />
          </Field>
          <Field label="% פנסיה מעסיק">
            <input type="number" className={inputCls} value={pensionEmployer} onChange={e => setPensionEmployer(e.target.value)} step="0.5" />
          </Field>
          <Field label="% פיצויים">
            <input type="number" className={inputCls} value={severancePay} onChange={e => setSeverancePay(e.target.value)} step="0.01" />
          </Field>
        </Section>

        {/* Section 4 — System user */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={createUser}
              onChange={e => setCreateUser(e.target.checked)}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-base font-semibold text-gray-900">צור משתמש מערכת לעובד</span>
          </label>
          {createUser && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="אימייל משתמש" required>
                <input type="email" className={inputCls} value={userEmail} onChange={e => setUserEmail(e.target.value)} required={createUser} />
              </Field>
              <Field label="סיסמה (מינ' 8 תווים)" required>
                <input type="password" className={inputCls} value={userPassword} onChange={e => setUserPassword(e.target.value)} required={createUser} minLength={8} />
              </Field>
              <Field label="תפקיד מערכת">
                <select className={selectCls} value={userRole} onChange={e => setUserRole(e.target.value as any)}>
                  <option value="EMPLOYEE">עובד</option>
                  <option value="HR_MANAGER">מנהל HR</option>
                  <option value="ACCOUNTANT">רואה חשבון</option>
                  <option value="ADMIN">מנהל מערכת</option>
                </select>
              </Field>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-start">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-6 py-2.5 rounded-lg transition"
          >
            {mutation.isPending ? 'שומר...' : 'צור עובד'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/employees')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-2.5 rounded-lg transition"
          >
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
