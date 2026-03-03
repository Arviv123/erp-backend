import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

interface AuthContextType {
  token: string | null;
  user: any;
  loading: boolean;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('erp_token');
    const savedUser = localStorage.getItem('erp_user');
    if (savedToken) setToken(savedToken);
    if (savedUser && savedUser !== 'undefined') {
      try { setUser(JSON.parse(savedUser)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string, tenantId: string) => {
    const res = await api.post('/users/auth/login', { email, password, tenantId });
    const { token: t, user: u } = res.data;
    localStorage.setItem('erp_token', t);
    localStorage.setItem('erp_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
