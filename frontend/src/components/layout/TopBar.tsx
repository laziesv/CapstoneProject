"use client";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// เรียงจาก path เฉพาะเจาะจงก่อน (find คืนคีย์แรกที่ startsWith ตรง)
const titles: Record<string, string> = {
  "/dashboard": "แดชบอร์ด",
  "/cases": "คดี",
  "/evidence/upload": "อัปโหลดหลักฐาน",
  "/evidence": "รายละเอียดหลักฐาน",
  "/verify": "ตรวจสอบลายน้ำ",
  "/logs": "บันทึกการเข้าถึง",
  "/users": "จัดการผู้ใช้",
  "/profile": "โปรไฟล์",
};

export default function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const displayName = user?.full_name || user?.username || "ผู้ใช้งาน";
  const key = Object.keys(titles).find((k) => pathname.startsWith(k));
  const title = key ? titles[key] : "DEVA";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface px-7">
      <span className="text-base font-semibold">{title}</span>

      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
        {displayName.charAt(0)}
      </span>
    </header>
  );
}
