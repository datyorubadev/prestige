"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { setSessionUser } from "@/lib/auth-store";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { SessionUser } from "@/lib/types";

export function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    escalation: true,
    resolution: true,
    digest: false,
  });

  if (!user) return null;

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const updated = await api.post<SessionUser>("/profile", {
        userId: user.id,
        fullName: name,
        email,
        online,
        prefs,
      });
      const mergedUser: SessionUser = {
        ...user,
        ...updated,
        fullName: (updated as any)?.full_name || updated?.fullName || name,
        email: updated?.email || email,
        role: updated?.role || user?.role || "agent",
      };
      setSessionUser(mergedUser);
      toast("Profile saved");
    } catch {
      toast("Could not save profile", "danger");
    } finally {
      setSaving(false);
    }
  };

  const roleName = (user?.role ? String(user.role).replace("_", " ") : "agent");

  // Security / Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast("Password must be at least 6 characters", "danger");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match", "danger");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/profile", { password: newPassword });
      toast("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast("Could not update password", "danger");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">Profile</h1>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface shadow-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Icon name="user" size={16} className="text-text-2" />
            <h3 className="text-card-title text-text">Profile</h3>
          </header>
          <div className="flex flex-col gap-4 p-[18px]">
            <div className="flex items-center gap-3">
              <Avatar name={user.fullName || user.email} color={user.color} />
              <div>
                <p className="text-[13.5px] font-bold text-text">{user.fullName || user.email}</p>
                <p className="text-meta text-text-3 capitalize">{roleName}</p>
              </div>
              <div className="ml-auto">
                <Pill status={online ? "online" : "offline"} dot tone={online ? "success" : "neutral"} />
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Display name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-control" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="input-control"
              />
            </label>

            <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface-2 px-3 py-2.5">
              <div>
                <p className="text-[12.5px] font-semibold text-text">Presence</p>
                <p className="text-[11.5px] text-text-3">
                  Status is pushed to dashboards via the agent_presence event
                </p>
              </div>
              <Switch
                checked={online}
                onChange={setOnline}
                label="Presence"
              />
            </div>

            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 self-start rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Save changes
            </button>
          </div>
        </section>

        {/* Security & Password Card */}
        <section className="rounded-xl border border-border bg-surface shadow-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Icon name="shield" size={16} className="text-text-2" />
            <h3 className="text-card-title text-text">Security & Password</h3>
          </header>
          <div className="flex flex-col gap-4 p-[18px]">
            <p className="text-[12.5px] text-text-2">
              Update your account password. Strong passwords contain at least 8 characters with letters, numbers, and symbols.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="input-control"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="input-control"
              />
            </label>

            <button
              type="button"
              onClick={() => void changePassword()}
              disabled={savingPassword || !newPassword}
              className="inline-flex items-center justify-center gap-1.5 self-start rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPassword ? <Spinner size={14} /> : <Icon name="lock" size={14} />}
              Update password
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface shadow-card xl:col-span-2">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Icon name="bell" size={16} className="text-text-2" />
            <h3 className="text-card-title text-text">Notifications</h3>
          </header>
          <div className="flex flex-col p-[18px]">
            <PrefRow
              title="New escalation assigned"
              desc="Push + toast on the bus"
              checked={prefs.escalation}
              onChange={(v) => setPrefs((p) => ({ ...p, escalation: v }))}
            />
            <PrefRow
              title="Ticket resolved by me"
              desc="Confirmation"
              checked={prefs.resolution}
              onChange={(v) => setPrefs((p) => ({ ...p, resolution: v }))}
            />
            <PrefRow
              title="Email digest"
              desc="Daily summary"
              checked={prefs.digest}
              onChange={(v) => setPrefs((p) => ({ ...p, digest: v }))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function PrefRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div>
        <p className="text-[13px] font-semibold text-text">{title}</p>
        <p className="text-meta text-text-3">{desc}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
