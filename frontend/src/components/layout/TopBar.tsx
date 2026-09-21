"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { integrityAlertService } from "@/services";
import type { DatabaseIntegrityAlertResponse } from "@/interfaces";

const titles: Record<string, string> = {
  "/dashboard": "แดชบอร์ด",
  "/cases": "คดี",
  "/evidence/upload": "อัปโหลดหลักฐาน",
  "/evidence": "รายละเอียดหลักฐาน",
  "/verify": "ตรวจสอบลายน้ำ",
  "/logs": "บันทึกการเข้าถึง",
  "/users": "จัดการผู้ใช้",
  "/profile": "โปรไฟล์",
  "/blockchain": "บล็อกเชน",
};

export default function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const displayName = user?.full_name || user?.username || "ผู้ใช้งาน";
  const key = Object.keys(titles).find((item) => pathname.startsWith(item));
  const title = key ? titles[key] : "DEVA";
  const isAdmin = user?.role === "admin";
  const [integrity, setIntegrity] = useState<DatabaseIntegrityAlertResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadIntegrityAlerts = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      setIntegrity(await integrityAlertService.list());
    } catch {
      // Blockchain อาจหยุดชั่วคราว จึงไม่ให้การแจ้งเตือนขัดขวางหน้าหลัก
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const initialLoadId = window.setTimeout(() => {
      void loadIntegrityAlerts();
    }, 0);
    const intervalId = window.setInterval(loadIntegrityAlerts, 30_000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [isAdmin, loadIntegrityAlerts]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-7 backdrop-blur">
      <span className="text-base font-semibold text-foreground">{title}</span>

      <div className="flex items-center gap-3">
        {isAdmin && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsOpen((value) => !value)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                integrity?.alert_count
                  ? "border-danger/30 bg-danger-light text-danger"
                  : "border-border bg-surface text-muted hover:bg-surface-hover"
              }`}
              aria-label={`การแจ้งเตือนความถูกต้อง ${integrity?.alert_count ?? 0} รายการ`}
              title="การแจ้งเตือนความถูกต้องของฐานข้อมูล"
            >
              <Bell className="h-[18px] w-[18px]" />
              {!!integrity?.alert_count && (
                <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {integrity.alert_count > 99 ? "99+" : integrity.alert_count}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="absolute right-0 top-12 w-[min(24rem,calc(100vw-7rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">แจ้งเตือนความถูกต้อง</p>
                    <p className="text-xs text-muted">เฉพาะผู้ดูแลระบบ · ตรวจทุก 30 วินาที</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => void loadIntegrityAlerts()} className="rounded-lg p-2 text-muted hover:bg-surface-hover" aria-label="ตรวจสอบอีกครั้ง">
                      <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-hover" aria-label="ปิด">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {!integrity?.alert_count ? (
                    <p className="px-3 py-8 text-center text-sm text-muted">ไม่พบความผิดปกติของข้อมูลหลักฐานหรือ Access Log</p>
                  ) : integrity.alerts.map((alert) => (
                    <Link
                      key={`${alert.alert_type}-${alert.access_session_ref || alert.evidence_id}`}
                      href={alert.alert_type === "ACCESS_LOG" ? "/logs" : `/evidence/${alert.evidence_id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex gap-3 rounded-xl p-3 hover:bg-danger-light"
                    >
                      <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-danger" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-danger">
                          {alert.alert_type === "ACCESS_LOG" ? "ตรวจพบ Access Log ผิดปกติ" : "ตรวจพบค่า Hash ไม่ตรงกัน"}
                        </span>
                        <span className="block truncate text-xs text-foreground">
                          {alert.evidence_number || "ไม่พบหลักฐานในฐานข้อมูล"}
                          {alert.original_filename ? ` · ${alert.original_filename}` : ""}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {alert.alert_type === "ACCESS_LOG"
                            ? "ประวัติการเข้าถึงในฐานข้อมูลไม่ตรงกับ Blockchain"
                            : "ข้อมูลในฐานข้อมูลไม่ตรงกับ Blockchain"}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white shadow-sm">
          {displayName.charAt(0)}
        </span>
      </div>
    </header>
  );
}
