"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { mockApi } from "@/lib/mock";
import { WidgetChat } from "@/components/widget/widget-chat";
import { DEMO_TENANT_SLUG } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

/** Floating AI chat — the real product widget fixed bottom-right, exactly how
 *  a normal website embeds its assistant. Loads the demo tenant (nairawave); if the
 *  live backend isn't reachable (dev default is mock data), falls back to the
 *  prototype dataset so the launcher always appears. */
export function FloatingChat() {
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Tenant | null>(`/tenants/${DEMO_TENANT_SLUG}`)
      .then((t) => {
        if (active && t) setTenant(t);
      })
      .catch(async () => {
        const t = await mockApi.tenant(DEMO_TENANT_SLUG);
        if (active && t) setTenant(t);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {tenant ? <WidgetChat key={tenant.id} tenant={tenant} /> : null}
    </div>
  );
}
