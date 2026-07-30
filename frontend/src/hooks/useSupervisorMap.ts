"use client";

import { useEffect, useState } from "react";
import { userService } from "@/services";
import type { SupervisorMap } from "@/utils/caseAccess";

/** โหลดสายบังคับบัญชา (user_id → user_id ของหัวหน้า) สำหรับคำนวณสิทธิ์เห็นคดี
 *
 *  คืน `null` ระหว่างโหลด — ต่างจาก `{}` ที่แปลว่า "โหลดแล้ว ไม่มีสายบังคับบัญชา"
 *  หน้าที่ใช้ canSeeCase เป็นประตูกั้นต้องรอ non-null ก่อน ไม่งั้นจะขึ้น
 *  "ไม่มีสิทธิ์" แวบหนึ่งทั้งที่จริงมีสิทธิ์ */
export function useSupervisorMap(): SupervisorMap | null {
  const [map, setMap] = useState<SupervisorMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    userService
      .getSupervisorMap()
      .then((m) => {
        if (!cancelled) setMap(m);
      })
      .catch(() => {
        // โหลดไม่ได้ = ถือว่าไม่มีสายบังคับบัญชา (เห็นเฉพาะคดีของตัวเอง)
        // ต้อง set {} ไม่ใช่ปล่อย null ไม่งั้นหน้า detail จะค้างที่ spinner ตลอด
        if (!cancelled) setMap({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}
