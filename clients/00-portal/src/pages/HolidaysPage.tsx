import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const HEBREW_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

async function getHolidays(year: number) {
  const r = await api.get('/hr/holidays', { params: { year } });
  return r.data;
}

export default function HolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => getHolidays(year),
  });

  const holidays: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  // Group by month
  const byMonth: Record<number, any[]> = {};
  holidays.forEach((h: any) => {
    const m = new Date(h.date).getMonth() + 1;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  });

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">לוח חגים ישראלי</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none bg-white">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">טוען...</div>
      ) : holidays.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400">אין חגים לשנה זו</div>
      ) : (
        <div className="space-y-4">
          {Object.keys(byMonth).sort((a, b) => Number(a) - Number(b)).map(m => (
            <div key={m} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-rose-50 px-4 py-2 border-b border-rose-100">
                <h2 className="text-sm font-semibold text-rose-800">{HEBREW_MONTHS[Number(m)]} {year}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {byMonth[Number(m)].map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-8">
                        <p className="text-lg font-bold text-gray-900">{new Date(h.date).getDate()}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{h.name}</p>
                        {h.hebrewDate && <p className="text-xs text-gray-400">{h.hebrewDate}</p>}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(h.date).toLocaleDateString('he-IL', { weekday: 'long' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
