import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

async function getEmployees() {
  const res = await api.get('/employees', { params: { isActive: true, pageSize: 100 } });
  return res.data;
}

async function getPreview(employeeId: string) {
  const res = await api.get(`/payroll/preview/${employeeId}`);
  return res.data;
}

export default function PayrollPreviewPage() {
  const [selectedId, setSelectedId] = useState('');
  const [fetchId, setFetchId]       = useState('');

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: getEmployees,
  });

  const employees = Array.isArray(empData) ? empData : Array.isArray(empData?.data) ? empData.data : [];

  const { data: previewData, isLoading, error } = useQuery({
    queryKey: ['payroll-preview', fetchId],
    queryFn: () => getPreview(fetchId),
    enabled: !!fetchId,
  });

  const preview = previewData?.data ?? previewData;

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">מחשבון שכר</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-lg">
        <div className="flex gap-3 mb-6">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
            <option value="">בחר עובד...</option>
            {employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName}
              </option>
            ))}
          </select>
          <button
            onClick={() => setFetchId(selectedId)}
            disabled={!selectedId || isLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            <Calculator className="w-4 h-4" />
            חשב
          </button>
        </div>

        {isLoading && <div className="text-gray-500 text-sm text-center py-6">מחשב...</div>}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            שגיאה בטעינת תחזית
          </div>
        )}

        {preview && !isLoading && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-700">שכר ברוטו</span>
              <span className="font-semibold">{fmtCurrency(preview.grossSalary)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-red-600">
              <span>מס הכנסה</span>
              <span>({fmtCurrency(preview.incomeTax)})</span>
            </div>
            <div className="flex justify-between py-1.5 text-red-600">
              <span>ביטוח לאומי עובד</span>
              <span>({fmtCurrency(preview.nationalInsuranceEmployee ?? preview.nationalInsurance ?? 0)})</span>
            </div>
            <div className="flex justify-between py-1.5 text-red-600">
              <span>פנסיה עובד</span>
              <span>({fmtCurrency(preview.pensionEmployee ?? preview.pension ?? 0)})</span>
            </div>
            <div className="flex justify-between py-3 border-t-2 border-gray-200 font-bold text-base">
              <span>נטו לתשלום</span>
              <span className="text-green-700">{fmtCurrency(preview.netSalary)}</span>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 bg-blue-50 rounded-lg p-3 space-y-1.5 text-xs text-blue-700">
              <p className="font-semibold mb-1">עלויות מעסיק:</p>
              {preview.pensionEmployer > 0 && (
                <div className="flex justify-between">
                  <span>פנסיה מעסיק</span>
                  <span>{fmtCurrency(preview.pensionEmployer)}</span>
                </div>
              )}
              {preview.nationalInsuranceEmployer > 0 && (
                <div className="flex justify-between">
                  <span>ביטוח לאומי מעסיק</span>
                  <span>{fmtCurrency(preview.nationalInsuranceEmployer)}</span>
                </div>
              )}
              {preview.severancePay > 0 && (
                <div className="flex justify-between">
                  <span>פיצויים</span>
                  <span>{fmtCurrency(preview.severancePay)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
