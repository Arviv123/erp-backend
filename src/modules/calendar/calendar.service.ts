// ============================================================
// Holiday Calendar Service
// Supports: Jewish, Israeli National, Gregorian, Muslim holidays
// Libraries: @hebcal/core (Jewish/Israeli) + date-holidays (Gregorian/Muslim)
// ============================================================

import Holidays, { HolidaysTypes } from 'date-holidays';

// ─── @hebcal/core types (ESM-only package, loaded via dynamic import) ─────────

interface HebcalEvent {
  getDate(): { greg(): Date };
  getDesc(): string;
  render(lang: string): string;
  getFlags(): number;
}

interface HebcalModule {
  HebrewCalendar: {
    calendar(opts: {
      year: number;
      isHebrewYear: boolean;
      il: boolean;
      sedrot: boolean;
      omer: boolean;
    }): HebcalEvent[];
  };
  HDate: new (date: Date) => {
    render(lang: string): string;
  };
  flags: {
    CHAG: number;
    MINOR_HOLIDAY: number;
    YOM_TOV_ENDS: number;
    ROSH_CHODESH: number;
    CHANUKAH_CANDLES: number;
    SPECIAL_SHABBAT: number;
    LIGHT_CANDLES: number;
    LIGHT_CANDLES_TZEIS: number;
  };
}

// Cache the dynamic ESM import so we only load it once
let _hebcalPromise: Promise<HebcalModule> | null = null;

function getHebcal(): Promise<HebcalModule> {
  if (!_hebcalPromise) {
    _hebcalPromise = import('@hebcal/core') as Promise<HebcalModule>;
  }
  return _hebcalPromise;
}

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
  date:         string;
  dayOfWeek:    number; // 0=Sunday
  isShabbat:    boolean;
  isHoliday:    boolean;
  holiday?:     Holiday;
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

// ─── Helper utilities ────────────────────────────────────────────────────────

