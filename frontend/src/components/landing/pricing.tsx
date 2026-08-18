"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/landing/reveal";

const PLANS = [
  {
    name: "Starter",
    priceMonthly: 0,
    tagline: "For one tenant finding its feet.",
    cta: "Start free",
    href: "/register",
    features: ["1 tenant", "Live chat widget", "Help center", "Shared inbox", "Email capture"],
    highlighted: false,
  },
  {
    name: "Pro",
    priceMonthly: 29,
    tagline: "For agencies running several brands.",
    cta: "Start free",
    href: "/register",
    features: [
      "Up to 10 tenants",
      "AI assistant + human handoff",
      "Escalation rules & SLAs",
      "CSAT in the conversation",
      "Reports per tenant",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    priceMonthly: null,
    tagline: "For support teams at scale.",
    cta: "Talk to sales",
    href: "/login",
    features: [
      "Unlimited tenants",
      "Super-admin console",
      "SSO & audit log",
      "Custom SLAs",
      "Dedicated onboarding",
    ],
    highlighted: false,
  },
];

/** Pricing — three tiers with a monthly/annual toggle. The annual price is
 *  derived, never hand-typed twice. */
export function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[38px]">
            Per tenant, not per agent.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-text-2">
            Pay once for each brand you serve - every tenant includes the full
            inbox, widget, and help center.
          </p>
        </Reveal>

        <Reveal className="mt-9 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-border bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              aria-pressed={!annual}
              className={cn(
                "rounded-full px-5 py-2 text-[13px] font-semibold transition-colors duration-150",
                !annual ? "bg-surface text-text shadow-[0_1px_2px_rgba(21,32,43,0.08)]" : "text-text-2 hover:text-text",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold transition-colors duration-150",
                annual ? "bg-surface text-text shadow-[0_1px_2px_rgba(21,32,43,0.08)]" : "text-text-2 hover:text-text",
              )}
            >
              Annual
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-text-3">
                −20%
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 items-stretch gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => {
            const price = p.priceMonthly === null ? null : annual ? Math.round(p.priceMonthly * 0.8) : p.priceMonthly;
            return (
              <Reveal key={p.name} delay={i * 80} className="h-full">
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl bg-surface p-7",
                    p.highlighted
                      ? "shadow-[0_24px_60px_-30px_rgba(21,32,43,0.35)] ring-2 ring-border-strong"
                      : "shadow-[0_1px_2px_rgba(21,32,43,0.04)] ring-1 ring-border",
                  )}
                >
                  {p.highlighted && (
                    <span className="absolute -top-3 left-7 inline-flex w-fit items-center gap-1 rounded-full bg-text px-3 py-1 text-[11px] font-bold text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-display text-[17px] font-bold text-text">{p.name}</h3>
                  <p className="mt-1 text-[13px] text-text-3">{p.tagline}</p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    {price === null ? (
                      <span className="font-display text-[38px] font-bold leading-none tracking-[-0.02em] text-text">
                        Custom
                      </span>
                    ) : (
                      <>
                        <span className="font-display text-[38px] font-bold leading-none tracking-[-0.02em] text-text">
                          ${price}
                        </span>
                        <span className="text-[13px] text-text-3">/ tenant / month</span>
                      </>
                    )}
                  </div>

                  <ul className="mt-7 flex flex-col gap-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-text-2">
                        <Icon name="check" size={15} className="mt-0.5 shrink-0 text-text-3" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={p.href}
                    className={cn(
                      "mt-8 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-3 text-[13.5px] font-bold transition-colors duration-150",
                      p.highlighted
                        ? "bg-primary text-white hover:bg-primary-dark"
                        : "border border-border-strong bg-surface text-text hover:bg-surface-2",
                    )}
                  >
                    {p.cta}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
