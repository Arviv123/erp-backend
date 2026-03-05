import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, CheckCircle, Clock, XCircle, Download, RefreshCw, Lock } from 'lucide-react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Issuer = 'Cal' | 'LeumiCard' | 'Isracard' | 'PoalimExpress' | 'Amex';

type LineStatus = 'MATCHED' | 'PENDING' | 'UNMATCHED';

interface Statement {
  id: string;
  issuer: Issuer;
  month: string;
  totalAmount: number;
  reconciledCount: number;
  pendingCount: number;
  createdAt: string;
  status?: 'OPEN' | 'CLOSED';
}

interface StatementLine {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  status: LineStatus;
  bankTransactionId?: string;
  matched: boolean;
  last4?: string;
}

interface UploadResult {
  statementId: string;
  totalLines: number;
  totalAmount: number;
  parsedLines: {
    date: string;
    merchant: string;
    amount: number;
    currency: string;
    last4?: string;
    reference?: string;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

const ISSUER_LABELS: Record<Issuer, string> = {
  Cal: 'כאל',
  LeumiCard: 'לאומי כארד',
  Isracard: 'ישראכארט',
  PoalimExpress: 'פועלים אקספרס',
  Amex: 'אמריקן אקספרס',
};

const ISSUERS: Issuer[] = ['Cal', 'LeumiCard', 'Isracard', 'PoalimExpress', 'Amex'];

const STATUS_BADGE: Record<LineStatus, { label: string; className: string; icon: React.ReactNode }> = {
  MATCHED: {
    label: 'מותאם',
    className: 'bg-green-100 text-green-700',
    icon: <CheckCircle className="w-3 h-3 inline ml-1" />,
  },
  PENDING: {
    label: 'ממתין',
    className: 'bg-yellow-100 text-yellow-700',
    icon: <Clock className="w-3 h-3 inline ml-1" />,
  },
  UNMATCHED: {
    label: 'לא מותאם',
    className: 'bg-red-100 text-red-700',
    icon: <XCircle className="w-3 h-3 inline ml-1" />,
  },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreditCardReconPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIssuer, setSelectedIssuer] = useState<Issuer>('Cal');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ─── Statements list ────────────────────────────────────────────────────────

  const { data: statementsData, isLoading: statementsLoading } = useQuery({
    queryKey: ['cc-statements'],
    queryFn: () =>
      api.get('/credit-card-recon/statements').then(r => {
        const d = r.data;
        return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Statement[];
      }),
  });

  const statements = statementsData ?? [];

  // ─── Statement lines ────────────────────────────────────────────────────────

  const { data: linesData, isLoading: linesLoading, refetch: refetchLines } = useQuery({
    queryKey: ['cc-lines', selectedStatementId],
    queryFn: () =>
      api
        .get(`/credit-card-recon/statements/${selectedStatementId}/lines`)
        .then(r => {
          const d = r.data;
          return (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as StatementLine[];
        }),
    enabled: !!selectedStatementId,
  });

  const lines = linesData ?? [];

  // ─── Auto-match ─────────────────────────────────────────────────────────────

  const autoMatch = useMutation({
    mutationFn: () =>
      api.post(`/credit-card-recon/statements/${selectedStatementId}/auto-match`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cc-lines', selectedStatementId] });
      qc.invalidateQueries({ queryKey: ['cc-statements'] });
    },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה בהתאמה אוטומטית'),
  });

  // ─── Close statement ─────────────────────────────────────────────────────────

  const closeStatement = useMutation({
    mutationFn: () =>
      api.post(`/credit-card-recon/statements/${selectedStatementId}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cc-statements'] });
      qc.invalidateQueries({ queryKey: ['cc-lines', selectedStatementId] });
    },
    onError: (e: any) => alert(e.response?.data?.error ?? 'שגיאה בסגירת דף החשבון'),
  });

  // ─── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('issuer', selectedIssuer);

    try {
      const res = await api.post('/credit-card-recon/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = res.data as UploadResult;
      setUploadResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['cc-statements'] });
      if (result.statementId) {
        setSelectedStatementId(result.statementId);
      }
    } catch (e: any) {
      setUploadError(e.response?.data?.error ?? 'שגיאה בהעלאת הקובץ');
    } finally {
      setUploading(false);
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!selectedStatementId) return;
    setExporting(true);
    try {
      const res = await api.get(`/credit-card-recon/statements/${selectedStatementId}/export`, {
        responseType: 'blob',
      });
      const stmt = statements.find(s => s.id === selectedStatementId);
      const name = stmt
        ? `כרטיס_אשראי_${ISSUER_LABELS[stmt.issuer]}_${stmt.month}.xlsx`
        : `כרטיס_אשראי_${selectedStatementId}.xlsx`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('שגיאה בייצוא הקובץ');
    } finally {
      setExporting(false);
    }
  };

  // ─── Summary counts ─────────────────────────────────────────────────────────

  const matchedCount = lines.filter(l => l.status === 'MATCHED').length;
  const pendingCount = lines.filter(l => l.status === 'PENDING').length;
  const unmatchedCount = lines.filter(l => l.status === 'UNMATCHED').length;

  const selectedStatement = statements.find(s => s.id === selectedStatementId);
  const isClosed = selectedStatement?.status === 'CLOSED';

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">התאמת כרטיסי אשראי</h1>
      </div>

      {/* Upload bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">העלאת דף חשבון</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">מנפיק הכרטיס</label>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={selectedIssuer}
              onChange={e => setSelectedIssuer(e.target.value as Issuer)}
            >
              {ISSUERS.map(issuer => (
                <option key={issuer} value={issuer}>
                  {ISSUER_LABELS[issuer]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">קובץ CSV</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'מעלה...' : 'העלה דף חשבון'}
          </button>
        </div>

        {uploadError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {uploadError}
          </div>
        )}

        {uploadResult && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            הועלה בהצלחה — {uploadResult.totalLines} שורות, סה"כ {fmtILS(uploadResult.totalAmount)}
          </div>
        )}
      </div>

      {/* Main content: two-column layout */}
      <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
        {/* Left panel: statements list */}
        <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">דפי חשבון</h2>
          </div>

          {statementsLoading ? (
            <div className="text-center py-12 text-gray-500">טוען...</div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12 text-gray-400">אין דפי חשבון</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {statements.map(stmt => (
                <li
                  key={stmt.id}
                  className={`p-4 cursor-pointer hover:bg-blue-50 transition-colors ${
                    selectedStatementId === stmt.id ? 'bg-blue-50 border-r-4 border-blue-600' : ''
                  }`}
                  onClick={() => setSelectedStatementId(stmt.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-800">
                      {ISSUER_LABELS[stmt.issuer]}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        stmt.status === 'CLOSED'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {stmt.status === 'CLOSED' ? 'סגור' : 'פתוח'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{stmt.month}</p>
                  <p className="text-sm font-bold text-gray-900">{fmtILS(stmt.totalAmount)}</p>
                  <div className="flex gap-3 mt-2 text-xs">
                    <span className="text-green-600">{stmt.reconciledCount} מותאמות</span>
                    <span className="text-yellow-600">{stmt.pendingCount} ממתינות</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{fmtDate(stmt.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right panel: lines */}
        <div className="flex-1 min-w-0 space-y-4">
          {!selectedStatementId ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="text-center py-12 text-gray-400">בחר דף חשבון מהרשימה</div>
            </div>
          ) : (
            <>
              {/* Statement action bar */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    {selectedStatement && (
                      <div>
                        <h2 className="text-base font-semibold text-gray-800">
                          {ISSUER_LABELS[selectedStatement.issuer]} — {selectedStatement.month}
                        </h2>
                        <p className="text-sm text-gray-500">
                          סה"כ: {fmtILS(selectedStatement.totalAmount)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => autoMatch.mutate()}
                      disabled={autoMatch.isPending || isClosed}
                      className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {autoMatch.isPending ? 'מבצע...' : 'התאמה אוטומטית'}
                    </button>
                    <button
                      onClick={() => closeStatement.mutate()}
                      disabled={closeStatement.isPending || isClosed}
                      className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      {closeStatement.isPending ? 'סוגר...' : isClosed ? 'סגור' : 'סגור'}
                    </button>
                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {exporting ? 'מייצא...' : 'ייצוא Excel'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">מותאמות</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{matchedCount}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs text-yellow-700 font-medium">ממתינות</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span className="text-xs text-red-700 font-medium">לא מותאמות</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">{unmatchedCount}</p>
                </div>
              </div>

              {/* Lines table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {linesLoading ? (
                  <div className="text-center py-12 text-gray-500">טוען...</div>
                ) : lines.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">אין נתונים</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">תאריך</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">בית עסק</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">סכום</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">מטבע</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">4 ספרות אחרונות</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => {
                        const badge = STATUS_BADGE[line.status] ?? STATUS_BADGE.PENDING;
                        return (
                          <tr
                            key={line.id}
                            className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                          >
                            <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                              {fmtDate(line.date)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">
                              {line.merchant}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-gray-900">
                              {fmtILS(line.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">
                              {line.currency}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                              {line.last4 ? `****${line.last4}` : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}
                              >
                                {badge.icon}
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
