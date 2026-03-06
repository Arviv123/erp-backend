#!/usr/bin/env node
/**
 * ERP MCP Server
 * Exposes the ERP system to Claude Code via the Model Context Protocol (MCP).
 *
 * Transport: stdio
 * Configure with env vars:
 *   ERP_API_URL   — base URL of the ERP backend (default: https://erp-backend-n433.onrender.com)
 *   ERP_JWT_TOKEN — JWT obtained by calling POST /api/users/login
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// ── ERP HTTP helper ───────────────────────────────────────────────────────────

async function callERP(path: string, options: RequestInit = {}): Promise<any> {
  const baseUrl = process.env['ERP_API_URL'] ?? 'https://erp-backend-n433.onrender.com';
  const token   = process.env['ERP_JWT_TOKEN'] ?? '';
  const url     = `${baseUrl}${path}`;

  console.error(`[ERP] ${options.method ?? 'GET'} ${url}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string> ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ERP API error: ${res.status} ${body}`);
  }

  return res.json();
}

// ── Tool result helpers ───────────────────────────────────────────────────────

function okText(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

function errText(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    isError:  true,
    content: [{ type: 'text', text: `Error: ${message}` }],
  };
}

// ── Build query string from object ───────────────────────────────────────────

function qs(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return pairs.length ? `?${pairs.join('&')}` : '';
}

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'erp-mcp-server', version: '1.0.0' },
  {
    capabilities: {
      tools:     {},
      resources: {},
      prompts:   {},
    },
  }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name:        'search_erp',
    description: 'Full-text search across all ERP entities (customers, invoices, products, employees, etc.)',
    inputSchema: {
      type:       'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        types: { type: 'string', description: 'Comma-separated entity types to search (e.g. customers,invoices)' },
        limit: { type: 'number', description: 'Max results per type (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name:        'get_customers',
    description: 'List CRM customers, optionally filtered by search term',
    inputSchema: {
      type:       'object' as const,
      properties: {
        search:   { type: 'string', description: 'Filter by name, email, or phone' },
        pageSize: { type: 'number', description: 'Number of results (default 20)' },
      },
    },
  },
  {
    name:        'get_customer',
    description: 'Get full details of a single customer by ID',
    inputSchema: {
      type:       'object' as const,
      properties: {
        id: { type: 'string', description: 'Customer ID' },
      },
      required: ['id'],
    },
  },
  {
    name:        'get_invoices',
    description: 'List invoices, optionally filtered by customer ID and/or status',
    inputSchema: {
      type:       'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Filter by customer ID' },
        status:     { type: 'string', description: 'Invoice status: DRAFT | SENT | PAID | OVERDUE | CANCELLED' },
        pageSize:   { type: 'number', description: 'Number of results (default 20)' },
      },
    },
  },
  {
    name:        'get_invoice',
    description: 'Get full details of a single invoice by ID',
    inputSchema: {
      type:       'object' as const,
      properties: {
        id: { type: 'string', description: 'Invoice ID' },
      },
      required: ['id'],
    },
  },
  {
    name:        'create_invoice',
    description: 'Create a new invoice for a customer with line items',
    inputSchema: {
      type:       'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        dueDate:    { type: 'string', description: 'Due date in ISO format (YYYY-MM-DD)' },
        lineItems:  {
          type:  'array',
          items: {
            type:       'object',
            properties: {
              description: { type: 'string' },
              quantity:    { type: 'number' },
              unitPrice:   { type: 'number' },
            },
            required: ['description', 'quantity', 'unitPrice'],
          },
          description: 'Invoice line items',
        },
      },
      required: ['customerId', 'lineItems'],
    },
  },
  {
    name:        'get_trial_balance',
    description: 'Get the accounting trial balance as of a given date',
    inputSchema: {
      type:       'object' as const,
      properties: {
        asOf: { type: 'string', description: 'Date in ISO format (YYYY-MM-DD). Defaults to today.' },
      },
    },
  },
  {
    name:        'get_stock_levels',
    description: 'Get current inventory stock levels, optionally filtered',
    inputSchema: {
      type:       'object' as const,
      properties: {
        search:      { type: 'string',  description: 'Filter by product name or SKU' },
        lowStockOnly: { type: 'boolean', description: 'If true, only return items below reorder level' },
      },
    },
  },
  {
    name:        'get_employees',
    description: 'List employees, optionally filtered by search term',
    inputSchema: {
      type:       'object' as const,
      properties: {
        search:   { type: 'string', description: 'Filter by name, ID number, or department' },
        pageSize: { type: 'number', description: 'Number of results (default 20)' },
      },
    },
  },
  {
    name:        'get_payroll_runs',
    description: 'List payroll runs for a given year and/or month',
    inputSchema: {
      type:       'object' as const,
      properties: {
        year:  { type: 'number', description: 'Year (e.g. 2026)' },
        month: { type: 'number', description: 'Month number 1–12' },
      },
    },
  },
  {
    name:        'get_sales_orders',
    description: 'List sales orders, optionally filtered by status',
    inputSchema: {
      type:       'object' as const,
      properties: {
        status:   { type: 'string', description: 'Order status: DRAFT | CONFIRMED | SHIPPED | DELIVERED | CANCELLED' },
        pageSize: { type: 'number', description: 'Number of results (default 20)' },
      },
    },
  },
  {
    name:        'get_analytics_kpis',
    description: 'Get key performance indicators dashboard (revenue, expenses, outstanding AR/AP, cash position)',
    inputSchema: {
      type:       'object' as const,
      properties: {},
    },
  },
  {
    name:        'run_agent',
    description: 'Send a message to the ERP AI agent and get a response',
    inputSchema: {
      type:       'object' as const,
      properties: {
        message:        { type: 'string', description: 'Message / task for the agent' },
        conversationId: { type: 'string', description: 'Optional conversation ID to continue an existing session' },
      },
      required: ['message'],
    },
  },
  {
    name:        'get_overdue_invoices',
    description: 'Get accounts-receivable aging report showing overdue invoices',
    inputSchema: {
      type:       'object' as const,
      properties: {
        daysOverdue: { type: 'number', description: 'Minimum days overdue (0 = all overdue)' },
      },
    },
  },
  {
    name:        'get_rfid_dashboard',
    description: 'Get the RFID asset/inventory tracking dashboard',
    inputSchema: {
      type:       'object' as const,
      properties: {},
    },
  },
];

// ── List tools ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// ── Call tool ─────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {

      // ── search_erp ──────────────────────────────────────────────────────────
      case 'search_erp': {
        const { query, types, limit = 10 } = args as { query: string; types?: string; limit?: number };
        const data = await callERP(`/api/search${qs({ q: query, types, limit })}`);
        return okText(data);
      }

      // ── get_customers ───────────────────────────────────────────────────────
      case 'get_customers': {
        const { search, pageSize = 20 } = args as { search?: string; pageSize?: number };
        const data = await callERP(`/api/crm/customers${qs({ search, pageSize })}`);
        return okText(data);
      }

      // ── get_customer ────────────────────────────────────────────────────────
      case 'get_customer': {
        const { id } = args as { id: string };
        const data = await callERP(`/api/crm/customers/${id}`);
        return okText(data);
      }

      // ── get_invoices ────────────────────────────────────────────────────────
      case 'get_invoices': {
        const { customerId, status, pageSize = 20 } = args as {
          customerId?: string; status?: string; pageSize?: number;
        };
        const data = await callERP(`/api/invoices${qs({ customerId, status, pageSize })}`);
        return okText(data);
      }

      // ── get_invoice ─────────────────────────────────────────────────────────
      case 'get_invoice': {
        const { id } = args as { id: string };
        const data = await callERP(`/api/invoices/${id}`);
        return okText(data);
      }

      // ── create_invoice ──────────────────────────────────────────────────────
      case 'create_invoice': {
        const { customerId, lineItems, dueDate } = args as {
          customerId: string;
          lineItems:  Array<{ description: string; quantity: number; unitPrice: number }>;
          dueDate?:   string;
        };
        const data = await callERP('/api/invoices', {
          method: 'POST',
          body:   JSON.stringify({ customerId, lineItems, dueDate }),
        });
        return okText(data);
      }

      // ── get_trial_balance ───────────────────────────────────────────────────
      case 'get_trial_balance': {
        const { asOf } = args as { asOf?: string };
        const data = await callERP(`/api/accounting/trial-balance${qs({ asOf })}`);
        return okText(data);
      }

      // ── get_stock_levels ────────────────────────────────────────────────────
      case 'get_stock_levels': {
        const { search, lowStockOnly } = args as { search?: string; lowStockOnly?: boolean };
        const data = await callERP(`/api/inventory${qs({ search, lowStockOnly })}`);
        return okText(data);
      }

      // ── get_employees ───────────────────────────────────────────────────────
      case 'get_employees': {
        const { search, pageSize = 20 } = args as { search?: string; pageSize?: number };
        const data = await callERP(`/api/employees${qs({ search, pageSize })}`);
        return okText(data);
      }

      // ── get_payroll_runs ────────────────────────────────────────────────────
      case 'get_payroll_runs': {
        const { year, month } = args as { year?: number; month?: number };
        const data = await callERP(`/api/payroll${qs({ year, month })}`);
        return okText(data);
      }

      // ── get_sales_orders ────────────────────────────────────────────────────
      case 'get_sales_orders': {
        const { status, pageSize = 20 } = args as { status?: string; pageSize?: number };
        const data = await callERP(`/api/sales-orders${qs({ status, pageSize })}`);
        return okText(data);
      }

      // ── get_analytics_kpis ──────────────────────────────────────────────────
      case 'get_analytics_kpis': {
        const data = await callERP('/api/analytics/kpis');
        return okText(data);
      }

      // ── run_agent ───────────────────────────────────────────────────────────
      case 'run_agent': {
        const { message, conversationId } = args as { message: string; conversationId?: string };
        const data = await callERP('/api/agents/general/chat', {
          method: 'POST',
          body:   JSON.stringify({ message, conversationId }),
        });
        return okText(data);
      }

      // ── get_overdue_invoices ────────────────────────────────────────────────
      case 'get_overdue_invoices': {
        const { daysOverdue = 0 } = args as { daysOverdue?: number };
        const data = await callERP(`/api/accounting/aging${qs({ type: 'AR', daysOverdue })}`);
        return okText(data);
      }

      // ── get_rfid_dashboard ──────────────────────────────────────────────────
      case 'get_rfid_dashboard': {
        const data = await callERP('/api/rfid/dashboard');
        return okText(data);
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err: any) {
    console.error(`[ERP] Tool "${name}" failed:`, err?.message ?? err);
    return errText(err?.message ?? String(err));
  }
});

// ── Resources ─────────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri:         'erp://customers',
      name:        'ERP Customers',
      description: 'Full list of CRM customers',
      mimeType:    'application/json',
    },
    {
      uri:         'erp://chart-of-accounts',
      name:        'Chart of Accounts',
      description: 'Complete chart of accounts for the tenant',
      mimeType:    'application/json',
    },
    {
      uri:         'erp://products',
      name:        'Product Catalog',
      description: 'All products/inventory items',
      mimeType:    'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let data: unknown;

    switch (uri) {
      case 'erp://customers':
        data = await callERP('/api/crm/customers?pageSize=500');
        break;
      case 'erp://chart-of-accounts':
        data = await callERP('/api/accounting/accounts?pageSize=500');
        break;
      case 'erp://products':
        data = await callERP('/api/inventory/products?pageSize=200');
        break;
      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text:     JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err: any) {
    console.error(`[ERP] Resource "${uri}" failed:`, err?.message ?? err);
    throw new McpError(ErrorCode.InternalError, err?.message ?? String(err));
  }
});

// ── Prompts ───────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name:        'monthly_report',
      description: 'Generate a comprehensive monthly financial report',
      arguments:   [
        { name: 'month', description: 'Month number 1–12', required: true },
        { name: 'year',  description: 'Year (e.g. 2026)',  required: true },
      ],
    },
    {
      name:        'stock_analysis',
      description: 'Analyze inventory levels and suggest reorder actions',
      arguments:   [],
    },
    {
      name:        'customer_analysis',
      description: 'Analyze customer purchasing patterns and revenue contribution',
      arguments:   [
        { name: 'customerId', description: 'Optional — focus on a single customer', required: false },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {

    case 'monthly_report': {
      const month = (args['month'] as string) ?? new Date().getMonth() + 1;
      const year  = (args['year']  as string) ?? new Date().getFullYear();
      return {
        description: `Monthly financial report for ${month}/${year}`,
        messages: [
          {
            role:    'user' as const,
            content: {
              type: 'text' as const,
              text: `Please generate a comprehensive monthly financial report for ${month}/${year}.

Use the ERP tools to:
1. Fetch the trial balance as of the last day of the month (get_trial_balance)
2. Fetch all invoices for the month (get_invoices with status filter)
3. Fetch overdue invoices (get_overdue_invoices)
4. Fetch analytics KPIs (get_analytics_kpis)
5. Fetch payroll runs for the month (get_payroll_runs with year=${year} month=${month})

Then compile a professional report in Hebrew with:
- Executive summary (revenue, expenses, net profit)
- Accounts receivable position
- Payroll costs
- Outstanding issues and recommendations`,
            },
          },
        ],
      };
    }

    case 'stock_analysis': {
      return {
        description: 'Inventory analysis and reorder recommendations',
        messages: [
          {
            role:    'user' as const,
            content: {
              type: 'text' as const,
              text: `Please analyze the current inventory situation.

Use the ERP tools to:
1. Fetch all stock levels (get_stock_levels)
2. Fetch items below reorder level (get_stock_levels with lowStockOnly=true)

Then provide:
- Summary of current stock health
- List of items requiring immediate reorder (sorted by urgency)
- Items with excess stock that may need promotion
- Recommendations for optimizing inventory levels`,
            },
          },
        ],
      };
    }

    case 'customer_analysis': {
      const customerId = args['customerId'] as string | undefined;
      const focus      = customerId ? `Focus specifically on customer ID: ${customerId}.` : 'Analyze the top customers.';
      return {
        description: `Customer performance analysis${customerId ? ` for ${customerId}` : ''}`,
        messages: [
          {
            role:    'user' as const,
            content: {
              type: 'text' as const,
              text: `Please analyze customer performance. ${focus}

Use the ERP tools to:
${customerId
  ? `1. Get customer details: get_customer with id="${customerId}"\n2. Get their invoices: get_invoices with customerId="${customerId}"`
  : '1. List all customers: get_customers\n2. Fetch recent invoices: get_invoices'}
3. Check for any overdue invoices: get_overdue_invoices

Then provide:
- Revenue contribution by customer
- Payment behavior analysis (on-time vs. late)
- Outstanding balances
- Recommendations for customer relationship management`,
            },
          },
        ],
      };
    }

    default:
      throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[ERP MCP] Server started on stdio transport');
  console.error(`[ERP MCP] API URL: ${process.env['ERP_API_URL'] ?? 'https://erp-backend-n433.onrender.com'}`);
  console.error(`[ERP MCP] JWT token: ${process.env['ERP_JWT_TOKEN'] ? 'configured' : 'NOT SET'}`);
}

main().catch((err) => {
  console.error('[ERP MCP] Fatal error:', err);
  process.exit(1);
});