function dateToIso(d: Date): string {
  // Use UTC to avoid timezone shifts
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Hebrew date string via HDate ────────────────────────────────────────────

async function getHebrewDateString(date: Date): Promise<string> {
  try {
    const { HDate } = await getHebcal();
    const hdate = new HDate(date);
    return hdate.render('he');
  } catch {
    return '';
  }
}

// ─── Jewish Holidays via @hebcal/core ────────────────────────────────────────

/**
 * Descriptions that indicate a memorial day (working day in Israel)
 */
const MEMORIAL_DESCS = ['Yom HaShoah', 'Yom HaZikaron'];

/**
 * Descriptions that are national (non-working) holidays but flagged in hebcal
 * as MINOR_HOLIDAY or have no CHAG flag.
 */
const NATIONAL_NONWORKING_DESCS = ["Yom HaAtzma'ut"];

/**
 * Descriptions to skip entirely (Erev / candle lighting / havdalah versions
 * of holidays, Shabbat-related events, Rosh Chodesh, special Shabbatot, etc.)
 */
const SKIP_PATTERNS = [
  'Erev ',
  'Shabbat',
  'Rosh Chodesh',
  'Candles',
  'Havdalah',
  'Daf Yomi',
  'Selichot',
  'Molad',
  'Tachanun',
  'Yom HaAliyah School',
  'Chag HaBanot',
  'Rosh Hashana LaBehemot',
  'Leil Selichot',
  'Yom HaNikud',
  'Yom HaZikaron - ',
  'Hebrew Language Day',
  'Family Day',
  "Yom HaAliyah",
  "Yom HaAliyah School Observance",
  "Yom HaHerut",
  "Yom HaRabbi",
];

/**
 * Chanukah — we group all 8 candle-lighting events into a single holiday entry.
 */
function isChanukahEvent(desc: string): boolean {
  return desc.startsWith('Chanukah');
}

/**
 * Map a @hebcal/core event description to a stable slug ID.
 */
function descToId(desc: string): string {
  if (desc.startsWith('Rosh Hashana')) return 'rosh-hashana';
  if (desc === 'Rosh Hashana II') return 'rosh-hashana-2';
  if (desc === 'Yom Kippur') return 'yom-kippur';
  if (desc.startsWith('Sukkot')) return 'sukkot';
  if (desc === 'Hoshana Raba') return 'hoshana-raba';
  if (desc === 'Shmini Atzeret') return 'shmini-atzeret';
  if (isChanukahEvent(desc)) return 'chanukah';
  if (desc === "Tu BiShvat") return 'tu-bishvat';
  if (desc === 'Purim') return 'purim';
  if (desc === 'Shushan Purim') return 'shushan-purim';
  if (desc.startsWith('Pesach')) return 'pesach';
  if (desc === 'Pesach Sheni') return 'pesach-sheni';
  if (desc === 'Yom HaShoah') return 'yom-hashoah';
  if (desc === 'Yom HaZikaron') return 'yom-hazikaron';
  if (desc === "Yom HaAtzma'ut") return 'yom-haatzmaut';
  if (desc === "Lag BaOmer") return 'lag-baomer';
  if (desc === "Yom Yerushalayim") return 'yom-yerushalayim';
  if (desc === 'Shavuot') return 'shavuot';
  if (desc === "Tisha B'Av") return 'tisha-bav';
  if (desc === "Tu B'Av") return 'tu-bav';
  return slugify(desc);
}

/**
 * Determine if an event is a working day in Israel.
 */
function hebcalEventIsWorkingDay(desc: string, eventFlags: number, flags: HebcalModule['flags']): boolean {
  // Full holidays (CHAG) = not working
  if (eventFlags & flags.CHAG) return false;
  // National non-working day
  if (NATIONAL_NONWORKING_DESCS.some(p => desc.includes(p))) return false;
  // Memorial days and minor holidays = working
  if (MEMORIAL_DESCS.some(p => desc.includes(p))) return true;
  // Minor holidays = working day
  if (eventFlags & flags.MINOR_HOLIDAY) return true;
  // Default: working
  return true;
}

/**
 * Determine category of a holiday.
 */
function hebcalEventCategory(desc: string, eventFlags: number, flags: HebcalModule['flags']): 'major' | 'minor' | 'memorial' {
  if (MEMORIAL_DESCS.some(p => desc.includes(p))) return 'memorial';
  if (eventFlags & flags.CHAG) return 'major';
  if (NATIONAL_NONWORKING_DESCS.some(p => desc.includes(p))) return 'major';
  return 'minor';
}

export async function getJewishHolidays(
  year: number,
  includeMinor: boolean,
): Promise<Holiday[]> {
  const { HebrewCalendar, flags } = await getHebcal();

  const events = HebrewCalendar.calendar({
    year,
    isHebrewYear: false,
    il: true,
    sedrot: false,
    omer: false,
  });

  const results: Holiday[] = [];
  // Track grouped Chanukah
  let chanukahStart: string | null = null;
  let chanukahEnd: string | null = null;

  // Track seen IDs for deduplication (e.g. Pesach spans many days)
  const seenIds = new Set<string>();

  for (const event of events) {
    const gregDate = event.getDate().greg();
    const dateStr = dateToIso(gregDate);

    // Only events in the requested Gregorian year
    if (!dateStr.startsWith(String(year))) continue;

    const desc = event.getDesc();
    const eventFlags = event.getFlags();

    // Skip Shabbat-related and other noise events
    if (SKIP_PATTERNS.some(p => desc.startsWith(p) || desc === p)) continue;
    // Skip Rosh Chodesh
    if (eventFlags & flags.ROSH_CHODESH) continue;

    // Group Chanukah candles into one holiday
    if (isChanukahEvent(desc)) {
      if (!chanukahStart) chanukahStart = dateStr;
      chanukahEnd = dateStr;
      continue; // We'll emit one entry after the loop
    }

    const id = descToId(desc);

    // For multi-day holidays like Pesach, Sukkot — emit the first occurrence only
    if (seenIds.has(id)) continue;

    const isMinorFlag = Boolean(eventFlags & flags.MINOR_HOLIDAY);
    const isWorking = hebcalEventIsWorkingDay(desc, eventFlags, flags);

    // Filter minor holidays if not requested
    if (isMinorFlag && !includeMinor) continue;

    // Also skip "8th day" type events that were already captured
    if (id === 'pesach' && seenIds.has('pesach')) continue;
    if (id === 'sukkot' && seenIds.has('sukkot')) continue;

    seenIds.add(id);

    const hebrewName = event.render('he');
    const category = hebcalEventCategory(desc, eventFlags, flags);
    const isPublic = !isWorking || category === 'memorial';

    const hebrewDate = await getHebrewDateString(gregDate);

    const holiday: Holiday = {
      id,
      date:            dateStr,
      name:            hebrewName,
      nameEn:          desc,
      type:            HolidayType.JEWISH,
      isWorkingDay:    isWorking,
      isPublicHoliday: isPublic,
      category,
      hebrewDate,
    };

    results.push(holiday);
  }

  // Emit Chanukah as a single multi-day holiday
  if (chanukahStart) {
    const hebrewDate = await getHebrewDateString(new Date(chanukahStart + 'T12:00:00Z'));
    results.push({
      id:              'chanukah',
      date:            chanukahStart,
      endDate:         chanukahEnd ?? chanukahStart,
      name:            'חֲנוּכָּה',
      nameEn:          'Chanukah',
      type:            HolidayType.JEWISH,
      isWorkingDay:    true,
      isPublicHoliday: false,
      category:        'minor',
      hebrewDate,
    });
  }

  // Sort by date
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

// ─── Gregorian Holidays via date-holidays ────────────────────────────────────

/**
 * Map date-holidays type to our isWorkingDay / isPublicHoliday fields.
 */
function dhTypeToWorkingDay(type: HolidaysTypes.HolidayType): boolean {
  return type !== 'public' && type !== 'bank';
}

function dhTypeToIsPublic(type: HolidaysTypes.HolidayType): boolean {
  return type === 'public' || type === 'bank';
}

function dhTypeToCategory(type: HolidaysTypes.HolidayType): 'major' | 'minor' | 'memorial' {
  if (type === 'public' || type === 'bank') return 'major';
  if (type === 'observance') return 'memorial';
  return 'minor';
}

/**
 * Extract a stable YYYY-MM-DD from a date-holidays date string.
 * The date field format is "YYYY-MM-DD hh:mm:ss [-hh:ss]".
 * We use the .start Date object converted to local ISO for accuracy.
 */
function dhDateStr(dh: HolidaysTypes.Holiday): string {
  // date-holidays returns start as a Date in UTC
  // Use the date string field (first 10 chars) as canonical date
  return dh.date.slice(0, 10);
}

export function getGregorianHolidays(year: number): Holiday[] {
  const hd = new Holidays('IL');
  const dhHolidays = hd.getHolidays(year);

  // Also add a few internationally recognized Gregorian holidays not in IL data
  const hdUS = new Holidays('US');
  const usHolidays = hdUS.getHolidays(year).filter(
    h => h.type === 'public' && (
      h.name === "New Year's Day" ||
      h.name === 'Christmas Day'
    ),
  );

  const results: Holiday[] = [];
  const seenDates = new Set<string>();

  for (const dh of [...dhHolidays, ...usHolidays]) {
    const dateStr = dhDateStr(dh);
    // Only include events in the requested year
    if (!dateStr.startsWith(String(year))) continue;

    const key = `${dateStr}-${dh.name}`;
    if (seenDates.has(key)) continue;
    seenDates.add(key);

    // Calculate end date from dh.start / dh.end if multi-day
    const startDateStr = dateStr;
    let endDateStr: string | undefined;
    const startMs = dh.start.getTime();
    const endMs   = dh.end.getTime();
    const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) {
      endDateStr = addDaysToDateStr(startDateStr, diffDays - 1);
    }

    results.push({
      id:              slugify(dh.name),
      date:            startDateStr,
      endDate:         endDateStr,
      name:            dh.name,
      nameEn:          dh.name,
      type:            HolidayType.GREGORIAN,
      isWorkingDay:    dhTypeToWorkingDay(dh.type),
      isPublicHoliday: dhTypeToIsPublic(dh.type),
      category:        dhTypeToCategory(dh.type),
    });
  }

  // Sort by date
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

// ─── Muslim Holidays via date-holidays (UAE = comprehensive Muslim calendar) ─

/**
 * Known Muslim holiday name mappings to Hebrew.
 */
const MUSLIM_NAME_HE: Record<string, string> = {
  // Arabic names from AE/EG datasets
  'اليوم الأول من رمضان': 'ראשית רמדאן',
  'عيد الفطر':            'עיד אל-פיטר (חג הפסקת הצום)',
  'عيد الأضحى':           'עיד אל-אדחא (חג הקורבן)',
  'رأس السنة الهجرية':   "ראש השנה המוסלמי (אל-הג'רה)",
  'المولد النبويّ':       "מולד הנביא (מאוולד אל-נביא)",
  'المولد النبوي':        "מולד הנביא (מאוולד אל-נביא)",
  // Turkish names
  'Ramazan Bayramı':      'עיד אל-פיטר (חג הפסקת הצום)',
  'Kurban Bayramı':       'עיד אל-אדחא (חג הקורבן)',
  // English fallbacks
  'Eid al-Fitr':          'עיד אל-פיטר (חג הפסקת הצום)',
  'Eid al-Adha':          'עיד אל-אדחא (חג הקורבן)',
  'Ramadan':              'רמדאן',
};

/**
 * Which AE holiday names to include as Muslim holidays.
 */
const MUSLIM_INCLUDE_NAMES_AE = [
  'اليوم الأول من رمضان',  // Ramadan start
  'عيد الفطر',              // Eid al-Fitr
  'عيد الأضحى',             // Eid al-Adha
  'رأس السنة الهجرية',     // Islamic New Year
  'المولد النبويّ',         // Mawlid
  'المولد النبوي',
];

export function getMuslimHolidays(year: number): Holiday[] {
  // Use UAE (AE) which has the most complete Muslim holiday set
  const hd = new Holidays('AE');
  const dhHolidays = hd.getHolidays(year);

  const results: Holiday[] = [];

  for (const dh of dhHolidays) {
    if (!MUSLIM_INCLUDE_NAMES_AE.includes(dh.name)) continue;

    const dateStr = dhDateStr(dh);
    if (!dateStr.startsWith(String(year))) continue;

    const nameHe = MUSLIM_NAME_HE[dh.name] ?? dh.name;
    const isRamadan = dh.name.includes('رمضان');
    const isEid = dh.name.includes('عيد');

    // Calculate end date
    let endDateStr: string | undefined;
    const diffDays = Math.round((dh.end.getTime() - dh.start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) {
      endDateStr = addDaysToDateStr(dateStr, diffDays - 1);
    }

    results.push({
      id:              slugify(dh.name || 'muslim-holiday'),
      date:            dateStr,
      endDate:         endDateStr,
      name:            nameHe,
      nameEn:          dh.name,
      type:            HolidayType.MUSLIM,
      isWorkingDay:    isRamadan ? true : !isEid,
      isPublicHoliday: isEid,
      category:        isEid ? 'major' : 'minor',
    });
  }

  results.sort((a, b) => a.date.localeCompare(b.date));
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
    results.push(...await getJewishHolidays(year, includeMinorHolidays));
  }
  if (gregorian) {
    results.push(...getGregorianHolidays(year));
  }
  if (muslim) {
    results.push(...getMuslimHolidays(year));
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
    const dateStr   = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj   = new Date(year, month - 1, d);
    const dow       = dateObj.getDay(); // 0=Sun, 6=Sat
    const isShabbat = dow === 6;
    const holiday   = holidayMap.get(dateStr);
    const isHol     = !!holiday;
    const isWorking = !isShabbat && !nonWorkingDates.has(dateStr);

    days.push({
      date:         dateStr,
      dayOfWeek:    dow,
      isShabbat,
      isHoliday:    isHol,
      holiday:      holiday ?? undefined,
      isWorkingDay: isWorking,
    });
  }

  return { year, month, days };
}
