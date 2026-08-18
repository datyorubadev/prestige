import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { TrustStrip } from "@/components/landing/trust-strip";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Testimonials } from "@/components/landing/testimonials";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { CtaBand } from "@/components/landing/cta-band";
import { SiteFooter } from "@/components/landing/site-footer";
import { FloatingChat } from "@/components/landing/floating-chat";

/** Public landing (guide §6.2). A real product demo page: the shared inbox in
 *  the hero and the floating chat widget are the live product running against
 *  mock data — not screenshots. Sections separate by soft bands and space, not
 *  hairlines; primary green appears only on buttons. */
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Features />
        <Testimonials />
        <Pricing />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
      <FloatingChat />
    </div>
  );
}
