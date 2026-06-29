"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getToken, fetchCurrentUser, setSession, clearSession } from "@/lib/auth";

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
      const user = await fetchCurrentUser();
      if (!active) return;

      if (!user) {
        clearSession();
        router.replace("/login");
        return;
      }

      // sync ข้อมูล user ล่าสุด แล้วปล่อยให้เข้าได้
      setSession(token, user);
      setChecking(false);
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
