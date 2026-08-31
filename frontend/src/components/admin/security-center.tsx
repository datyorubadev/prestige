"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/icons";
import { Select, type SelectOption } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const BROADCAST_LEVELS: SelectOption[] = [
  { value: "info", label: "Info (Blue)", icon: "bell", iconColor: "text-blue-500" },
  { value: "warning", label: "Warning (Amber)", icon: "zap", iconColor: "text-amber-500" },
  { value: "danger", label: "Critical (Red)", icon: "shield", iconColor: "text-rose-500" },
];

export interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  email: string;
  ip: string;
  device: string;
  createdAt: string;
  lastSeen: string;
}

export function SecurityCenter() {
  const toast = useToast();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ActiveSession | null>(null);

  // Broadcast state
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastLevel, setBroadcastLevel] = useState<"info" | "warning" | "danger">("warning");
  const [activeBroadcast, setActiveBroadcast] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  const fetchSessions = () => {
    api.get<ActiveSession[]>("/platform/sessions").then((data) => {
      setSessions(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchSessions(); }, []);

  useEffect(() => {
    api.get<{ broadcast: { message: string; level: string } | null }>("/platform/broadcast").then((res) => {
      if (res?.broadcast?.message) setActiveBroadcast(res.broadcast.message);
    }).catch(() => {});
  }, []);

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    try {
      await api.post("/platform/broadcast", { message: broadcastMsg.trim(), level: broadcastLevel, active: true });
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
      await api.post("/platform/broadcast", { message: "", active: false });
      setActiveBroadcast(null);
      toast("Active platform broadcast cleared");
    } catch {
      toast("Could not clear broadcast", "danger");
    } finally {
      setBroadcasting(false);
    }
  };

  const doRevoke = async (session: ActiveSession) => {
    setRevokingId(session.id);
    try {
      await api.delete(`/platform/sessions/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      toast(`Revoked session for ${session.email}`);
    } catch {
      toast("Could not revoke session", "danger");
    } finally {
      setRevokingId(null);
      setConfirmRevoke(null);
    }
  };

  const timeAgo = (iso: string) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="flex flex-col gap-6 text-text">
      <header>
        <h1 className="text-h1 font-bold text-text">Security Center & Global Governance</h1>
        <p className="mt-1 text-[13px] text-text-3">
          Monitor active user sessions, issue emergency platform broadcasts, and inspect security events.
        </p>
      </header>

      {/* Emergency Broadcast */}
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
              onClick={() => void clearBroadcast()}
              disabled={broadcasting}
              className="shrink-0 rounded bg-white px-2.5 py-1 text-[11.5px] font-bold text-danger border border-danger/30 hover:bg-danger-soft transition-colors"
            >
              Clear Banner
            </button>
          </div>
        )}

        <form onSubmit={(e) => void sendBroadcast(e)} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              placeholder="e.g. Scheduled platform maintenance in 30 minutes."
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

      {/* Sessions */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-3">
          Active Authenticated Sessions ({sessions.length})
        </h3>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-3">No active sessions found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface-2 p-3 text-[12.5px]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                    {(s.userName ?? s.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-text">{s.userName || s.email}</p>
                    <p className="text-[11.5px] text-text-3">{s.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-[11.5px] text-text-3 font-mono">
                    <p>{s.ip || "—"}</p>
                    <p className="text-[10.5px] text-text-3">{s.device || "—"}</p>
                  </div>

                  <span className="text-text-3 text-[11.5px]">{timeAgo(s.lastSeen)}</span>

                  <button
                    type="button"
                    disabled={revokingId === s.id}
                    onClick={() => setConfirmRevoke(s)}
                    className="rounded bg-red-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {revokingId === s.id ? "Revoking…" : "Force Logout"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        title="Force Logout?"
        description={`This will immediately revoke the active session for ${confirmRevoke?.email ?? ""}. They will need to sign in again.`}
        confirmLabel="Revoke Session"
        tone="danger"
        busy={revokingId === confirmRevoke?.id}
        onConfirm={() => { if (confirmRevoke) void doRevoke(confirmRevoke); }}
      />
    </div>
  );
}
