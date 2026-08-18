import Link from "next/link";
import { Icon } from "@/components/icons";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#testimonials", label: "Customers" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/** Landing nav — 72px, white blur, no hairline. The brand mark is the only
 *  green moment; the CTA is a pill button. Links collapse on mobile. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-6 px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Prestige home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <Icon name="shield" size={19} />
          </span>
          <span className="text-[17px] font-extrabold tracking-tight text-text">Prestige</span>
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-[13.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-[13.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
