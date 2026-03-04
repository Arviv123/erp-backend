/**
 * MobileAuthContext — stores JWT for employee mobile PIN sessions
 * Separate from regular user auth (AuthContext)
 */
import { createContext, useContext, useState, ReactNode } from 'react';

const STORAGE_KEY = 'mobile_token';
const EMP_KEY     = 'mobile_employee';

interface MobileEmployee {
  id:        string;
  firstName: string;
  lastName:  string;
  tenantId?: string;
}

interface MobileAuthCtx {
  token:    string | null;
  employee: MobileEmployee | null;
  login:    (token: string, employee: MobileEmployee) => void;
  logout:   () => void;
}

const Ctx = createContext<MobileAuthCtx>({
  token: null, employee: null,
  login: () => {}, logout: () => {},
});

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [employee, setEmployee] = useState<MobileEmployee | null>(() => {
    try { return JSON.parse(localStorage.getItem(EMP_KEY) ?? 'null'); } catch { return null; }
  });

  const login = (t: string, emp: MobileEmployee) => {
    localStorage.setItem(STORAGE_KEY, t);
    localStorage.setItem(EMP_KEY, JSON.stringify(emp));
    setToken(t);
    setEmployee(emp);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EMP_KEY);
    setToken(null);
    setEmployee(null);
  };

  return <Ctx.Provider value={{ token, employee, login, logout }}>{children}</Ctx.Provider>;
}

export function useMobileAuth() { return useContext(Ctx); }

/** API helper that uses the mobile token */
export function getMobileHeaders(): Record<string, string> {
  const t = localStorage.getItem(STORAGE_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
