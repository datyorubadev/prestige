import Link from "next/link";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/landing/reveal";
import { DEMO_TENANT_SLUG } from "@/lib/utils";

/** Final CTA — text and buttons only, over a layered dot-grid pattern and a
 *  soft radial wash. The texture is ink-neutral; green stays on the buttons. */
export function CtaBand() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-surface-2 px-6 py-16 text-center lg:px-14 lg:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(21,32,43,0.10) 1.5px, transparent 1.5px)",
                backgroundSize: "20px 20px",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(255,255,255,0.55) 2px, transparent 2px)",
                backgroundSize: "20px 20px",
                backgroundPosition: "10px 10px",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 90% at 50% 0%, rgba(255,255,255,0.95), transparent 60%)",
              }}
            />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[40px]">
                Give every brand a support desk that tells the truth.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-text-2">
                Spin up a tenant, open the widget, and watch a conversation hand
                itself off to your team - all on demo data, no setup.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link href="/register" className="l-btn l-btn-primary">
                  Start free
                  <Icon name="arrow-right" size={15} />
                </Link>
                <Link href={`/portal/${DEMO_TENANT_SLUG}`} className="l-btn l-btn-ghost">
                  See the help center
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
