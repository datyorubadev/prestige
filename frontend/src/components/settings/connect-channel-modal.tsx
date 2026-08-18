"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/icons";
import type { ChannelSettings } from "@/lib/types";

interface Field {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
}

interface DisplayField {
  key: string;
  label: string;
  target: "phone" | "address";
  placeholder?: string;
}

/** Provider credential fields (keys match backend provider config keys). */
const CREDENTIALS: Record<string, Field[]> = {
  whatsapp: [
    { key: "access_token", label: "Access token", secret: true, placeholder: "EAAG…" },
    { key: "phone_number_id", label: "Phone number ID", placeholder: "e.g. 1088 4312 9345" },
    { key: "verify_token", label: "Webhook verify token", secret: true, placeholder: "Any secret string" },
  ],
  telegram: [{ key: "bot_token", label: "Bot token", secret: true, placeholder: "123456:ABC-…" }],
  sms: [
    { key: "account_sid", label: "Account SID", secret: true, placeholder: "AC…" },
    { key: "auth_token", label: "Auth token", secret: true, placeholder: "••••••••" },
    { key: "from_number", label: "From number", placeholder: "+1 234 567 8900" },
  ],
  email: [
    { key: "from_email", label: "Forwarding mailbox", placeholder: "support@yourco.com" },
    { key: "smtp_host", label: "SMTP host", placeholder: "smtp.gmail.com" },
    { key: "smtp_port", label: "SMTP port", placeholder: "587" },
    { key: "smtp_user", label: "SMTP user", placeholder: "support@yourco.com" },
    { key: "smtp_pass", label: "SMTP password / app password", secret: true, placeholder: "••••••••" },
    { key: "imap_host", label: "IMAP host", placeholder: "imap.gmail.com", optional: true },
    { key: "imap_user", label: "IMAP user", placeholder: "support@yourco.com", optional: true },
    { key: "imap_pass", label: "IMAP password", secret: true, placeholder: "••••••••", optional: true },
  ],
};

/** Optional display fields patched onto the channel after connect. */
const DISPLAY: Record<string, DisplayField[]> = {
  whatsapp: [{ key: "phone", label: "Display number", target: "phone", placeholder: "+1 234 567 8900" }],
  telegram: [{ key: "bot_username", label: "Bot username", target: "address", placeholder: "@YourSupportBot" }],
  sms: [{ key: "phone", label: "Display number", target: "phone", placeholder: "+1 234 567 8900" }],
  email: [{ key: "from_name", label: "Sender name", target: "address", placeholder: "Your Support Team" }],
};

const BUILTIN_HELP: Record<string, string> = {
  chat: "Paste this snippet before the closing </body> tag on any page — visitors open tickets straight from your site.",
  portal: "Your self-serve help center is hosted by Prestige. Enabling it activates the public portal at your subdomain.",
};

export function ConnectChannelModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: ChannelSettings;
  onClose: () => void;
  onSaved: (updated: ChannelSettings) => void;
}) {
  const toast = useToast();
  const fields = CREDENTIALS[channel.id] ?? [];
  const display = DISPLAY[channel.id] ?? [];

  const [values, setValues] = useState<Record<string, string>>({});
  const [autoReply, setAutoReply] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [embed, setEmbed] = useState<{ url: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const builtin = channel.id === "chat" || channel.id === "portal";

  useEffect(() => {
    if (channel.id === "chat") {
      void api
        .get<{ url: string; code: string }>("/channels/chat/embed")
        .then(setEmbed)
        .catch(() => setEmbed(null));
    }
  }, [channel.id]);

  const fieldValue = (key: string) => values[key] ?? "";

  const copyEmbed = async () => {
    if (!embed) return;
    try {
      await navigator.clipboard.writeText(embed.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Copy failed — select the snippet and copy manually", "danger");
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      const config: Record<string, string | boolean> = {
        ...values,
        auto_reply: autoReply,
      };
      if (channel.id === "chat" || channel.id === "portal") delete config.auto_reply;
      const updated = await api.post<ChannelSettings>(`/channels/${channel.id}/connect`, { config });
      let patched = updated;
      if (display.length) {
        const patch: Partial<ChannelSettings> = {};
        for (const d of display) {
          if (values[d.key]) patch[d.target] = values[d.key];
        }
        if (Object.keys(patch).length) patched = await api.patch<ChannelSettings>(`/channels/${channel.id}`, patch);
      }
      onSaved(patched);
      onClose();
      toast(`${patched.label} connected`, "success");
    } catch {
      toast("Could not connect channel — check the fields", "danger");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await api.post<{ ok: boolean; message: string }>(`/channels/${channel.id}/test`, {
        config: { ...values, auto_reply: autoReply },
      });
      toast(res.message, res.ok ? "success" : "danger");
    } catch {
      toast("Test failed", "danger");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={builtin ? `${channel.label} · ${channel.connected ? "Manage" : "Enable"}` : `Connect ${channel.label}`}
      icon={builtin ? "sliders" : "link"}
      footer={
        builtin ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Close
            </button>
            {!channel.connected && (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Spinner size={14} /> : <Icon name="check" size={14} />}
                {channel.connected ? "Connected" : "Enable"}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={test}
              disabled={testing || busy}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Spinner size={13} /> : <Icon name="zap" size={13} />}
              Test connection
            </button>
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner size={14} /> : <Icon name="link" size={14} />}
              {channel.connected ? "Save changes" : "Connect"}
            </button>
          </>
        )
      }
    >
      {builtin ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-text-2">{BUILTIN_HELP[channel.id]}</p>
          {channel.id === "chat" &&
            (embed ? (
              <div className="flex flex-col gap-2">
                <p className="text-micro uppercase text-text-3">Embed snippet</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-2 p-3 font-mono text-code text-text">
                  {embed.code}
                </pre>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyEmbed()}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                  >
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? "Copied" : "Copy snippet"}
                  </button>
                  <a
                    href={embed.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                  >
                    <Icon name="eye" size={13} />
                    Preview widget
                  </a>
                </div>
              </div>
            ) : (
              <div className="skeleton h-20 w-full" />
            ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="text-[12.5px] text-text-3">
            {channel.connected
              ? "Credentials are saved. Update them below, then test or save."
              : "Enter your provider credentials — they are stored encrypted per tenant."}
          </p>
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1.5 flex items-center justify-between text-micro uppercase text-text-3">
                {f.label}
                {f.optional && <span className="text-text-4">optional</span>}
              </span>
              <input
                type={f.secret ? "password" : "text"}
                value={fieldValue(f.key)}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="input-control"
              />
            </label>
          ))}
          {display.length > 0 && (
            <div className="border-t border-border pt-3.5">
              <p className="mb-1.5 text-micro uppercase text-text-3">Display</p>
              {display.map((d) => (
                <label key={d.key} className="block">
                  <span className="mb-1.5 block text-micro uppercase text-text-3">{d.label}</span>
                  <input
                    type="text"
                    value={fieldValue(d.key)}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                    placeholder={d.placeholder}
                    className="input-control"
                  />
                </label>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-2">
            <input
              type="checkbox"
              checked={autoReply}
              onChange={(e) => setAutoReply(e.target.checked)}
              className="accent-primary"
            />
            Auto-reply with the AI assistant before an agent responds
          </label>
        </div>
      )}
    </Modal>
  );
}
