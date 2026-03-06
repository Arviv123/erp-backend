import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import * as tools from './agent-tools';

// ─── Constants ────────────────────────────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1000;

// ─── Agent Definitions ────────────────────────────────────────────────────────

export const AGENT_DEFINITIONS = [
  {
    type: 'inventory',
    name: 'סוכן מלאי',
    nameEn: 'Inventory Agent',
    icon: 'Package',
    description: 'מנטר רמות מלאי, מזהה מוצרים עם מלאי נמוך ומציע הזמנות חידוש',
    color: 'blue',
  },
  {
    type: 'finance',
    name: 'סוכן כספים',
    nameEn: 'Finance Agent',
    icon: 'TrendingUp',
    description: 'מנתח תזרים מזומנים, מעקב חשבוניות פגות תוקף וחובות',
    color: 'green',
  },
  {
    type: 'sales',
    name: 'סוכן מכירות',
    nameEn: 'Sales Agent',
    icon: 'ShoppingCart',
    description: 'עוקב אחר מכירות, הצעות מחיר ולקוחות מובילים',
    color: 'purple',
  },
  {
    type: 'hr',
    name: 'סוכן משאבי אנוש',
    nameEn: 'HR Agent',
    icon: 'Users',
    description: 'מנטר בקשות חופשה, נוכחות וסטטוס שכר',
    color: 'orange',
  },
  {
    type: 'purchasing',
    name: 'סוכן רכש',
    nameEn: 'Purchasing Agent',
    icon: 'Truck',
    description: 'מנטר חשבוניות ספק, תשלומים פגי תוקף וביצועי ספקים',
    color: 'red',
  },
  {
    type: 'coordinator',
    name: 'מנהל כללי',
    nameEn: 'Coordinator Agent',
    icon: 'Brain',
    description: 'מתאם את כל הסוכנים ומייצר סיכום מנהלים',
    color: 'indigo',
  },
] as const;

export type AgentType = (typeof AGENT_DEFINITIONS)[number]['type'];

// ─── LLM Client ──────────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
}

// ─── JSON Extraction ─────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from a string, handling ```json blocks as well as raw JSON.
 */
function extractJson(text: string): Record<string, unknown> | null {
  // Try ```json ... ``` block first
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* fall through */ }
  }

  // Try first { ... } occurrence
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(text.slice(braceStart, braceEnd + 1)); } catch { /* fall through */ }
  }

  return null;
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

async function buildInventoryPrompt(tenantId: string): Promise<{ prompt: string; rawData: unknown }> {
  const lowStock = await tools.getLowStockProducts(tenantId);
  const rawData = { lowStockProducts: lowStock, count: lowStock.length };

  const prompt = `אתה סוכן מלאי חכם של מערכת ERP ישראלית.

נתונים נוכחיים:
${JSON.stringify(rawData, null, 2)}

תן ניתוח קצר ומקצועי בעברית. התמקד ב:
- מוצרים שדורשים הזמנה דחופה
- מגמות בחוסרי מלאי
- המלצות לרמות מינימום

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף):
{
  "alerts": ["התראה 1", "התראה 2"],
  "insights": ["תובנה 1", "תובנה 2"],
  "recommendations": ["המלצה 1", "המלצה 2"],
  "summary": "סיכום קצר בשורה אחת"
}`;

  return { prompt, rawData };
}

async function buildFinancePrompt(tenantId: string): Promise<{ prompt: string; rawData: unknown }> {
  const [overdueInvoices, cashFlow] = await Promise.all([
    tools.getOverdueInvoices(tenantId),
    tools.getCashFlowSummary(tenantId),
  ]);
  const rawData = { overdueInvoices, cashFlow, overdueCount: overdueInvoices.length };

  const prompt = `אתה סוכן כספים חכם של מערכת ERP ישראלית.

נתונים נוכחיים:
${JSON.stringify(rawData, null, 2)}

תן ניתוח קצר ומקצועי בעברית. התמקד ב:
- חשבוניות פגות תוקף שדורשות מעקב גבייה
- מצב תזרים מזומנים
- סיכוני אשראי

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף):
{
  "alerts": ["התראה 1", "התראה 2"],
  "insights": ["תובנה 1", "תובנה 2"],
  "recommendations": ["המלצה 1", "המלצה 2"],
  "summary": "סיכום קצר בשורה אחת"
}`;

  return { prompt, rawData };
}

