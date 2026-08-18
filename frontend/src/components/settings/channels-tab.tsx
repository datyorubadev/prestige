"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ui/pill";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Icon, type IconName } from "@/components/icons";
import { ConnectChannelModal } from "@/components/settings/connect-channel-modal";
import type { ChannelSettings } from "@/lib/types";

const CHANNEL_ICONS: Record<string, IconName> = {
  chat: "send",
  whatsapp: "link",
  portal: "inbox",
  email: "mail",
  telegram: "send",
  sms: "zap",
};

/** External channels a simulated inbound can arrive on. */
const SIMULATABLE = ["whatsapp", "sms", "telegram", "email"];

function statusPill(c: ChannelSettings) {
  if (c.providerStatus === "error") return <Pill status="Error" tone="danger" dot />;
  if (c.connected) return <Pill status="Connected" tone="success" dot />;
  if (c.enabled) return <Pill status="Configure" tone="info" />;
  return <Pill status="Paused" tone="neutral" />;
}

export function ChannelsTab() {
  const toast = useToast();
  const [channels, setChannels] = useState<ChannelSettings[] | null>(null);
  const [active, setActive] = useState<ChannelSettings | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = () =>
    void api.get<ChannelSettings[]>("/channels").then(setChannels).catch(() => setChannels([]));

  useEffect(() => {
    load();
  }, []);

  useRealtime({ settings_changed: () => load() });

  const replace = (updated: ChannelSettings) =>
    setChannels((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));

  const toggle = async (c: ChannelSettings) => {
    try {
      const updated = await api.patch<ChannelSettings>(`/channels/${c.id}`, { enabled: !c.enabled });
      replace(updated);
      toast(`${updated.label} ${updated.enabled ? "enabled" : "paused"}`);
    } catch {
      toast("Could not update channel", "danger");
    }
  };

  const disconnect = async (c: ChannelSettings) => {
    setBusyId(c.id);
    try {
      const updated = await api.post<ChannelSettings>(`/channels/${c.id}/disconnect`, {});
      replace(updated);
      toast(`${updated.label} disconnected`);
    } catch {
      toast("Could not disconnect channel", "danger");
    } finally {
      setBusyId(null);
    }
  };

  const test = async (c: ChannelSettings) => {
    setBusyId(c.id);
    try {
      const res = await api.post<{ ok: boolean; message: string }>(`/channels/${c.id}/test`, {});
      toast(res.message, res.ok ? "success" : "danger");
      load();
    } catch {
      toast("Test failed", "danger");
    } finally {
      setBusyId(null);
    }
  };

  const sync = async (c: ChannelSettings) => {
    setBusyId(c.id);
    try {
      const res = await api.post<{ ok: boolean; ingested: number; message?: string }>(`/channels/${c.id}/sync`, {});
      toast(
        res.ok ? `Synced — ${res.ingested} new message(s)` : (res.message ?? "Channel does not support polling"),
        res.ok ? "success" : "danger",
      );
    } catch {
      toast("Sync failed", "danger");
    } finally {
      setBusyId(null);
    }
  };

  const copyWebhook = async (c: ChannelSettings) => {
    if (!c.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(c.webhookUrl);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast("Copy failed", "danger");
    }
  };

  if (!channels) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-40 w-full" />
        ))}
      </div>
    );
  }

  const enabledCount = channels.filter((c) => c.enabled).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Channels</h1>
          <p className="mt-1 max-w-xl text-[12.5px] text-text-2">
            Where customers reach you — the chat widget, WhatsApp, Telegram, SMS and a shared email inbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-text-2">
            {enabledCount} of {channels.length} enabled
          </span>
          <button
            type="button"
            onClick={() => setSimOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="zap" size={14} />
            Simulate inbound
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {channels.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs md:col-span-2">
            <EmptyState
              icon="send"
              title="No channels connected yet"
              subtitle="Connect the chat widget, WhatsApp, Telegram, SMS or a shared email inbox to start receiving conversations."
              action={
                <button
                  type="button"
                  onClick={() => setSimOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="plus" size={14} />
                  Connect a channel
                </button>
              }
            />
          </div>
        ) : (
          channels.map((c) => (
          <Card key={c.id} title={c.label} icon={CHANNEL_ICONS[c.id] ?? "send"}>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-text-2">{c.detail}</p>
                  <p className="mt-1 truncate font-mono text-[11.5px] text-text-3">
                    {c.phone ?? c.address ?? c.id}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <Switch checked={c.enabled} onChange={() => void toggle(c)} label={`Toggle ${c.label}`} />
                </span>
              </div>

              <div className="flex items-center gap-2">
                {statusPill(c)}
                {c.providerStatus === "error" && c.lastError && (
                  <span className="truncate text-[11px] text-danger" title={c.lastError}>
                    {c.lastError}
                  </span>
                )}
              </div>

              {c.connected && c.webhookUrl && (
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-3">
                    {c.webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyWebhook(c)}
                    aria-label="Copy webhook URL"
                    className="shrink-0 rounded-sm p-1 text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                  >
                    <Icon name={copiedId === c.id ? "check" : "copy"} size={13} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-border pt-3">
                {c.connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void test(c)}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === c.id ? <Spinner size={12} /> : <Icon name="zap" size={13} />}
                      Test
                    </button>
                    {(c.id === "email" || c.id === "telegram") && (
                      <button
                        type="button"
                        onClick={() => void sync(c)}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === c.id ? <Spinner size={12} /> : <Icon name="swap" size={13} />}
                        Sync now
                      </button>
                    )}
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setActive(c)}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                    >
                      <Icon name="edit" size={13} />
                      Manage
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnect(c)}
                      disabled={busyId === c.id}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-danger-soft bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="trash" size={13} />
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setActive(c)}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                    >
                      <Icon name="link" size={13} />
                      {c.id === "chat" || c.id === "portal" ? "Enable" : "Connect"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
          ))
        )}
      </div>

      {active && (
        <ConnectChannelModal
          channel={active}
          onClose={() => setActive(null)}
          onSaved={(updated) => {
            replace(updated);
            setActive(null);
          }}
        />
      )}

      {simOpen && <SimulateModal channels={channels} onClose={() => setSimOpen(false)} />}
    </div>
  );
}

