import Link from "next/link";
import { Icon } from "@/components/icons";

/** Footer — standard SaaS footer: page links only (no console or dashboard
 *  routes), no border, no demo badges. */
export function SiteFooter() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
                <Icon name="shield" size={19} />
              </span>
              <span className="text-[17px] font-extrabold tracking-tight text-text">Prestige</span>
            </div>
            <p className="mt-4 max-w-[240px] text-[13px] leading-relaxed text-text-3">
              Multi-tenant AI customer support - one calm inbox for every brand
              you serve.
            </p>
          </div>

          <nav aria-label="Product">
            <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-text-3">Product</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Product", href: "#product" },
                { label: "Features", href: "#features" },
                { label: "Pricing", href: "#pricing" },
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-[13.5px] font-medium text-text-2 transition-colors duration-150 hover:text-text"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Customers">
            <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-text-3">Customers</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Customers", href: "#testimonials" },
                { label: "FAQ", href: "#faq" },
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-[13.5px] font-medium text-text-2 transition-colors duration-150 hover:text-text"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Get started">
            <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-text-3">Get started</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Sign in", href: "/login" },
                { label: "Create account", href: "/register" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[13.5px] font-medium text-text-2 transition-colors duration-150 hover:text-text"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-[12.5px] text-text-3">
            © {new Date().getFullYear()} Prestige. All rights reserved.
          </p>
          <p className="text-[12.5px] text-text-3">
            Built with Next.js, TypeScript and a calm design system.
          </p>
        </div>
      </div>
    </footer>
  );
}
