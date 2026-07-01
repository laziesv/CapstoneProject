"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getToken, setSession, clearSession } from "@/utils/session";
import { authService } from "@/services";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const token = getToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      // ตรวจ token กับ backend ว่ายังใช้ได้จริง
      try {
        const user = await authService.me();
        if (!active) return;
        // sync ข้อมูล user ล่าสุด แล้วปล่อยให้เข้าได้
        setSession(token, user);
        setChecking(false);
      } catch {
        if (!active) return;
        clearSession();
        router.replace("/login");
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
