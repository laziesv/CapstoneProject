"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/** โซนเฉพาะผู้ดูแลระบบ — คุมสิทธิ์ที่เดียว (ครอบ /verify, /logs, /users) */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user ? user.role === "admin" : null;

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-sm text-muted">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
      </div>
    );
  }

  return <>{children}</>;
}
