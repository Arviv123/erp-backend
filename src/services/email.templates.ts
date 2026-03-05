/**
 * Email HTML templates for the ERP system.
 * All templates use inline CSS for maximum email client compatibility.
 * UI text is in Hebrew; RTL layout is applied via dir="rtl".
 */

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatILS(amount: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

/** Shared wrapper: outer table layout used by all templates. */
function baseLayout(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>מערכת חשבשבת</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <!-- Outer card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">
          <!-- Header bar -->
          <tr>
            <td style="background-color:#1a56db;padding:24px 32px;">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">
                מערכת חשבשבת
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f0f4f8;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#718096;text-align:center;">
                הודעה זו נשלחה אוטומטית ממערכת חשבשבת. אנא אל תשיב להודעה זו.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// payslipTemplate
// ---------------------------------------------------------------------------

export function payslipTemplate(opts: {
  employeeName: string;
  month: number;
  year: number;
  netSalary: number;
}): string {
  const { employeeName, month, year, netSalary } = opts;

  // month is 1-based
  const hebrewMonth = HEBREW_MONTHS[(month - 1) % 12] ?? String(month);
  const formattedSalary = formatILS(netSalary);

  const body = `
    <!-- Title -->
    <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:bold;color:#1a202c;">תלוש שכר</h1>
    <p style="margin:0 0 28px 0;font-size:14px;color:#718096;">
      לתקופה: ${hebrewMonth} ${year}
    </p>

    <!-- Info card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:6px 0;">
                <span style="font-size:13px;color:#718096;">שם העובד</span>
              </td>
              <td style="padding:6px 0;text-align:left;">
                <span style="font-size:14px;font-weight:600;color:#2d3748;">${employeeName}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 0;border-top:1px solid #e2e8f0;">
                <span style="font-size:13px;color:#718096;">תקופת שכר</span>
              </td>
              <td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:left;">
                <span style="font-size:14px;font-weight:600;color:#2d3748;">${hebrewMonth} ${year}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Net salary highlight -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#ebf8ff;border-radius:6px;border:1px solid #bee3f8;margin-bottom:28px;">
      <tr>
        <td style="padding:20px 24px;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#2b6cb0;">שכר נטו לתשלום</p>
          <p style="margin:0;font-size:32px;font-weight:bold;color:#1a365d;">${formattedSalary}</p>
        </td>
      </tr>
    </table>

    <!-- Attachment note -->
    <p style="margin:0 0 8px 0;font-size:14px;color:#4a5568;">
      שלום <strong>${employeeName}</strong>,
    </p>
    <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.6;">
      מצורף לפנייתך תלוש השכר לחודש ${hebrewMonth} ${year}.
      הקובץ מצורף כ-PDF לאימייל זה.
    </p>
  `;

  return baseLayout(body);
}

// ---------------------------------------------------------------------------
// invoiceTemplate
// ---------------------------------------------------------------------------

export function invoiceTemplate(opts: {
  customerName: string;
  invoiceNumber: string;
  total: number;
}): string {
  const { customerName, invoiceNumber, total } = opts;
  const formattedTotal = formatILS(total);

  const body = `
    <!-- Title -->
    <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:bold;color:#1a202c;">חשבונית מס</h1>
    <p style="margin:0 0 28px 0;font-size:14px;color:#718096;">
      מספר חשבונית: <strong>${invoiceNumber}</strong>
    </p>

    <!-- Greeting -->
    <p style="margin:0 0 20px 0;font-size:14px;color:#4a5568;line-height:1.6;">
      שלום <strong>${customerName}</strong>,<br />
      מצורפת חשבונית המס שהופקה עבורך. ניתן למצוא את פרטי החשבונית מטה ואת קובץ ה-PDF המצורף.
    </p>

    <!-- Info card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:6px 0;">
                <span style="font-size:13px;color:#718096;">שם הלקוח</span>
              </td>
              <td style="padding:6px 0;text-align:left;">
                <span style="font-size:14px;font-weight:600;color:#2d3748;">${customerName}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 0;border-top:1px solid #e2e8f0;">
                <span style="font-size:13px;color:#718096;">מספר חשבונית</span>
              </td>
              <td style="padding:6px 0;border-top:1px solid #e2e8f0;text-align:left;">
                <span style="font-size:14px;font-weight:600;color:#2d3748;">${invoiceNumber}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Total highlight -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f0fff4;border-radius:6px;border:1px solid #9ae6b4;margin-bottom:28px;">
      <tr>
        <td style="padding:20px 24px;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#276749;">סכום לתשלום</p>
          <p style="margin:0;font-size:32px;font-weight:bold;color:#1c4532;">${formattedTotal}</p>
        </td>
      </tr>
    </table>

    <!-- Note -->
    <p style="margin:0;font-size:13px;color:#718096;line-height:1.6;">
      לשאלות ובירורים בנוגע לחשבונית זו, אנא פנה לשירות הלקוחות שלנו.
      חשבונית זו הופקה אוטומטית ממערכת חשבשבת.
    </p>
  `;

  return baseLayout(body);
}

// ---------------------------------------------------------------------------
// welcomeTemplate
// ---------------------------------------------------------------------------

export function welcomeTemplate(opts: {
  tenantName: string;
  loginUrl?: string;
}): string {
  const { tenantName, loginUrl } = opts;

  const ctaBlock = loginUrl
    ? `
    <!-- CTA button -->
    <table cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
      <tr>
        <td style="border-radius:6px;background-color:#1a56db;">
          <a href="${loginUrl}"
             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:bold;
                    color:#ffffff;text-decoration:none;border-radius:6px;">
            כניסה למערכת
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 20px 0;font-size:12px;color:#718096;">
      לחלופין, העתק את הכתובת הבאה לדפדפן:<br />
      <a href="${loginUrl}" style="color:#1a56db;word-break:break-all;">${loginUrl}</a>
    </p>`
    : `<p style="margin:28px 0;font-size:14px;color:#4a5568;">
        ניתן להתחבר למערכת דרך כתובת ה-ERP שסופקה לך.
       </p>`;

  const body = `
    <!-- Title -->
    <h1 style="margin:0 0 12px 0;font-size:26px;font-weight:bold;color:#1a202c;">
      ברוכים הבאים למערכת חשבשבת
    </h1>
    <p style="margin:0 0 28px 0;font-size:14px;color:#718096;">
      ניהול עסקי חכם — חשבונות, שכר, ומשאבי אנוש במקום אחד
    </p>

    <!-- Greeting card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 12px 0;font-size:15px;font-weight:600;color:#2d3748;">
            שלום וברוך הבא, <strong>${tenantName}</strong>!
          </p>
          <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.7;">
            אנחנו שמחים שהצטרפת למערכת חשבשבת.<br />
            חשבון הארגון שלך נוצר בהצלחה ומוכן לשימוש.<br />
            באמצעות המערכת תוכל לנהל: חשבונאות דו-צידית, חשבוניות,
            הנהלת שכר ישראלית, ניהול עובדים, נוכחות ועוד.
          </p>
        </td>
      </tr>
    </table>

    ${ctaBlock}

    <!-- Tips -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#fffbeb;border-radius:6px;border:1px solid #fbd38d;margin-bottom:8px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#744210;">
            טיפים לתחילת הדרך
          </p>
          <ul style="margin:0;padding-right:18px;font-size:13px;color:#744210;line-height:1.8;">
            <li>הוסף עובדים תחת מודול "עובדים"</li>
            <li>הגדר תרשים חשבונות בהתאם לעסק שלך</li>
            <li>צור חשבוניות ושלח אותן ישירות ללקוחות</li>
            <li>הפעל חישובי שכר חודשיים אוטומטיים</li>
          </ul>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(body);
}
