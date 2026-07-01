"use client";
import { Bell, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function TopBar() {
  const { user } = useAuth();

  const displayName = user?.full_name || user?.username || "ผู้ใช้งาน";
  const badge = user?.badge_number || user?.rank || "";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="ค้นหาหลักฐาน, คดี, ธุรกรรม..."
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <button className="relative rounded-lg p-2 hover:bg-surface-hover transition-colors">
          <Bell className="h-[18px] w-[18px] text-muted" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
        </button>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
            {displayName.charAt(0)}
          </div>
          <div className="text-sm">
            <p className="font-medium leading-tight">{displayName}</p>
            {badge && <p className="text-xs text-muted">{badge}</p>}
          </div>
        </div>
      </div>
    </header>
  );
}
