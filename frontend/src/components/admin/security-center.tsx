import { useState, useEffect } from "react";
import { Icon } from "@/components/icons";
import { Select, type SelectOption } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const BROADCAST_LEVELS: SelectOption[] = [
  { value: "info", label: "Info (Blue)", icon: "bell", iconColor: "text-blue-500" },
  { value: "warning", label: "Warning (Amber)", icon: "zap", iconColor: "text-amber-500" },
  { value: "danger", label: "Critical (Red)", icon: "shield", iconColor: "text-rose-500" },
];

export interface ActiveSession {
  id: string;
  userName: string;
  userEmail: string;
  role: string;
  ipAddress: string;
  device: string;
  lastActive: string;
}

const MOCK_SESSIONS: ActiveSession[] = [
  {
    id: "sess-1",
    userName: "Owner User",
    userEmail: "owner@prestige.com",
    role: "owner",
    ipAddress: "192.168.1.132",
    device: "Chrome / Windows 11",
    lastActive: "Just now",
  },
  {
    id: "sess-2",
    userName: "Amaka Okafor",
    userEmail: "agent@prestige.com",
    role: "agent",
    ipAddress: "102.89.22.14",
    device: "Firefox / macOS",
    lastActive: "4 mins ago",
  },
  {
    id: "sess-3",
    userName: "John Customer",
    userEmail: "john@customer.com",
    role: "customer",
    ipAddress: "197.210.45.88",
    device: "Safari / iOS",
    lastActive: "18 mins ago",
  },
];

export function SecurityCenter() {
  const toast = useToast();
  const [sessions, setSessions] = useState<ActiveSession[]>(MOCK_SESSIONS);
  const [revokedMsg, setRevokedMsg] = useState<string | null>(null);

  // Broadcast state
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastLevel, setBroadcastLevel] = useState<"info" | "warning" | "danger">("warning");
  const [activeBroadcast, setActiveBroadcast] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  useEffect(() => {
    api
      .get<{ broadcast: { message: string; level: string } | null }>("/platform/broadcast")
      .then((res) => {
        if (res?.broadcast?.message) {
          setActiveBroadcast(res.broadcast.message);
        }
      })
      .catch(() => {});
  }, []);

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    try {
      await api.post("/platform/broadcast", {
        message: broadcastMsg.trim(),
        level: broadcastLevel,
        active: true,
      });
      setActiveBroadcast(broadcastMsg.trim());
      setBroadcastMsg("");
      toast("Broadcast alert published to all active tenants in realtime");
    } catch {
      toast("Could not send broadcast", "danger");
    } finally {
      setBroadcasting(false);
    }
  };

  const clearBroadcast = async () => {
    setBroadcasting(true);
    try {
      await api.post("/platform/broadcast", {
        message: "",
        active: false,
      });
      setActiveBroadcast(null);
      toast("Active platform broadcast cleared");
    } catch {
      toast("Could not clear broadcast", "danger");
    } finally {
      setBroadcasting(false);
    }
  };

  const revokeSession = (id: string, userEmail: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setRevokedMsg(`Revoked session for ${userEmail}. Forced logout issued.`);
    setTimeout(() => setRevokedMsg(null), 3000);
  };

  return (
    <div className="flex flex-col gap-6 text-text">
      <header>
        <h1 className="text-h1 font-bold text-text">Security Center & Global Governance</h1>
        <p className="mt-1 text-[13px] text-text-3">
          Monitor active user sessions, issue emergency platform broadcasts, and inspect security events.
        </p>
      </header>

      {/* Emergency Broadcast Control Card */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Icon name="zap" size={15} />
            </span>
            <h3 className="text-[14px] font-bold text-text">Emergency Platform Announcement</h3>
          </div>
          {activeBroadcast && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Live Broadcast Active
            </span>
          )}
        </div>

        {activeBroadcast && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] text-amber-900">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="bell" size={15} className="shrink-0 text-amber-700" />
              <span className="truncate"><strong>Active Alert:</strong> {activeBroadcast}</span>
            </div>
            <button
              type="button"
              onClick={clearBroadcast}
              disabled={broadcasting}
              className="shrink-0 rounded bg-white px-2.5 py-1 text-[11.5px] font-bold text-danger border border-danger/30 hover:bg-danger-soft transition-colors"
            >
              Clear Banner
            </button>
          </div>
        )}

        <form onSubmit={sendBroadcast} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              placeholder="e.g. Scheduled platform maintenance in 30 minutes. Chat will remain active."
              className="input-control flex-1"
            />
            <Select
              value={broadcastLevel}
              onChange={(v) => setBroadcastLevel(v as "info" | "warning" | "danger")}
              options={BROADCAST_LEVELS}
              ariaLabel="Broadcast Severity Level"
              className="sm:w-48 shrink-0"
            />
            <button
              type="submit"
              disabled={broadcasting || !broadcastMsg.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:opacity-50 shadow-xs shrink-0"
            >
              <Icon name="send" size={13} />
              Push Broadcast
            </button>
          </div>
        </form>
      </div>

      {revokedMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-600 font-medium animate-in fade-in">
          <Icon name="shield" size={16} />
          {revokedMsg}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-3">
          Active Authenticated Sessions ({sessions.length})
        </h3>

        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface-2 p-3 text-[12.5px]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  {s.userName[0]}
                </div>
                <div>
                  <p className="font-semibold text-text">{s.userName}</p>
                  <p className="text-[11.5px] text-text-3">{s.userEmail} • <span className="font-mono">{s.role}</span></p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right text-[11.5px] text-text-3 font-mono">
                  <p>{s.ipAddress}</p>
                  <p className="text-[10.5px] text-text-3">{s.device}</p>
                </div>

                <span className="text-text-3 text-[11.5px]">{s.lastActive}</span>

                <button
                  type="button"
                  onClick={() => revokeSession(s.id, s.userEmail)}
                  className="rounded bg-red-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-red-600 hover:bg-red-500/20"
                >
                  Force Logout
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
