"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { canAccess } from "@/config/permissions";

/** คุมสิทธิ์ตาม role ที่จุดเดียว — ครอบทุก path ใน (protected)
 *  (AuthGuard คุมเรื่องล็อกอินไปแล้ว ตัวนี้คุมต่อว่า role เข้า path นี้ได้ไหม) */
export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  // user ยังโหลดไม่เสร็จ (AuthProvider อ่านจาก session หลัง mount)
  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccess(user.role, pathname)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-sm text-muted">บัญชีของคุณไม่มีสิทธิ์ใช้งานหน้านี้</p>
        <Link href="/dashboard" className="mt-2 text-sm text-primary hover:underline">← กลับหน้าหลัก</Link>
      </div>
    );
  }

  return <>{children}</>;
}
