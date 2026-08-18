import { Icon } from "@/components/icons";
import { Reveal } from "@/components/landing/reveal";

const FAQS = [
  {
    q: "Is this really multi-tenant?",
    a: "Yes. One Prestige instance serves many tenants - each with its own widget, help center, and queue - all behind a single console. Agents switch tenants without logging out.",
  },
  {
    q: "How does the AI hand off to a human?",
    a: "A visitor can ask (try “talk to a human” in the demo) or an escalation rule can trigger it. The same conversation moves to an agent in real time - nothing is re-typed, nothing is lost.",
  },
  {
    q: "What happens when no agent is online?",
    a: "The widget tells the truth: it shows an offline state, takes an email instead of a message, and the request lands in the inbox for the next shift. It never pretends an agent is there.",
  },
  {
    q: "Can customers self-serve?",
    a: "Every tenant ships a help center with searchable articles. Every article ends with “Did this help?” and a fallback to a human when it didn’t.",
  },
  {
    q: "How is CSAT collected?",
    a: "One five-face scale appears in the chat after a conversation resolves - optional, in the flow, and configurable per tenant. It never blocks the visitor.",
  },
  {
    q: "Is this a real product?",
    a: "This build is a working prototype running on realistic mock data - chat, handoff, CSAT and the inbox all work end to end. No screenshots, no canned video.",
  },
];

/** FAQ — semantic <details> accordions, keyboard-accessible with no JS. */
export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-20 lg:px-8 lg:py-28">
        <Reveal>
          <h2 className="text-center font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[38px]">
            Questions, answered straight.
          </h2>
        </Reveal>

        <div className="mt-10 flex flex-col gap-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <details className="group overflow-hidden rounded-2xl bg-surface-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-bold text-text [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-text-2 transition-transform duration-180 group-open:rotate-180">
                    <Icon name="chevron-down" size={16} />
                  </span>
                </summary>
                <p className="px-6 pb-5 text-[14px] leading-relaxed text-text-2">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
