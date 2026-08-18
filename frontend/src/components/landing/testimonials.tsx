import { Reveal } from "@/components/landing/reveal";

const FEATURED = {
  quote:
    "We run support for three brands and one shared inbox means a visitor from NairaWave and a customer from MediQuick are side by side - same team, same queue, no switching consoles.",
  name: "Amara Obi",
  role: "Head of Support",
  org: "NairaWave Fintech",
};

const OTHERS = [
  {
    quote:
      "The handoff is the detail everyone gets wrong. Here the thread just keeps going, so the customer never repeats themselves.",
    name: "Tunde Bakare",
    role: "Support Lead",
    org: "GidiExpress",
  },
  {
    quote:
      "CSAT lands in the conversation instead of a pop-up. Our ratings went up because we finally see them.",
    name: "Chidi Eze",
    role: "Customer Ops",
    org: "SolarHub",
  },
];

/** Testimonials — asymmetric composition: one large featured quote plus a
 *  stacked pair, so the section never reads as a 3-card clone of pricing. */
export function Testimonials() {
  return (
    <section id="testimonials" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
        <Reveal>
          <h2 className="max-w-xl font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[38px]">
            Teams that answer fast stay calm.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Reveal className="md:col-span-2">
            <figure className="flex h-full flex-col justify-between rounded-2xl bg-surface p-8 shadow-[0_1px_2px_rgba(21,32,43,0.04)] ring-1 ring-border lg:p-10">
              <blockquote className="font-display text-[20px] font-medium leading-snug tracking-[-0.01em] text-text lg:text-[23px]">
                “{FEATURED.quote}”
              </blockquote>
              <figcaption className="mt-8 flex items-center gap-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[13px] font-bold text-text-2">
                  {FEATURED.name.split(" ").map((w) => w[0]).join("")}
                </span>
                <div>
                  <p className="text-[13px] font-bold text-text">{FEATURED.name}</p>
                  <p className="text-[12px] text-text-3">
                    {FEATURED.role} · {FEATURED.org}
                  </p>
                </div>
              </figcaption>
            </figure>
          </Reveal>

          <div className="flex flex-col gap-4">
            {OTHERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 80}>
                <figure className="flex h-full flex-col rounded-2xl bg-surface p-6 shadow-[0_1px_2px_rgba(21,32,43,0.04)] ring-1 ring-border">
                  <blockquote className="text-[14.5px] leading-relaxed text-text">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-5 text-[12px] text-text-3">
                    <span className="font-bold text-text">{t.name}</span> · {t.role}, {t.org}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
