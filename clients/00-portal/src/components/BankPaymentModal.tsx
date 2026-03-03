import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';

interface Props {
  run: any;
  payslips: any[];
  onClose: () => void;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export default function BankPaymentModal({ run, payslips, onClose }: Props) {
  const qc = useQueryClient();

  const payMutation = useMutation({
    mutationFn: () => api.post(`/payroll/runs/${run.id}/paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-run', run.id] });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      onClose();
    },
  });

  const handleDownload = () => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '';
    // Use window.fetch with auth header to download CSV
    fetch(`${import.meta.env.VITE_API_URL ?? 'https://erp-backend-n433.onrender.com/api'}/payroll/runs/${run.id}/bank-export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = `salary-${run.period}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      });
  };

  const withBank    = payslips.filter(p => (p.employee?.bankAccount as any)?.bank);
  const withoutBank = payslips.filter(p => !(p.employee?.bankAccount as any)?.bank);
  const totalNet    = payslips.reduce((s, p) => s + Number(p.netSalary), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">ייצוא תשלום לבנק</h3>
            <p className="text-xs text-gray-500">שכר {run.period} — {payslips.length} עובדים</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Summary */}
        <div className="flex gap-4 px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex-1 text-center">
            <p className="text-2xl font-bold text-gray-900">{fmtCurrency(totalNet)}</p>
            <p className="text-xs text-gray-500">סה"כ לתשלום</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-2xl font-bold text-green-700">{withBank.length}</p>
            <p className="text-xs text-gray-500">עובדים עם בנק</p>
          </div>
          {withoutBank.length > 0 && (
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-red-600">{withoutBank.length}</p>
              <p className="text-xs text-gray-500">ללא פרטי בנק</p>
            </div>
          )}
        </div>

        {/* Warning */}
        {withoutBank.length > 0 && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold mb-1">חסרים פרטי בנק לעובדים הבאים:</p>
              <p>{withoutBank.map((p: any) => `${p.employee?.firstName} ${p.employee?.lastName}`).join(', ')}</p>
            </div>
          </div>
        )}

        {/* Payslips table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-3 py-2 font-medium text-gray-600">עובד</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">בנק</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">סניף</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">חשבון</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">נטו</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payslips.map((p: any) => {
                const ba  = p.employee?.bankAccount as any;
                const hasBank = ba?.bank;
                return (
                  <tr key={p.id} className={hasBank ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {p.employee?.firstName} {p.employee?.lastName}
                    </td>
                    {hasBank ? (
                      <>
                        <td className="px-3 py-2.5 text-gray-600">{ba.bank}</td>
                        <td className="px-3 py-2.5 text-gray-600">{ba.branchCode}</td>
                        <td className="px-3 py-2.5 text-gray-600 font-mono">{ba.accountNumber}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2.5 text-red-600 text-xs">
                        ⚠️ חסרים פרטי בנק
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-semibold text-green-700 text-left">
                      {fmtCurrency(Number(p.netSalary))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-gray-700">סה"כ</td>
                <td className="px-3 py-2 font-bold text-green-700 text-left">{fmtCurrency(totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 px-6 pb-5 pt-3 border-t border-gray-100">
          <button onClick={handleDownload}
            className="flex items-center gap-2 flex-1 justify-center bg-gray-800 hover:bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium transition">
            <Download className="w-4 h-4" />הורד CSV לבנק
          </button>
          {run.status === 'APPROVED' && (
            <button
              onClick={() => payMutation.mutate()}
              disabled={payMutation.isPending}
              className="flex items-center gap-2 flex-1 justify-center bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 rounded-xl text-sm font-semibold transition">
              <CheckCircle2 className="w-4 h-4" />
              {payMutation.isPending ? 'מעבד...' : 'סמן כשולם'}
            </button>
          )}
          <button onClick={onClose}
            className="px-5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm transition">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
