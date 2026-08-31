"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface OnboardingModalProps {
  tenantId: string;
}

const BRAND_PALETTE = [
  { name: "Emerald", hex: "#00a86b" },
  { name: "Cobalt", hex: "#2563eb" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Amber", hex: "#d97706" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Slate", hex: "#0f172a" },
];

export function OnboardingModal({ tenantId }: OnboardingModalProps) {
  const { user } = useAuth();
  const storageKey = `prestige_onboarding_completed_${user?.id ?? "usr"}_${tenantId}`;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const [companyName, setCompanyName] = useState(
    user?.fullName ? `${user.fullName}'s Workspace` : "My Workspace",
  );
  const [brandColor, setBrandColor] = useState("#00a86b");
  const [botName, setBotName] = useState("Prestige AI");
  const [welcomeMsg, setWelcomeMsg] = useState("Hi there! How can we help you today?");

  useEffect(() => {
    if (user?.role !== "owner" && user?.role !== "super_admin") return;
    const isDone = localStorage.getItem(storageKey) === "true";
    if (!isDone) {
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, [storageKey, user?.role]);

  const closeAndPersist = async () => {
    localStorage.setItem(storageKey, "true");
    try {
      await api.put("/settings/tenant", {
        botName: botName || "Prestige AI",
        primaryColor: brandColor,
        welcomeMessage: welcomeMsg || "Hi there! How can we help you today?",
      });
    } catch {
      // Settings persist even if API call fails
    }
    setOpen(false);
  };

  const isCustomColor = !BRAND_PALETTE.some(
    (c) => c.hex.toLowerCase() === brandColor.toLowerCase(),
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Top Bar */}
        <div className="border-b border-border/70 bg-gradient-to-r from-primary-soft/30 via-surface to-surface px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon name="sparkles" size={15} />
              </span>
              <span className="text-[12.5px] font-bold tracking-wide text-text">
                Quickstart Setup
              </span>
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-[#1e293b]">
                Step {step} of {totalSteps}
              </span>
            </div>

            <button
              type="button"
              onClick={closeAndPersist}
              className="text-[12px] font-semibold text-[#1e293b] transition-colors hover:text-text"
            >
              Skip setup
            </button>
          </div>

          {/* Segmented Step Progress Bar */}
          <div className="mt-3.5 grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  step >= i ? "bg-primary" : "bg-surface-3",
                )}
              />
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7">
          {/* STEP 1: Workspace Name & Brand Accent */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight text-text">
                  Name your workspace
                </h2>
                <p className="mt-1 text-[13px] text-[#1e293b]">
                  Set your company name and brand color for support emails and customer portals.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                <label className="block text-[12.5px] font-semibold text-text">
                  Workspace Name
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. BoltPay Technologies"
                    className="input-control mt-1.5 text-text font-normal"
                  />
                </label>

                <div>
                  <label className="block text-[12.5px] font-semibold text-text mb-2">
                    Primary Brand Color
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {BRAND_PALETTE.map((c) => {
                      const isSelected = brandColor.toLowerCase() === c.hex.toLowerCase();
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setBrandColor(c.hex)}
                          style={{ backgroundColor: c.hex }}
                          aria-label={`Select ${c.name}`}
                          className={cn(
                            "relative flex h-8 w-8 items-center justify-center rounded-full transition-all shadow-xs",
                            isSelected
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                              : "hover:opacity-90",
                          )}
                        >
                          {isSelected && <Icon name="check" size={13} className="text-white" />}
                        </button>
                      );
                    })}

                    {/* 7th Circle: Custom Color Picker */}
                    <div
                      className={cn(
                        "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all shadow-xs border border-border overflow-hidden",
                        isCustomColor
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                          : "hover:border-text-2 bg-surface-2",
                      )}
                      style={{ backgroundColor: isCustomColor ? brandColor : undefined }}
                      title="Custom color picker"
                    >
                      {isCustomColor ? (
                        <Icon name="check" size={13} className="text-white relative z-10 pointer-events-none" />
                      ) : (
                        <span className="text-[13px] font-semibold text-[#1e293b] pointer-events-none">+</span>
                      )}
                      <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                        aria-label="Pick custom color"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: AI Support Bot & Live Chat */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight text-text">
                  Customize your AI bot
                </h2>
                <p className="mt-1 text-[13px] text-[#1e293b]">
                  Your AI assistant handles common inquiries and drafts answers for your human team.
                </p>
              </div>

              <div className="space-y-3.5 pt-1">
                <label className="block text-[12.5px] font-semibold text-text">
                  Bot Name
                  <input
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="e.g. Prestige AI"
                    className="input-control mt-1.5 text-text font-normal"
                  />
                </label>

                <label className="block text-[12.5px] font-semibold text-text">
                  Greeting Message
                  <input
                    value={welcomeMsg}
                    onChange={(e) => setWelcomeMsg(e.target.value)}
                    placeholder="e.g. Hi there! How can we help you today?"
                    className="input-control mt-1.5 text-text font-normal"
                  />
                </label>

                {/* Subtle borderless preview card */}
                <div className="rounded-xl bg-surface-2 p-3.5 text-[12px]">
                  <span className="text-micro font-semibold uppercase tracking-wider text-[#1e293b] block mb-2">
                    Live Chat Widget Preview
                  </span>
                  <div className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-2xs">
                    <span
                      style={{ backgroundColor: brandColor }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-xs"
                    >
                      <Icon name="sparkles" size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-text block text-[13px]">{botName}</span>
                      <span className="text-[#1e293b] truncate block text-[12px] mt-0.5">{welcomeMsg}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Knowledge Base & Auto-FAQs */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight text-text">
                  Connect knowledge base
                </h2>
                <p className="mt-1 text-[13px] text-[#1e293b]">
                  Your AI learns directly from your articles, documents, and past customer chats.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary shadow-2xs">
                    <Icon name="check" size={13} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-semibold text-text">Auto-Discover FAQs</h4>
                    <p className="mt-0.5 text-[12px] text-[#1e293b] leading-relaxed">
                      One-click AI extraction scans past customer conversations to discover frequent inquiries.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info-soft text-info shadow-2xs">
                    <Icon name="file" size={13} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-semibold text-text">Multi-format Document Upload</h4>
                    <p className="mt-0.5 text-[12px] text-[#1e293b] leading-relaxed">
                      Upload PDFs, DOCX, CSVs, or crawl help URLs for instant vector retrieval and RAG search.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Ready to Launch */}
          {step === 4 && (
            <div className="space-y-5 animate-in fade-in duration-200 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-xs border border-emerald-100">
                <Icon name="check" size={24} />
              </div>
              <div>
                <h2 className="text-[18px] font-bold tracking-tight text-text">
                  Your workspace is ready! 🚀
                </h2>
                <p className="mt-1 text-[13px] text-[#1e293b]">
                  Your multi-channel AI support desk is initialized and ready for tickets.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1 text-left">
                <Link
                  href={`/widget/${tenantId}`}
                  onClick={closeAndPersist}
                  className="flex flex-col justify-between rounded-xl bg-surface-2 p-3.5 transition-all hover:bg-surface-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <Icon name="sparkles" size={15} className="text-primary" />
                    <span className="text-[12.5px] font-semibold text-text">Embed Widget</span>
                  </div>
                  <span className="mt-2 text-[11px] text-[#1e293b]">Copy HTML & JS script snippet</span>
                </Link>

                <Link
                  href="/agents"
                  onClick={closeAndPersist}
                  className="flex flex-col justify-between rounded-xl bg-surface-2 p-3.5 transition-all hover:bg-surface-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <Icon name="users" size={15} className="text-info" />
                    <span className="text-[12.5px] font-semibold text-text">Invite Team</span>
                  </div>
                  <span className="mt-2 text-[11px] text-[#1e293b]">Add support agents & admins</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-border/70 bg-surface px-6 py-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1e293b] transition-colors hover:text-text"
            >
              <Icon name="chevron-left" size={14} />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={closeAndPersist}
              className="text-[12.5px] font-semibold text-[#1e293b] transition-colors hover:text-text"
            >
              Skip Setup
            </button>
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-xs"
            >
              Continue
              <Icon name="chevron-right" size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={closeAndPersist}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-xs"
            >
              Go to Dashboard
              <Icon name="arrow-right" size={14} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
