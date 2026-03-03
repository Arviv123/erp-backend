import { createContext, useContext, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { type ModuleKey, MODULES, ROLE_DEFAULTS } from '../lib/modules';

const STORAGE_KEY = 'erp_permissions';

function loadAll(): Record<string, ModuleKey[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveAll(data: Record<string, ModuleKey[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

interface PermCtx {
  hasModule: (key: ModuleKey) => boolean;
  allowedModules: () => ModuleKey[];
  getUserModules: (userId: string) => ModuleKey[] | null;
  setUserModules: (userId: string, modules: ModuleKey[]) => void;
}

const PermissionsContext = createContext<PermCtx>(null!);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const allowedModules = useCallback((): ModuleKey[] => {
    if (!user) return [];
    if (user.role === 'ADMIN') return MODULES.map(m => m.key);
    const all = loadAll();
    // If admin has set specific modules for this user, use those
    if (all[user.id]) return all[user.id];
    // Otherwise fall back to role defaults
    return ROLE_DEFAULTS[user.role] ?? ['DASHBOARD', 'ATTENDANCE'];
  }, [user]);

  const hasModule = useCallback((key: ModuleKey): boolean => {
    return allowedModules().includes(key);
  }, [allowedModules]);

  const getUserModules = useCallback((userId: string): ModuleKey[] | null => {
    const all = loadAll();
    return all[userId] ?? null;
  }, []);

  const setUserModules = useCallback((userId: string, modules: ModuleKey[]) => {
    const all = loadAll();
    all[userId] = modules;
    saveAll(all);
  }, []);

  return (
    <PermissionsContext.Provider value={{ hasModule, allowedModules, getUserModules, setUserModules }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
