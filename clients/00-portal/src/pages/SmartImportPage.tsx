import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadResponse {
  jobId: string;
  detectedCompany: string;
  columns: string[];
  preview: Record<string, unknown>[];
  totalRows: number;
  fieldSuggestions: Record<string, string>;
}

interface JobStatus {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processed: number;
  total: number;
  errors: string[];
  entityType: string;
}

interface ImportJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  entityType: string;
  company: string;
  createdAt: string;
  processed: number;
  total: number;
  errors: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANIES = ['Priority', 'Hashavshevet', 'SAP', 'Generic'];

const ENTITY_TYPES: Record<string, string> = {
  customers: 'לקוחות',
  products: 'מוצרים',
  employees: 'עובדים',
  vendors: 'ספקים',
  accounts: 'חשבונות',
};

const ENTITY_FIELDS: Record<string, Record<string, string>> = {
  customers: {
    name: 'שם',
    email: 'אימייל',
    phone: 'טלפון',
    businessId: 'ח.פ / ת.ז',
    address: 'כתובת',
    city: 'עיר',
  },
  products: {
    name: 'שם',
    sku: 'מק"ט',
    barcode: 'ברקוד',
    sellingPrice: 'מחיר מכירה',
    vatRate: 'שיעור מע"מ',
    description: 'תיאור',
  },
  employees: {
    firstName: 'שם פרטי',
    lastName: 'שם משפחה',
    idNumber: 'מספר ת.ז',
    email: 'אימייל',
    phone: 'טלפון',
    department: 'מחלקה',
  },
  vendors: {
    name: 'שם',
    email: 'אימייל',
    phone: 'טלפון',
    businessId: 'ח.פ',
    address: 'כתובת',
  },
  accounts: {
    code: 'קוד חשבון',
    name: 'שם חשבון',
    type: 'סוג',
    parentCode: 'קוד אב',
  },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'ממתין', color: 'bg-gray-100 text-gray-700' },
  PROCESSING: { label: 'מעבד', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'הושלם', color: 'bg-green-100 text-green-700' },
  FAILED: { label: 'נכשל', color: 'bg-red-100 text-red-700' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SmartImportPage() {
  const queryClient = useQueryClient();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [company, setCompany] = useState('Generic');
  const [entityType, setEntityType] = useState('customers');
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll job status when processing
  const [polling, setPolling] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  // Recent jobs
  const { data: recentJobs, refetch: refetchJobs } = useQuery<ImportJob[]>({
    queryKey: ['smart-import-jobs'],
    queryFn: async () => {
      const r = await api.get('/smart-import/jobs');
      return Array.isArray(r.data) ? r.data : [];
    },
    refetchInterval: 10000,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('אין קובץ');
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('company', company);
      const r = await api.post('/smart-import/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data as UploadResponse;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      // Pre-fill mapping from AI suggestions
      const mapping: Record<string, string> = {};
      data.columns.forEach((col) => {
        mapping[col] = data.fieldSuggestions?.[col] ?? '';
      });
      setFieldMapping(mapping);
      if (data.detectedCompany) setCompany(data.detectedCompany);
      setStep(2);
    },
  });

  // Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!uploadResult) throw new Error('אין נתונים');
      const r = await api.post(`/smart-import/jobs/${uploadResult.jobId}/confirm`, {
        entityType,
        fieldMapping,
      });
      return r.data as { jobId: string; status: string; processed: number; errors: string[] };
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId ?? uploadResult?.jobId ?? null);
      setStep(3);
      setPolling(true);
    },
  });

  // Poll status
  useEffect(() => {
    if (!polling || !currentJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await api.get(`/smart-import/jobs/${currentJobId}/status`);
        const status: JobStatus = r.data;
        if (!cancelled) {
          setJobStatus(status);
          if (status.status === 'PROCESSING' || status.status === 'PENDING') {
            setTimeout(poll, 2000);
          } else {
            setPolling(false);
            refetchJobs();
            queryClient.invalidateQueries({ queryKey: ['smart-import-jobs'] });
          }
        }
      } catch {
        if (!cancelled) setPolling(false);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [polling, currentJobId]);

  // Drag handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setSelectedFile(f);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSelectedFile(f);
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedFile(null);
    setUploadResult(null);
    setFieldMapping({});
    setCurrentJobId(null);
    setJobStatus(null);
    setPolling(false);
    setCompany('Generic');
    setEntityType('customers');
  };

  const fields = ENTITY_FIELDS[entityType] ?? {};
  const fieldOptions = Object.entries(fields);

  // Progress calculation
  const progress = jobStatus
    ? jobStatus.total > 0
      ? Math.round((jobStatus.processed / jobStatus.total) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ייבוא חכם</h1>
          <p className="text-sm text-gray-500 mt-1">ייבוא נתונים ממערכות חיצוניות עם מיפוי שדות אוטומטי</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-center gap-8">
          {[
            { num: 1, label: 'העלאת קובץ' },
            { num: 2, label: 'מיפוי שדות' },
            { num: 3, label: 'תוצאות' },
          ].map(({ num, label }, idx) => (
            <div key={num} className="flex items-center gap-3">
              {idx > 0 && <div className="w-16 h-px bg-gray-200" />}
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step > num
                      ? 'bg-green-500 text-white'
                      : step === num
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step > num ? <CheckCircle className="w-5 h-5" /> : num}
                </div>
                <span className={`text-sm font-medium ${step === num ? 'text-blue-600' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── STEP 1: Upload ─────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-800">העלאת קובץ</h2>

          {/* Drag & Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            {selectedFile ? (
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <FileSpreadsheet className="w-5 h-5 text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">{selectedFile.name}</p>
                </div>
                <p className="text-xs text-gray-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-700">גרור קובץ לכאן או לחץ לבחירה</p>
                <p className="text-xs text-gray-400 mt-1">CSV, XLSX, XLS, JSON</p>
              </div>
            )}
          </div>

          {/* Options row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מערכת מקור</label>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סוג ישות</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {Object.entries(ENTITY_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {uploadMutation.isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>שגיאה בהעלאת הקובץ. אנא נסה שנית.</span>
            </div>
          )}

          <div className="flex justify-start">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || uploadMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploadMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> מעלה...</>
              ) : (
                <><ChevronLeft className="w-4 h-4" /> המשך למיפוי</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 2: Field Mapping ───────────────────────────── */}
      {step === 2 && uploadResult && (
        <div className="space-y-4">
          {/* Info bar */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="text-sm text-blue-800">
              <span className="font-semibold">הקובץ נטען בהצלחה.</span>{' '}
              זוהו <strong>{uploadResult.totalRows}</strong> שורות ו-<strong>{uploadResult.columns.length}</strong> עמודות.
              מערכת מקור שזוהתה: <strong>{uploadResult.detectedCompany || company}</strong>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">תצוגה מקדימה (5 שורות ראשונות)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {uploadResult.columns.map((col) => (
                      <th key={col} className="px-3 py-2 text-right font-medium text-gray-600 border-b">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.preview.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      {uploadResult.columns.map((col) => (
                        <td key={col} className="px-3 py-2 text-gray-700 max-w-32 truncate">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Field mapping */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">מיפוי שדות</h3>
            <p className="text-xs text-gray-500 mb-4">
              הבינה המלאכותית הציעה מיפוי אוטומטי. ניתן לשנות לפי הצורך.
            </p>
            <div className="space-y-3">
              {uploadResult.columns.map((col) => (
                <div key={col} className="flex items-center gap-4">
                  <div className="w-40 shrink-0">
                    <span className="text-sm font-medium text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg block truncate">
                      {col}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">→</span>
                  <select
                    value={fieldMapping[col] ?? ''}
                    onChange={(e) => setFieldMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                  >
                    <option value="">דלג (אל תייבא)</option>
                    {fieldOptions.map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {uploadResult.fieldSuggestions?.[col] && fieldMapping[col] === uploadResult.fieldSuggestions[col] && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded shrink-0">AI</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {confirmMutation.isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>שגיאה בביצוע הייבוא. אנא נסה שנית.</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1"
            >
              <ChevronRight className="w-4 h-4" /> חזרה
            </button>
            <button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {confirmMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> מעבד...</>
              ) : (
                <><CheckCircle className="w-4 h-4" /> בצע ייבוא</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: Progress / Results ─────────────────────── */}
      {step === 3 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
          {/* Progress */}
          {(polling || jobStatus?.status === 'PROCESSING' || jobStatus?.status === 'PENDING') && (
            <div className="text-center space-y-4">
              <RefreshCw className="w-10 h-10 text-blue-600 mx-auto animate-spin" />
              <p className="text-lg font-semibold text-gray-800">מייבא נתונים...</p>
              <div className="max-w-md mx-auto">
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>{jobStatus?.processed ?? 0} / {jobStatus?.total ?? uploadResult?.totalRows ?? 0}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Success */}
          {jobStatus?.status === 'COMPLETED' && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <p className="text-2xl font-bold text-gray-900">הייבוא הושלם!</p>
              <p className="text-gray-600">
                יובאו בהצלחה <strong>{jobStatus.processed}</strong> רשומות מתוך{' '}
                <strong>{jobStatus.total}</strong>
              </p>
              {jobStatus.errors.length > 0 && (
                <div className="text-right max-w-lg mx-auto bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-yellow-800 mb-2">
                    שגיאות ({jobStatus.errors.length}):
                  </p>
                  <ul className="text-xs text-yellow-700 space-y-1 max-h-32 overflow-y-auto">
                    {jobStatus.errors.map((e, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="shrink-0">•</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Failed */}
          {jobStatus?.status === 'FAILED' && (
            <div className="text-center space-y-4">
              <XCircle className="w-16 h-16 text-red-500 mx-auto" />
              <p className="text-2xl font-bold text-gray-900">הייבוא נכשל</p>
              {jobStatus.errors.length > 0 && (
                <div className="text-right max-w-lg mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
                  <ul className="text-xs text-red-700 space-y-1">
                    {jobStatus.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center">
            <button
              onClick={resetWizard}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 text-sm"
            >
              ייבוא נוסף
            </button>
          </div>
        </div>
      )}

      {/* ─── Recent Jobs Table ───────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-800">ייבואים אחרונים</h2>
        </div>

        {!recentJobs || recentJobs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">אין ייבואים קודמים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-right font-medium text-gray-600">מזהה</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ישות</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">מערכת מקור</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">רשומות</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">תאריך</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentJobs.slice(0, 10).map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{job.id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-gray-800">{ENTITY_TYPES[job.entityType] ?? job.entityType}</td>
                    <td className="px-4 py-3 text-gray-600">{job.company}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {job.processed} / {job.total}
                      {job.errors?.length > 0 && (
                        <span className="mr-2 text-xs text-red-500">({job.errors.length} שגיאות)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
