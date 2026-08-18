import { Reveal } from "@/components/landing/reveal";

const STEPS = [
  {
    n: "01",
    title: "A visitor opens a chat",
    body: "The widget greets them on your site with a real question, not a wall of options. It feels like your brand, because it is.",
  },
  {
    n: "02",
    title: "AI answers, then hands off",
    body: 'Routine questions resolve instantly. Say "talk to a human" and the same conversation moves to your team - same thread, real handover.',
  },
  {
    n: "03",
    title: "Resolve, rate, repeat",
    body: "Closed conversations end with a five-face CSAT. Every ticket from every tenant lands in one shared inbox, ready for the next shift.",
  },
];

/** How it works — the value narrative. Numbered because it is a sequence: the
 *  numbers carry the order, nothing is decorative. */
export function HowItWorks() {
  return (
    <section id="product" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
        <Reveal>
          <h2 className="max-w-xl font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[38px]">
            One conversation, two lanes.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-2">
            AI handles what it can, a human takes what it can&apos;t - and the
            customer never has to tell the story twice.
          </p>
        </Reveal>

        <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <li className="flex flex-col">
                <span className="font-display text-[42px] font-bold leading-none tracking-[-0.02em] text-text-3">
                  {s.n}
                </span>
                <h3 className="mt-4 text-[17px] font-bold text-text">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-text-2">
                  {s.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
