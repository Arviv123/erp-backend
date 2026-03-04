/**
 * useEmployerInfo — fetches tenant (employer) data for legal documents
 * Used by: PayslipPage, Form106Page, Form126Page, MonthlyReport102Page
 *
 * Returns: businessName, businessNumber (ח.פ./ע.מ.), vatNumber, address,
 *          withholdingFileNumber (תיק ניכויים), niFileNumber (תיק ב.ל.)
 */
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface EmployerInfo {
  businessName:         string;
  businessNumber:       string;  // ח.פ. / ע.מ.
  vatNumber?:           string;  // מס' עוסק מורשה
  withholdingFileNumber?: string; // מספר תיק ניכויים (ממס הכנסה) — נשמר ב-taxSettings
  niFileNumber?:        string;  // מספר תיק ביטוח לאומי — נשמר ב-taxSettings
  address?: {
    street?: string;
    city?:   string;
    zip?:    string;
  };
  phone?:  string;
  email?:  string;
}

async function fetchTenantInfo(): Promise<EmployerInfo> {
  const r = await api.get('/tenants/me');
  const t = r.data?.data ?? r.data;
  const ts = (t.taxSettings as any) ?? {};
  return {
    businessName:          t.name         ?? '',
    businessNumber:        t.businessNumber ?? '',
    vatNumber:             t.vatNumber,
    withholdingFileNumber: ts.withholdingFileNumber ?? ts.taxFileNumber ?? '',
    niFileNumber:          ts.niFileNumber ?? '',
    address:               t.address as any,
    phone:                 t.phone,
    email:                 t.email,
  };
}

export function useEmployerInfo() {
  return useQuery({
    queryKey: ['tenant-info'],
    queryFn:  fetchTenantInfo,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

/** Formats employer address as single line */
export function fmtAddress(address?: EmployerInfo['address']): string {
  if (!address) return '';
  return [address.street, address.city].filter(Boolean).join(', ');
}
