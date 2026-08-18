"use client";

import { useSyncExternalStore } from "react";
import { redirect, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

const subscribeEmpty = () => () => {};

/** Authenticated shell — guards all routes in the (auth) group.
 *
 * Enforces the login gate plus role-segment boundaries so each surface matches
 * the signed-in role: /admin (super admin), /dashboard (owner + agent) and
 * /portal (customer). A customer landing on /dashboard or an owner on /admin is
 * bounced to their own home instead of rendering a 403-everywhere shell.
 * Impersonation is exempt so the super-admin "view as tenant" flow is preserved.
 *
 * Gating happens after hydration (not during SSR) so that hard-navigating to
 * a protected deep link like /dashboard/tickets?email=… keeps the URL instead
 * of being bounced to /login and losing the query string. The server snapshot
 * of the session is always null, so SSR just renders an empty shell. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, role, impersonating } = useAuth();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribeEmpty, () => true, () => false);

  if (user && !impersonating) {
    const tenantId = user.tenantId ?? "t1";
    if (role === "customer") {
      if (
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/widget")
      ) {
        redirect(`/portal/${tenantId}`);
      }
    } else if (role === "super_admin") {
      if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/tickets")) {
        redirect("/admin");
      }
    } else if (pathname.startsWith("/admin")) {
      redirect("/dashboard");
    }
  }

  if (pathname.startsWith("/portal")) {
    if (user) {
      return <AppShell>{children}</AppShell>;
    }
    // Allow guest access to the customer portal & help center without staff login redirect
    return <>{children}</>;
  }

  if (user) return <AppShell>{children}</AppShell>;
  if (!hydrated) return null;
  redirect("/login");
}
