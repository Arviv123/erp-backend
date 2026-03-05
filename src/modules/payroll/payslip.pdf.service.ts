import PDFDocument from 'pdfkit';

// ─── Hebrew month names ──────────────────────────────────────────
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatPeriodHebrew(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${HEBREW_MONTHS[m - 1]} ${y}`;
}

function formatNIS(amount: number): string {
  return `${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
}

// ─── Payslip PDF opts ────────────────────────────────────────────
export interface PayslipPDFOpts {
  payslip: {
    id: string;
    period: string;                   // "2026-02"
    grossSalary: number;
    netSalary: number;
    incomeTax: number;
    nationalInsuranceEmployee: number;
    nationalInsuranceEmployer: number;
    healthInsurance: number;
    pensionEmployee: number;
    pensionEmployer: number;
    trainingFundEmployee: number;
    trainingFundEmployer: number;
    sickDays: number;
    vacationDays: number;
    recuperationDays?: number;
    recuperationPay?: number;
    overtimeHours?: number;
    overtimePay?: number;
    baseSalary?: number;
  };
  employeeName: string;
  employeeId: string;
  idNumber?: string;
  jobTitle?: string;
  department?: string;
  companyName: string;
  companyVatNumber?: string;
}

export function generatePayslipPDF(opts: PayslipPDFOpts): Buffer {
  const { payslip, employeeName, employeeId, idNumber, jobTitle, department, companyName, companyVatNumber } = opts;

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = 595.28;
  const marginL = 40;
  const marginR = 40;
  const contentWidth = pageWidth - marginL - marginR;
  const rightX = pageWidth - marginR;

  // ─── Helper: draw a two-column row (label left, value right) ──
  function drawRow(label: string, value: string, y: number, bold = false, color = '#1a1a1a'): number {
    doc.fontSize(10).fillColor(color);
    if (bold) doc.font('Helvetica-Bold');
    else doc.font('Helvetica');
    doc.text(label, marginL, y, { width: contentWidth * 0.65 });
    doc.font('Helvetica-Bold').fillColor(color);
    doc.text(value, marginL + contentWidth * 0.65, y, { width: contentWidth * 0.35, align: 'right' });
    return y + 18;
  }

  function drawDivider(y: number, color = '#cccccc'): number {
    doc.strokeColor(color).lineWidth(0.5).moveTo(marginL, y).lineTo(rightX, y).stroke();
    return y + 8;
  }

  function drawSectionHeader(title: string, y: number, bgColor = '#f0f4f8'): number {
    doc.rect(marginL, y, contentWidth, 20).fill(bgColor);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#2d3748')
      .text(title, marginL + 6, y + 4, { width: contentWidth });
    return y + 28;
  }

  // ─────────────────────────────────────────────────────────────
  // HEADER
  // ─────────────────────────────────────────────────────────────
  let y = 40;

  // Company name + title
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a365d')
    .text(companyName, marginL, y, { width: contentWidth, align: 'center' });
  y += 26;

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#2b6cb0')
    .text('TALOOSH SCHAR  |  תלוש שכר', marginL, y, { width: contentWidth, align: 'center' });
  y += 20;

  doc.fontSize(12).font('Helvetica').fillColor('#4a5568')
    .text(formatPeriodHebrew(payslip.period), marginL, y, { width: contentWidth, align: 'center' });
  y += 8;

  if (companyVatNumber) {
    doc.fontSize(9).font('Helvetica').fillColor('#718096')
      .text(`Osek Morasheh / Eosek Patur: ${companyVatNumber}`, marginL, y, { width: contentWidth, align: 'center' });
    y += 14;
  }

  // Heavy divider under header
  doc.strokeColor('#2b6cb0').lineWidth(2).moveTo(marginL, y).lineTo(rightX, y).stroke();
  y += 12;

  // ─────────────────────────────────────────────────────────────
  // EMPLOYEE DETAILS
  // ─────────────────────────────────────────────────────────────
  y = drawSectionHeader('PIRTEI OVED  |  פרטי עובד', y, '#ebf4ff');

  // Two-column employee info
  const leftColX  = marginL;
  const rightColX = marginL + contentWidth / 2 + 10;
  const colW      = contentWidth / 2 - 10;

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#4a5568').text('Shem:', leftColX, y);
  doc.font('Helvetica').fillColor('#1a1a1a').text(employeeName, leftColX + 60, y, { width: colW - 60 });

  if (idNumber) {
    doc.font('Helvetica-Bold').fillColor('#4a5568').text('T.Z.:', rightColX, y);
    doc.font('Helvetica').fillColor('#1a1a1a').text(idNumber, rightColX + 45, y, { width: colW - 45 });
  }
  y += 16;

  if (jobTitle) {
    doc.font('Helvetica-Bold').fillColor('#4a5568').text('Tafkid:', leftColX, y);
    doc.font('Helvetica').fillColor('#1a1a1a').text(jobTitle, leftColX + 60, y, { width: colW - 60 });
  }
  if (department) {
    doc.font('Helvetica-Bold').fillColor('#4a5568').text('Machlaka:', rightColX, y);
    doc.font('Helvetica').fillColor('#1a1a1a').text(department, rightColX + 65, y, { width: colW - 65 });
  }
  y += 16;

  doc.font('Helvetica-Bold').fillColor('#4a5568').text('Tkufa:', leftColX, y);
  doc.font('Helvetica').fillColor('#1a1a1a').text(formatPeriodHebrew(payslip.period), leftColX + 60, y, { width: colW - 60 });
  y += 8;

  y = drawDivider(y + 4, '#bee3f8');

  // ─────────────────────────────────────────────────────────────
  // SALARY BREAKDOWN
  // ─────────────────────────────────────────────────────────────
  y = drawSectionHeader('RAKHIVEI SCHAR  |  רכיבי שכר', y, '#f0fff4');

  const baseSalary     = payslip.baseSalary    ?? payslip.grossSalary;
  const overtimePay    = payslip.overtimePay   ?? 0;
  const recuperationPay = payslip.recuperationPay ?? 0;

  y = drawRow('Schar Basis  |  שכר בסיס',            formatNIS(baseSalary),      y);
  y = drawDivider(y - 4, '#e2e8f0');

  if (overtimePay > 0) {
    const otHours = payslip.overtimeHours ?? 0;
    y = drawRow(`Shaot Nosafot  |  שעות נוספות (${otHours} sh.)`, formatNIS(overtimePay), y);
    y = drawDivider(y - 4, '#e2e8f0');
  }

  if (recuperationPay > 0) {
    const recupDays = payslip.recuperationDays ?? 0;
    y = drawRow(`Havra'a  |  הבראה (${recupDays} yamim)`, formatNIS(recuperationPay), y);
    y = drawDivider(y - 4, '#e2e8f0');
  }

  // Gross total row
  doc.rect(marginL, y - 2, contentWidth, 22).fill('#c6f6d5');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#22543d')
    .text('SCHAR BRUTO  |  שכר ברוטו', marginL + 6, y + 2, { width: contentWidth * 0.65 });
  doc.text(formatNIS(payslip.grossSalary), marginL + contentWidth * 0.65, y + 2, { width: contentWidth * 0.35, align: 'right' });
  y += 30;

  // ─────────────────────────────────────────────────────────────
  // DEDUCTIONS
  // ─────────────────────────────────────────────────────────────
  y = drawSectionHeader('NIKUYIM  |  ניכויים', y, '#fff5f5');

  y = drawRow('Mas Hachnasa  |  מס הכנסה',                    formatNIS(payslip.incomeTax),                  y, false, '#c53030');
  y = drawDivider(y - 4, '#e2e8f0');
  y = drawRow('Bituach Leumi (Oved)  |  ביטוח לאומי עובד',   formatNIS(payslip.nationalInsuranceEmployee),  y, false, '#c53030');
  y = drawDivider(y - 4, '#e2e8f0');
  y = drawRow('Mas Briut  |  מס בריאות',                      formatNIS(payslip.healthInsurance),            y, false, '#c53030');
  y = drawDivider(y - 4, '#e2e8f0');
  y = drawRow('Pension (Oved)  |  פנסיה עובד',                formatNIS(payslip.pensionEmployee),            y, false, '#c53030');
  y = drawDivider(y - 4, '#e2e8f0');

  if (payslip.trainingFundEmployee > 0) {
    y = drawRow('Keren Hishtalmut (Oved)  |  קרן השתלמות עובד', formatNIS(payslip.trainingFundEmployee), y, false, '#c53030');
    y = drawDivider(y - 4, '#e2e8f0');
  }

  const totalDeductions = payslip.incomeTax + payslip.nationalInsuranceEmployee +
    payslip.healthInsurance + payslip.pensionEmployee + payslip.trainingFundEmployee;

  doc.rect(marginL, y - 2, contentWidth, 22).fill('#fed7d7');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#742a2a')
    .text('SACH NIKUYIM  |  סך ניכויים', marginL + 6, y + 2, { width: contentWidth * 0.65 });
  doc.text(formatNIS(totalDeductions), marginL + contentWidth * 0.65, y + 2, { width: contentWidth * 0.35, align: 'right' });
  y += 30;

  // ─────────────────────────────────────────────────────────────
  // EMPLOYER CONTRIBUTIONS (informational)
  // ─────────────────────────────────────────────────────────────
  y = drawSectionHeader('HAFRASHAT MAASIK  |  הפרשות מעסיק (לידיעה)', y, '#faf5ff');

  y = drawRow('Bituach Leumi (Maasik)  |  ביטוח לאומי מעסיק', formatNIS(payslip.nationalInsuranceEmployer), y, false, '#553c9a');
  y = drawDivider(y - 4, '#e2e8f0');
  y = drawRow('Pension (Maasik)  |  פנסיה מעסיק',              formatNIS(payslip.pensionEmployer),           y, false, '#553c9a');
  y = drawDivider(y - 4, '#e2e8f0');

  if (payslip.trainingFundEmployer > 0) {
    y = drawRow('Keren Hishtalmut (Maasik)  |  קרן השתלמות מעסיק', formatNIS(payslip.trainingFundEmployer), y, false, '#553c9a');
    y = drawDivider(y - 4, '#e2e8f0');
  }

  // Sick/vacation days line
  doc.fontSize(9).font('Helvetica').fillColor('#718096')
    .text(`Yamei Machala: ${payslip.sickDays}  |  Yamei Hofsha: ${payslip.vacationDays}`, marginL, y, { width: contentWidth });
  y += 18;

  // ─────────────────────────────────────────────────────────────
  // NET SALARY BOX
  // ─────────────────────────────────────────────────────────────
  y += 10;
  const netBoxHeight = 60;
  doc.rect(marginL, y, contentWidth, netBoxHeight).fill('#1a365d');

  doc.fontSize(13).font('Helvetica-Bold').fillColor('#bee3f8')
    .text('SCHAR NETO LE-TASHLUM  |  שכר נטו לתשלום', marginL + 10, y + 8, { width: contentWidth - 20 });

  doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff')
    .text(formatNIS(payslip.netSalary), marginL + 10, y + 26, { width: contentWidth - 20, align: 'right' });

  y += netBoxHeight + 16;

  // ─────────────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────────────
  const issueDate = new Date().toLocaleDateString('he-IL');
  doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(marginL, y).lineTo(rightX, y).stroke();
  y += 8;

  doc.fontSize(8).font('Helvetica').fillColor('#a0aec0')
    .text(
      `Taloosh hukhan be: ${issueDate}  |  תלוש הוכן בתאריך: ${issueDate}  |  ${companyName}${companyVatNumber ? `  |  ע.מ. ${companyVatNumber}` : ''}`,
      marginL, y, { width: contentWidth, align: 'center' }
    );

  doc.end();

  // Collect all chunks synchronously (pdfkit bufferPages)
  const allChunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => allChunks.push(c));

  return Buffer.concat(chunks);
}
