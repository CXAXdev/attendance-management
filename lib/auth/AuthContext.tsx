"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Employee } from "@/lib/types";
import { useData } from "@/lib/db/DataContext";

const SESSION_KEY = "kintai-session-v1";

interface AuthApi {
  currentUser: Employee | null;
  ready: boolean;
  /** loginId でログイン(プロトタイプ: パスワード無し) */
  login: (loginId: string) => Employee | null;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { db, ready: dbReady } = useData();
  // セッションIDは遅延初期化で localStorage から直接読む(SSR では null)。
  // ready ゲートで保護されるためハイドレーション不整合は起きない。
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(SESSION_KEY)
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // マウント完了の通知のみ(意図的な1回フラグ)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  const login = useCallback(
    (loginId: string): Employee | null => {
      const user = db.employees.find(
        (e) => e.loginId === loginId && e.active
      );
      if (!user) return null;
      setCurrentUserId(user.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SESSION_KEY, user.id);
      }
      return user;
    },
    [db.employees]
  );

  const logout = useCallback(() => {
    setCurrentUserId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  // 退職(active=false)にされた人はログイン中でも無効にする(レイアウトがログイン画面へ戻す)
  const currentUser = useMemo(
    () =>
      db.employees.find((e) => e.id === currentUserId && e.active) ?? null,
    [db.employees, currentUserId]
  );

  const value: AuthApi = useMemo(
    () => ({ currentUser, ready: ready && dbReady, login, logout }),
    [currentUser, ready, dbReady, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthProvider 内で使用してください");
  return ctx;
}
