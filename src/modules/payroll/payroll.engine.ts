/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           PAYROLL ENGINE — Israeli Labor Law (2026)             ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Laws implemented:                                              ║
 * ║  • פקודת מס הכנסה — Income Tax Ordinance                       ║
 * ║  • חוק הביטוח הלאומי — National Insurance Law                  ║
 * ║  • צו הרחבה לפנסיה חובה (2008 + תיקון 2011)                   ║
 * ║  • חוק שעות עבודה ומנוחה, תשי"א-1951 — Overtime               ║
 * ║  • חוק דמי הבראה, תשמ"א-1980 — Recuperation Pay               ║
 * ║  • צו הרחבה דמי נסיעה — Travel Allowance                       ║
 * ║  • חוק שכר מינימום — Minimum Wage                              ║
 * ║  • חוק חופשה שנתית — Annual Vacation                           ║
 * ║  • חוק דמי מחלה — Sick Leave                                   ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Last reviewed: March 2026                                      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { PayslipCalculation, TaxBracket } from '../../shared/types';

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — TAX YEAR 2026 CONSTANTS
// Source: רשות המסים בישראל + המוסד לביטוח לאומי
// ═══════════════════════════════════════════════════════════════════

// ─── Income Tax Brackets (Monthly, ILS) ───────────────────────────
// פקודת מס הכנסה — מדרגות מס 2026
const INCOME_TAX_BRACKETS: TaxBracket[] = [
  { min: 0,      max: 7_180,  rate: 0.10 },  // 10%
  { min: 7_180,  max: 10_290, rate: 0.14 },  // 14%
  { min: 10_290, max: 16_530, rate: 0.20 },  // 20%
  { min: 16_530, max: 22_970, rate: 0.31 },  // 31%
  { min: 22_970, max: 47_720, rate: 0.35 },  // 35%
  { min: 47_720, max: null,   rate: 0.47 },  // 47%
];

// ─── Tax Credit Points ─────────────────────────────────────────────
// נקודת זיכוי — ערך חודשי 2026
const TAX_CREDIT_POINT_MONTHLY = 248; // ₪

// ─── National Insurance + Health Thresholds ────────────────────────
// ביטוח לאומי — תקרות 2026
// רצפה = 60% מהשכר הממוצע במשק (מתעדכן ינואר בכל שנה — לאמת מול אתר ב.ל.)
const NI_LOWER_THRESHOLD  = 7_522;  // ≈60% מהשכר הממוצע 2026 (~12,537 ₪)
const NI_CEILING          = 50_200; // תקרת שכר מקסימלי לב.ל. 2026

// ─── National Insurance Employee Rates ────────────────────────────
// שיעורי ביטוח לאומי עובד (לפי חוק הב.ל., ס' 176)
const NI_EMP_BELOW    = 0.004;  // 0.40% עד תקרה נמוכה
const NI_EMP_ABOVE    = 0.07;   // 7.00% מעל תקרה נמוכה

// ─── Health Insurance Employee Rates ──────────────────────────────
// מס בריאות ממלכתי (הנגבה ע"י ב.ל.)
const HI_EMP_BELOW    = 0.031;  // 3.10% עד תקרה נמוכה
const HI_EMP_ABOVE    = 0.05;   // 5.00% מעל תקרה נמוכה

// ─── National Insurance Employer Rates ────────────────────────────
// שיעורי ביטוח לאומי מעסיק
const NI_ER_BELOW     = 0.0355; // 3.55% עד תקרה נמוכה
const NI_ER_ABOVE     = 0.076;  // 7.60% מעל תקרה נמוכה

// ─── Minimum Wage ──────────────────────────────────────────────────
// שכר מינימום — חוק שכר מינימום, תשמ"ז-1987
// ⚠ יש לעדכן בינואר/יולי כל שנה בהתאם לתקנות
const MINIMUM_WAGE_MONTHLY = 6_300;  // שכר מינימום חודשי 2026 (קירוב)
const MINIMUM_WAGE_HOURLY  = 33.62;  // שכר מינימום שעתי 2026

