"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  FolderOpen,
  ShieldCheck,
  ClipboardList,
  Users,
  LogOut,
  Fingerprint,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { href: "/cases", label: "คดี", icon: FolderOpen },
];

const adminItems = [
  { href: "/verify", label: "ตรวจลายน้ำ", icon: ShieldCheck },
  { href: "/logs", label: "บันทึกการเข้าถึง", icon: ClipboardList },
  { href: "/users", label: "จัดการผู้ใช้", icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const isAdmin = user?.role === "admin";
  const items = isAdmin ? [...navItems, ...adminItems] : navItems;
  const displayName = user?.full_name || user?.username || "ผู้ใช้งาน";

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[76px] flex-col items-center gap-2 bg-sidebar py-[18px]">
      {/* โลโก้ */}
      <Link
        href="/dashboard"
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary"
        title="DEVA"
      >
        <Fingerprint className="h-5 w-5 text-white" />
      </Link>

      {/* รางไอคอน — ชื่อเมนูโผล่เป็น tooltip เมื่อชี้ */}
      <nav className="flex flex-col items-center gap-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? "bg-sidebar-hover text-white"
                  : "text-muted hover:bg-sidebar-hover hover:text-white"
              }`}
            >
              <item.icon className="h-[19px] w-[19px]" />
              <span className="pointer-events-none absolute left-[54px] z-50 whitespace-nowrap rounded-lg bg-ink-raised px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ล่าง: โปรไฟล์ + ออกจากระบบ */}
      <div className="mt-auto flex flex-col items-center gap-3">
        <button
          onClick={signOut}
          title="ออกจากระบบ"
          aria-label="ออกจากระบบ"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-danger/20 hover:text-danger"
        >
          <LogOut className="h-[19px] w-[19px]" />
        </button>
        <Link
          href="/profile"
          title="โปรไฟล์"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-hover text-[13px] font-semibold text-white transition-colors hover:bg-primary"
        >
          {displayName.charAt(0)}
        </Link>
      </div>
    </aside>
  );
}
