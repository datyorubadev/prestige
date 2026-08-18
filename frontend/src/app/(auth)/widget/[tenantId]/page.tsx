"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { WidgetChat } from "@/components/widget/widget-chat";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { uploadAttachment } from "@/components/ui/attachments";
import type { Tenant } from "@/lib/types";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "mobile";
type PresenceMode = "default" | "online" | "away" | "offline";
type PositionMode = "bottom-right" | "bottom-left";

const COLOR_PRESETS = [
  { label: "Emerald", color: "#00a86b", secondary: "#059669" },
  { label: "Indigo", color: "#4f46e5", secondary: "#3730a3" },
  { label: "Royal Blue", color: "#2563eb", secondary: "#1d4ed8" },
  { label: "Violet", color: "#7c3aed", secondary: "#6d28d9" },
  { label: "Rose", color: "#e11d48", secondary: "#be123c" },
  { label: "Dark Slate", color: "#0f172a", secondary: "#334155" },
];

const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "pidgin", label: "Naija Pidgin" },
  { value: "formal", label: "Formal Executive" },
];

interface CustomizationState {
  logoUrl: string | null;
  displayImage: string | null;
  botName: string;
  color: string;
  secondaryColor: string;
  position: PositionMode;
  presence: PresenceMode;
  tone: string;
  welcomeMessage: string;
  proactiveTeaser: string;
  launcherText: string;
  mobileFullscreen: boolean;
}

