import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionsProvider, usePermissions } from './contexts/PermissionsContext';
import ToastProvider from './contexts/ToastContext';
import { type ModuleKey } from './lib/modules';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';

// Dashboard
import DashboardPage from './pages/DashboardPage';

// Employees
import EmployeesPage from './pages/EmployeesPage';
import NewEmployeePage from './pages/NewEmployeePage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';

// Payroll
import PayrollDashboardPage from './pages/PayrollDashboardPage';
import PayrollRunDetailPage from './pages/PayrollRunDetailPage';
import PayslipPage from './pages/PayslipPage';
import PayslipsListPage from './pages/PayslipsListPage';
import PayrollPreviewPage from './pages/PayrollPreviewPage';
import Form106Page from './pages/Form106Page';
import Form126Page from './pages/Form126Page';
import MonthlyReport102Page from './pages/MonthlyReport102Page';
import PayrollWorksheetPage from './pages/PayrollWorksheetPage';
import ReportGeneratorPage from './pages/ReportGeneratorPage';

// Invoices
import InvoicesListPage from './pages/InvoicesListPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import NewInvoicePage from './pages/NewInvoicePage';
import AgingReportPage from './pages/AgingReportPage';

// Accounting
import AccountingDashboardPage from './pages/AccountingDashboardPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import JournalPage from './pages/JournalPage';
import TrialBalancePage from './pages/TrialBalancePage';
import PLReportPage from './pages/PLReportPage';
import BalanceSheetPage from './pages/BalanceSheetPage';
import VATReportPage from './pages/VATReportPage';
import CashFlowPage from './pages/CashFlowPage';

// Purchasing
import VendorsPage from './pages/VendorsPage';
import NewVendorPage from './pages/NewVendorPage';
import BillsListPage from './pages/BillsListPage';
import NewBillPage from './pages/NewBillPage';
import APAgingPage from './pages/APAgingPage';

// CRM
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import CustomerStatementPage from './pages/CustomerStatementPage';
import NewCustomerPage from './pages/NewCustomerPage';

// HR
import HRDashboardPage from './pages/HRDashboardPage';
import LeaveRequestsPage from './pages/LeaveRequestsPage';
import LeaveBalancePage from './pages/LeaveBalancePage';
import HolidaysPage from './pages/HolidaysPage';
import LeaveTypesPage from './pages/LeaveTypesPage';

// Attendance
import AttendancePage from './pages/AttendancePage';
import SummaryPage from './pages/SummaryPage';
import ManagerViewPage from './pages/ManagerViewPage';

// Inventory
import InventoryDashboardPage from './pages/InventoryDashboardPage';
import ItemsPage from './pages/ItemsPage';
import NewItemPage from './pages/NewItemPage';
import ItemDetailPage from './pages/ItemDetailPage';
import MovementsPage from './pages/MovementsPage';

// POS
import POSPage from './pages/POSPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import SalesSummaryPage from './pages/SalesSummaryPage';

// Accounting extras
import FixedAssetsPage from './pages/FixedAssetsPage';
import ExpenseReportsPage from './pages/ExpenseReportsPage';
import BudgetPage from './pages/BudgetPage';
import BankReconciliationPage from './pages/BankReconciliationPage';
import AccountLedgerPage from './pages/AccountLedgerPage';
import LedgerCardsPage from './pages/LedgerCardsPage';
import CreditCardReconPage from './pages/CreditCardReconPage';

// Documents & Settings
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import CompanySettingsPage from './pages/CompanySettingsPage';

// Receipts
import ReceiptsPage from './pages/ReceiptsPage';

// Smart Import
import SmartImportPage from './pages/SmartImportPage';

// POS Phase 2
import POSPromotionsPage from './pages/POSPromotionsPage';
import POSLoyaltyPage from './pages/POSLoyaltyPage';
import GiftCardsPage from './pages/GiftCardsPage';
import POSZReportPage from './pages/POSZReportPage';

// POS Phase 3
import POSTablesPage from './pages/POSTablesPage';
import POSCashPage from './pages/POSCashPage';
import POSAnalyticsPage from './pages/POSAnalyticsPage';

// Payment Terminals
import PaymentTerminalsPage from './pages/PaymentTerminalsPage';

