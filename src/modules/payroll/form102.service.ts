import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

/**
 * Generates Form 102 — monthly employer report for the Israeli Tax Authority.
 * Returns an XLSX buffer with one row per employee and a totals row at the bottom.
 */
export async function generateForm102Excel(
  tenantId: string,
  period: string,   // "YYYY-MM"
  prisma: PrismaClient
): Promise<Buffer> {
  // ─── Fetch payslips + employee data ──────────────────────────
  const [payslips, tenant] = await Promise.all([
    prisma.payslip.findMany({
      where:   { tenantId, period, deletedAt: null },
      include: { employee: true },
      orderBy: { employee: { lastName: 'asc' } },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  ]);

  const companyName   = tenant?.name ?? tenantId;
  const vatNumber     = tenant?.vatNumber ?? tenant?.businessNumber ?? '';

  // ─── Build worksheet data ────────────────────────────────────
  const wb = XLSX.utils.book_new();

  // Title rows
  const titleRows: (string | number)[][] = [
    ['טופס 102 - דוח מעסיק חודשי', period],
    [companyName, vatNumber ? `ע.מ. ${vatNumber}` : ''],
    [],
    // Headers (RTL-friendly — Hebrew labels)
    [
      'מספר שורה',
      'שם עובד',
      'ת.ז.',
      'שכר ברוטו',
      'מס הכנסה',
      'ב.ל. עובד',
      'ב.ל. מעסיק',
      'מס בריאות',
      'פנסיה עובד',
      'פנסיה מעסיק',
      'פיצויים',
      'קרן השתלמות עובד',
      'קרן השתלמות מעסיק',
      'שכר נטו',
    ],
  ];

  // Data rows
  const dataRows = payslips.map((p, idx) => {
    const emp  = p.employee;
    const name = `${emp.firstName} ${emp.lastName}`;
    return [
      idx + 1,                              // מספר שורה
      name,                                 // שם עובד
      emp.idNumber,                         // ת.ז.
      Number(p.grossSalary),               // שכר ברוטו
      Number(p.incomeTax),                 // מס הכנסה
      Number(p.nationalInsurance),         // ב.ל. עובד
      Number(p.niEmployer),               // ב.ל. מעסיק
      Number(p.healthInsurance),           // מס בריאות
      Number(p.pensionEmployee),           // פנסיה עובד
      Number(p.pensionEmployer),           // פנסיה מעסיק
      Number(p.severancePay),             // פיצויים
      Number(p.trainingFundEmployee),      // קרן השתלמות עובד
      Number(p.trainingFundEmployer),      // קרן השתלמות מעסיק
      Number(p.netSalary),                // שכר נטו
    ];
  });

  // Totals row
  const numEmployees  = payslips.length;
  const sum = (fn: (p: typeof payslips[0]) => number) =>
    payslips.reduce((s, p) => s + fn(p), 0);

  const totalsRow = [
    '',
    `סה"כ (${numEmployees} עובדים)`,
    '',
    sum(p => Number(p.grossSalary)),
    sum(p => Number(p.incomeTax)),
    sum(p => Number(p.nationalInsurance)),
    sum(p => Number(p.niEmployer)),
    sum(p => Number(p.healthInsurance)),
    sum(p => Number(p.pensionEmployee)),
    sum(p => Number(p.pensionEmployer)),
    sum(p => Number(p.severancePay)),
    sum(p => Number(p.trainingFundEmployee)),
    sum(p => Number(p.trainingFundEmployer)),
    sum(p => Number(p.netSalary)),
  ];

  // Empty separator before totals
  const allRows = [...titleRows, ...dataRows, [], totalsRow];

  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // ─── Column widths ────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 8 },   // מספר שורה
    { wch: 22 },  // שם עובד
    { wch: 12 },  // ת.ז.
    { wch: 12 },  // שכר ברוטו
    { wch: 12 },  // מס הכנסה
    { wch: 11 },  // ב.ל. עובד
    { wch: 11 },  // ב.ל. מעסיק
    { wch: 11 },  // מס בריאות
    { wch: 12 },  // פנסיה עובד
    { wch: 12 },  // פנסיה מעסיק
    { wch: 10 },  // פיצויים
    { wch: 16 },  // קרן השתלמות עובד
    { wch: 16 },  // קרן השתלמות מעסיק
    { wch: 12 },  // שכר נטו
  ];

  XLSX.utils.book_append_sheet(wb, ws, `טופס 102 - ${period}`);

  // ─── Write to buffer ─────────────────────────────────────────
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf;
}
