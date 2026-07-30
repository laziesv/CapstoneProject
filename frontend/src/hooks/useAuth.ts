"use client";

import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

/** เข้าถึง user ปัจจุบัน + refresh/signOut (ต้องอยู่ใต้ <AuthProvider>) */
export function useAuth() {
  return useContext(AuthContext);
}