// ─── Company Car — שווי רכב צמוד ──────────────────────────────────
// תקנות מס הכנסה (שווי שימוש ברכב), תשמ"ז-1987 + תיקון 2022
// שיעור: 2.48% ממחירון הרכב / 12 לחישוב חודשי
// רכב חשמלי/היברידי: ניכויים לפי תיקון 2022
const CAR_BENEFIT_RATE         = 0.0248; // 2.48% ממחירון
const CAR_HYBRID_DEDUCTION     = 540;    // ₪ ניכוי חודשי — היברידי (HEV)
const CAR_PLUGIN_DEDUCTION     = 1_090;  // ₪ ניכוי חודשי — פלאג-אין היברידי (PHEV)
const CAR_ELECTRIC_DEDUCTION   = 1_310;  // ₪ ניכוי חודשי — חשמלי מלא (EV)

// ─── Training Fund — קרן השתלמות ───────────────────────────────────
// צו הרחבה לקרן השתלמות; שיעור מינימלי: עובד 2.5%, מעסיק 7.5%
// תקרת שכר פטורה ממס (2026): 18,854 ₪/חודש
// הפקדה מעל התקרה: חייבת במס הכנסה לעובד
const TRAINING_FUND_SALARY_CEILING = 18_854; // ₪ תקרת שכר פטור

// ─── Travel Allowance ──────────────────────────────────────────────
// דמי נסיעה — צו הרחבה
// פטור ממס הכנסה עד עלות בפועל (תקרה = מחיר כרטיסייה)
const TRAVEL_DAILY_MAX    = 26;    // ₪ ליום עבודה (הנחיית רשות המסים)
const TRAVEL_DAYS_DEFAULT = 21;    // ימי עבודה ממוצעים בחודש (אם לא צוין)

// ─── Recuperation Pay (דמי הבראה) ─────────────────────────────────
// חוק דמי הבראה, תשמ"א-1980 + צו הרחבה
const RECUPERATION_DAILY_RATE = 438; // ₪ ליום (2026 — לפי צו הרחבה עדכני; לאמת מדי שנה)

// ימי הבראה לפי ותק (מינימום חוקי — עובדי מדינה גבוה יותר)
const RECUPERATION_TABLE = [
  { fromYear: 0,  toYear: 1,  days: 5  },
  { fromYear: 1,  toYear: 3,  days: 6  },
  { fromYear: 3,  toYear: 10, days: 7  },
  { fromYear: 10, toYear: 15, days: 8  },
  { fromYear: 15, toYear: 20, days: 9  },
  { fromYear: 20, toYear: 99, days: 10 },
];

// ─── Vacation Accrual ──────────────────────────────────────────────
// חוק חופשה שנתית, תשי"א-1951 — לפי תיקון מספר 8 משנת 2002
// ס' 3(א): מינימום ימי חופשה שנתיים לפי ותק
const VACATION_TABLE = [
  { fromYear: 0,  toYear: 3,  daysPerYear: 14 }, // שנות ותק 1–3
  { fromYear: 3,  toYear: 4,  daysPerYear: 15 }, // שנת ותק 4
  { fromYear: 4,  toYear: 5,  daysPerYear: 16 }, // שנת ותק 5
  { fromYear: 5,  toYear: 6,  daysPerYear: 18 }, // שנת ותק 6 (קפיצה לפי החוק)
  { fromYear: 6,  toYear: 7,  daysPerYear: 21 }, // שנת ותק 7 (קפיצה לפי החוק)
  { fromYear: 7,  toYear: 8,  daysPerYear: 22 }, // +1 ליום לכל שנת ותק נוספת
  { fromYear: 8,  toYear: 9,  daysPerYear: 23 },
  { fromYear: 9,  toYear: 10, daysPerYear: 24 },
  { fromYear: 10, toYear: 11, daysPerYear: 25 },
  { fromYear: 11, toYear: 12, daysPerYear: 26 },
  { fromYear: 12, toYear: 13, daysPerYear: 27 },
  { fromYear: 13, toYear: 99, daysPerYear: 28 }, // תקרת מקסימום — 28 ימים
];

// ─── Sick Leave ────────────────────────────────────────────────────
// חוק דמי מחלה, תשל"ו-1976
const SICK_LEAVE_MONTHLY = 1.5;  // 1.5 ימים לחודש

// ─── Overtime Rates ────────────────────────────────────────────────
// חוק שעות עבודה ומנוחה, תשי"א-1951
const OT_RATE_125 = 1.25;  // שעות 1–2 מעל הרגיל
const OT_RATE_150 = 1.50;  // שעות 3+ | שבת | חג

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — INDIVIDUAL CALCULATORS
// ═══════════════════════════════════════════════════════════════════

