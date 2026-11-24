import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore, type User } from './api';
import { reconnectSocket } from './realtime';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** para cambios que llegan por otro lado: saldo, skin equipada... */
  patchUser: (changes: Partial<User>) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  // al recargar la página compruebo si el token guardado sigue valiendo
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.login(username, password);
    tokenStore.set(r.token);
    setUser(r.user);
    reconnectSocket();
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const r = await api.register(username, password);
    tokenStore.set(r.token);
    setUser(r.user);
    reconnectSocket();
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    reconnectSocket();
  }, []);

  const patchUser = useCallback((changes: Partial<User>) => {
    setUser((u) => (u ? { ...u, ...changes } : u));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, patchUser }),
    [user, loading, login, register, logout, patchUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>');
  return ctx;
}
