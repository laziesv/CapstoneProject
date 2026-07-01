"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import { getUser, logout } from "@/utils/session";
import type { AuthUser } from "@/interfaces";

export interface AuthContextValue {
  user: AuthUser | null;
  /** โหลด user ล่าสุดจาก session (เรียกหลัง login/เปลี่ยนข้อมูล) */
  refresh: () => void;
  /** ออกจากระบบ + เด้งไปหน้า login */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  refresh: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(() => setUser(getUser()), []);
  const signOut = useCallback(() => logout(), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