// ─── Income Tax ────────────────────────────────────────────────────
function calcIncomeTax(
  taxableIncome: number,
  taxCreditPoints: number
): { tax: number; creditsUsed: number; breakdown: PayslipCalculation['taxBracketBreakdown'] } {
  let remaining = Math.max(taxableIncome, 0);
  let gross = 0;
  const breakdown: PayslipCalculation['taxBracketBreakdown'] = [];

  for (const bracket of INCOME_TAX_BRACKETS) {
    if (remaining <= 0) break;
    const size  = bracket.max !== null ? bracket.max - bracket.min : Infinity;
    const taxable = Math.min(remaining, size);
    const taxAmt  = taxable * bracket.rate;
    breakdown.push({ min: bracket.min, max: bracket.max, rate: bracket.rate, taxableAmount: taxable, taxAmount: taxAmt });
    gross     += taxAmt;
    remaining -= taxable;
  }

  const creditsUsed = taxCreditPoints * TAX_CREDIT_POINT_MONTHLY;
  const tax         = Math.max(round2(gross - creditsUsed), 0);
  return { tax, creditsUsed: round2(creditsUsed), breakdown };
}

// ─── National Insurance + Health Insurance ─────────────────────────
function calcNI(grossForNI: number): {
  niEmp: number; hiEmp: number; niEr: number;
} {
  const capped = Math.min(grossForNI, NI_CEILING);
  const below  = Math.min(capped, NI_LOWER_THRESHOLD);
  const above  = Math.max(capped - NI_LOWER_THRESHOLD, 0);

  return {
    niEmp: round2(below * NI_EMP_BELOW + above * NI_EMP_ABOVE),
    hiEmp: round2(below * HI_EMP_BELOW + above * HI_EMP_ABOVE),
    niEr:  round2(below * NI_ER_BELOW  + above * NI_ER_ABOVE),
  };
}

// ─── Pension ───────────────────────────────────────────────────────
function calcPension(pensionBase: number, empRate: number, erRate: number, sevRate: number): {
  penEmp: number; penEr: number; sev: number;
} {
  return {
    penEmp: round2(pensionBase * (empRate / 100)),
    penEr:  round2(pensionBase * (erRate  / 100)),
    sev:    round2(pensionBase * (sevRate / 100)),
  };
}

// ─── Overtime ──────────────────────────────────────────────────────
/**
 * חישוב שעות נוספות — חוק שעות עבודה ומנוחה, תשי"א-1951
 *
 * שכר שעתי = שכר חודשי / (שעות חודשיות ממוצעות = 186)
 * שעות 1–2 מעל 8 שעות יום: 125%
 * שעות 3+ / שבת / חג:      150%
 */
function calcOvertime(
  grossSalary: number,
  hourlyRate: number | undefined,
  overtime125Hours: number,
  overtime150Hours: number
): { pay125: number; pay150: number; totalOT: number; effectiveHourly: number } {
  // הסקת שכר שעתי: אם הוזן מפורש — שימוש בו, אחרת חישוב מהמשכורת החודשית
  const MONTHLY_HOURS = 186; // 4.33 שבועות × 43 שעות (תקרה חוק שעות עבודה ומנוחה, תשי"א-1951)
  const effHourly = hourlyRate && hourlyRate > 0
    ? hourlyRate
    : round2(grossSalary / MONTHLY_HOURS);

  const pay125 = round2(effHourly * OT_RATE_125 * overtime125Hours);
  const pay150 = round2(effHourly * OT_RATE_150 * overtime150Hours);
  return { pay125, pay150, totalOT: round2(pay125 + pay150), effectiveHourly: effHourly };
}

// ─── Travel Allowance ──────────────────────────────────────────────
/**
 * דמי נסיעה — פטור ממס הכנסה; חייב בביטוח לאומי
 * תקרה: עלות בפועל, לא יותר מ-26 ₪/יום
 */
function calcTravel(workDays: number): number {
  return round2(Math.min(workDays, TRAVEL_DAYS_DEFAULT) * TRAVEL_DAILY_MAX);
}

// ─── Recuperation Pay ──────────────────────────────────────────────
/**
 * דמי הבראה חודשיים = (ימי הבראה שנתיים × 432₪) / 12
 * מחושב לפי ותק — חוק דמי הבראה, תשמ"א-1980
 */
