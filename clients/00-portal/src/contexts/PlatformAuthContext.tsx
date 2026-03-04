import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import platformApi from '../lib/platformApi';

interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
}

interface PlatformAuthState {
  admin: PlatformAdmin | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const PlatformAuthContext = createContext<PlatformAuthState | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin]   = useState<PlatformAdmin | null>(null);
  const [token, setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('platform_token');
    const savedAdmin = localStorage.getItem('platform_admin');
    if (savedToken && savedAdmin) {
      try {
        setToken(savedToken);
        setAdmin(JSON.parse(savedAdmin));
      } catch {
        localStorage.removeItem('platform_token');
        localStorage.removeItem('platform_admin');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await platformApi.post('/auth/login', { email, password });
    const { token: t, admin: a } = res.data;
    localStorage.setItem('platform_token', t);
    localStorage.setItem('platform_admin', JSON.stringify(a));
    setToken(t);
    setAdmin(a);
  };

  const logout = () => {
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_admin');
    setToken(null);
    setAdmin(null);
  };

  return (
    <PlatformAuthContext.Provider value={{ admin, token, loading, login, logout }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export const usePlatformAuth = () => {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('usePlatformAuth must be inside PlatformAuthProvider');
  return ctx;
};
