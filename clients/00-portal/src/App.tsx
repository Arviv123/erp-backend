import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionsProvider, usePermissions } from './contexts/PermissionsContext';
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

// Admin
import UserPermissionsPage from './pages/UserPermissionsPage';

// Employee Self-Service Portal (ESS)
import EmployeePortalPage from './pages/EmployeePortalPage';
import EmployeeForm101Page from './pages/EmployeeForm101Page';

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PermissionsProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
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

              {/* Invoices */}
              <Route path="/invoices" element={<ProtectedRoute module="INVOICES"><InvoicesListPage /></ProtectedRoute>} />
              <Route path="/invoices/new" element={<ProtectedRoute module="INVOICES"><NewInvoicePage /></ProtectedRoute>} />
              <Route path="/invoices/aging" element={<ProtectedRoute module="INVOICES"><AgingReportPage /></ProtectedRoute>} />
              <Route path="/invoices/:id" element={<ProtectedRoute module="INVOICES"><InvoiceDetailPage /></ProtectedRoute>} />

              {/* Accounting */}
              <Route path="/accounting" element={<ProtectedRoute module="ACCOUNTING"><AccountingDashboardPage /></ProtectedRoute>} />
              <Route path="/accounting/accounts" element={<ProtectedRoute module="ACCOUNTING"><ChartOfAccountsPage /></ProtectedRoute>} />
              <Route path="/accounting/transactions" element={<ProtectedRoute module="ACCOUNTING"><JournalPage /></ProtectedRoute>} />
              <Route path="/accounting/trial-balance" element={<ProtectedRoute module="ACCOUNTING"><TrialBalancePage /></ProtectedRoute>} />
              <Route path="/accounting/reports/pl" element={<ProtectedRoute module="ACCOUNTING"><PLReportPage /></ProtectedRoute>} />
              <Route path="/accounting/reports/balance-sheet" element={<ProtectedRoute module="ACCOUNTING"><BalanceSheetPage /></ProtectedRoute>} />
              <Route path="/accounting/reports/vat" element={<ProtectedRoute module="ACCOUNTING"><VATReportPage /></ProtectedRoute>} />
              <Route path="/accounting/reports/cash-flow" element={<ProtectedRoute module="ACCOUNTING"><CashFlowPage /></ProtectedRoute>} />

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
    </QueryClientProvider>
  );
}
