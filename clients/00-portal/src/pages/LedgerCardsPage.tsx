import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account { id: string; code: string; name: string }
interface Customer { id: string; name: string }
interface Vendor { id: string; name: string }
interface Employee { id: string; fullName: string }

interface LedgerLine {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  reference?: string;
  invoiceId?: string;
}

interface LedgerData {
  accountNumber?: string;
  accountName?: string;
  openingBalance: number;
  closingBalance: number;
  lines: LedgerLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

const today = () => new Date().toISOString().slice(0, 10);

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

type TabType = 'account' | 'customer' | 'vendor' | 'employee';

const TABS: { id: TabType; label: string }[] = [
  { id: 'account', label: 'חשבון' },
  { id: 'customer', label: 'לקוח' },
  { id: 'vendor', label: 'ספק' },
  { id: 'employee', label: 'עובד' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LedgerCardsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [selectedId, setSelectedId] = useState('');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [queryKey, setQueryKey] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const [exporting, setExporting] = useState(false);

  // ─── Lists ─────────────────────────────────────────────────────────────────

  const { data: accounts } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () =>
      api.get('/accounting/accounts').then(r => {
        const d = r.data;
        return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Account[];
      }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () =>
      api.get('/crm/customers').then(r => {
        const d = r.data;
        return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Customer[];
      }),
    enabled: activeTab === 'customer',
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () =>
      api.get('/purchasing/vendors').then(r => {
        const d = r.data;
        return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Vendor[];
      }),
    enabled: activeTab === 'vendor',
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () =>
      api.get('/employees').then(r => {
        const d = r.data;
        return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Employee[];
      }),
    enabled: activeTab === 'employee',
  });

  // ─── Derived entity name ────────────────────────────────────────────────────

  const entityName = (() => {
    if (!selectedId) return '';
    if (activeTab === 'account') {
      const a = (accounts ?? []).find(x => x.id === selectedId);
      return a ? `${a.code} — ${a.name}` : '';
    }
    if (activeTab === 'customer') return (customers ?? []).find(x => x.id === selectedId)?.name ?? '';
    if (activeTab === 'vendor') return (vendors ?? []).find(x => x.id === selectedId)?.name ?? '';
    if (activeTab === 'employee') return (employees ?? []).find(x => x.id === selectedId)?.fullName ?? '';
    return '';
  })();

  // ─── Load ledger ────────────────────────────────────────────────────────────

  const loadLedger = async () => {
    if (!selectedId) return;
    setLedgerLoading(true);
    setLedgerError('');
    setLedgerData(null);

    const endpointMap: Record<TabType, string> = {
      account: '/ledger/account',
      customer: '/ledger/customer',
      vendor: '/ledger/vendor',
      employee: '/ledger/employee',
    };

    const paramMap: Record<TabType, string> = {
      account: 'accountId',
      customer: 'customerId',
      vendor: 'vendorId',
      employee: 'employeeId',
    };

    try {
      const res = await api.get(endpointMap[activeTab], {
        params: { [paramMap[activeTab]]: selectedId, from, to },
      });
      setLedgerData(res.data as LedgerData);
      setQueryKey(`${activeTab}-${selectedId}-${from}-${to}`);
    } catch (e: any) {
      setLedgerError(e.response?.data?.error ?? 'שגיאה בטעינת הכרטסת');
    } finally {
      setLedgerLoading(false);
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!selectedId) return;
    setExporting(true);
    try {
      const res = await api.get('/ledger/export', {
        params: { type: activeTab, entityId: selectedId, from, to },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `כרטסת_${entityName}_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('שגיאה בייצוא הקובץ');
    } finally {
      setExporting(false);
    }
  };

  // ─── Tab change ─────────────────────────────────────────────────────────────

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedId('');
    setLedgerData(null);
    setLedgerError('');
    setQueryKey(null);
  };

  // ─── Dropdown options ───────────────────────────────────────────────────────

  const renderDropdown = () => {
    if (activeTab === 'account') {
      return (
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          <option value="">בחר חשבון...</option>
          {(accounts ?? []).map(a => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
      );
    }
    if (activeTab === 'customer') {
      return (
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          <option value="">בחר לקוח...</option>
          {(customers ?? []).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    if (activeTab === 'vendor') {
      return (
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          <option value="">בחר ספק...</option>
          {(vendors ?? []).map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      );
    }
    if (activeTab === 'employee') {
      return (
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          <option value="">בחר עובד...</option>
          {(employees ?? []).map(e => (
            <option key={e.id} value={e.id}>{e.fullName}</option>
          ))}
        </select>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">כרטסות</h1>
          {ledgerData && entityName && (
            <p className="text-sm text-gray-500 mt-1">
              {entityName} | {fmtDate(from)} — {fmtDate(to)}
            </p>
          )}
        </div>
        {ledgerData && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'מייצא...' : 'ייצוא Excel'}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-500 mb-1">
              {activeTab === 'account' ? 'חשבון' :
               activeTab === 'customer' ? 'לקוח' :
               activeTab === 'vendor' ? 'ספק' : 'עובד'}
            </label>
            {renderDropdown()}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>
          <button
            onClick={loadLedger}
            disabled={!selectedId || ledgerLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            {ledgerLoading ? 'טוען...' : 'הצג כרטסת'}
          </button>
        </div>
      </div>

      {/* States */}
      {!queryKey && !ledgerLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center py-12 text-gray-400">בחר ישות ולחץ "הצג כרטסת"</div>
        </div>
      )}

      {ledgerLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center py-12 text-gray-500">טוען...</div>
        </div>
      )}

      {ledgerError && !ledgerLoading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {ledgerError}
        </div>
      )}

      {/* Ledger card */}
      {ledgerData && !ledgerLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">יתרת פתיחה</p>
              <p className="text-lg font-bold text-gray-800">
                {fmtILS(ledgerData.openingBalance ?? 0)}
              </p>
            </div>
            <div className={`rounded-lg p-4 border ${
              (ledgerData.closingBalance ?? 0) < 0
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <p className="text-xs text-gray-500 mb-1">יתרת סגירה</p>
              <p className={`text-lg font-bold ${
                (ledgerData.closingBalance ?? 0) < 0 ? 'text-red-700' : 'text-green-700'
              }`}>
                {fmtILS(ledgerData.closingBalance ?? 0)}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">תאריך</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">תיאור</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">חיוב</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">זיכוי</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">יתרה</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">אסמכתא</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr className="bg-gray-100 font-semibold border-b border-gray-200">
                  <td className="px-4 py-3 text-gray-600" colSpan={4}>
                    יתרת פתיחה
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    {fmtILS(ledgerData.openingBalance ?? 0)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>

                {/* Transaction lines */}
                {(!ledgerData.lines || ledgerData.lines.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      אין תנועות
                    </td>
                  </tr>
                ) : ledgerData.lines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-gray-100 hover:bg-blue-50 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {fmtDate(line.date)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">
                      {line.description || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-green-700">
                      {line.debit !== null && line.debit !== undefined && line.debit > 0
                        ? fmtILS(line.debit)
                        : ''}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-red-600">
                      {line.credit !== null && line.credit !== undefined && line.credit > 0
                        ? fmtILS(line.credit)
                        : ''}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold ${
                      line.balance < 0 ? 'text-red-700' : 'text-gray-800'
                    }`}>
                      {fmtILS(line.balance)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">
                      {line.reference ?? '—'}
                    </td>
                  </tr>
                ))}

                {/* Closing balance row */}
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-gray-700" colSpan={4}>
                    יתרת סגירה
                  </td>
                  <td className={`px-4 py-3 text-base ${
                    (ledgerData.closingBalance ?? 0) < 0 ? 'text-red-700' : 'text-gray-900'
                  }`}>
                    {fmtILS(ledgerData.closingBalance ?? 0)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3 text-center">
            {entityName} | {fmtDate(from)} — {fmtDate(to)} | {ledgerData.lines?.length ?? 0} תנועות
          </p>
        </div>
      )}
    </div>
  );
}