async function buildSalesPrompt(tenantId: string): Promise<{ prompt: string; rawData: unknown }> {
  const [topCustomers, salesSummary, staleQuotes] = await Promise.all([
    tools.getTopCustomers(tenantId),
    tools.getSalesSummary(tenantId),
    tools.getStaleQuotes(tenantId),
  ]);
  const rawData = { topCustomers, salesSummary, staleQuotes, staleQuoteCount: staleQuotes.length };

  const prompt = `אתה סוכן מכירות חכם של מערכת ERP ישראלית.

נתונים נוכחיים:
${JSON.stringify(rawData, null, 2)}

תן ניתוח קצר ומקצועי בעברית. התמקד ב:
- ביצועי מכירות החודש לעומת החודש הקודם
- לקוחות מובילים ופוטנציאל צמיחה
- הצעות מחיר פתוחות שדורשות מעקב

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף):
{
  "alerts": ["התראה 1", "התראה 2"],
  "insights": ["תובנה 1", "תובנה 2"],
  "recommendations": ["המלצה 1", "המלצה 2"],
  "summary": "סיכום קצר בשורה אחת"
}`;

  return { prompt, rawData };
}

async function buildHrPrompt(tenantId: string): Promise<{ prompt: string; rawData: unknown }> {
  const [pendingLeaves, attendanceAnomalies, payrollCost] = await Promise.all([
    tools.getPendingLeaves(tenantId),
    tools.getAttendanceAnomalies(tenantId),
    tools.getPayrollCostSummary(tenantId),
  ]);
  const rawData = {
    pendingLeaves,
    pendingLeaveCount: pendingLeaves.length,
    attendanceAnomalies,
    payrollCost,
  };

  const prompt = `אתה סוכן משאבי אנוש חכם של מערכת ERP ישראלית.

נתונים נוכחיים:
${JSON.stringify(rawData, null, 2)}

תן ניתוח קצר ומקצועי בעברית. התמקד ב:
- בקשות חופשה הממתינות לאישור
- עובדים עם אנומליות נוכחות
- עלויות שכר החודש

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף):
{
  "alerts": ["התראה 1", "התראה 2"],
  "insights": ["תובנה 1", "תובנה 2"],
  "recommendations": ["המלצה 1", "המלצה 2"],
  "summary": "סיכום קצר בשורה אחת"
}`;

  return { prompt, rawData };
}

async function buildPurchasingPrompt(tenantId: string): Promise<{ prompt: string; rawData: unknown }> {
  const unpaidBills = await tools.getUnpaidBills(tenantId);
  const overdueBills = unpaidBills.filter(b => b.isOverdue);
  const upcomingBills = unpaidBills.filter(b => !b.isOverdue && b.daysUntilDue <= 7);
  const rawData = { unpaidBills, overdueBills, upcomingBills };

  const prompt = `אתה סוכן רכש חכם של מערכת ERP ישראלית.

נתונים נוכחיים:
${JSON.stringify(rawData, null, 2)}

תן ניתוח קצר ומקצועי בעברית. התמקד ב:
- חשבוניות ספק שעברו את תאריך התשלום
- תשלומים הצפויים בשבוע הקרוב
- מצב חובות לספקים

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף):
{
  "alerts": ["התראה 1", "התראה 2"],
  "insights": ["תובנה 1", "תובנה 2"],
  "recommendations": ["המלצה 1", "המלצה 2"],
  "summary": "סיכום קצר בשורה אחת"
}`;

  return { prompt, rawData };
}

// ─── Prompt Dispatcher ───────────────────────────────────────────────────────