export default function WidgetDemoPage() {
  const params = useParams<{ tenantId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    params?.tenantId || user?.tenantId || "t1",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [copied, setCopied] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  // Customization controls draft state
  const [custom, setCustom] = useState<CustomizationState>({
    logoUrl: null,
    displayImage: null,
    botName: "Assistant",
    color: "#00a86b",
    secondaryColor: "#059669",
    position: "bottom-right",
    presence: "default",
    tone: "professional",
    welcomeMessage: "Hello! How can we help you today?",
    proactiveTeaser: "Need help? Chat with us — usually replies instantly.",
    launcherText: "Chat with us",
    mobileFullscreen: false,
  });

  const loadTenants = useCallback(() => {
    let active = true;
    const req = isSuperAdmin
      ? api.get<Tenant[]>("/tenants")
      : api
          .get<Tenant>(`/tenants/${user?.tenantId ?? "t1"}`)
          .then((t) => [t]);

    void req
      .then((list) => {
        if (!active) return;
        setTenants(list);
        const match =
          list.find((x) => x.id === selectedTenantId || x.slug === selectedTenantId) ?? list[0];
        if (match) {
          setSelectedTenantId(match.id);
          setCustom({
            logoUrl: match.logoUrl ?? null,
            displayImage: match.displayImage ?? null,
            botName: match.botName ?? `${match.name} Assistant`,
            color: match.color ?? "#00a86b",
            secondaryColor: match.secondaryColor ?? "#059669",
            position: (match.widgetPosition as PositionMode) ?? "bottom-right",
            presence: "default",
            tone: match.tone ?? "professional",
            welcomeMessage:
              match.welcomeMessage ?? `Hello! I'm ${match.name}. How can I help you today?`,
            proactiveTeaser:
              match.proactiveTeaser ?? "Need help? Chat with us — usually replies instantly.",
            launcherText: match.launcherText ?? "Chat with us",
            mobileFullscreen: match.mobileFullscreen ?? false,
          });
        }
      })
      .catch(() => active && setTenants([]));

    return () => {
      active = false;
    };
  }, [isSuperAdmin, selectedTenantId, user?.tenantId]);

  useEffect(loadTenants, [loadTenants]);

  const activeTenant =
    tenants?.find((t) => t.id === selectedTenantId || t.slug === selectedTenantId) ?? null;

  const setPartial = (patch: Partial<CustomizationState>) => {
    setCustom((prev) => ({ ...prev, ...patch }));
  };

  const triggerQuickAction = (query: string) => {
    window.dispatchEvent(
      new CustomEvent("prestige_trigger_widget", { detail: { query } }),
    );
  };

  const saveToTenant = async () => {
    if (!activeTenant) return;
    setSaving(true);
    try {
      await api.put(`/tenants/${activeTenant.id}`, {
        logoUrl: custom.logoUrl,
        displayImage: custom.displayImage,
        botName: custom.botName,
        color: custom.color,
        secondaryColor: custom.secondaryColor,
        widgetPosition: custom.position,
        tone: custom.tone,
        welcomeMessage: custom.welcomeMessage,
        proactiveTeaser: custom.proactiveTeaser,
        launcherText: custom.launcherText,
        mobileFullscreen: custom.mobileFullscreen,
      });
      await loadTenants();
      toast("Widget branding & live broadcast saved successfully!");
    } catch {
      toast("Failed to save widget settings", "danger");
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.prestige.ng";

  const tenantSlug = (activeTenant?.slug || activeTenant?.name || "nairawave").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const scriptTag = `<!-- Prestige AI Live Chat Widget -->
<script
  src="${origin}/widget.js"
  data-tenant-id="${tenantSlug}"
  data-position="${custom.position}"
  data-color="${custom.color}"
  async
  defer>
</script>`;

  const copyCode = () => {
    void navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Preview tenant merged with live customization state
  const previewTenant: Tenant | null = activeTenant
    ? {
        ...activeTenant,
        logoUrl: custom.logoUrl,
        displayImage: custom.displayImage,
        botName: custom.botName,
        color: custom.color,
        secondaryColor: custom.secondaryColor,
        widgetPosition: custom.position,
        tone: custom.tone,
        welcomeMessage: custom.welcomeMessage,
        proactiveTeaser: custom.proactiveTeaser,
        launcherText: custom.launcherText,
        mobileFullscreen: custom.mobileFullscreen,
      }
    : null;

  const presenceOverride = custom.presence === "default" ? undefined : custom.presence;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Widget Studio & Live Sandbox</h1>
          <p className="mt-1 text-meta text-text-2">Customize AI branding live and test on simulated customer site</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Viewport Switcher */}
          <div className="flex items-center gap-1 rounded-sm border border-border bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-[12px] font-semibold transition-all duration-150",
                viewport === "desktop" ? "bg-surface text-text shadow-xs" : "text-text-3 hover:text-text",
              )}
            >
              <Icon name="monitor" size={14} />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-[12px] font-semibold transition-all duration-150",
                viewport === "mobile" ? "bg-surface text-text shadow-xs" : "text-text-3 hover:text-text",
              )}
            >
              <Icon name="phone" size={14} />
              Mobile Frame
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowEmbedModal(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-xs"
          >
            <Icon name="code" size={14} />
            Get Embed Code
          </button>
        </div>
      </header>

      {/* Embed Code Modal */}
      {showEmbedModal && (
        <Modal
          open
          onClose={() => setShowEmbedModal(false)}
          title="Deploy Live Chat Widget"
          size="lg"
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-text-2 leading-relaxed">
              Copy and paste this lightweight script snippet before the closing <code className="rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-primary font-semibold">&lt;/body&gt;</code> tag on your website (WordPress, Shopify, React, HTML):
            </p>

            <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0c1322] shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#101827] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]/80" />
                  <span className="ml-2 font-mono text-[11px] font-medium text-slate-400">widget-embed.html</span>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-slate-800/90 px-3 py-1 text-[11.5px] font-semibold text-slate-200 shadow-xs transition-all duration-150 hover:bg-slate-700 hover:text-white"
                >
                  <Icon name={copied ? "check" : "copy"} size={13} className={copied ? "text-emerald-400" : "text-slate-300"} />
                  {copied ? "Copied!" : "Copy Code"}
                </button>
              </div>
              <div className="p-4 font-mono text-[12.5px] leading-relaxed text-emerald-400 overflow-x-auto">
                <pre className="whitespace-pre font-mono">{scriptTag}</pre>
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowEmbedModal(false)}
                className="rounded-sm bg-surface-2 px-4 py-2 text-[12.5px] font-semibold text-text hover:bg-surface-3 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-180px)]">
        {/* Left Column: Independently Scrollable Customization Details Panel */}
        <section className="lg:col-span-5 xl:col-span-4 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          {/* Section Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 bg-surface">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" size={16} className="text-primary" />
              <h2 className="text-card-title text-text font-bold">Customization Details</h2>
            </div>
            {isSuperAdmin && (
              <Select
                size="sm"
                ariaLabel="Select tenant"
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={(tenants ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
            )}
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-4.5 space-y-4">
            {/* Bot Name */}
            <Field label="Bot Assistant Name">
              <input
                value={custom.botName}
                onChange={(e) => setPartial({ botName: e.target.value })}
                className="input-control"
              />
            </Field>

            {/* Brand Logo */}
            <Field label="Widget Logo">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border text-[15px] font-bold text-white shadow-xs",
                    !custom.logoUrl && "bg-primary",
                  )}
                >
                  {custom.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={custom.logoUrl}
                      alt={`${custom.botName} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    custom.botName?.charAt(0) ?? "B"
                  )}
                </span>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text transition-colors duration-150 hover:bg-surface-2">
                    <Icon name="image" size={13} />
                    {custom.logoUrl ? "Change Logo" : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-hidden="true"
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void uploadAttachment(file).then((att) =>
                            setPartial({ logoUrl: att.url ?? att.dataUrl ?? null }),
                          );
                        }
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {custom.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setPartial({ logoUrl: null })}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon name="trash" size={13} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-text-3">
                PNG, JPG or SVG — shows in the chat header and launcher.
              </p>
            </Field>

            {/* Display Image (chat header cover) */}
            <Field label="Display Image">
              <div className="flex flex-col gap-3">
                <div className={cn(
                  "flex h-24 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2",
                  custom.displayImage ? "" : "border-dashed",
                )}>
                  {custom.displayImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={custom.displayImage}
                      alt={`${custom.botName} display image`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-[11px] text-text-3">
                      <Icon name="image" size={16} />
                      No cover image set
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text transition-colors duration-150 hover:bg-surface-2">
                    <Icon name="image" size={13} />
                    {custom.displayImage ? "Change Image" : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-hidden="true"
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void uploadAttachment(file).then((att) =>
                            setPartial({ displayImage: att.url ?? att.dataUrl ?? null }),
                          );
                        }
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {custom.displayImage && (
                    <button
                      type="button"
                      onClick={() => setPartial({ displayImage: null })}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon name="trash" size={13} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-text-3">
                Wide banner shown above the chat header — ideal for a hero or lifestyle shot.
              </p>
            </Field>

            {/* Quick Color Presets */}
            <div>
              <span className="mb-2 block text-micro uppercase text-text-3">Color Swatches</span>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPartial({ color: p.color, secondaryColor: p.secondary })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all duration-150",
                      custom.color === p.color ? "border-primary bg-primary-soft text-primary-dark shadow-2xs" : "border-border bg-surface hover:border-text-3",
                    )}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary & Secondary Color Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary Color">
                <div className="flex items-center gap-2">
                  <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border shadow-xs transition-transform hover:scale-105" title="Pick primary color">
                    <input
                      type="color"
                      value={isHexColor(custom.color) ? custom.color : "#000000"}
                      onChange={(e) => setPartial({ color: e.target.value })}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0"
                    />
                    <span className="h-full w-full rounded-full" style={{ backgroundColor: custom.color }} />
                  </label>
                  <input
                    type="text"
                    value={custom.color}
                    onChange={(e) => setPartial({ color: e.target.value })}
                    className="input-control font-mono text-[11.5px]"
                  />
                </div>
              </Field>

              <Field label="Secondary Color">
                <div className="flex items-center gap-2">
                  <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border shadow-xs transition-transform hover:scale-105" title="Pick secondary color">
                    <input
                      type="color"
                      value={isHexColor(custom.secondaryColor) ? custom.secondaryColor : "#000000"}
                      onChange={(e) => setPartial({ secondaryColor: e.target.value })}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0"
                    />
                    <span className="h-full w-full rounded-full" style={{ backgroundColor: custom.secondaryColor }} />
                  </label>
                  <input
                    type="text"
                    value={custom.secondaryColor}
                    onChange={(e) => setPartial({ secondaryColor: e.target.value })}
                    className="input-control font-mono text-[11.5px]"
                  />
                </div>
              </Field>
            </div>

            {/* Position & Presence */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Launcher Position">
                <Select
                  value={custom.position}
                  onChange={(v) => setPartial({ position: v as PositionMode })}
                  options={[
                    { value: "bottom-right", label: "Bottom Right" },
                    { value: "bottom-left", label: "Bottom Left" },
                  ]}
                  ariaLabel="Launcher Position"
                />
              </Field>

              <Field label="Presence State">
                <Select
                  value={custom.presence}
                  onChange={(v) => setPartial({ presence: v as PresenceMode })}
                  options={[
                    { value: "default", label: "Truthful State" },
                    { value: "online", label: "🟢 Online" },
                    { value: "away", label: "🟡 Away" },
                    { value: "offline", label: "⚪ Offline" },
                  ]}
                  ariaLabel="Presence State"
                />
              </Field>
            </div>

            {/* Tone */}
            <Field label="AI Brand Tone">
              <Select
                value={custom.tone}
                onChange={(v) => setPartial({ tone: v })}
                options={TONES}
                ariaLabel="AI Brand Tone"
              />
            </Field>

            {/* Welcome & Teaser */}
            <Field label="Welcome Message">
              <textarea
                value={custom.welcomeMessage}
                onChange={(e) => setPartial({ welcomeMessage: e.target.value })}
                rows={2}
                className="input-control resize-y text-[12.5px]"
              />
            </Field>

            <Field label="Proactive Teaser Prompt">
              <textarea
                value={custom.proactiveTeaser}
                onChange={(e) => setPartial({ proactiveTeaser: e.target.value })}
                rows={2}
                className="input-control resize-y text-[12.5px]"
              />
            </Field>

            <Field label="Launcher Button Text">
              <input
                value={custom.launcherText}
                onChange={(e) => setPartial({ launcherText: e.target.value })}
                className="input-control"
              />
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
              <div>
                <p className="text-[12.5px] font-semibold text-text">Mobile Fullscreen</p>
                <p className="text-[11.5px] text-text-3">Full screen under 700px viewport</p>
              </div>
              <Switch
                checked={custom.mobileFullscreen}
                onChange={(v) => setPartial({ mobileFullscreen: v })}
                label="Mobile Fullscreen"
              />
            </div>
          </div>

          {/* Sticky Bottom Save Action */}
          <div className="shrink-0 border-t border-border p-3 bg-surface">
            <button
              type="button"
              onClick={() => void saveToTenant()}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors duration-150 hover:bg-primary-dark disabled:opacity-50 shadow-xs"
            >
              {saving ? <Spinner size={15} /> : <Icon name="check" size={15} />}
              Save & Broadcast Settings
            </button>
          </div>
        </section>

        {/* Right Column: Live Simulated Customer Website Stage */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col overflow-hidden rounded-xl border border-border bg-slate-900/5 shadow-card p-4 items-center justify-center min-h-[600px]">
          <div
            className={cn(
              "relative transition-all duration-300 h-full flex flex-col justify-center",
              viewport === "desktop"
                ? "w-full"
                : "max-w-[410px] w-full h-full rounded-[38px] border-[12px] border-[#1e293b] shadow-2xl overflow-hidden bg-white",
            )}
          >
            {/* Mobile Device Status Bar */}
            {viewport === "mobile" && (
              <div className="flex items-center justify-between bg-[#1e293b] px-6 pt-2 pb-1 text-white text-[11px] font-semibold shrink-0">
                <span>9:41</span>
                <div className="flex items-center gap-1.5">
                  <Icon name="signal" size={12} />
                  <Icon name="wifi" size={12} />
                  <span className="h-2.5 w-5 rounded-xs border border-white bg-white" />
                </div>
              </div>
            )}

            {/* Customer Website Container */}
            <div
              className={cn(
                "flex-1 flex flex-col overflow-hidden bg-white shadow-card transition-all duration-300",
                viewport === "desktop" ? "rounded-xl border border-border" : "rounded-b-[26px]",
              )}
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 20%, rgba(0,168,107,.08), transparent 40%), radial-gradient(circle at 85% 70%, rgba(37,99,235,.08), transparent 40%)",
              }}
            >
              {/* Browser Address Bar Header */}
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                </div>
                <div className="ml-2 flex flex-1 items-center gap-2 rounded-md bg-surface-2 px-3 py-1 text-[11.5px] text-text-3">
                  <Icon name="lock" size={12} className="text-primary shrink-0" />
                  <span className="truncate font-mono">
                    https://{activeTenant?.slug ?? "demo"}.ng
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => loadTenants()}
                  title="Reload demo"
                  aria-label="Reload demo"
                  className="text-text-3 hover:text-text p-1 rounded-md hover:bg-surface-3"
                >
                  <Icon name="refresh" size={14} />
                </button>
              </div>

              {/* Page Body Content */}
              <div className="flex-1 flex flex-col justify-between p-8 overflow-y-auto">
                {activeTenant ? (
                  <>
                    <div className="flex items-center gap-3">
                      {custom.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={custom.logoUrl}
                          alt={`${activeTenant.name} logo`}
                          className="h-11 w-11 rounded-[12px] object-cover shadow-md"
                        />
                      ) : (
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-[12px] text-white shadow-md transition-colors duration-200"
                          style={{ backgroundColor: custom.color }}
                        >
                          <Icon name="building" size={20} />
                        </span>
                      )}
                      <div>
                        <p className="text-[16px] font-extrabold text-text">
                          {activeTenant.name}
                        </p>
                        <p className="text-[12px] text-text-3 capitalize">
                          {custom.tone} · {activeTenant.city}
                        </p>
                      </div>
                    </div>

                    <div className="max-w-[540px] my-auto">
                      <h2 className="text-[28px] font-extrabold leading-tight tracking-tight text-text">
                        Financial services made effortless for{" "}
                        {custom.tone === "pidgin" ? "una style" : "everyone"}
                      </h2>
                      <p className="mt-3 text-[14px] leading-relaxed text-text-2">
                        Get instant support for transfers, card disputes, and account inquiries.
                        Ask {custom.botName} anything or type &quot;speak to human&quot; to connect to an agent.
                      </p>
                      <div className="mt-6 grid grid-cols-3 gap-3 max-w-[460px]">
                        {[
                          {
                            label: "Send Money",
                            icon: "send",
                            prompt: "How do I send money to an account?",
                          },
                          {
                            label: "Card & PIN",
                            icon: "card",
                            prompt: "I need help with my debit card PIN",
                          },
                          {
                            label: "Track Transfer",
                            icon: "trend",
                            prompt: "I want to track a pending transfer",
                          },
                        ].map((f) => (
                          <button
                            key={f.label}
                            type="button"
                            onClick={() => triggerQuickAction(f.prompt)}
                            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-[12px] font-semibold text-text-2 transition-all duration-150 hover:border-primary-border hover:text-primary hover:shadow-card hover:-translate-y-0.5"
                          >
                            <Icon name={f.icon as "send"} size={20} className="text-text-3" />
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="mt-auto flex items-center gap-2 text-[12px] font-medium text-text-3 pt-4">
                      <Icon name="bot" size={15} className="text-primary" />
                      {custom.botName} live sandbox · position: {custom.position.replace("-", " ")}.
                    </p>
                  </>
                ) : (
                  <div className="flex-1">
                    <div className="skeleton h-8 w-2/3" />
                    <div className="skeleton mt-4 h-4 w-full" />
                    <div className="skeleton mt-2 h-4 w-5/6" />
                  </div>
                )}
              </div>
            </div>

            {/* Embedded Live Chat Widget Floating Stage */}
            <div
              className={cn(
                "absolute bottom-6 z-20 pointer-events-auto",
                custom.position === "bottom-left" ? "left-6" : "right-6",
              )}
            >
              {previewTenant && (
                <WidgetChat
                  key={`${selectedTenantId}-${JSON.stringify(custom)}-${viewport}`}
                  tenant={previewTenant}
                  presenceOverride={presenceOverride}
                  positionOverride={custom.position}
                  isMobileFrame={viewport === "mobile"}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro uppercase text-text-3 font-semibold">{label}</span>
      {children}
    </label>
  );
}
