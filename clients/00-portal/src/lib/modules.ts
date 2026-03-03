export type ModuleKey =
  | 'DASHBOARD' | 'EMPLOYEES' | 'PAYROLL' | 'INVOICES'
  | 'ACCOUNTING' | 'CRM' | 'HR' | 'ATTENDANCE' | 'INVENTORY' | 'POS';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  routePrefixes: string[];
}

export const MODULES: ModuleDef[] = [
  { key: 'DASHBOARD',   label: 'לוח בקרה',         description: 'סיכום כללי של המערכת',         routePrefixes: ['/dashboard'] },
  { key: 'EMPLOYEES',   label: 'עובדים',            description: 'ניהול עובדים ופרטים אישיים',   routePrefixes: ['/employees'] },
  { key: 'PAYROLL',     label: 'שכר',               description: 'עיבוד שכר ותלושים',            routePrefixes: ['/payroll'] },
  { key: 'INVOICES',    label: 'חשבוניות',          description: 'הפקת חשבוניות ומעקב תשלומים', routePrefixes: ['/invoices'] },
  { key: 'ACCOUNTING',  label: 'הנהלת חשבונות',    description: 'יומן, דוחות ומאזן',            routePrefixes: ['/accounting'] },
  { key: 'CRM',         label: 'לקוחות',            description: 'ניהול לקוחות ומכירות',         routePrefixes: ['/crm'] },
  { key: 'HR',          label: 'משאבי אנוש',        description: 'חופשות, היעדרויות וחגים',      routePrefixes: ['/hr'] },
  { key: 'ATTENDANCE',  label: 'נוכחות',            description: 'שעון נוכחות ודוחות',           routePrefixes: ['/attendance'] },
  { key: 'INVENTORY',   label: 'מלאי',              description: 'ניהול מלאי ותנועות',           routePrefixes: ['/inventory'] },
  { key: 'POS',         label: 'קופה',              description: 'קופה רושמת ומכירות',           routePrefixes: ['/pos'] },
];

// Default modules per role (when admin hasn't configured specific user)
export const ROLE_DEFAULTS: Record<string, ModuleKey[]> = {
  ADMIN:          ['DASHBOARD','EMPLOYEES','PAYROLL','INVOICES','ACCOUNTING','CRM','HR','ATTENDANCE','INVENTORY','POS'],
  MANAGER:        ['DASHBOARD','EMPLOYEES','HR','ATTENDANCE','PAYROLL'],
  ACCOUNTANT:     ['DASHBOARD','ACCOUNTING','INVOICES','CRM'],
  CASHIER:        ['POS'],
  SALESPERSON:    ['DASHBOARD','INVOICES','CRM'],
  HR_MANAGER:     ['DASHBOARD','HR','ATTENDANCE','EMPLOYEES'],
  PAYROLL_ADMIN:  ['DASHBOARD','PAYROLL','EMPLOYEES'],
  EMPLOYEE:       ['DASHBOARD','ATTENDANCE'],
};
