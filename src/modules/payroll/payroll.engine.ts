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
const NI_LOWER_THRESHOLD  = 7_100;  // 60% מהשכר הממוצע (קירוב)
const NI_CEILING          = 50_200; // תקרת שכר מקסימלי לב.ל.

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

// ─── Travel Allowance ──────────────────────────────────────────────
// דמי נסיעה — צו הרחבה
// פטור ממס הכנסה עד עלות בפועל (תקרה = מחיר כרטיסייה)
const TRAVEL_DAILY_MAX    = 26;    // ₪ ליום עבודה (הנחיית רשות המסים)
const TRAVEL_DAYS_DEFAULT = 21;    // ימי עבודה ממוצעים בחודש (אם לא צוין)

// ─── Recuperation Pay (דמי הבראה) ─────────────────────────────────
// חוק דמי הבראה, תשמ"א-1980 + צו הרחבה
const RECUPERATION_DAILY_RATE = 432; // ₪ ליום (2026 — יש לעדכן)

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
// חוק חופשה שנתית, תשי"א-1951
const VACATION_TABLE = [
  { fromYear: 0,  toYear: 5,  daysPerYear: 14 },
  { fromYear: 5,  toYear: 7,  daysPerYear: 16 },
  { fromYear: 7,  toYear: 8,  daysPerYear: 17 },
  { fromYear: 8,  toYear: 9,  daysPerYear: 18 },
  { fromYear: 9,  toYear: 10, daysPerYear: 19 },
  { fromYear: 10, toYear: 11, daysPerYear: 20 },
  { fromYear: 11, toYear: 12, daysPerYear: 21 },
  { fromYear: 12, toYear: 13, daysPerYear: 22 },
  { fromYear: 13, toYear: 14, daysPerYear: 23 },
  { fromYear: 14, toYear: 15, daysPerYear: 24 },
  { fromYear: 15, toYear: 99, daysPerYear: 28 },
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
  const MONTHLY_HOURS = 186; // ממוצע שעות בחודש = 43 שבועות × 43... actually 186 standard
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

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — MAIN calculatePayslip FUNCTION
// ═══════════════════════════════════════════════════════════════════

export interface PayslipParams {
  // ── Required base params ───────────────────────────────────────
  grossSalary:         number;   // שכר יסוד חודשי
  taxCreditPoints:     number;   // נקודות זיכוי
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
}

export function calculatePayslip(params: PayslipParams): PayslipCalculation {
  const {
    grossSalary,
    taxCreditPoints,
    pensionEmployeeRate,
    pensionEmployerRate,
    severancePayRate,
    hourlyRate,
    overtime125Hours  = 0,
    overtime150Hours  = 0,
    travelWorkDays    = TRAVEL_DAYS_DEFAULT,
    includeRecuperation = false,
    startDate,
    period,
    bonusAmount       = 0,
  } = params;

  if (grossSalary < 0)      throw new Error('Gross salary cannot be negative');
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
  const travelAllowance = calcTravel(travelWorkDays);

  // ── 4. Gross salary ──────────────────────────────────────────────
  // Pension base = base salary only (not overtime for basic calculation,
  // though some CBAs include overtime — this is the minimum legal)
  const pensionBase = grossSalary;

  // Total gross (for taloosh display)
  const totalGross = round2(grossSalary + totalOT + recuperationPay + bonusAmount);

  // NI base = everything including travel (מס בריאות/ב.ל. חל על הכל)
  const grossForNI = round2(totalGross + travelAllowance);

  // Taxable income = gross - travel (נסיעות פטורות ממס הכנסה)
  const taxableIncome = round2(totalGross - 0); // travel exempt from tax but NI applies
  // NOTE: travel is added to grossForNI but NOT to taxableIncome — correct per Israeli law

  // ── 5. Income tax ────────────────────────────────────────────────
  const { tax: incomeTax, creditsUsed, breakdown } = calcIncomeTax(taxableIncome, taxCreditPoints);

  // ── 6. National Insurance ────────────────────────────────────────
  const { niEmp, hiEmp, niEr } = calcNI(grossForNI);

  // ── 7. Pension ───────────────────────────────────────────────────
  const { penEmp, penEr, sev } = calcPension(
    pensionBase,
    pensionEmployeeRate,
    pensionEmployerRate,
    severancePayRate
  );

  // ── 8. Net salary ────────────────────────────────────────────────
  const totalDeductions = round2(incomeTax + niEmp + hiEmp + penEmp);
  const netSalary       = round2(totalGross + travelAllowance - totalDeductions);

  // ── 9. Total employer cost ───────────────────────────────────────
  const totalEmployerCost = round2(totalGross + travelAllowance + penEr + sev + niEr);

  // ── 10. Minimum wage check ───────────────────────────────────────
  const minimumWageOk = grossSalary >= MINIMUM_WAGE_MONTHLY;

  // ── 11. Accruals ─────────────────────────────────────────────────
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
    grossSalary:      totalGross,
    grossForNI,
    taxableIncome,

    // Deductions
    incomeTax:                  round2(incomeTax),
    taxCreditsAmount:           round2(creditsUsed),
    nationalInsuranceEmployee:  niEmp,
    healthInsuranceEmployee:    hiEmp,
    pensionEmployee:            penEmp,
    totalDeductions,
    netSalary,

    // Employer
    pensionEmployer:            penEr,
    severancePay:               sev,
    nationalInsuranceEmployer:  niEr,
    totalEmployerCost,

    // Legal
    minimumWageOk,
    minimumWage: MINIMUM_WAGE_MONTHLY,

    // Accruals
    vacationAccruedDays,
    sickLeaveAccruedDays: SICK_LEAVE_MONTHLY,

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
 * 186 שעות = ממוצע חודשי (4.33 שבועות × 43 שעות)
 * ⚠ חלק מהמעסיקים משתמשים ב-182 — הנה המקובל לפי רשות המסים
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