// Quotes
import QuotesPage from './pages/QuotesPage';
import NewQuotePage from './pages/NewQuotePage';
import QuoteDetailPage from './pages/QuoteDetailPage';

// Sales Orders
import SalesOrdersPage from './pages/SalesOrdersPage';

// Recurring Invoices
import RecurringInvoicesPage from './pages/RecurringInvoicesPage';

// Price Lists + Branches
import PriceListsPage from './pages/PriceListsPage';
import BranchesPage from './pages/BranchesPage';

// Petty Cash
import PettyCashPage from './pages/PettyCashPage';

// Admin
import UserPermissionsPage from './pages/UserPermissionsPage';

// Employee Self-Service Portal (ESS)
import EmployeePortalPage from './pages/EmployeePortalPage';
import EmployeeForm101Page from './pages/EmployeeForm101Page';

// Mobile Employee App (/m/*)
import MobileLoginPage from './pages/MobileLoginPage';
import MobileHomePage  from './pages/MobileHomePage';
import { MobileAuthProvider } from './contexts/MobileAuthContext';

// Platform Admin (/platform/*)
import PlatformLoginPage        from './pages/platform/PlatformLoginPage';
import PlatformDashboardPage    from './pages/platform/PlatformDashboardPage';
import PlatformTenantsPage      from './pages/platform/PlatformTenantsPage';
import PlatformTenantDetailPage from './pages/platform/PlatformTenantDetailPage';
import PlatformAdminsPage       from './pages/platform/PlatformAdminsPage';
import PlatformActivityPage     from './pages/platform/PlatformActivityPage';
import PlatformSettingsPage     from './pages/platform/PlatformSettingsPage';
import { PlatformAuthProvider, usePlatformAuth } from './contexts/PlatformAuthContext';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function ProtectedRoute({ children, module }: { children: ReactNode; module?: ModuleKey }) {
  const { token, loading, user } = useAuth();
  const { hasModule } = usePermissions();

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500 text-sm">טוען...</div>;
  if (!token) return <Navigate to="/" replace />;
  if (module && user?.role !== 'ADMIN' && !hasModule(module)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { token, loading, user } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500 text-sm">טוען...</div>;
  if (!token) return <Navigate to="/" replace />;
  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function PlatformRoute({ children }: { children: ReactNode }) {
  const { token, loading } = usePlatformAuth();
  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-400 text-sm">טוען...</div>;
  if (!token) return <Navigate to="/platform/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <PlatformAuthProvider>
      <MobileAuthProvider>
      <AuthProvider>
        <PermissionsProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              {/* ── Platform Admin (/platform/*) — completely separate from tenant UI */}
              <Route path="/platform/login"        element={<PlatformLoginPage />} />
              <Route path="/platform/dashboard"    element={<PlatformRoute><PlatformDashboardPage /></PlatformRoute>} />
              <Route path="/platform/tenants"      element={<PlatformRoute><PlatformTenantsPage /></PlatformRoute>} />
              <Route path="/platform/tenants/:id"  element={<PlatformRoute><PlatformTenantDetailPage /></PlatformRoute>} />
              <Route path="/platform/admins"       element={<PlatformRoute><PlatformAdminsPage /></PlatformRoute>} />
              <Route path="/platform/activity"     element={<PlatformRoute><PlatformActivityPage /></PlatformRoute>} />
              <Route path="/platform/settings"     element={<PlatformRoute><PlatformSettingsPage /></PlatformRoute>} />
              <Route path="/platform"              element={<Navigate to="/platform/login" replace />} />

              {/* Mobile Employee App — no main Layout */}
              <Route path="/m/login" element={<MobileLoginPage />} />
              <Route path="/m/home"  element={<MobileHomePage  />} />
              <Route path="/m"       element={<MobileLoginPage />} />

              <Route path="/" element={<LoginPage />} />

              {/* Dashboard */}
              <Route path="/dashboard" element={<ProtectedRoute module="DASHBOARD"><DashboardPage /></ProtectedRoute>} />

              {/* Employees */}
              <Route path="/employees" element={<ProtectedRoute module="EMPLOYEES"><EmployeesPage /></ProtectedRoute>} />
              <Route path="/employees/new" element={<ProtectedRoute module="EMPLOYEES"><NewEmployeePage /></ProtectedRoute>} />
              <Route path="/employees/:id" element={<ProtectedRoute module="EMPLOYEES"><EmployeeDetailPage /></ProtectedRoute>} />

              {/* Payroll */}
              <Route path="/payroll" element={<ProtectedRoute module="PAYROLL"><PayrollDashboardPage /></ProtectedRoute>} />
              <Route path="/payroll/runs/:id" element={<ProtectedRoute module="PAYROLL"><PayrollRunDetailPage /></ProtectedRoute>} />
              <Route path="/payroll/payslips" element={<ProtectedRoute module="PAYROLL"><PayslipsListPage /></ProtectedRoute>} />
              <Route path="/payroll/payslips/:id" element={<ProtectedRoute module="PAYROLL"><PayslipPage /></ProtectedRoute>} />
              <Route path="/payroll/payslip/:id" element={<ProtectedRoute module="PAYROLL"><PayslipPage /></ProtectedRoute>} />
              <Route path="/payroll/preview" element={<ProtectedRoute module="PAYROLL"><PayrollPreviewPage /></ProtectedRoute>} />
              <Route path="/payroll/form106" element={<ProtectedRoute module="PAYROLL"><Form106Page /></ProtectedRoute>} />
              <Route path="/payroll/form126" element={<ProtectedRoute module="PAYROLL"><Form126Page /></ProtectedRoute>} />
              <Route path="/payroll/report102" element={<ProtectedRoute module="PAYROLL"><MonthlyReport102Page /></ProtectedRoute>} />
              <Route path="/payroll/worksheet" element={<ProtectedRoute module="PAYROLL"><PayrollWorksheetPage /></ProtectedRoute>} />
              <Route path="/payroll/reports" element={<ProtectedRoute module="PAYROLL"><ReportGeneratorPage /></ProtectedRoute>} />

              {/* Invoices */}
              <Route path="/invoices" element={<ProtectedRoute module="INVOICES"><InvoicesListPage /></ProtectedRoute>} />
              <Route path="/invoices/new" element={<ProtectedRoute module="INVOICES"><NewInvoicePage /></ProtectedRoute>} />
              <Route path="/invoices/aging" element={<ProtectedRoute module="INVOICES"><AgingReportPage /></ProtectedRoute>} />
              <Route path="/invoices/:id" element={<ProtectedRoute module="INVOICES"><InvoiceDetailPage /></ProtectedRoute>} />

              {/* Documents (quotes, delivery notes, etc.) */}
              <Route path="/documents" element={<ProtectedRoute module="INVOICES"><DocumentsPage /></ProtectedRoute>} />
              <Route path="/documents/:id" element={<ProtectedRoute module="INVOICES"><DocumentDetailPage /></ProtectedRoute>} />

              {/* Company Settings */}
              <Route path="/settings/company" element={<ProtectedRoute module="INVOICES"><CompanySettingsPage /></ProtectedRoute>} />

              {/* Accounting */}
              <Route path="/accounting" element={<ProtectedRoute module="ACCOUNTING"><AccountingDashboardPage /></ProtectedRoute>} />
              <Route path="/accounting/accounts" element={<ProtectedRoute module="ACCOUNTING"><ChartOfAccountsPage /></ProtectedRoute>} />
              <Route path="/accounting/transactions" element={<ProtectedRoute module="ACCOUNTING"><JournalPage /></ProtectedRoute>} />
              <Route path="/accounting/trial-balance" element={<ProtectedRoute module="ACCOUNTING"><TrialBalancePage /></ProtectedRoute>} />
              <Route path="/accounting/reports/pl" element={<ProtectedRoute module="ACCOUNTING"><PLReportPage /></ProtectedRoute>} />
              <Route path="/accounting/reports/balance-sheet" element={<ProtectedRoute module="ACCOUNTING"><BalanceSheetPage /></ProtectedRoute>} />
              <Route path="/accounting/reports/vat" element={<ProtectedRoute module="ACCOUNTING"><VATReportPage /></ProtectedRoute>} />
              <Route path="/accounting/reports/cash-flow" element={<ProtectedRoute module="ACCOUNTING"><CashFlowPage /></ProtectedRoute>} />
              <Route path="/accounting/fixed-assets" element={<ProtectedRoute module="ACCOUNTING"><FixedAssetsPage /></ProtectedRoute>} />
              <Route path="/accounting/expenses" element={<ProtectedRoute module="ACCOUNTING"><ExpenseReportsPage /></ProtectedRoute>} />
              <Route path="/accounting/budget" element={<ProtectedRoute module="ACCOUNTING"><BudgetPage /></ProtectedRoute>} />
              <Route path="/accounting/bank-recon" element={<ProtectedRoute module="ACCOUNTING"><BankReconciliationPage /></ProtectedRoute>} />
              <Route path="/accounting/ledger" element={<ProtectedRoute module="ACCOUNTING"><AccountLedgerPage /></ProtectedRoute>} />
              <Route path="/accounting/ledger-cards" element={<ProtectedRoute module="ACCOUNTING"><LedgerCardsPage /></ProtectedRoute>} />
              <Route path="/accounting/credit-card-recon" element={<ProtectedRoute module="ACCOUNTING"><CreditCardReconPage /></ProtectedRoute>} />

              {/* Receipts */}
              <Route path="/receipts" element={<ProtectedRoute module="INVOICES"><ReceiptsPage /></ProtectedRoute>} />

              {/* Smart Import */}
              <Route path="/smart-import" element={<ProtectedRoute module="ACCOUNTING"><SmartImportPage /></ProtectedRoute>} />

              {/* Purchasing */}
              <Route path="/purchasing/vendors" element={<ProtectedRoute module="ACCOUNTING"><VendorsPage /></ProtectedRoute>} />
              <Route path="/purchasing/vendors/new" element={<ProtectedRoute module="ACCOUNTING"><NewVendorPage /></ProtectedRoute>} />
              <Route path="/purchasing/bills" element={<ProtectedRoute module="ACCOUNTING"><BillsListPage /></ProtectedRoute>} />
              <Route path="/purchasing/bills/new" element={<ProtectedRoute module="ACCOUNTING"><NewBillPage /></ProtectedRoute>} />
              <Route path="/purchasing/ap-aging" element={<ProtectedRoute module="ACCOUNTING"><APAgingPage /></ProtectedRoute>} />

              {/* CRM */}
              <Route path="/crm/customers" element={<ProtectedRoute module="CRM"><CustomersPage /></ProtectedRoute>} />
              <Route path="/crm/customers/new" element={<ProtectedRoute module="CRM"><NewCustomerPage /></ProtectedRoute>} />
              <Route path="/crm/customers/:id" element={<ProtectedRoute module="CRM"><CustomerDetailPage /></ProtectedRoute>} />
              <Route path="/crm/customers/:id/statement" element={<ProtectedRoute module="CRM"><CustomerStatementPage /></ProtectedRoute>} />

              {/* HR */}
              <Route path="/hr" element={<ProtectedRoute module="HR"><HRDashboardPage /></ProtectedRoute>} />
              <Route path="/hr/leave-requests" element={<ProtectedRoute module="HR"><LeaveRequestsPage /></ProtectedRoute>} />
              <Route path="/hr/leave-balance" element={<ProtectedRoute module="HR"><LeaveBalancePage /></ProtectedRoute>} />
              <Route path="/hr/holidays" element={<ProtectedRoute module="HR"><HolidaysPage /></ProtectedRoute>} />
              <Route path="/hr/leave-types" element={<ProtectedRoute module="HR"><LeaveTypesPage /></ProtectedRoute>} />

              {/* Attendance */}
              <Route path="/attendance" element={<ProtectedRoute module="ATTENDANCE"><AttendancePage /></ProtectedRoute>} />
              <Route path="/attendance/summary" element={<ProtectedRoute module="ATTENDANCE"><SummaryPage /></ProtectedRoute>} />
              <Route path="/attendance/manager" element={<ProtectedRoute module="ATTENDANCE"><ManagerViewPage /></ProtectedRoute>} />

              {/* Inventory */}
              <Route path="/inventory" element={<ProtectedRoute module="INVENTORY"><InventoryDashboardPage /></ProtectedRoute>} />
              <Route path="/inventory/items" element={<ProtectedRoute module="INVENTORY"><ItemsPage /></ProtectedRoute>} />
              <Route path="/inventory/items/new" element={<ProtectedRoute module="INVENTORY"><NewItemPage /></ProtectedRoute>} />
              <Route path="/inventory/items/:id" element={<ProtectedRoute module="INVENTORY"><ItemDetailPage /></ProtectedRoute>} />
              <Route path="/inventory/movements" element={<ProtectedRoute module="INVENTORY"><MovementsPage /></ProtectedRoute>} />

              {/* POS */}
              <Route path="/pos" element={<ProtectedRoute module="POS"><POSPage /></ProtectedRoute>} />
              <Route path="/pos/sales" element={<ProtectedRoute module="POS"><SalesHistoryPage /></ProtectedRoute>} />
              <Route path="/pos/summary" element={<ProtectedRoute module="POS"><SalesSummaryPage /></ProtectedRoute>} />
              <Route path="/pos/tables" element={<ProtectedRoute module="POS"><POSTablesPage /></ProtectedRoute>} />
              <Route path="/pos/cash" element={<ProtectedRoute module="POS"><POSCashPage /></ProtectedRoute>} />
              <Route path="/pos/analytics" element={<ProtectedRoute module="POS"><POSAnalyticsPage /></ProtectedRoute>} />
              <Route path="/pos/promotions" element={<ProtectedRoute module="POS"><POSPromotionsPage /></ProtectedRoute>} />
              <Route path="/pos/loyalty" element={<ProtectedRoute module="POS"><POSLoyaltyPage /></ProtectedRoute>} />
              <Route path="/pos/gift-cards" element={<ProtectedRoute module="POS"><GiftCardsPage /></ProtectedRoute>} />
              <Route path="/pos/z-report" element={<ProtectedRoute module="POS"><POSZReportPage /></ProtectedRoute>} />
              <Route path="/pos/payment-terminals" element={<ProtectedRoute module="POS"><PaymentTerminalsPage /></ProtectedRoute>} />

              {/* Quotes */}
              <Route path="/quotes" element={<ProtectedRoute module="INVOICES"><QuotesPage /></ProtectedRoute>} />
              <Route path="/quotes/new" element={<ProtectedRoute module="INVOICES"><NewQuotePage /></ProtectedRoute>} />
              <Route path="/quotes/:id" element={<ProtectedRoute module="INVOICES"><QuoteDetailPage /></ProtectedRoute>} />

              {/* Sales Orders */}
              <Route path="/sales-orders" element={<ProtectedRoute module="INVOICES"><SalesOrdersPage /></ProtectedRoute>} />

              {/* Recurring Invoices */}
              <Route path="/recurring-invoices" element={<ProtectedRoute module="INVOICES"><RecurringInvoicesPage /></ProtectedRoute>} />

              {/* Price Lists */}
              <Route path="/price-lists" element={<ProtectedRoute module="ACCOUNTING"><PriceListsPage /></ProtectedRoute>} />

              {/* Branches */}
              <Route path="/branches" element={<ProtectedRoute module="ACCOUNTING"><BranchesPage /></ProtectedRoute>} />

              {/* Petty Cash */}
              <Route path="/petty-cash" element={<ProtectedRoute module="ACCOUNTING"><PettyCashPage /></ProtectedRoute>} />

              {/* Employee Self-Service Portal (ESS) — accessible to all logged-in users */}
              <Route path="/employee" element={<ProtectedRoute module="DASHBOARD"><EmployeePortalPage /></ProtectedRoute>} />
              <Route path="/employee/payslips" element={<ProtectedRoute module="DASHBOARD"><PayslipsListPage /></ProtectedRoute>} />
              <Route path="/employee/form101" element={<ProtectedRoute module="DASHBOARD"><EmployeeForm101Page /></ProtectedRoute>} />
              <Route path="/employee/leave" element={<ProtectedRoute module="DASHBOARD"><LeaveRequestsPage /></ProtectedRoute>} />

              {/* Admin only */}
              <Route path="/admin/permissions" element={<AdminRoute><UserPermissionsPage /></AdminRoute>} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </PermissionsProvider>
      </AuthProvider>
      </MobileAuthProvider>
      </PlatformAuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
