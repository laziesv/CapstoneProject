// ── Services barrel ─────────────────────────────────────
// import รวมที่เดียว: import { authService, dashboardService, userService } from "@/services"

export { authService } from "./http/auth.service";
export { dashboardService } from "./http/dashboard.service";
export { userService } from "./http/user.service";
export { ApiError } from "./http/client";