function SimulateModal({ channels, onClose }: { channels: ChannelSettings[]; onClose: () => void }) {
  const toast = useToast();
  const options = channels
    .filter((c) => SIMULATABLE.includes(c.id))
    .map((c) => ({ value: c.id, label: c.label }));

  const [channel, setChannel] = useState<string>(options[0]?.value ?? "whatsapp");
  const [from, setFrom] = useState("+234 900 000 0000");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [autoReply, setAutoReply] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ ticketId: string; new: boolean; replied: boolean }>("/webhooks/simulate", {
        channel,
        from_: from || "demo_customer",
        name: name || null,
        text,
        auto_reply: autoReply,
      });
      toast(
        `${res.new ? "New ticket" : "Message added"} ${res.ticketId}${res.replied ? " — AI replied" : ""}`,
        "success",
      );
      onClose();
    } catch {
      toast("Simulation failed — is the channel enabled?", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Simulate an inbound message"
      icon="zap"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner size={14} /> : <Icon name="send" size={14} />}
            Send message
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Channel</span>
          <Select value={channel} onChange={setChannel} options={options} ariaLabel="Channel" />
        </label>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">From</span>
            <input value={from} onChange={(e) => setFrom(e.target.value)} className="input-control" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="input-control"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Message</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Where is my delivery?"
            className="input-control resize-none"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-2">
          <input
            type="checkbox"
            checked={autoReply}
            onChange={(e) => setAutoReply(e.target.checked)}
            className="accent-primary"
          />
          Let the AI assistant auto-reply
        </label>
      </div>
    </Modal>
  );
}
