"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { WidgetChat } from "@/components/widget/widget-chat";
import type { Tenant } from "@/lib/types";

const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

const TONES = ["professional", "casual", "pidgin", "formal"];
const toneOptions = TONES.map((t) => ({ value: t, label: t }));
const posOptions = [
  { value: "bottom-right", label: "bottom-right" },
  { value: "bottom-left", label: "bottom-left" },
];

interface SettingsDraft {
  botName: string;
  color: string;
  secondaryColor: string;
  widgetPosition: "bottom-right" | "bottom-left";
  tone: string;
  welcomeMessage: string;
  proactiveTeaser: string;
  escalationMessage: string;
  launcherText: string;
  mobileFullscreen: boolean;
}

const COLOR_PRESETS = [
  { label: "Emerald", color: "#00a86b", secondary: "#059669" },
  { label: "Indigo", color: "#4f46e5", secondary: "#3730a3" },
  { label: "Royal Blue", color: "#2563eb", secondary: "#1d4ed8" },
  { label: "Violet", color: "#7c3aed", secondary: "#6d28d9" },
  { label: "Rose", color: "#e11d48", secondary: "#be123c" },
  { label: "Dark Slate", color: "#0f172a", secondary: "#334155" },
];

export function TenantSettings() {
  const { role, user } = useAuth();
  const tenantId = user?.tenantId ?? "t1";
  const canEdit = role === "owner";
  const toast = useToast();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deployTab, setDeployTab] = useState<"html" | "react" | "wordpress">("html");

  const load = useCallback(() => {
    let active = true;
    api
      .get<Tenant>(`/tenants/${tenantId}`)
      .then((t) => {
        if (!active) return;
        setTenant(t);
        setDraft({
          botName: t.botName ?? `${t.name} Assistant`,
          color: t.color,
          secondaryColor: t.secondaryColor ?? "#2563eb",
          widgetPosition: t.widgetPosition ?? "bottom-right",
          tone: t.tone,
          welcomeMessage: t.welcomeMessage ?? `Hello! I'm ${t.name}. How can I help you today?`,
          proactiveTeaser:
            t.proactiveTeaser ?? "Need help? Chat with us — usually replies instantly.",
          escalationMessage: t.escalationMessage ?? "Please hold on — a member of our team is joining.",
          launcherText: t.launcherText ?? "Chat with us",
          mobileFullscreen: t.mobileFullscreen ?? false,
        });
      })
      .catch(() => {
        if (active) setTenant(null);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(load, [load]);

  // Brand settings broadcast live — other sessions see the change instantly.
  useRealtime({
    settings_changed: () => {
      void load();
    },
  });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await api.put<Tenant>(`/tenants/${tenantId}`, {
        botName: draft.botName,
        color: draft.color,
        secondaryColor: draft.secondaryColor,
        widgetPosition: draft.widgetPosition,
        tone: draft.tone,
        welcomeMessage: draft.welcomeMessage,
        proactiveTeaser: draft.proactiveTeaser,
        escalationMessage: draft.escalationMessage,
        launcherText: draft.launcherText,
        mobileFullscreen: draft.mobileFullscreen,
      });
      setTenant(updated);
      toast("Saved — brand settings broadcast live");
    } catch {
      toast("Could not save settings", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (!tenant || !draft) {
    return (
      <div className="flex flex-col gap-6">
        <div className="skeleton h-7 w-52" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton mt-4 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-2/3" />
          </div>
          <div className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="skeleton h-[280px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<SettingsDraft>) => setDraft({ ...draft, ...patch });

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.prestige.ng";
  const tenantSlug = (tenant.slug || tenant.name || "nairawave").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const embedScript = `<!-- Prestige AI Live Chat Widget Embed -->
<script
  src="${origin}/widget.js"
  data-tenant-id="${tenantSlug}"
  data-position="${draft.widgetPosition}"
  data-color="${draft.color}"
  async
  defer>
</script>`;

  const reactSnippet = `import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Script
          src="${origin}/widget.js"
          data-tenant-id="${tenantSlug}"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}`;

  const wordpressSnippet = `// Add to your WordPress theme functions.php or Header Script plugin:
add_action('wp_footer', function() {
  echo '<script src="${origin}/widget.js" data-tenant-id="${tenantSlug}" async defer></script>';
});`;

  const copyEmbed = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    toast("Embed script copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Brand & widget</h1>
          <p className="mt-1 text-meta text-text-3">Customize AI branding, live preview, and deploy script tag</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
          >
            {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
            Save & broadcast
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Widget Appearance Settings */}
        <section className="rounded-md border border-border bg-surface shadow-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Icon name="sparkles" size={16} className="text-primary" />
            <h3 className="text-card-title text-text">Widget appearance</h3>
          </header>
          <div className="flex flex-col gap-4 p-5">
            <Field label="Bot name">
              <input
                value={draft.botName}
                disabled={!canEdit}
                onChange={(e) => set({ botName: e.target.value })}
                className="input-control"
              />
            </Field>

            {/* Preset Swatches */}
            <div>
              <span className="mb-2 block text-micro uppercase text-text-3">Quick Color Presets</span>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => set({ color: p.color, secondaryColor: p.secondary })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all duration-150",
                      draft.color === p.color ? "border-primary bg-primary-soft text-primary-dark" : "border-border bg-surface hover:border-text-3",
                    )}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Primary color">
                <div className="flex items-center gap-2">
                  <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border shadow-xs transition-transform hover:scale-105" title="Pick primary color">
                    <input
                      type="color"
                      value={isHexColor(draft.color) ? draft.color : "#000000"}
                      disabled={!canEdit}
                      onChange={(e) => set({ color: e.target.value })}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <span className="h-full w-full rounded-full" style={{ backgroundColor: draft.color }} />
                  </label>
                  <input
                    type="text"
                    value={draft.color}
                    disabled={!canEdit}
                    onChange={(e) => set({ color: e.target.value })}
                    className="input-control font-mono text-[12px]"
                  />
                </div>
              </Field>

              <Field label="Secondary color">
                <div className="flex items-center gap-2">
                  <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border shadow-xs transition-transform hover:scale-105" title="Pick secondary color">
                    <input
                      type="color"
                      value={isHexColor(draft.secondaryColor) ? draft.secondaryColor : "#000000"}
                      disabled={!canEdit}
                      onChange={(e) => set({ secondaryColor: e.target.value })}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <span className="h-full w-full rounded-full" style={{ backgroundColor: draft.secondaryColor }} />
                  </label>
                  <input
                    type="text"
                    value={draft.secondaryColor}
                    disabled={!canEdit}
                    onChange={(e) => set({ secondaryColor: e.target.value })}
                    className="input-control font-mono text-[12px]"
                  />
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Widget position">
                <Select
                  value={draft.widgetPosition}
                  onChange={(v) => set({ widgetPosition: v as SettingsDraft["widgetPosition"] })}
                  options={posOptions}
                  disabled={!canEdit}
                  ariaLabel="Widget position"
                />
              </Field>
              <Field label="Brand tone">
                <Select
                  value={draft.tone}
                  onChange={(v) => set({ tone: v })}
                  options={toneOptions}
                  disabled={!canEdit}
                  ariaLabel="Brand tone"
                />
              </Field>
            </div>

            <Field label="Welcome message">
              <textarea
                value={draft.welcomeMessage}
                disabled={!canEdit}
                onChange={(e) => set({ welcomeMessage: e.target.value })}
                rows={2}
                className="input-control resize-y"
              />
            </Field>

            <Field label="Proactive teaser">
              <textarea
                value={draft.proactiveTeaser}
                disabled={!canEdit}
                onChange={(e) => set({ proactiveTeaser: e.target.value })}
                rows={2}
                className="input-control resize-y"
              />
              <p className="mt-1 text-[11.5px] text-text-3">
                Intercom-style prompt shown above launcher after 20s scroll & 4s idle.
              </p>
            </Field>

            <Field label="Escalation message">
              <textarea
                value={draft.escalationMessage}
                disabled={!canEdit}
                onChange={(e) => set({ escalationMessage: e.target.value })}
                rows={2}
                className="input-control resize-y"
              />
            </Field>

            <Field label="Launcher text">
              <input
                value={draft.launcherText}
                disabled={!canEdit}
                onChange={(e) => set({ launcherText: e.target.value })}
                className="input-control"
              />
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
              <div>
                <p className="text-[12.5px] font-semibold text-text">Mobile fullscreen</p>
                <p className="text-[11.5px] text-text-3">
                  Widget covers the whole viewport under 700px width
                </p>
              </div>
              <Switch
                checked={draft.mobileFullscreen}
                onChange={(v) => set({ mobileFullscreen: v })}
                disabled={!canEdit}
                label="Mobile fullscreen"
              />
            </div>
          </div>
        </section>

        {/* Live Staged Preview Section */}
        <section className="flex flex-col rounded-md border border-border bg-surface shadow-card">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="eye" size={16} className="text-primary" />
              <h3 className="text-card-title text-text">Live interactive preview</h3>
            </div>
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-bold text-primary-dark">
              Live Stage
            </span>
          </header>
          <div className="flex flex-1 flex-col p-5">
            <p className="mb-4 text-meta text-text-3">
              Interact with the live widget below — changes update instantly as you edit settings.
            </p>
            <WidgetStage tenant={tenant} draft={draft} />
          </div>
        </section>
      </div>

      {/* Deploy & Embed Script Section (Chatwoot Model) */}
      <section className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 bg-surface">
          <div>
            <h3 className="text-card-title text-text font-bold">Widget Installation & Script Deployment</h3>
            <p className="mt-0.5 text-[12px] text-text-3">Deploy Prestige AI Chat on any external website or app</p>
          </div>

          {/* Framework Tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setDeployTab("html")}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-semibold transition-all duration-150",
                deployTab === "html" ? "bg-white text-text shadow-xs" : "text-text-3 hover:text-text",
              )}
            >
              HTML / JS
            </button>
            <button
              type="button"
              onClick={() => setDeployTab("react")}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-semibold transition-all duration-150",
                deployTab === "react" ? "bg-white text-text shadow-xs" : "text-text-3 hover:text-text",
              )}
            >
              Next.js / React
            </button>
            <button
              type="button"
              onClick={() => setDeployTab("wordpress")}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-semibold transition-all duration-150",
                deployTab === "wordpress" ? "bg-white text-text shadow-xs" : "text-text-3 hover:text-text",
              )}
            >
              WordPress / Shopify
            </button>
          </div>
        </header>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-[13px] text-text-2 leading-relaxed">
            Copy and paste the script snippet below into your site&apos;s HTML header or footer before the closing <code className="rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-primary font-semibold">&lt;/body&gt;</code> tag.
          </p>

          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0c1322] shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#101827] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]/80" />
                <span className="ml-2 font-mono text-[11px] font-medium text-slate-400">
                  {deployTab === "html" ? "index.html" : deployTab === "react" ? "ChatWidget.tsx" : "footer.php"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyEmbed(deployTab === "html" ? embedScript : deployTab === "react" ? reactSnippet : wordpressSnippet)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-slate-800/90 px-3 py-1 text-[11.5px] font-semibold text-slate-200 shadow-xs transition-all duration-150 hover:bg-slate-700 hover:text-white"
              >
                <Icon name={copied ? "check" : "copy"} size={13} className={copied ? "text-emerald-400" : "text-slate-300"} />
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <div className="p-4 font-mono text-[12.5px] leading-relaxed text-emerald-400 overflow-x-auto">
              <pre className="whitespace-pre font-mono">
                {deployTab === "html" && embedScript}
                {deployTab === "react" && reactSnippet}
                {deployTab === "wordpress" && wordpressSnippet}
              </pre>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <a
              href={`${origin}/widget-embed?tenantId=${tenant.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
            >
              <Icon name="link" size={14} />
              Open standalone embed URL
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Staged interactive widget preview — mirrors the embedded customer-facing widget. */
function WidgetStage({ tenant, draft }: { tenant: Tenant; draft: SettingsDraft }) {
  const right = draft.widgetPosition === "bottom-right";
  const previewTenant: Tenant = {
    ...tenant,
    botName: draft.botName,
    color: draft.color,
    secondaryColor: draft.secondaryColor,
    widgetPosition: draft.widgetPosition,
    tone: draft.tone,
    welcomeMessage: draft.welcomeMessage,
    proactiveTeaser: draft.proactiveTeaser,
    escalationMessage: draft.escalationMessage,
    launcherText: draft.launcherText,
    mobileFullscreen: draft.mobileFullscreen,
  };

  return (
    <div
      className="relative min-h-[500px] flex-1 overflow-hidden rounded-xl border border-dashed border-border"
      style={{
        backgroundImage:
          "radial-gradient(circle at 10% 20%, rgba(0,168,107,.06), transparent 30%), radial-gradient(circle at 90% 80%, rgba(37,99,235,.06), transparent 30%)",
      }}
    >
      <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-text-3 bg-surface/80 px-3 py-1 rounded-full border border-border backdrop-blur-xs">
        <Icon name="building" size={13} className="text-primary" />
        {tenant.name} — simulated customer website
      </span>

      <div
        className={cn(
          "absolute bottom-4 flex flex-col items-end gap-2.5",
          right ? "right-4" : "left-4",
        )}
      >
        <WidgetChat key={JSON.stringify(draft)} tenant={previewTenant} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro uppercase text-text-3">{label}</span>
      {children}
    </label>
  );
}
