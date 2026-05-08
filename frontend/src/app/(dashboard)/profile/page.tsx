import { currentUser } from "@/lib/mockData";
import { Shield, Mail, Hash, Building, Star } from "lucide-react";

export default function ProfilePage() {
  const u = currentUser;
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted mt-1">ข้อมูลเจ้าหน้าที่</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {u.full_name.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-bold">{u.full_name}</h2>
            <p className="text-sm text-muted">@{u.username}</p>
            <span className="mt-1 inline-block rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary">{u.role}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <InfoRow icon={Hash} label="Badge Number" value={u.badge_number} />
          <InfoRow icon={Star} label="Rank" value={u.rank} />
          <InfoRow icon={Building} label="Department" value={u.department} />
          <InfoRow icon={Mail} label="Email" value={u.email} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h3 className="font-semibold mb-4">Change Password</h3>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium text-muted">Current Password</label>
            <input type="password" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">New Password</label>
            <input type="password" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Confirm New Password</label>
            <input type="password" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
          </div>
          <button className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">Update Password</button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
      <Icon className="h-4 w-4 text-muted" />
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
