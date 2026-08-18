"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: "sparkles" | "book" | "users" | "message" | "check";
  done: boolean;
}

export function OnboardingCard({ tenantId }: { tenantId: string }) {
  const { user } = useAuth();
  const storageKey = `prestige_onboarding_dismissed_${tenantId}`;
  
  const [dismissed, setDismissed] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({
    workspace: true,
  });

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === "true";
    setDismissed(isDismissed);

    // Load completed steps
    try {
      const stored = localStorage.getItem(`prestige_onboarding_steps_${tenantId}`);
      if (stored) {
        setCompletedSteps(JSON.parse(stored));
      }
    } catch {
      // fallback
    }
  }, [storageKey, tenantId]);

  const toggleStep = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...completedSteps, [id]: !completedSteps[id] };
    setCompletedSteps(next);
    localStorage.setItem(`prestige_onboarding_steps_${tenantId}`, JSON.stringify(next));
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(storageKey, "true");
  };

  const steps: Step[] = [
    {
      id: "workspace",
      title: "Create your organization workspace",
      description: "Workspace initialized and ready for team members.",
      href: "/settings",
      icon: "check",
      done: true,
    },
    {
      id: "widget",
      title: "Customize your AI Assistant & Live Chat Widget",
      description: "Pick your brand colors, AI persona, and launcher positioning.",
      href: `/widget/${tenantId}`,
      icon: "sparkles",
      done: !!completedSteps.widget,
    },
    {
      id: "kb",
      title: "Add knowledge base articles & FAQs",
      description: "Upload your company documents or crawl your help URLs.",
      href: "/kb",
      icon: "book",
      done: !!completedSteps.kb,
    },
    {
      id: "invite",
      title: "Invite your support team or test live chat",
      description: "Add agents with team-scoped inboxes and test customer chat.",
      href: "/agents",
      icon: "users",
      done: !!completedSteps.invite,
    },
  ];

  const total = steps.length;
  const completedCount = steps.filter((s) => s.done).length;
  const pct = Math.round((completedCount / total) * 100);

  if (dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary-border bg-gradient-to-r from-primary-soft/80 via-surface to-surface p-5 shadow-xs transition-all animate-in fade-in slide-in-from-top-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
              <Icon name="sparkles" size={13} />
            </span>
            <h2 className="text-[15px] font-bold text-text">
              Welcome to Prestige! Let&apos;s get your support desk ready
            </h2>
          </div>
          <p className="mt-1 text-[13px] text-text-2">
            Complete these quick steps to launch your AI-powered live chat and knowledge base.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-primary-dark">{pct}% complete</span>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss onboarding checklist"
            className="rounded-md p-1 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
            title="Dismiss checklist"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            onClick={() => {
              if (!s.done) {
                const next = { ...completedSteps, [s.id]: true };
                setCompletedSteps(next);
                localStorage.setItem(`prestige_onboarding_steps_${tenantId}`, JSON.stringify(next));
              }
            }}
            className={cn(
              "group relative flex flex-col justify-between rounded-lg border p-3.5 transition-all duration-150",
              s.done
                ? "border-border bg-white/70 opacity-80 hover:opacity-100"
                : "border-primary/40 bg-white shadow-xs hover:border-primary hover:shadow-card",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px]",
                  s.done ? "bg-emerald-50 text-emerald-600" : "bg-primary-soft text-primary",
                )}
              >
                <Icon name={s.done ? "check" : s.icon} size={15} />
              </div>
              <button
                type="button"
                onClick={(e) => toggleStep(s.id, e)}
                title={s.done ? "Mark incomplete" : "Mark complete"}
                className={cn(
                  "h-4 w-4 rounded-full border flex items-center justify-center transition-colors",
                  s.done
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-border hover:border-primary",
                )}
              >
                {s.done && <Icon name="check" size={10} />}
              </button>
            </div>

            <div className="mt-3">
              <h3 className={cn("text-[13px] font-bold text-text", s.done && "line-through text-text-3")}>
                {s.title}
              </h3>
              <p className="mt-1 text-[11.5px] leading-snug text-text-3">{s.description}</p>
            </div>

            <div className="mt-3 flex items-center gap-1 text-[11.5px] font-semibold text-primary group-hover:underline">
              <span>{s.done ? "Review settings" : "Start setup"}</span>
              <Icon name="arrow-right" size={11} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
