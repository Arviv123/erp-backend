import { UserRole } from '@prisma/client';
import { Request } from 'express';

// ─── Authenticated Request ───────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    tenantId: string;
    role: UserRole;
    email: string;
  };
}

// ─── API Response Wrapper ────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

// ─── Pagination ──────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ─── Payroll Calculation Types ───────────────────────────────────
export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface PayslipCalculation {
  grossSalary: number;
  taxableIncome: number;
  incomeTax: number;
  taxCreditsAmount: number;
  nationalInsuranceEmployee: number;
  healthInsuranceEmployee: number;
  pensionEmployee: number;
  netSalary: number;
  // Employer costs
  pensionEmployer: number;
  severancePay: number;
  nationalInsuranceEmployer: number;
  totalEmployerCost: number;
  // Breakdown
  taxBracketBreakdown: Array<{
    min: number;
    max: number | null;
    rate: number;
    taxableAmount: number;
    taxAmount: number;
  }>;
}

// ─── Double-Entry Types ──────────────────────────────────────────
export interface JournalEntry {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description?: string;
}

export interface CreateTransactionInput {
  tenantId: string;
  date: Date;
  reference: string;
  description: string;
  sourceType: string;
  sourceId?: string;
  lines: JournalEntry[];
  createdBy: string;
}