function calcRecuperation(startDate: Date, periodDate: Date): {
  annualDays: number; monthlyAmount: number;
} {
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const yearsEmployed = Math.floor(
    (periodDate.getTime() - startDate.getTime()) / msPerYear
  );

  const row = RECUPERATION_TABLE
    .filter(r => yearsEmployed >= r.fromYear)
    .at(-1) ?? RECUPERATION_TABLE[0];

  const annualDays     = row.days;
  const monthlyAmount  = round2((annualDays * RECUPERATION_DAILY_RATE) / 12);
  return { annualDays, monthlyAmount };
}

// ─── Vacation Accrual ──────────────────────────────────────────────
/**
 * ימי חופשה שנצברו החודש = ימים שנתיים / 12
 * חוק חופשה שנתית, תשי"א-1951
 */
function calcVacationAccrual(startDate: Date, periodDate: Date): number {
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const yearsEmployed = (periodDate.getTime() - startDate.getTime()) / msPerYear;

  const row = VACATION_TABLE
    .filter(r => yearsEmployed >= r.fromYear)
    .at(-1) ?? VACATION_TABLE[0];

  return round2(row.daysPerYear / 12);
}

// ─── Company Car Benefit — שווי רכב צמוד ──────────────────────────
/**
 * תקנות מס הכנסה (שווי שימוש ברכב), תשמ"ז-1987
 * שווי חודשי = מחירון × 2.48% / 12
 * ניכויים לפי תיקון 2022: היברידי -540, פלאג-אין -1,090, חשמלי -1,310
 *
 * שווי הרכב מתווסף לברוטו החייב במס ובביטוח לאומי.
 * יש לכלול בתלוש כרכיב הכנסה נפרד.
 */
export function calcCarBenefit(
  listPrice: number,
  carType: 'REGULAR' | 'HYBRID' | 'PLUGIN_HYBRID' | 'ELECTRIC' = 'REGULAR'
): number {
  if (!listPrice || listPrice <= 0) return 0;
  const raw = round2(listPrice * CAR_BENEFIT_RATE / 12);
  const deduction =
    carType === 'ELECTRIC'      ? CAR_ELECTRIC_DEDUCTION :
    carType === 'PLUGIN_HYBRID' ? CAR_PLUGIN_DEDUCTION   :
    carType === 'HYBRID'        ? CAR_HYBRID_DEDUCTION   : 0;
  return Math.max(0, round2(raw - deduction));
}

// ─── Training Fund — קרן השתלמות ───────────────────────────────────
/**
 * צו הרחבה — קרן השתלמות לשכירים
 * עובד: 2.5% מהשכר הקובע (נוכה מהנטו — לא מוכר לניכוי ממס)
 * מעסיק: 7.5% מהשכר הקובע (עלות מעסיק; פטור ממס עד תקרה)
 *
 * תקרת שכר לפטור ממס 2026: 18,854 ₪/חודש
 * מעל התקרה: חלק ההפרשה מעל 4.5% (מעסיק) = הכנסה חייבת לעובד
 */
