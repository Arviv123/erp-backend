import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, XCircle, FileText, TrendingUp, Banknote, CreditCard, RotateCcw, BarChart2, X } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const fmtDateOnly = (d: string) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן',
  CREDIT_CARD: 'אשראי',
  TRANSFER: 'העברה',
  CHECK: "צ'ק",
  GIFT_CARD: 'כרטיס מתנה',
  OTHER: 'אחר',
};

interface HourData {
  hour: number;
  amount: number;
}

interface PaymentMethodData {
  method: string;
  amount: number;
  count: number;
}

interface XReportData {
  salesTotal: number;
  cashTotal: number;
  creditTotal: number;
  transactionCount: number;
  refundTotal: number;
  netTotal: number;
  byHour: HourData[];
  byPaymentMethod: PaymentMethodData[];
}

interface ZReportSummary {
  id: string;
  date: string;
  salesTotal: number;
  cashTotal: number;
  creditTotal: number;
  transactionCount: number;
  netTotal: number;
  closedBy: string;
}

type Tab = 'x' | 'z';

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function HourlyChart({ data }: { data: HourData[] }) {
  if (!data || data.length === 0) return <div className="text-center py-4 text-gray-400 text-sm">אין נתוני שעות</div>;

  const maxAmount = Math.max(...data.map(d => d.amount), 1);

  return (
    <div className="flex items-end gap-1 h-28">
      {Array.from({ length: 24 }, (_, h) => {
        const entry = data.find(d => d.hour === h);
        const amount = entry?.amount ?? 0;
        const heightPct = (amount / maxAmount) * 100;
        return (
          <div key={h} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className={`w-full rounded-t transition-all ${amount > 0 ? 'bg-blue-400 hover:bg-blue-500' : 'bg-gray-100'}`}
              style={{ height: `${Math.max(heightPct, amount > 0 ? 4 : 0)}%` }}
            />
            {h % 4 === 0 && (
              <span className="text-gray-400 text-[9px]">{h}:00</span>
            )}
            {amount > 0 && (
              <div className="hidden group-hover:block absolute bottom-full mb-1 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                {h}:00 — {fmtCurrency(amount)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function POSZReportPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('x');
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closeSessionId, setCloseSessionId] = useState('');
  const [closeError, setCloseError] = useState('');
  const [selectedZReport, setSelectedZReport] = useState<string | null>(null);

  // X-Report (current session)
  const {
    data: xReport,
    isLoading: xLoading,
    refetch: refetchX,
    isFetching: xFetching,
  } = useQuery<XReportData>({
    queryKey: ['pos-xreport'],
    queryFn: async () => {
      const res = await api.get('/pos/z-report/current');
      return res.data;
    },
    enabled: tab === 'x',
    refetchInterval: false,
  });

  // Past Z-reports
  const { data: zReports = [], isLoading: zLoading } = useQuery<ZReportSummary[]>({
    queryKey: ['pos-zreports'],
    queryFn: async () => {
      const res = await api.get('/pos/z-reports');
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
    enabled: tab === 'z',
  });

  // Single Z-report detail
  const { data: zDetail, isLoading: zDetailLoading } = useQuery({
    queryKey: ['pos-zreport-detail', selectedZReport],
    queryFn: async () => {
      const res = await api.get(`/pos/z-reports/${selectedZReport}`);
      return res.data;
    },
    enabled: !!selectedZReport,
  });

  const closeMutation = useMutation({
    mutationFn: (sessionId: string) => api.post('/pos/z-report/close', { sessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-xreport'] });
      queryClient.invalidateQueries({ queryKey: ['pos-zreports'] });
      setCloseConfirm(false);
      setCloseSessionId('');
      setCloseError('');
      setTab('z');
    },
    onError: () => setCloseError('שגיאה בסגירת הקופה. ודא שיש סשן פתוח.'),
  });

  const handleClose = () => {
    closeMutation.mutate(closeSessionId);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText className="text-blue-600" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">דוחות X / Z</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('x')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'x' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          X — סיכום נוכחי
        </button>
        <button
          onClick={() => setTab('z')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'z' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Z — סגירת קופה
        </button>
      </div>

      {/* X-Report Tab */}
      {tab === 'x' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-700">סיכום סשן נוכחי</h2>
            <button
              onClick={() => refetchX()}
              disabled={xFetching}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw size={15} className={xFetching ? 'animate-spin' : ''} />
              רענן
            </button>
          </div>

          {xLoading ? (
            <div className="text-center py-8 text-gray-500">טוען...</div>
          ) : !xReport ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
              <BarChart2 size={40} className="mx-auto mb-3 opacity-40" />
              <p>אין נתוני סשן נוכחי</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <SummaryCard
                  icon={<TrendingUp size={18} className="text-blue-600" />}
                  label='סה"כ מכירות'
                  value={fmtCurrency(xReport.salesTotal ?? 0)}
                  color="bg-blue-50"
                />
                <SummaryCard
                  icon={<Banknote size={18} className="text-green-600" />}
                  label='סה"כ מזומן'
                  value={fmtCurrency(xReport.cashTotal ?? 0)}
                  color="bg-green-50"
                />
                <SummaryCard
                  icon={<CreditCard size={18} className="text-purple-600" />}
                  label='סה"כ אשראי'
                  value={fmtCurrency(xReport.creditTotal ?? 0)}
                  color="bg-purple-50"
                />
                <SummaryCard
                  icon={<FileText size={18} className="text-orange-600" />}
                  label="מספר עסקאות"
                  value={String(xReport.transactionCount ?? 0)}
                  color="bg-orange-50"
                />
                <SummaryCard
                  icon={<RotateCcw size={18} className="text-red-600" />}
                  label="החזרות"
                  value={fmtCurrency(xReport.refundTotal ?? 0)}
                  color="bg-red-50"
                />
              </div>

              {/* Net total banner */}
              <div className="bg-gray-900 text-white rounded-xl p-5 flex items-center justify-between">
                <span className="text-gray-300 font-medium">נטו לתשלום</span>
                <span className="text-2xl font-bold">{fmtCurrency(xReport.netTotal ?? 0)}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment method breakdown */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">פירוט לפי אמצעי תשלום</h3>
                  {(!xReport.byPaymentMethod || xReport.byPaymentMethod.length === 0) ? (
                    <div className="text-center py-4 text-gray-400 text-sm">אין נתונים</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">אמצעי תשלום</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">עסקאות</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">סכום</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {xReport.byPaymentMethod.map((row) => (
                          <tr key={row.method} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {METHOD_LABELS[row.method] ?? row.method}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.count}</td>
                            <td className="px-3 py-2 font-semibold text-gray-900">{fmtCurrency(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Hourly chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">מכירות לפי שעה</h3>
                  <HourlyChart data={xReport.byHour ?? []} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Z-Report Tab */}
      {tab === 'z' && (
        <div className="space-y-6">
          {/* Close session section */}
          <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">סגירת קופה (Z)</h2>
            <p className="text-sm text-gray-500 mb-4">
              סגירת קופה תסיים את הסשן הנוכחי ותפיק דוח Z. פעולה זו אינה ניתנת לביטול.
            </p>
            <button
              onClick={() => { setCloseConfirm(true); setCloseError(''); }}
              className="bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 text-sm font-semibold flex items-center gap-2"
            >
              <XCircle size={16} />
              סגור קופה (Z)
            </button>
          </div>

          {/* Past Z-reports */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">דוחות Z קודמים</h2>
            </div>
            {zLoading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : zReports.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FileText size={40} className="mx-auto mb-3 opacity-40" />
                <p>אין דוחות Z</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">מכירות</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">מזומן</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">אשראי</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">עסקאות</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">נסגר ע"י</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">פרטים</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {zReports.map((report) => (
                      <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 text-xs">{fmtDateOnly(report.date)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(report.salesTotal)}</td>
                        <td className="px-4 py-3 text-gray-700">{fmtCurrency(report.cashTotal)}</td>
                        <td className="px-4 py-3 text-gray-700">{fmtCurrency(report.creditTotal)}</td>
                        <td className="px-4 py-3 text-gray-600">{report.transactionCount}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{report.closedBy || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedZReport(selectedZReport === report.id ? null : report.id)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            {selectedZReport === report.id ? 'סגור' : 'הצג'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Z-report detail */}
          {selectedZReport && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-800">פרטי דוח Z</h3>
                <button onClick={() => setSelectedZReport(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              {zDetailLoading ? (
                <div className="text-center py-6 text-gray-500">טוען...</div>
              ) : !zDetail ? (
                <div className="text-center py-6 text-gray-400 text-sm">לא נמצאו פרטים</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'תאריך', value: fmtDate(zDetail.date) },
                    { label: 'סה"כ מכירות', value: fmtCurrency(zDetail.salesTotal ?? 0) },
                    { label: 'מזומן', value: fmtCurrency(zDetail.cashTotal ?? 0) },
                    { label: 'אשראי', value: fmtCurrency(zDetail.creditTotal ?? 0) },
                    { label: 'מספר עסקאות', value: String(zDetail.transactionCount ?? 0) },
                    { label: 'החזרות', value: fmtCurrency(zDetail.refundTotal ?? 0) },
                    { label: 'נטו', value: fmtCurrency(zDetail.netTotal ?? 0) },
                    { label: 'נסגר ע"י', value: zDetail.closedBy || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg px-4 py-3">
                      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                      <p className="font-semibold text-gray-900 text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Close session confirm dialog */}
      {closeConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" dir="rtl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="text-red-600" size={22} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">סגירת קופה (Z)</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              האם לסגור את הקופה ולהפיק דוח Z? פעולה זו תסיים את כל העסקאות של הסשן הנוכחי ולא ניתנת לביטול.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">מזהה סשן (Session ID)</label>
              <input
                type="text"
                value={closeSessionId}
                onChange={e => setCloseSessionId(e.target.value)}
                placeholder="הזן מזהה סשן לסגירה..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <p className="text-xs text-gray-400 mt-1">ניתן להשתמש ב-Session ID מדוח ה-X שלמעלה</p>
            </div>
            {closeError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-4 text-sm">
                {closeError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={closeMutation.isPending || !closeSessionId.trim()}
                className="flex-1 bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <XCircle size={15} />
                {closeMutation.isPending ? 'סוגר...' : 'אשר סגירת קופה'}
              </button>
              <button
                onClick={() => { setCloseConfirm(false); setCloseError(''); setCloseSessionId(''); }}
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
