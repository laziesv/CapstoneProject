import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import AuthGuard from "@/components/AuthGuard";
import RouteGuard from "@/components/RouteGuard";
import { AuthProvider } from "@/contexts/AuthContext";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AuthProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          {/* รางไอคอนกว้าง 76px — พื้นที่ทำงานกว้างขึ้นจากเดิม */}
          <div className="flex flex-1 flex-col pl-[76px]">
            <TopBar />
            {/* RouteGuard คุมสิทธิ์ตาม role — Sidebar/TopBar ยังอยู่ แสดง "ไม่มีสิทธิ์" ในเนื้อหา */}
            <main className="flex-1 p-7">
              <RouteGuard>{children}</RouteGuard>
            </main>
          </div>
        </div>
      </AuthProvider>
    </AuthGuard>
  );
}
