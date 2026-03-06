# ERP MCP Server

An MCP (Model Context Protocol) server that connects Claude Code directly to the ERP backend.
Once configured, Claude Code can query customers, invoices, inventory, employees, payroll, and more
without leaving your development environment.

---

## Prerequisites

- Node.js 20+
- A running ERP backend (local or Render — `https://erp-backend-n433.onrender.com`)
- A valid JWT token from the ERP (obtained via login)

---

## Installation

```bash
cd erp-mcp-server
npm install
npm run build
```

---

## Environment Variables

| Variable        | Description                                                          | Default                                      |
|-----------------|----------------------------------------------------------------------|----------------------------------------------|
| `ERP_API_URL`   | Base URL of the ERP backend                                          | `https://erp-backend-n433.onrender.com`      |
| `ERP_JWT_TOKEN` | JWT bearer token (log in via POST /api/users/login first)            | *(empty — required for authenticated calls)* |

### Getting a JWT token

```bash
curl -X POST https://erp-backend-n433.onrender.com/api/users/login \
  -H "Content-Type: application/json" \
  --data-binary @- << 'EOF'
{"email":"admin2@test.co.il","password":"Admin1234!","tenantId":"cmm95megs00014n265h3objd5"}
EOF
```

Copy the `token` field from the response.

---

## Connecting to Claude Code

Add the following to your Claude Code MCP settings file
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows,
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "erp": {
      "command": "node",
      "args": ["C:/Users/<you>/בקנד חשבשבת/erp-mcp-server/build/index.js"],
      "env": {
        "ERP_API_URL":   "https://erp-backend-n433.onrender.com",
        "ERP_JWT_TOKEN": "<paste your JWT here>"
      }
    }
  }
}
```

Restart Claude Code after saving. You should see "erp" appear in the MCP servers list.

---

## Available Tools

| Tool                  | Description                                              |
|-----------------------|----------------------------------------------------------|
| `search_erp`          | Full-text search across all ERP entities                 |
| `get_customers`       | List CRM customers                                       |
| `get_customer`        | Get a single customer by ID                              |
| `get_invoices`        | List invoices (filterable by customer/status)            |
| `get_invoice`         | Get a single invoice by ID                               |
| `create_invoice`      | Create a new invoice with line items                     |
| `get_trial_balance`   | Accounting trial balance as of a given date              |
| `get_stock_levels`    | Inventory stock levels (supports low-stock filter)       |
| `get_employees`       | List employees                                           |
| `get_payroll_runs`    | Payroll runs by year/month                               |
| `get_sales_orders`    | List sales orders                                        |
| `get_analytics_kpis`  | KPI dashboard (revenue, expenses, cash)                  |
| `run_agent`           | Send a message to the ERP AI agent                       |
| `get_overdue_invoices`| Accounts-receivable aging report                         |
| `get_rfid_dashboard`  | RFID asset/inventory tracking dashboard                  |

## Available Resources

| URI                      | Description                     |
|--------------------------|---------------------------------|
| `erp://customers`        | Full customer list (JSON)        |
| `erp://chart-of-accounts`| Complete chart of accounts (JSON)|
| `erp://products`         | Product catalog (JSON)           |

## Available Prompts

| Prompt               | Arguments            | Description                                    |
|----------------------|----------------------|------------------------------------------------|
| `monthly_report`     | `month`, `year`      | Generate a monthly financial report            |
| `stock_analysis`     | *(none)*             | Analyze inventory and suggest reorders         |
| `customer_analysis`  | `customerId?`        | Analyze customer performance and AR            |

---

## Local Development

```bash
# Run from source (requires ts-node)
ERP_JWT_TOKEN=<token> npm run dev

# Build and run compiled output
npm run build
ERP_JWT_TOKEN=<token> npm start
```

Logs are written to stderr so they don't interfere with the MCP stdio protocol.

---

## Troubleshooting

- **"NOT SET" for JWT token** — make sure `ERP_JWT_TOKEN` is set in the MCP config `env` block.
- **401 Unauthorized from ERP** — token may be expired; log in again to get a fresh one.
- **Server not appearing in Claude Code** — verify the `args` path is correct and `npm run build` has been run.
- **ERP on Render cold-starts** — the first request after inactivity may take 30–60 s; subsequent ones are fast.
