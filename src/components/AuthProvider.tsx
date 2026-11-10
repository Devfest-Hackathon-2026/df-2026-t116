"use client";
// ログインの状態を画面全体で共有する。
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { signIn, signOutUser, watchUser, type SignedInUser } from "@/lib/client/firebase";

interface AuthState {
  user: SignedInUser | null;
  /** ログインの状態を読み終えたか */
  ready: boolean;
  login: (devName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  ready: false,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return watchUser((u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const login = useCallback(async (devName?: string) => {
    try {
      await signIn(devName);
    } catch (e) {
      console.error("login failed", e instanceof Error ? e.message : e);
      alert("ログインできませんでした。もう一度試してください");
    }
  }, []);

  const logout = useCallback(async () => {
    await signOutUser();
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}