async function buildPrompt(
  agentType: string,
  tenantId: string,
): Promise<{ prompt: string; rawData: unknown }> {
  switch (agentType) {
    case 'inventory':   return buildInventoryPrompt(tenantId);
    case 'finance':     return buildFinancePrompt(tenantId);
    case 'sales':       return buildSalesPrompt(tenantId);
    case 'hr':          return buildHrPrompt(tenantId);
    case 'purchasing':  return buildPurchasingPrompt(tenantId);
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

// ─── Fallback Findings from Raw Data ─────────────────────────────────────────

function buildFallbackFindings(agentType: string, rawData: unknown): Record<string, unknown> {
  const data = rawData as Record<string, unknown>;
  const alerts: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];

  try {
    switch (agentType) {
      case 'inventory': {
        const products = (data.lowStockProducts as tools.LowStockProduct[]) ?? [];
        if (products.length > 0) alerts.push(`${products.length} מוצרים עם מלאי נמוך`);
        products.slice(0, 3).forEach(p =>
          insights.push(`${p.name}: מלאי ${p.quantity}, נקודת הזמנה ${p.reorderPoint}`)
        );
        if (products.length > 0) recommendations.push('הכן הזמנת רכש למוצרים מתחת לנקודת ההזמנה');
        break;
      }
      case 'finance': {
        const invoices = (data.overdueInvoices as tools.OverdueInvoice[]) ?? [];
        const cashFlow = data.cashFlow as tools.CashFlowSummary;
        if (invoices.length > 0) alerts.push(`${invoices.length} חשבוניות פגות תוקף`);
        if (cashFlow) insights.push(`תזרים נטו: ₪${cashFlow.netCashFlow.toLocaleString()}`);
        if (invoices.length > 0) recommendations.push('שלח תזכורות גבייה ללקוחות עם חוב');
        break;
      }
      case 'sales': {
        const summary = data.salesSummary as tools.SalesSummary;
        const stale = (data.staleQuotes as tools.StaleQuote[]) ?? [];
        if (stale.length > 0) alerts.push(`${stale.length} הצעות מחיר ממתינות מעל 14 יום`);
        if (summary) {
          const dir = (summary.growthPercent ?? 0) >= 0 ? 'גידול' : 'ירידה';
          insights.push(`${dir} של ${Math.abs(summary.growthPercent ?? 0)}% במכירות לעומת החודש הקודם`);
        }
        if (stale.length > 0) recommendations.push('צור קשר עם לקוחות שטרם הגיבו להצעות המחיר');
        break;
      }
      case 'hr': {
        const leaves = (data.pendingLeaves as tools.PendingLeave[]) ?? [];
        const anomalies = (data.attendanceAnomalies as tools.AttendanceAnomaly[]) ?? [];
        if (leaves.length > 0) alerts.push(`${leaves.length} בקשות חופשה ממתינות לאישור`);
        if (anomalies.length > 0) alerts.push(`${anomalies.length} עובדים עם אנומליות נוכחות`);
        if (leaves.length > 0) recommendations.push('אשר/דחה בקשות חופשה פתוחות');
        break;
      }
      case 'purchasing': {
        const overdue = (data.overdueBills as tools.UnpaidBill[]) ?? [];
        const upcoming = (data.upcomingBills as tools.UnpaidBill[]) ?? [];
        if (overdue.length > 0) alerts.push(`${overdue.length} חשבוניות ספק פגות תוקף`);
        if (upcoming.length > 0) insights.push(`${upcoming.length} תשלומים צפויים בשבוע הקרוב`);
        if (overdue.length > 0) recommendations.push('בצע תשלומים לספקים שעברו את מועד הפירעון');
        break;
      }
    }
  } catch {
    // Ignore errors in fallback construction
  }

  return {
    alerts,
    insights,
    recommendations,
    summary: `ניתוח ${agentType} — ${alerts.length} התראות, ${insights.length} תובנות`,
  };
}

// ─── Core Agent Runner ────────────────────────────────────────────────────────

/**
 * Run a single specialist agent:
 * 1. Gather data via tool functions
 * 2. Build a Hebrew prompt
 * 3. Call Claude Haiku for analysis
 * 4. Parse JSON findings
 * 5. Save AgentTask to database
 */
export async function runAgent(
  tenantId: string,
  agentType: string,
  userId: string,
  _provider?: string, // reserved for future multi-provider support
): Promise<{
  taskId: string;
  agentType: string;
  status: string;
  findings: Record<string, unknown>;
  summary: string;
  tokensUsed: number;
}> {
  const def = AGENT_DEFINITIONS.find(a => a.type === agentType);
  if (!def) throw new Error(`סוג סוכן לא מוכר: ${agentType}`);

  // Create the task record in RUNNING state
  const task = await prisma.agentTask.create({
    data: {
      tenantId,
      agentType,
      status: 'running',
      triggeredBy: userId,
      provider: 'anthropic',
    },
  });

  let findings: Record<string, unknown> = {};
  let summary = '';
  let tokensUsed = 0;
  let finalStatus = 'completed';
  let errorMessage: string | undefined;

  try {
    // Step 1: gather data and build prompt
    const { prompt, rawData } = await buildPrompt(agentType, tenantId);

    // Step 2: call Claude Haiku
    const client = getAnthropicClient();
    let llmText = '';
    let llmFailed = false;

    try {
      const response = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        system: `אתה עוזר AI מקצועי לניתוח נתונים עסקיים. תמיד תחזיר תשובות בעברית בפורמט JSON בלבד.`,
        messages: [{ role: 'user', content: prompt }],
      });

      llmText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');

      tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    } catch (llmErr) {
      llmFailed = true;
      console.error(`[AgentTeam] LLM call failed for agent ${agentType}:`, llmErr);
    }

    // Step 3: parse JSON (or fall back to raw-data summary)
    if (!llmFailed && llmText) {
      const parsed = extractJson(llmText);
      if (parsed) {
        findings = parsed;
        summary = String(parsed['summary'] ?? '');
      } else {
        // LLM returned something but not valid JSON — use raw text as summary
        findings = buildFallbackFindings(agentType, rawData);
        summary = llmText.slice(0, 300);
      }
    } else {
      // LLM failed entirely — build findings from raw data
      findings = buildFallbackFindings(agentType, rawData);
      summary = String(findings['summary'] ?? '');
    }
  } catch (err) {
    finalStatus = 'failed';
    errorMessage = err instanceof Error ? err.message : String(err);
    findings = {};
    summary = `שגיאה: ${errorMessage}`;
    console.error(`[AgentTeam] Agent ${agentType} failed:`, err);
  }

  // Step 4: update task record
  const updatedTask = await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      status: finalStatus,
      findings: findings as object,
      summary,
      tokensUsed,
      completedAt: new Date(),
      ...(errorMessage ? { error: errorMessage } : {}),
    },
  });

  return {
    taskId: updatedTask.id,
    agentType,
    status: finalStatus,
    findings,
    summary,
    tokensUsed,
  };
}

