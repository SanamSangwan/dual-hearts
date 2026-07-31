import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiLogin, apiPost, clearToken, PublicUser, saveToken } from "./api";

type AuthState = {
  ready: boolean;
  user: PublicUser | null;
  partner: PublicUser | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [partner, setPartner] = useState<PublicUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet("/auth/me");
      setUser(data.user);
      setPartner(data.partner);
    } catch {
      setUser(null);
      setPartner(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    await saveToken(data.access_token);
    await refresh();
  }, [refresh]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const data = await apiPost("/auth/register", { email, password, name });
    await saveToken(data.access_token);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setPartner(null);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, user, partner, refresh, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
