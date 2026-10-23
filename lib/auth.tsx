import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, setAuthToken, type User } from './api';
import { storage } from './storage';

const TOKEN_KEY = 'ledger.auth.token';
const USER_KEY = 'ledger.auth.user';

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: User | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    token: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await storage.get(TOKEN_KEY);
      const userJson = await storage.get(USER_KEY);
      if (cancelled) return;
      if (token && userJson) {
        try {
          const user = JSON.parse(userJson) as User;
          setAuthToken(token);
          setState({ status: 'authenticated', user, token });
          return;
        } catch {
          // fall through to unauthenticated
        }
      }
      setState({ status: 'unauthenticated', user: null, token: null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      async login(email, password) {
        const { token, user } = await apiClient.login(email, password);
        await storage.set(TOKEN_KEY, token);
        await storage.set(USER_KEY, JSON.stringify(user));
        setAuthToken(token);
        setState({ status: 'authenticated', user, token });
      },
      async logout() {
        await storage.remove(TOKEN_KEY);
        await storage.remove(USER_KEY);
        setAuthToken(null);
        setState({ status: 'unauthenticated', user: null, token: null });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
