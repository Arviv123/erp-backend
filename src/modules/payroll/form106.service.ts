import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';

/**
 * Generates Form 106 — Annual employee wage certificate (תעודת משכורת שנתית).
 * Aggregates all approved/paid payslips for a given employee and year.
 */
export async function generateForm106PDF(
  employeeId: string,
  year: number,
  prisma: PrismaClient
): Promise<Buffer> {
  // ─── Fetch employee ───────────────────────────────────────────
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) throw new Error('Employee not found');

  // ─── Fetch all payslips for the year ─────────────────────────
  const payslips = await prisma.payslip.findMany({
    where: {
      employeeId,
      tenantId:  employee.tenantId,
      period:    { startsWith: String(year) },
      deletedAt: null,
    },
    orderBy: { period: 'asc' },
  });

  // ─── Fetch tenant (company) info ─────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { id: employee.tenantId },
  });

  const companyName  = tenant?.name ?? employee.tenantId;
  const vatNumber    = tenant?.vatNumber ?? tenant?.businessNumber ?? '';
  const employeeName = `${employee.firstName} ${employee.lastName}`;
  const monthCount   = payslips.length;

  // ─── Aggregate annual totals ──────────────────────────────────
  const sum = (fn: (p: typeof payslips[0]) => number) =>
    Math.round(payslips.reduce((s, p) => s + fn(p), 0) * 100) / 100;

  const totalGross       = sum(p => Number(p.grossSalary));
  const totalIncomeTax   = sum(p => Number(p.incomeTax));
  const totalNIEmployee  = sum(p => Number(p.nationalInsurance));
  const totalHealth      = sum(p => Number(p.healthInsurance));
  const totalPensionEmp  = sum(p => Number(p.pensionEmployee));
  const totalPensionEr   = sum(p => Number(p.pensionEmployer));
  const totalSeverance   = sum(p => Number(p.severancePay));
  const totalTFEmployee  = sum(p => Number(p.trainingFundEmployee));
  const totalTFEmployer  = sum(p => Number(p.trainingFundEmployer));
  const totalNet         = sum(p => Number(p.netSalary));
  const totalNIEmployer  = sum(p => Number(p.niEmployer));

  const avgGross       = monthCount > 0 ? Math.round(totalGross     / monthCount) : 0;
  const avgIncomeTax   = monthCount > 0 ? Math.round(totalIncomeTax / monthCount) : 0;
  const avgNI          = monthCount > 0 ? Math.round(totalNIEmployee / monthCount) : 0;
  const avgHealth      = monthCount > 0 ? Math.round(totalHealth     / monthCount) : 0;
  const avgPensionEmp  = monthCount > 0 ? Math.round(totalPensionEmp / monthCount) : 0;
  const avgPensionEr   = monthCount > 0 ? Math.round(totalPensionEr  / monthCount) : 0;
  const avgTFEmployee  = monthCount > 0 ? Math.round(totalTFEmployee / monthCount) : 0;
  const avgTFEmployer  = monthCount > 0 ? Math.round(totalTFEmployer / monthCount) : 0;
  const avgNet         = monthCount > 0 ? Math.round(totalNet        / monthCount) : 0;

  function formatNIS(n: number): string {
    return `${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
  }

  // ─── Build PDF ────────────────────────────────────────────────
  const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pageWidth    = 595.28;
  const marginL      = 45;
  const contentWidth = pageWidth - marginL * 2;
  const rightX       = pageWidth - marginL;

  // ── Title block ──────────────────────────────────────────────
  let y = 45;

  doc.rect(marginL, y, contentWidth, 80).fill('#1a365d');

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#ffffff')
    .text('TOFES 106 | טופס 106', marginL + 10, y + 8, { width: contentWidth - 20, align: 'center' });

  doc.fontSize(13).font('Helvetica').fillColor('#bee3f8')
    .text(`Teuddat Maskoret Shatit ${year} | תעודת משכורת שנתית ${year}`, marginL + 10, y + 34, { width: contentWidth - 20, align: 'center' });

  doc.fontSize(10).font('Helvetica').fillColor('#90cdf4')
    .text(`Horaat Mas Hachnasa Sif 164 | הוראת מס הכנסה, סעיף 164`, marginL + 10, y + 56, { width: contentWidth - 20, align: 'center' });

  y += 94;

  // ── Company + Employee info ──────────────────────────────────
  doc.rect(marginL, y, contentWidth, 72).fill('#f7fafc').stroke('#e2e8f0');
  y += 6;

  const halfW = contentWidth / 2 - 8;

  // Left column: company
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#718096').text('MAASIK / מעסיק', marginL + 6, y);
  y += 14;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text(companyName, marginL + 6, y, { width: halfW });
  if (vatNumber) {
    doc.fontSize(9).font('Helvetica').fillColor('#4a5568')
      .text(`Osek Morasheh: ${vatNumber}`, marginL + 6, y + 14, { width: halfW });
  }

  // Right column: employee
  const rc = marginL + contentWidth / 2 + 8;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#718096').text('OVED / עובד', rc, y - 14);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text(employeeName, rc, y, { width: halfW });
  if (employee.idNumber) {
    doc.fontSize(9).font('Helvetica').fillColor('#4a5568').text(`T.Z.: ${employee.idNumber}`, rc, y + 14, { width: halfW });
  }

  y += 54;

  // ── Report meta ───────────────────────────────────────────────
  doc.rect(marginL, y, contentWidth, 24).fill('#edf2f7');
  doc.fontSize(10).font('Helvetica').fillColor('#4a5568')
    .text(
      `Shnat Mas: ${year}  |  Mispar Hodashim: ${monthCount}  |  Tafkid: ${employee.jobTitle ?? '—'}  |  Machlaka: ${employee.department ?? '—'}`,
      marginL + 6, y + 6, { width: contentWidth - 12 }
    );
  y += 32;

  // ── Table header ─────────────────────────────────────────────
  const col1 = marginL;
  const col2 = marginL + contentWidth * 0.52;
  const col3 = marginL + contentWidth * 0.76;
  const colW1 = contentWidth * 0.50;
  const colW2 = contentWidth * 0.23;
  const colW3 = contentWidth * 0.24;

  doc.rect(marginL, y, contentWidth, 22).fill('#2d3748');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text('RAKHIV  |  רכיב',       col1 + 4, y + 6, { width: colW1 });
  doc.text('MEMUTSA CHODIK  |  ממוצע חודשי', col2, y + 6, { width: colW2, align: 'center' });
  doc.text('SACH SHATATI  |  סך שנתי',       col3, y + 6, { width: colW3, align: 'right' });
  y += 30;

  // ── Table rows helper ─────────────────────────────────────────
  let rowAlt = false;
  function drawTableRow(label: string, avg: number, total: number, highlight = false, textColor = '#1a1a1a'): void {
    const rowH = 20;
    const bg   = highlight ? '#fffbeb' : (rowAlt ? '#f7fafc' : '#ffffff');
    doc.rect(marginL, y, contentWidth, rowH).fill(bg);
    rowAlt = !rowAlt;

    const font = highlight ? 'Helvetica-Bold' : 'Helvetica';
    doc.fontSize(10).font(font).fillColor(textColor);
    doc.text(label,          col1 + 4, y + 4, { width: colW1 });
    doc.text(formatNIS(avg), col2,     y + 4, { width: colW2, align: 'center' });
    doc.text(formatNIS(total), col3,   y + 4, { width: colW3, align: 'right' });

    // row border
    doc.strokeColor('#e2e8f0').lineWidth(0.3)
      .moveTo(marginL, y + rowH).lineTo(rightX, y + rowH).stroke();
    y += rowH;
  }

  // Income rows
  doc.rect(marginL, y, contentWidth, 18).fill('#f0fff4');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#276749').text('HACHNASOT  |  הכנסות', col1 + 4, y + 4);
  y += 18;
  rowAlt = false;

  drawTableRow('Schar Bruto  |  שכר ברוטו',  avgGross,  totalGross, true, '#276749');
  drawTableRow('Schar Neto   |  שכר נטו',    avgNet,    totalNet);

  // Deduction rows
  y += 6;
  doc.rect(marginL, y, contentWidth, 18).fill('#fff5f5');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#c53030').text('NIKUYIM  |  ניכויים', col1 + 4, y + 4);
  y += 18;
  rowAlt = false;

  drawTableRow('Mas Hachnasa  |  מס הכנסה',                    avgIncomeTax,  totalIncomeTax, false, '#c53030');
  drawTableRow('Bituach Leumi (Oved)  |  ביטוח לאומי עובד',    avgNI,         totalNIEmployee);
  drawTableRow('Mas Briut  |  מס בריאות',                       avgHealth,     totalHealth);
  drawTableRow('Pension (Oved)  |  פנסיה עובד',                 avgPensionEmp, totalPensionEmp);
  if (totalTFEmployee > 0) {
    drawTableRow('Keren Hishtalmut (Oved)  |  קרן השתלמות עובד', avgTFEmployee, totalTFEmployee);
  }

  // Employer contributions
  y += 6;
  doc.rect(marginL, y, contentWidth, 18).fill('#faf5ff');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#553c9a').text('HAFRASHAT MAASIK  |  הפרשות מעסיק', col1 + 4, y + 4);
  y += 18;
  rowAlt = false;

  drawTableRow('Bituach Leumi (Maasik)  |  ביטוח לאומי מעסיק',  0,           totalNIEmployer, false, '#553c9a');
  drawTableRow('Pension (Maasik)  |  פנסיה מעסיק',                avgPensionEr, totalPensionEr);
  drawTableRow('Pitzuyim  |  פיצויים',                             0,           totalSeverance);
  if (totalTFEmployer > 0) {
    drawTableRow('Keren Hishtalmut (Maasik)  |  קרן השתלמות מעסיק', avgTFEmployer, totalTFEmployer);
  }

  y += 12;

  // ── Summary boxes ─────────────────────────────────────────────
  // Gross box
  const boxH = 52;
  const boxW = (contentWidth - 10) / 2;

  doc.rect(marginL, y, boxW, boxH).fill('#1a365d');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#bee3f8')
    .text('SACH SCHAR SHATATI BRUTO  |  סה"כ שכר שנתי ברוטו', marginL + 6, y + 6, { width: boxW - 12 });
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff')
    .text(formatNIS(totalGross), marginL + 6, y + 26, { width: boxW - 12, align: 'right' });

  // Tax box
  const box2X = marginL + boxW + 10;
  doc.rect(box2X, y, boxW, boxH).fill('#c53030');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#fed7d7')
    .text('SACH MAS SHENUKHA  |  סה"כ מס שנוכה', box2X + 6, y + 6, { width: boxW - 12 });
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff')
    .text(formatNIS(totalIncomeTax), box2X + 6, y + 26, { width: boxW - 12, align: 'right' });

  y += boxH + 20;

  // ── Footer ───────────────────────────────────────────────────
  doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(marginL, y).lineTo(rightX, y).stroke();
  y += 8;

  const issueDate = new Date().toLocaleDateString('he-IL');
  doc.fontSize(8).font('Helvetica').fillColor('#a0aec0')
    .text(
      `Mishmach zeh me'id al nikuyim she-nukhu mi-mashkoretcha be-shnat ${year}.  |  מסמך זה מעיד על ניכויים שנוכו ממשכורתך בשנת ${year}.`,
      marginL, y, { width: contentWidth, align: 'center' }
    );
  y += 14;
  doc.text(`Taarich hafakat ha-mishmach: ${issueDate}  |  ${companyName}`, marginL, y, { width: contentWidth, align: 'center' });

  doc.end();

  return Buffer.concat(chunks);
}
