// ============================================================
// Holiday Calendar Service
// Supports: Jewish, Israeli National, Gregorian, Muslim holidays
// No external API required — algorithmic + pre-calculated dates
// ============================================================

// ─── Enums ──────────────────────────────────────────────────────────────────

export enum HolidayType {
  JEWISH    = 'JEWISH',
  NATIONAL  = 'NATIONAL',
  GREGORIAN = 'GREGORIAN',
  MUSLIM    = 'MUSLIM',
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface HolidayOptions {
  jewish?:               boolean; // default true
  gregorian?:            boolean; // default false
  muslim?:               boolean; // default false
  includeMinorHolidays?: boolean; // Lag BaOmer, Tu BiShvat, etc.
  locale?:               'he' | 'en';
}

export interface Holiday {
  id:              string;
  date:            string;   // ISO YYYY-MM-DD
  endDate?:        string;   // for multi-day holidays
  name:            string;   // Hebrew name (primary)
  nameEn?:         string;
  type:            HolidayType;
  isWorkingDay:    boolean;  // false for major holidays
  isPublicHoliday: boolean;  // affects employee rights
  category:        string;   // 'major' | 'minor' | 'memorial'
  hebrewDate?:     string;   // e.g. "א' תשרי תשפ״ז"
}

export interface CalendarDay {
  date:        string;
  dayOfWeek:   number; // 0=Sunday
  isShabbat:   boolean;
  isHoliday:   boolean;
  holiday?:    Holiday;
  isWorkingDay: boolean;
}

export interface CalendarMonth {
  year:  number;
  month: number;
  days:  CalendarDay[];
}

export interface CalendarSettings {
  jewish:               boolean;
  gregorian:            boolean;
  muslim:               boolean;
  includeMinorHolidays: boolean;
  locale:               'he' | 'en';
}

// ─── In-memory tenant settings cache ────────────────────────────────────────

const tenantSettingsCache = new Map<string, CalendarSettings>();

const DEFAULT_SETTINGS: CalendarSettings = {
  jewish:               true,
  gregorian:            false,
  muslim:               false,
  includeMinorHolidays: false,
  locale:               'he',
};

// ─── Pre-calculated Jewish holiday dates (Gregorian) ────────────────────────
// Key: Gregorian year in which the Jewish year STARTS (Tishrei falls in that year)
// Note: holidays that cross year boundary (Chanukah, Tu BiShvat, Purim, Passover, etc.)
//       are stored under the year of Tishrei (the Jewish year start)

const JEWISH_HOLIDAY_DATES: Record<number, Record<string, string>> = {
  2024: {
    'rosh-hashana':    '2024-10-02',
    'yom-kippur':      '2024-10-11',
    'sukkot':          '2024-10-16',
    'hoshana-rabah':   '2024-10-22',
    'simchat-torah':   '2024-10-24',
    'chanukah-start':  '2024-12-25',
    'tu-bishvat':      '2025-01-13',
    'purim':           '2025-03-13',
    'passover':        '2025-04-12',
    'yom-hashoah':     '2025-04-24',
    'yom-hazikaron':   '2025-04-30',
    'yom-haatzmaut':   '2025-05-01',
    'lag-baomer':      '2025-05-16',
    'yom-yerushalayim':'2025-05-26',
    'shavuot':         '2025-06-01',
    'tisha-bav':       '2025-08-12',
  },
  2025: {
    'rosh-hashana':    '2025-09-22',
    'yom-kippur':      '2025-10-01',
    'sukkot':          '2025-10-06',
    'hoshana-rabah':   '2025-10-12',
    'simchat-torah':   '2025-10-14',
    'chanukah-start':  '2025-12-14',
    'tu-bishvat':      '2026-02-01',
    'purim':           '2026-03-03',
    'passover':        '2026-04-01',
    'yom-hashoah':     '2026-04-14',
    'yom-hazikaron':   '2026-04-21',
    'yom-haatzmaut':   '2026-04-22',
    'lag-baomer':      '2026-05-07',
    'yom-yerushalayim':'2026-05-17',
    'shavuot':         '2026-05-21',
    'tisha-bav':       '2026-08-02',
  },
  2026: {
    'rosh-hashana':    '2026-09-11',
    'yom-kippur':      '2026-09-20',
    'sukkot':          '2026-09-25',
    'hoshana-rabah':   '2026-10-01',
    'simchat-torah':   '2026-10-03',
    'chanukah-start':  '2026-12-04',
    'tu-bishvat':      '2027-01-22',
    'purim':           '2027-03-22',
    'passover':        '2027-04-21',
    'yom-hashoah':     '2027-05-04',
    'yom-hazikaron':   '2027-05-10',
    'yom-haatzmaut':   '2027-05-11',
    'lag-baomer':      '2027-05-26',
    'yom-yerushalayim':'2027-06-05',
    'shavuot':         '2027-06-11',
    'tisha-bav':       '2027-07-22',
  },
  2027: {
    'rosh-hashana':    '2027-10-01',
    'yom-kippur':      '2027-10-10',
    'sukkot':          '2027-10-15',
    'hoshana-rabah':   '2027-10-21',
    'simchat-torah':   '2027-10-23',
    'chanukah-start':  '2027-12-24',
    'tu-bishvat':      '2028-02-12',
    'purim':           '2028-03-12',
    'passover':        '2028-04-11',
    'yom-hashoah':     '2028-04-25',
    'yom-hazikaron':   '2028-04-30',
    'yom-haatzmaut':   '2028-05-01',
    'lag-baomer':      '2028-05-16',
    'yom-yerushalayim':'2028-05-26',
    'shavuot':         '2028-05-31',
    'tisha-bav':       '2028-08-12',
  },
  2028: {
    'rosh-hashana':    '2028-09-20',
    'yom-kippur':      '2028-09-29',
    'sukkot':          '2028-10-04',
    'hoshana-rabah':   '2028-10-10',
    'simchat-torah':   '2028-10-12',
    'chanukah-start':  '2028-12-12',
    'tu-bishvat':      '2029-02-01',
    'purim':           '2029-03-01',
    'passover':        '2029-03-31',
    'yom-hashoah':     '2029-04-12',
    'yom-hazikaron':   '2029-04-18',
    'yom-haatzmaut':   '2029-04-19',
    'lag-baomer':      '2029-05-04',
    'yom-yerushalayim':'2029-05-14',
    'shavuot':         '2029-05-19',
    'tisha-bav':       '2029-07-31',
  },
  2029: {
    'rosh-hashana':    '2029-09-09',
    'yom-kippur':      '2029-09-18',
    'sukkot':          '2029-09-23',
    'hoshana-rabah':   '2029-09-29',
    'simchat-torah':   '2029-10-01',
    'chanukah-start':  '2029-12-01',
    'tu-bishvat':      '2030-01-21',
    'purim':           '2030-03-20',
    'passover':        '2030-04-18',
    'yom-hashoah':     '2030-05-02',
    'yom-hazikaron':   '2030-05-06',
    'yom-haatzmaut':   '2030-05-07',
    'lag-baomer':      '2030-05-22',
    'yom-yerushalayim':'2030-06-01',
    'shavuot':         '2030-06-07',
    'tisha-bav':       '2030-07-20',
  },
};

// ─── Jewish holiday definitions ──────────────────────────────────────────────

interface JewishHolidayDef {
  id:              string;
  name:            string;
  nameEn:          string;
  isWorkingDay:    boolean;
  isPublicHoliday: boolean;
  category:        'major' | 'minor' | 'memorial';
  isMinor:         boolean;
  durationDays?:   number; // for multi-day holidays
  hebrewDateLabel: string;
}

const JEWISH_HOLIDAY_DEFS: JewishHolidayDef[] = [
  {
    id: 'rosh-hashana', name: 'ראש השנה', nameEn: 'Rosh Hashana',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    durationDays: 2, hebrewDateLabel: "א'-ב' תשרי",
  },
  {
    id: 'yom-kippur', name: 'יום כיפור', nameEn: 'Yom Kippur',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    hebrewDateLabel: "י' תשרי",
  },
  {
    id: 'sukkot', name: 'סוכות', nameEn: 'Sukkot',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    durationDays: 7, hebrewDateLabel: "ט\"ו-כ\"א תשרי",
  },
  {
    id: 'hoshana-rabah', name: 'הושענא רבה', nameEn: 'Hoshana Raba',
    isWorkingDay: true, isPublicHoliday: false, category: 'minor', isMinor: true,
    hebrewDateLabel: "כ\"א תשרי",
  },
  {
    id: 'simchat-torah', name: 'שמיני עצרת / שמחת תורה', nameEn: 'Shemini Atzeret / Simchat Torah',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    hebrewDateLabel: "כ\"ב-כ\"ג תשרי",
  },
  {
    id: 'chanukah-start', name: 'חנוכה', nameEn: 'Chanukah',
    isWorkingDay: true, isPublicHoliday: false, category: 'minor', isMinor: true,
    durationDays: 8, hebrewDateLabel: "כ\"ה כסלו",
  },
  {
    id: 'tu-bishvat', name: "ט\"ו בשבט", nameEn: "Tu BiShvat",
    isWorkingDay: true, isPublicHoliday: false, category: 'minor', isMinor: true,
    hebrewDateLabel: "ט\"ו שבט",
  },
  {
    id: 'purim', name: 'פורים', nameEn: 'Purim',
    isWorkingDay: true, isPublicHoliday: false, category: 'minor', isMinor: false,
    hebrewDateLabel: "י\"ד אדר",
  },
  {
    id: 'passover', name: 'פסח', nameEn: 'Passover',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    durationDays: 7, hebrewDateLabel: "ט\"ו-כ\"א ניסן",
  },
  {
    id: 'yom-hashoah', name: 'יום השואה', nameEn: 'Holocaust Remembrance Day',
    isWorkingDay: true, isPublicHoliday: true, category: 'memorial', isMinor: false,
    hebrewDateLabel: "כ\"ז ניסן",
  },
  {
    id: 'yom-hazikaron', name: 'יום הזיכרון', nameEn: 'Yom HaZikaron',
    isWorkingDay: true, isPublicHoliday: true, category: 'memorial', isMinor: false,
    hebrewDateLabel: "ד' אייר",
  },
  {
    id: 'yom-haatzmaut', name: 'יום העצמאות', nameEn: "Yom HaAtzma'ut (Independence Day)",
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    hebrewDateLabel: "ה' אייר",
  },
  {
    id: 'lag-baomer', name: "ל\"ג בעומר", nameEn: 'Lag BaOmer',
    isWorkingDay: true, isPublicHoliday: false, category: 'minor', isMinor: true,
    hebrewDateLabel: "י\"ח אייר",
  },
  {
    id: 'yom-yerushalayim', name: 'יום ירושלים', nameEn: 'Jerusalem Day',
    isWorkingDay: true, isPublicHoliday: false, category: 'minor', isMinor: true,
    hebrewDateLabel: "כ\"ח אייר",
  },
  {
    id: 'shavuot', name: 'שבועות', nameEn: 'Shavuot',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', isMinor: false,
    durationDays: 1, hebrewDateLabel: "ו' סיון",
  },
  {
    id: 'tisha-bav', name: "תשעה באב", nameEn: "Tisha B'Av",
    isWorkingDay: true, isPublicHoliday: false, category: 'memorial', isMinor: false,
    hebrewDateLabel: "ט' אב",
  },
];

// ─── Gregorian fixed holidays ────────────────────────────────────────────────

interface GregorianFixedHoliday {
  id:      string;
  name:    string;
  nameHe:  string;
  month:   number;
  day:     number;
  isWorkingDay:    boolean;
  isPublicHoliday: boolean;
  category:        'major' | 'minor' | 'memorial';
}

const GREGORIAN_FIXED: GregorianFixedHoliday[] = [
  {
    id: 'new-year', name: "New Year's Day", nameHe: 'ראש שנה לועזי',
    month: 1, day: 1,
    isWorkingDay: false, isPublicHoliday: true, category: 'major',
  },
  {
    id: 'labor-day-eu', name: 'Labor Day (EU)', nameHe: 'יום העבודה',
    month: 5, day: 1,
    isWorkingDay: false, isPublicHoliday: false, category: 'minor',
  },
  {
    id: 'halloween', name: 'Halloween', nameHe: 'הלואין',
    month: 10, day: 31,
    isWorkingDay: true, isPublicHoliday: false, category: 'minor',
  },
  {
    id: 'christmas', name: 'Christmas', nameHe: 'חג המולד',
    month: 12, day: 25,
    isWorkingDay: false, isPublicHoliday: false, category: 'major',
  },
];

// ─── Muslim holiday pre-calculated dates ─────────────────────────────────────
// Hijri calendar is lunar; dates shift ~11 days earlier each Gregorian year.

const MUSLIM_HOLIDAY_DATES: Record<number, Record<string, string>> = {
  2024: {
    'ramadan-start': '2024-03-10',
    'eid-al-fitr':   '2024-04-10',
    'eid-al-adha':   '2024-06-16',
    'al-hijra':      '2024-07-07',
    'mawlid':        '2024-09-15',
  },
  2025: {
    'ramadan-start': '2025-03-01',
    'eid-al-fitr':   '2025-03-30',
    'eid-al-adha':   '2025-06-06',
    'al-hijra':      '2025-06-26',
    'mawlid':        '2025-09-04',
  },
  2026: {
    'ramadan-start': '2026-02-17',
    'eid-al-fitr':   '2026-03-20',
    'eid-al-adha':   '2026-05-27',
    'al-hijra':      '2026-06-16',
    'mawlid':        '2026-08-25',
  },
  2027: {
    'ramadan-start': '2027-02-06',
    'eid-al-fitr':   '2027-03-08',
    'eid-al-adha':   '2027-05-16',
    'al-hijra':      '2027-06-05',
    'mawlid':        '2027-08-14',
  },
  2028: {
    'ramadan-start': '2028-01-26',
    'eid-al-fitr':   '2028-02-25',
    'eid-al-adha':   '2028-05-04',
    'al-hijra':      '2028-05-24',
    'mawlid':        '2028-08-02',
  },
  2029: {
    'ramadan-start': '2029-01-14',
    'eid-al-fitr':   '2029-02-13',
    'eid-al-adha':   '2029-04-23',
    'al-hijra':      '2029-05-14',
    'mawlid':        '2029-07-23',
  },
};

interface MuslimHolidayDef {
  id:              string;
  name:            string;
  nameEn:          string;
  isWorkingDay:    boolean;
  isPublicHoliday: boolean;
  category:        'major' | 'minor' | 'memorial';
  durationDays?:   number;
}

const MUSLIM_HOLIDAY_DEFS: MuslimHolidayDef[] = [
  {
    id: 'ramadan-start', name: 'רמדאן', nameEn: 'Ramadan',
    isWorkingDay: true, isPublicHoliday: false, category: 'major', durationDays: 30,
  },
  {
    id: 'eid-al-fitr', name: 'עיד אל-פיטר (חג הפסקת הצום)', nameEn: 'Eid al-Fitr',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', durationDays: 3,
  },
  {
    id: 'eid-al-adha', name: 'עיד אל-אדחא (חג הקורבן)', nameEn: 'Eid al-Adha',
    isWorkingDay: false, isPublicHoliday: true, category: 'major', durationDays: 4,
  },
  {
    id: 'al-hijra', name: "ראש השנה המוסלמי (אל-הג'רה)", nameEn: 'Al-Hijra (Islamic New Year)',
    isWorkingDay: true, isPublicHoliday: false, category: 'minor',
  },
  {
    id: 'mawlid', name: "מולד הנביא (מאוולד אל-נביא)", nameEn: "Mawlid al-Nabi (Prophet's Birthday)",
    isWorkingDay: true, isPublicHoliday: false, category: 'minor',
  },
];

// ─── Easter calculation (Meeus/Jones/Butcher algorithm) ──────────────────────

function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ─── Helper: add days to ISO date string ─────────────────────────────────────

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Build holiday list for a given Gregorian year ───────────────────────────

function buildJewishHolidaysForYear(
  year: number,
  includeMinor: boolean,
): Holiday[] {
  const results: Holiday[] = [];

  // Find which "Jewish year block" to use for a given Gregorian year.
  // Jewish holidays span two Gregorian years (e.g. Rosh Hashana 2025 is in block 2025,
  // but Passover 2026 is also in block 2025). We check both year-1 and year blocks.
  const blocks = [year - 1, year];

  const seen = new Set<string>();

  for (const block of blocks) {
    const dates = JEWISH_HOLIDAY_DATES[block];
    if (!dates) continue;

    for (const def of JEWISH_HOLIDAY_DEFS) {
      const dateStr = dates[def.id];
      if (!dateStr) continue;

      // Only include holidays that fall in the requested Gregorian year
      if (!dateStr.startsWith(String(year))) continue;

      // Skip minor holidays if not requested
      if (def.isMinor && !includeMinor) continue;

      const key = `${def.id}-${dateStr}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const holiday: Holiday = {
        id:              def.id,
        date:            dateStr,
        name:            def.name,
        nameEn:          def.nameEn,
        type:            HolidayType.JEWISH,
        isWorkingDay:    def.isWorkingDay,
        isPublicHoliday: def.isPublicHoliday,
        category:        def.category,
        hebrewDate:      def.hebrewDateLabel,
      };

      if (def.durationDays && def.durationDays > 1) {
        holiday.endDate = addDaysToDateStr(dateStr, def.durationDays - 1);
      }

      results.push(holiday);
    }
  }

  return results;
}

function buildGregorianHolidaysForYear(year: number): Holiday[] {
  const results: Holiday[] = [];

  // Fixed holidays
  for (const h of GREGORIAN_FIXED) {
    const dateStr = `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
    results.push({
      id:              h.id,
      date:            dateStr,
      name:            h.nameHe,
      nameEn:          h.name,
      type:            HolidayType.GREGORIAN,
      isWorkingDay:    h.isWorkingDay,
      isPublicHoliday: h.isPublicHoliday,
      category:        h.category,
    });
  }

  // Easter (variable)
  const easterDate = calculateEaster(year);
  results.push({
    id:              'easter',
    date:            dateToIso(easterDate),
    name:            'פסחא',
    nameEn:          'Easter',
    type:            HolidayType.GREGORIAN,
    isWorkingDay:    false,
    isPublicHoliday: false,
    category:        'major',
  });

  return results;
}

function buildMuslimHolidaysForYear(year: number): Holiday[] {
  const results: Holiday[] = [];

  // Check both year and year-1 blocks (Muslim calendar shifts earlier)
  const blocks = [year - 1, year];
  const seen = new Set<string>();

  for (const block of blocks) {
    const dates = MUSLIM_HOLIDAY_DATES[block];
    if (!dates) continue;

    for (const def of MUSLIM_HOLIDAY_DEFS) {
      const dateStr = dates[def.id];
      if (!dateStr) continue;
      if (!dateStr.startsWith(String(year))) continue;

      const key = `${def.id}-${dateStr}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const holiday: Holiday = {
        id:              def.id,
        date:            dateStr,
        name:            def.name,
        nameEn:          def.nameEn,
        type:            HolidayType.MUSLIM,
        isWorkingDay:    def.isWorkingDay,
        isPublicHoliday: def.isPublicHoliday,
        category:        def.category,
      };

      if (def.durationDays && def.durationDays > 1) {
        holiday.endDate = addDaysToDateStr(dateStr, def.durationDays - 1);
      }

      results.push(holiday);
    }
  }

  return results;
}

// ─── Expand multi-day holidays into a Set of date strings ────────────────────

function expandHolidayDates(holidays: Holiday[]): Set<string> {
  const dates = new Set<string>();
  for (const h of holidays) {
    dates.add(h.date);
    if (h.endDate) {
      let cur = h.date;
      while (cur < h.endDate) {
        cur = addDaysToDateStr(cur, 1);
        dates.add(cur);
      }
    }
  }
  return dates;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Return all holidays for a given Gregorian year based on options.
 */
export async function getHolidays(
  year: number,
  options: HolidayOptions = {},
): Promise<Holiday[]> {
  const {
    jewish               = true,
    gregorian            = false,
    muslim               = false,
    includeMinorHolidays = false,
  } = options;

  const results: Holiday[] = [];

  if (jewish) {
    results.push(...buildJewishHolidaysForYear(year, includeMinorHolidays));
  }
  if (gregorian) {
    results.push(...buildGregorianHolidaysForYear(year));
  }
  if (muslim) {
    results.push(...buildMuslimHolidaysForYear(year));
  }

  // Sort by date
  results.sort((a, b) => a.date.localeCompare(b.date));

  return results;
}

/**
 * Return all holidays between two dates (inclusive).
 */
export async function getHolidaysInRange(
  from: Date,
  to: Date,
  options: HolidayOptions = {},
): Promise<Holiday[]> {
  const fromStr = dateToIso(from);
  const toStr   = dateToIso(to);

  const fromYear = from.getFullYear();
  const toYear   = to.getFullYear();

  const all: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    all.push(...await getHolidays(y, options));
  }

  // Filter to range (use start date for range check; multi-day may overlap)
  return all.filter(h => {
    const effectiveEnd = h.endDate ?? h.date;
    return h.date <= toStr && effectiveEnd >= fromStr;
  });
}

/**
 * Return true if the given date is a holiday.
 */
export async function isHoliday(
  date: Date,
  options: HolidayOptions = {},
): Promise<boolean> {
  const dateStr = dateToIso(date);
  const year    = date.getFullYear();

  const holidays = await getHolidays(year, { ...options, includeMinorHolidays: true });
  const dates    = expandHolidayDates(holidays);
  return dates.has(dateStr);
}

/**
 * Count working days between two dates (inclusive of from, exclusive of to).
 * Israel workweek: Sun–Thu full, Fri half-day (counted), Sat = Shabbat (not counted).
 * Holidays that are not working days are excluded.
 */
export async function getWorkingDays(
  from: Date,
  to: Date,
  options: HolidayOptions = {},
): Promise<number> {
  const allHolidays = await getHolidaysInRange(from, to, options);
  // Build set of non-working holiday date strings
  const nonWorkingDates = new Set<string>();
  for (const h of allHolidays) {
    if (!h.isWorkingDay) {
      let cur = h.date;
      const end = h.endDate ?? h.date;
      nonWorkingDates.add(cur);
      while (cur < end) {
        cur = addDaysToDateStr(cur, 1);
        nonWorkingDates.add(cur);
      }
    }
  }

  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (cur < end) {
    const dow     = cur.getDay(); // 0=Sun, 6=Sat
    const dateStr = dateToIso(cur);
    const isShabbat = dow === 6;

    if (!isShabbat && !nonWorkingDates.has(dateStr)) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

/**
 * Return the next working day after a given date.
 * Skips Shabbat (Saturday) and non-working holidays.
 */
export async function getNextWorkingDay(
  date: Date,
  options: HolidayOptions = {},
): Promise<Date> {
  const candidate = new Date(date);
  candidate.setDate(candidate.getDate() + 1);
  candidate.setHours(0, 0, 0, 0);

  // Check up to 14 days forward
  for (let i = 0; i < 14; i++) {
    const dow = candidate.getDay();
    if (dow === 6) { // Shabbat
      candidate.setDate(candidate.getDate() + 1);
      continue;
    }
    const holidays = await getHolidays(candidate.getFullYear(), { ...options, includeMinorHolidays: true });
    const nonWorkingDates = new Set<string>();
    for (const h of holidays) {
      if (!h.isWorkingDay) {
        let cur = h.date;
        const end = h.endDate ?? h.date;
        nonWorkingDates.add(cur);
        while (cur < end) {
          cur = addDaysToDateStr(cur, 1);
          nonWorkingDates.add(cur);
        }
      }
    }
    const dateStr = dateToIso(candidate);
    if (!nonWorkingDates.has(dateStr)) {
      return new Date(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return new Date(candidate);
}

/**
 * Get tenant calendar settings from cache (or defaults).
 */
export async function getTenantCalendarSettings(
  tenantId: string,
): Promise<CalendarSettings> {
  return tenantSettingsCache.get(tenantId) ?? { ...DEFAULT_SETTINGS };
}

/**
 * Update tenant calendar settings (stored in memory cache).
 */
export async function updateTenantCalendarSettings(
  tenantId: string,
  settings: Partial<CalendarSettings>,
): Promise<CalendarSettings> {
  const current = await getTenantCalendarSettings(tenantId);
  const updated: CalendarSettings = { ...current, ...settings };
  tenantSettingsCache.set(tenantId, updated);
  return updated;
}

/**
 * Return a full month calendar with each day annotated.
 */
export async function getCalendarForMonth(
  tenantId: string,
  year: number,
  month: number, // 1-based
  optionsOverride?: HolidayOptions,
): Promise<CalendarMonth> {
  const settings = await getTenantCalendarSettings(tenantId);
  const options: HolidayOptions = optionsOverride ?? {
    jewish:               settings.jewish,
    gregorian:            settings.gregorian,
    muslim:               settings.muslim,
    includeMinorHolidays: settings.includeMinorHolidays,
  };

  const holidays = await getHolidays(year, options);

  // Build lookup: dateStr -> Holiday
  const holidayMap = new Map<string, Holiday>();
  for (const h of holidays) {
    holidayMap.set(h.date, h);
    if (h.endDate) {
      let cur = h.date;
      while (cur < h.endDate) {
        cur = addDaysToDateStr(cur, 1);
        if (!holidayMap.has(cur)) {
          // Mark continuation days with same holiday info
          holidayMap.set(cur, { ...h, date: cur });
        }
      }
    }
  }

  // Build non-working dates set
  const nonWorkingDates = new Set<string>();
  for (const h of holidays) {
    if (!h.isWorkingDay) {
      let cur = h.date;
      const end = h.endDate ?? h.date;
      nonWorkingDates.add(cur);
      while (cur < end) {
        cur = addDaysToDateStr(cur, 1);
        nonWorkingDates.add(cur);
      }
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const days: CalendarDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj  = new Date(year, month - 1, d);
    const dow      = dateObj.getDay(); // 0=Sun, 6=Sat
    const isShabbat = dow === 6;
    const holiday   = holidayMap.get(dateStr);
    const isHol     = !!holiday;
    const isWorking = !isShabbat && !nonWorkingDates.has(dateStr);

    days.push({
      date:        dateStr,
      dayOfWeek:   dow,
      isShabbat,
      isHoliday:   isHol,
      holiday:     holiday ?? undefined,
      isWorkingDay: isWorking,
    });
  }

  return { year, month, days };
}