export function calcTrainingFund(
  salaryBase: number,
  empRate: number,  // % (e.g. 2.5)
  erRate:  number   // % (e.g. 7.5)
): {
  empContrib:       number;  // ₪ ניכוי מעובד
  erContrib:        number;  // ₪ עלות מעסיק
  taxableExcess:    number;  // ₪ חייב במס הכנסה (מעל תקרה)
} {
  if (empRate <= 0 && erRate <= 0) return { empContrib: 0, erContrib: 0, taxableExcess: 0 };

  const empContrib = round2(salaryBase * empRate / 100);
  const erContrib  = round2(salaryBase * erRate  / 100);

  // חישוב עודף חייב במס: הפרשת מעסיק מעל 4.5% על שכר מעל תקרה
  const MAX_EXEMPT_ER_PCT = 4.5;
  const taxableExcess = salaryBase > TRAINING_FUND_SALARY_CEILING
    ? round2((salaryBase - TRAINING_FUND_SALARY_CEILING) * Math.min(erRate, MAX_EXEMPT_ER_PCT) / 100)
    : 0;

  return { empContrib, erContrib, taxableExcess };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — MAIN calculatePayslip FUNCTION
// ═══════════════════════════════════════════════════════════════════

export interface PayslipParams {
  // ── Required base params ───────────────────────────────────────
  grossSalary:         number;   // שכר יסוד חודשי
  taxCreditPoints:     number;   // נקודות זיכוי (כולל כל הזיכויים)
  pensionEmployeeRate: number;   // % פנסיה עובד (e.g. 6.00)
  pensionEmployerRate: number;   // % פנסיה מעסיק (e.g. 6.50)
  severancePayRate:    number;   // % פיצויים (e.g. 8.33)

  // ── Overtime ───────────────────────────────────────────────────
  hourlyRate?:         number;   // שכר שעתי (לעובד שעתי; אחרת מחושב)
  overtime125Hours?:   number;   // שעות נוספות 125%
  overtime150Hours?:   number;   // שעות נוספות 150% / שבת / חג

  // ── Travel ─────────────────────────────────────────────────────
  travelWorkDays?:     number;   // ימי עבודה בחודש לנסיעות (ברירת מחדל: 21)

  // ── Recuperation ───────────────────────────────────────────────
  includeRecuperation?: boolean; // האם לכלול הבראה חודשית?
  startDate?:           Date;    // תאריך תחילת עבודה
  period?:              string;  // "YYYY-MM" — לחישוב הבראה וחופשה

  // ── Bonus / extras ─────────────────────────────────────────────
  bonusAmount?:        number;   // בונוס / תוספת מיוחדת

  // ── Company Car — שווי רכב צמוד ──────────────────────────────
  // תקנות מס הכנסה (שווי שימוש ברכב) — 2.48% ממחירון
  carListPrice?:       number;   // מחירון הרכב (₪) — null/0 = אין רכב
  carType?:            'REGULAR' | 'HYBRID' | 'PLUGIN_HYBRID' | 'ELECTRIC';

  // ── Training Fund — קרן השתלמות ──────────────────────────────
  // צו הרחבה — עובד 2.5%, מעסיק 7.5% (0 = ללא קרן)
  trainingFundEmpRate?: number;  // % עובד (e.g. 2.5)
  trainingFundErRate?:  number;  // % מעסיק (e.g. 7.5)

  // ── Reporting fields (do not affect calculation) ───────────
  miluimDays?:         number;   // ימי מילואים — לדיווח טופס 126
  sickDays?:           number;   // ימי מחלה — לדיווח
  unpaidLeaveDays?:    number;   // ימי חופשה ללא תשלום
}

export function calculatePayslip(params: PayslipParams): PayslipCalculation {
  const {
    grossSalary,
    taxCreditPoints,
    pensionEmployeeRate,
    pensionEmployerRate,
    severancePayRate,
    hourlyRate,
    overtime125Hours    = 0,
    overtime150Hours    = 0,
    travelWorkDays      = TRAVEL_DAYS_DEFAULT,
    includeRecuperation = false,
    startDate,
    period,
    bonusAmount         = 0,
    carListPrice        = 0,
    carType             = 'REGULAR',
    trainingFundEmpRate = 0,
    trainingFundErRate  = 0,
    miluimDays          = 0,
    sickDays            = 0,
    unpaidLeaveDays     = 0,
  } = params;

  if (grossSalary < 0)         throw new Error('Gross salary cannot be negative');
  if (pensionEmployeeRate < 0) throw new Error('Pension employee rate cannot be negative');

  // ── Determine period date ────────────────────────────────────────
  let periodDate: Date;
  if (period) {
    const [y, m] = period.split('-').map(Number);
    periodDate = new Date(y, m - 1, 1);
  } else {
    periodDate = new Date();
  }

  // ── 1. Overtime ──────────────────────────────────────────────────
  const { pay125, pay150, totalOT } = calcOvertime(
    grossSalary, hourlyRate, overtime125Hours, overtime150Hours
  );

  // ── 2. Recuperation ──────────────────────────────────────────────
  let recuperationPay = 0;
  if (includeRecuperation && startDate) {
    const rec = calcRecuperation(startDate, periodDate);
    recuperationPay = rec.monthlyAmount;
  }

  // ── 3. Travel allowance ──────────────────────────────────────────
  // פטור ממס הכנסה; חייב בביטוח לאומי
  const travelAllowance = calcTravel(travelWorkDays);

  // ── 4. Company Car — שווי רכב צמוד ──────────────────────────────
  // חייב במס הכנסה ובביטוח לאומי (מצטרף לברוטו לכל מטרה)
  const carBenefit = calcCarBenefit(carListPrice, carType);

  // ── 5. Gross components ──────────────────────────────────────────
  // Pension base = base salary only (legal minimum; some CBAs differ)
  const pensionBase = grossSalary;

  // Total taxable gross = יסוד + שעות נוספות + הבראה + בונוס + שווי רכב
  // (נסיעות פטורות ממס הכנסה אך חייבות בב.ל.)
  const totalGross = round2(grossSalary + totalOT + recuperationPay + bonusAmount + carBenefit);

  // NI base = הכל כולל נסיעות ושווי רכב
  const grossForNI = round2(totalGross + travelAllowance);

  // Taxable income for income tax = totalGross (נסיעות פטורות ממס הכנסה)
  const taxableIncome = totalGross; // carBenefit already included above

  // ── 6. Training Fund — קרן השתלמות ───────────────────────────────
  // הפרשת מעסיק מעל תקרה = הכנסה חייבת נוספת (מוסיפה ל-taxableIncome)
  const { empContrib: tfEmp, erContrib: tfEr, taxableExcess: tfTaxableExcess }
    = calcTrainingFund(grossSalary, trainingFundEmpRate, trainingFundErRate);

  // הכנסה חייבת סופית (כולל עודף קרן השתלמות מעל תקרה)
  const taxableIncomeTotal = round2(taxableIncome + tfTaxableExcess);

  // ── 7. Income tax ────────────────────────────────────────────────
  const { tax: incomeTax, creditsUsed, breakdown } = calcIncomeTax(taxableIncomeTotal, taxCreditPoints);

  // ── 8. National Insurance ────────────────────────────────────────
  const { niEmp, hiEmp, niEr } = calcNI(grossForNI);

  // ── 9. Pension ───────────────────────────────────────────────────
  const { penEmp, penEr, sev } = calcPension(
    pensionBase,
    pensionEmployeeRate,
    pensionEmployerRate,
    severancePayRate
  );

  // ── 10. Net salary ───────────────────────────────────────────────
  // ניכויים מהעובד: מס + ב.ל. + בריאות + פנסיה + קרן השתלמות
  const totalDeductions = round2(incomeTax + niEmp + hiEmp + penEmp + tfEmp);
  const netSalary       = round2(totalGross + travelAllowance - totalDeductions);

  // ── 11. Total employer cost ──────────────────────────────────────
  const totalEmployerCost = round2(totalGross + travelAllowance + penEr + sev + niEr + tfEr);

  // ── 12. Minimum wage check ───────────────────────────────────────
  const minimumWageOk = grossSalary >= MINIMUM_WAGE_MONTHLY;

  // ── 13. Accruals ─────────────────────────────────────────────────
  const vacationAccruedDays = startDate
    ? calcVacationAccrual(startDate, periodDate)
    : round2(14 / 12); // default: 1.17 days/month (minimum)

  return {
    // Income
    baseSalary:       grossSalary,
    overtimePay125:   pay125,
    overtimePay150:   pay150,
    travelAllowance,
    recuperationPay,
    bonusAmount,
    carBenefit,                           // שווי רכב צמוד — חייב במס ובב.ל.
    grossSalary:      totalGross,
    grossForNI,
    taxableIncome:    taxableIncomeTotal, // כולל עודף קרן השתלמות מעל תקרה

    // Deductions
    incomeTax:                  round2(incomeTax),
    taxCreditsAmount:           round2(creditsUsed),
    nationalInsuranceEmployee:  niEmp,
    healthInsuranceEmployee:    hiEmp,
    pensionEmployee:            penEmp,
    trainingFundEmployee:       tfEmp,   // קרן השתלמות — ניכוי מעובד
    totalDeductions,
    netSalary,

    // Employer
    pensionEmployer:            penEr,
    severancePay:               sev,
    nationalInsuranceEmployer:  niEr,
    trainingFundEmployer:       tfEr,   // קרן השתלמות — הפרשת מעסיק
    totalEmployerCost,

    // Legal
    minimumWageOk,
    minimumWage: MINIMUM_WAGE_MONTHLY,

    // Accruals
    vacationAccruedDays,
    sickLeaveAccruedDays: SICK_LEAVE_MONTHLY,

    // Reporting (stored for Form 126 / payroll reports)
    miluimDays,
    sickDays,
    unpaidLeaveDays,

    // Detail
    taxBracketBreakdown: breakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — SUPPLEMENTARY CALCULATORS (exported for use in routes)
// ═══════════════════════════════════════════════════════════════════

/**
 * חישוב שכר חלקי חודש (עובד שנכנס/יצא באמצע)
 * שכר חלקי = שכר מלא × (ימי עבודה בפועל / סה"כ ימי עבודה בחודש)
 */
export function calcPartialMonth(
  fullMonthlySalary: number,
  actualWorkDays: number,
  totalWorkDaysInMonth: number
): number {
  if (totalWorkDaysInMonth <= 0) return fullMonthlySalary;
  return round2(fullMonthlySalary * (actualWorkDays / totalWorkDaysInMonth));
}

/**
 * חישוב שיעור השכר לשעה (לתלוש ולשעות נוספות)
 * 186 שעות = 4.33 שבועות × 43 שעות (תקרה לפי חוק שעות עבודה ומנוחה, תשי"א-1951)
 * הערה: חלק מבתי הדין לעבודה מקבלים 182 שעות (42ש' × 4.33) בהסכמים קיבוציים
 */
export function calcHourlyRate(monthlySalary: number): number {
  return round2(monthlySalary / 186);
}

/**
 * חישוב פיצויי פיטורים (סעיף 12 לחוק פיצויי פיטורים, תשכ"ג-1963)
 * פיצויים = שכר אחרון × שנות ותק
 */
export function calcSeveranceEntitlement(
  lastSalary: number,
  startDate: Date,
  terminationDate: Date
): { years: number; months: number; totalAmount: number } {
  const ms = terminationDate.getTime() - startDate.getTime();
  const totalMonths = Math.floor(ms / (30.44 * 24 * 3600 * 1000));
  const years       = Math.floor(totalMonths / 12);
  const months      = totalMonths % 12;
  const totalAmount = round2(lastSalary * (years + months / 12));
  return { years, months, totalAmount };
}

/**
 * חישוב פדיון חופשה (שכר חופשה שלא נוצל)
 * שכר יומי = שכר חודשי / 25 ימי עבודה
 */
export function calcVacationPayout(
  monthlySalary: number,
  unusedVacationDays: number
): number {
  const dailyRate = monthlySalary / 25;
  return round2(dailyRate * unusedVacationDays);
}

/**
 * חישוב דמי מחלה לתשלום (ס' 2 לחוק דמי מחלה)
 * יום 1: 0% | ימים 2–3: 50% | יום 4+: 100%
 */
export function calcSickPay(
  dailySalary: number,
  sickDays: number,
  availableBalance: number
): { payableDays: number; amount: number } {
  const usableDays = Math.min(sickDays, availableBalance);
  if (usableDays <= 0) return { payableDays: 0, amount: 0 };

  let amount = 0;
  let payableDays = 0;
  for (let day = 1; day <= usableDays; day++) {
    if (day === 1)          { /* ראשון — לא משלמים */ }
    else if (day <= 3)      { amount += dailySalary * 0.50; payableDays++; }
    else                    { amount += dailySalary * 1.00; payableDays++; }
  }
  return { payableDays, amount: round2(amount) };
}

// ─── Utility ──────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Export constants for use in reports ──────────────────────────
export const PAYROLL_CONSTANTS_2026 = {
  taxBrackets:         INCOME_TAX_BRACKETS,
  taxCreditPoint:      TAX_CREDIT_POINT_MONTHLY,
  niLowerThreshold:    NI_LOWER_THRESHOLD,
  niCeiling:           NI_CEILING,
  niEmployeeBelow:     NI_EMP_BELOW,
  niEmployeeAbove:     NI_EMP_ABOVE,
  hiEmployeeBelow:     HI_EMP_BELOW,
  hiEmployeeAbove:     HI_EMP_ABOVE,
  niEmployerBelow:     NI_ER_BELOW,
  niEmployerAbove:     NI_ER_ABOVE,
  minimumWageMonthly:  MINIMUM_WAGE_MONTHLY,
  minimumWageHourly:   MINIMUM_WAGE_HOURLY,
  travelDailyMax:      TRAVEL_DAILY_MAX,
  recuperationDaily:   RECUPERATION_DAILY_RATE,
  sickLeaveMonthly:    SICK_LEAVE_MONTHLY,
};
