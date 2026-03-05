import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Calendar,
  Settings,
  CheckSquare,
  Square,
  ChevronDown,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Holiday {
  date: string;
  name: string;
  hebrewName?: string;
  type: 'jewish' | 'gregorian' | 'muslim';
  isWorkday: boolean;
}

interface CalendarSettings {
  workWeekStart: number;
  workWeekEnd: number;
  includeTypes: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

const HOLIDAY_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  jewish: { label: 'יהודי', color: 'text-blue-700', bg: 'bg-blue-100' },
  gregorian: { label: 'לאומי / נוצרי', color: 'text-purple-700', bg: 'bg-purple-100' },
  muslim: { label: 'מוסלמי', color: 'text-green-700', bg: 'bg-green-100' },
};

const HEBREW_MONTHS = [
  '',
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGregorianDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getMonthFromDate(dateStr: string) {
  return new Date(dateStr).getMonth() + 1;
}

function getDayName(dateStr: string) {
  const d = new Date(dateStr);
  return DAY_NAMES_HE[d.getDay()];
}

function TypeBadge({ type }: { type: string }) {
  const t = HOLIDAY_TYPES[type] ?? { label: type, color: 'text-gray-700', bg: 'bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.bg} ${t.color}`}>
      {t.label}
    </span>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<'success' | 'error' | null>(null);

  const { data: settings } = useQuery<CalendarSettings>({
    queryKey: ['calendar-settings'],
    queryFn: async () => {
      const r = await api.get('/calendar/settings');
      return r.data;
    },
  });

  const [form, setForm] = useState<CalendarSettings>({
    workWeekStart: 0,
    workWeekEnd: 4,
    includeTypes: ['jewish', 'gregorian'],
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () => api.put('/calendar/settings', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-settings'] });
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setToast('success');
      onSaved();
      setTimeout(() => setToast(null), 2000);
    },
    onError: () => {
      setToast('error');
      setTimeout(() => setToast(null), 2000);
    },
  });

  const toggleType = (type: string) => {
    setForm((f) => ({
      ...f,
      includeTypes: f.includeTypes.includes(type)
        ? f.includeTypes.filter((t) => t !== type)
        : [...f.includeTypes, type],
    }));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-right hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-gray-800">
          <Settings className="w-5 h-5 text-gray-500" />
          <span className="font-semibold">הגדרות לוח שנה</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-gray-100">
          {/* Work week */}
          <div className="pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">ימי עבודה בשבוע</p>
            <div className="flex gap-2 flex-wrap">
              {DAY_NAMES_HE.map((day, idx) => {
                const isWork = idx >= form.workWeekStart && idx <= form.workWeekEnd;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (idx < form.workWeekEnd) {
                        setForm((f) => ({ ...f, workWeekStart: idx }));
                      } else {
                        setForm((f) => ({ ...f, workWeekEnd: idx }));
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isWork
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ימי עבודה: {DAY_NAMES_HE[form.workWeekStart]} – {DAY_NAMES_HE[form.workWeekEnd]}
            </p>
          </div>

          {/* Holiday types */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">סוגי חגים להצגה</p>
            <div className="space-y-2">
              {Object.entries(HOLIDAY_TYPES).map(([key, val]) => {
                const checked = form.includeTypes.includes(key);
                return (
                  <label key={key} className="flex items-center gap-3 cursor-pointer select-none">
                    <button
                      type="button"
                      onClick={() => toggleType(key)}
                      className={`text-blue-600 ${checked ? '' : 'text-gray-300'}`}
                    >
                      {checked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                    <span className="text-sm text-gray-700">{val.label}</span>
                    <TypeBadge type={key} />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
            >
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              שמור הגדרות
            </button>
            {toast === 'success' && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> נשמר
              </span>
            )}
            {toast === 'error' && (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" /> שגיאה
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HolidaysPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['jewish', 'gregorian', 'muslim']);
  const [settingsKey, setSettingsKey] = useState(0);

  const yearsRange = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

  const { data, isLoading } = useQuery<Holiday[]>({
    queryKey: ['holidays', year, selectedTypes, settingsKey],
    queryFn: async () => {
      const r = await api.get('/calendar/holidays', {
        params: { year, types: selectedTypes.join(',') },
      });
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  const holidays: Holiday[] = data ?? [];

  // Filter by selected types
  const filtered = holidays.filter((h) => selectedTypes.includes(h.type));

  // Group by month
  const byMonth: Record<number, Holiday[]> = {};
  filtered.forEach((h) => {
    const m = getMonthFromDate(h.date);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  });

  const sortedMonths = Object.keys(byMonth)
    .map(Number)
    .sort((a, b) => a - b);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Stats
  const workdayHolidays = filtered.filter((h) => !h.isWorkday).length;
  const totalHolidays = filtered.length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">לוח חגים ומועדים</h1>
          <p className="text-sm text-gray-500 mt-1">חגים ומועדים לפי שנה וסוג</p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            {yearsRange.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Type filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="text-sm font-medium text-gray-600">סינון לפי סוג:</span>
          {Object.entries(HOLIDAY_TYPES).map(([key, val]) => {
            const checked = selectedTypes.includes(key);
            return (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <button
                  type="button"
                  onClick={() => toggleType(key)}
                  className={checked ? 'text-blue-600' : 'text-gray-300'}
                >
                  {checked ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
                <span className="text-sm text-gray-700">{val.label}</span>
                <TypeBadge type={key} />
              </label>
            );
          })}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{totalHolidays}</p>
          <p className="text-xs text-gray-500 mt-1">סה"כ חגים</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{workdayHolidays}</p>
          <p className="text-xs text-gray-500 mt-1">ימי חופשה (לא ימי עבודה)</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalHolidays - workdayHolidays}</p>
          <p className="text-xs text-gray-500 mt-1">חגים בימי עבודה</p>
        </div>
      </div>

      {/* Holidays list by month */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">לא נמצאו חגים לפי הסינון שנבחר</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedMonths.map((month) => (
            <div
              key={month}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Month header */}
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">
                  {HEBREW_MONTHS[month]} {year}
                </h2>
                <span className="text-xs text-gray-400">
                  {byMonth[month].length} חגים
                </span>
              </div>

              {/* Holidays list */}
              <div className="divide-y divide-gray-50">
                {byMonth[month].map((holiday, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    {/* Date info */}
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-12">
                        <p className="text-xl font-bold text-gray-900">
                          {new Date(holiday.date).getDate()}
                        </p>
                        <p className="text-xs text-gray-400">{getDayName(holiday.date)}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{holiday.name}</p>
                          {holiday.hebrewName && holiday.hebrewName !== holiday.name && (
                            <p className="text-xs text-gray-500">({holiday.hebrewName})</p>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatGregorianDate(holiday.date)}</p>
                      </div>
                    </div>

                    {/* Right side: type + workday indicator */}
                    <div className="flex items-center gap-3">
                      <TypeBadge type={holiday.type} />
                      <div
                        title={holiday.isWorkday ? 'יום עבודה' : 'לא יום עבודה'}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-base ${
                          holiday.isWorkday
                            ? 'bg-green-100'
                            : 'bg-red-100'
                        }`}
                      >
                        {holiday.isWorkday ? '🟢' : '🔴'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings panel */}
      <SettingsPanel onSaved={() => setSettingsKey((k) => k + 1)} />
    </div>
  );
}