// ─── Coordinator ──────────────────────────────────────────────────────────────

/**
 * Run the coordinator agent:
 * 1. Run all 5 specialist agents in parallel
 * 2. Combine findings
 * 3. Call Claude Haiku to produce an executive summary
 * 4. Save a coordinator AgentTask
 */
export async function runCoordinator(
  tenantId: string,
  userId: string,
): Promise<{
  taskId: string;
  agentType: string;
  status: string;
  findings: Record<string, unknown>;
  summary: string;
  tokensUsed: number;
  agentResults: Array<{ agentType: string; taskId: string; status: string; findings: Record<string, unknown> }>;
}> {
  const specialistTypes = ['inventory', 'finance', 'sales', 'hr', 'purchasing'] as const;

  // Create coordinator task record
  const coordTask = await prisma.agentTask.create({
    data: {
      tenantId,
      agentType: 'coordinator',
      status: 'running',
      triggeredBy: userId,
      provider: 'anthropic',
    },
  });

  let coordFindings: Record<string, unknown> = {};
  let coordSummary = '';
  let coordTokens = 0;
  let finalStatus = 'completed';
  let errorMessage: string | undefined;

  try {
    // Step 1: run all specialist agents in parallel
    const agentResults = await Promise.all(
      specialistTypes.map(type => runAgent(tenantId, type, userId)),
    );

    // Step 2: build combined findings for coordinator prompt
    const combinedData: Record<string, unknown> = {};
    for (const result of agentResults) {
      combinedData[result.agentType] = {
        findings: result.findings,
        summary: result.summary,
        status: result.status,
      };
    }

    const coordPrompt = `אתה מנכ"ל חכם של חברה ישראלית. קיבלת דוחות מ-5 סוכני AI:

${JSON.stringify(combinedData, null, 2)}

צור סיכום מנהלים קצר ומקצועי בעברית. כלול:
- הנושאים הדחופים ביותר הדורשים טיפול מיידי
- תמונת מצב כוללת של העסק
- 3-5 המלצות עדיפות לשבוע הקרוב

החזר תשובה בפורמט JSON בלבד:
{
  "alerts": ["הדחוף ביותר 1", "הדחוף ביותר 2"],
  "insights": ["מצב העסק 1", "מצב העסק 2", "מצב העסק 3"],
  "recommendations": ["המלצה 1", "המלצה 2", "המלצה 3"],
  "summary": "סיכום מנהלים בשתי שורות מקסימום"
}`;

    // Step 3: call Claude Haiku for exec summary
    const client = getAnthropicClient();
    let llmText = '';

    try {
      const response = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        system: `אתה עוזר AI מקצועי לניהול עסקי. תמיד תחזיר תשובות בעברית בפורמט JSON בלבד.`,
        messages: [{ role: 'user', content: coordPrompt }],
      });

      llmText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');

      coordTokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    } catch (llmErr) {
      console.error('[AgentTeam] Coordinator LLM failed:', llmErr);
    }

    // Step 4: parse coordinator JSON
    if (llmText) {
      const parsed = extractJson(llmText);
      if (parsed) {
        coordFindings = parsed;
        coordSummary = String(parsed['summary'] ?? '');
      } else {
        coordSummary = llmText.slice(0, 400);
        coordFindings = { alerts: [], insights: [], recommendations: [], summary: coordSummary };
      }
    } else {
      // Build basic summary from specialist results
      const allAlerts: string[] = [];
      for (const result of agentResults) {
        const f = result.findings as Record<string, unknown>;
        const alerts = f['alerts'];
        if (Array.isArray(alerts)) allAlerts.push(...(alerts as string[]));
      }
      coordFindings = {
        alerts: allAlerts.slice(0, 5),
        insights: [`הושלמו ${agentResults.filter(r => r.status === 'completed').length}/5 סוכנים`],
        recommendations: ['בדוק את דוחות הסוכנים הבודדים לפרטים'],
        summary: `${allAlerts.length} התראות כולל מכל הסוכנים`,
      };
      coordSummary = String(coordFindings['summary']);
    }

    // Attach specialist result references
    coordFindings['agentResults'] = agentResults.map(r => ({
      agentType: r.agentType,
      taskId: r.taskId,
      status: r.status,
    }));

    // Update coordinator task
    await prisma.agentTask.update({
      where: { id: coordTask.id },
      data: {
        status: 'completed',
        findings: coordFindings as object,
        summary: coordSummary,
        tokensUsed: coordTokens,
        completedAt: new Date(),
      },
    });

    return {
      taskId: coordTask.id,
      agentType: 'coordinator',
      status: 'completed',
      findings: coordFindings,
      summary: coordSummary,
      tokensUsed: coordTokens,
      agentResults: agentResults.map(r => ({
        agentType: r.agentType,
        taskId: r.taskId,
        status: r.status,
        findings: r.findings,
      })),
    };
  } catch (err) {
    finalStatus = 'failed';
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[AgentTeam] Coordinator failed:', err);

    await prisma.agentTask.update({
      where: { id: coordTask.id },
      data: {
        status: finalStatus,
        error: errorMessage,
        completedAt: new Date(),
      },
    });

    throw err;
  }
}
