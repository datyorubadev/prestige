"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { WidgetChat } from "@/components/widget/widget-chat";
import type { Tenant } from "@/lib/types";

const FALLBACK_TENANT: Tenant = {
  id: "t1",
  name: "Prestige Support",
  slug: "prestige",
  email: "support@prestige.ng",
  status: "active",
  plan: "starter",
  agents: 3,
  customers: 500,
  kbMb: 5,
  volume30d: 20,
  color: "#00a86b",
  tone: "professional",
  city: "Lagos",
  botName: "Prestige AI",
  welcomeMessage: "Hello! How can we help you today?",
  launcherText: "Chat with us",
  widgetPosition: "bottom-right",
  escalationMessage: "Connecting you to a live agent...",
  mobileFullscreen: true,
  proactiveTeaser: "",
  secondaryColor: "#2563eb",
  agentsOnline: 1,
};

function EmbedContent() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "t1";
  const position = (searchParams.get("position") as "bottom-right" | "bottom-left") ?? "bottom-right";
  const color = searchParams.get("color");

  const [tenant, setTenant] = useState<Tenant>(() => ({
    ...FALLBACK_TENANT,
    ...(color ? { color } : {}),
  }));

  useEffect(() => {
    let active = true;
    api
      .get<Tenant>(`/tenants/${tenantId}/public`)
      .then((t) => active && setTenant(color ? { ...t, color } : t))
      .catch(() => {
        api
          .get<Tenant>(`/tenants/${tenantId}`)
          .then((t) => active && setTenant(color ? { ...t, color } : t))
          .catch(() => {});
      });
    return () => {
      active = false;
    };
  }, [tenantId, color]);

  return (
    <div
      className={`fixed inset-0 overflow-hidden bg-transparent flex flex-col justify-end p-2 ${
        position === "bottom-left" ? "items-start" : "items-end"
      }`}
    >
      <WidgetChat
        tenant={tenant}
        positionOverride={position}
        isEmbed={true}
        onToggleOpen={(isOpen) => {
          window.parent.postMessage({ type: "PRESTIGE_WIDGET_STATE", open: isOpen }, "*");
        }}
      />
    </div>
  );
}

export default function WidgetEmbedPage() {
  return (
    <Suspense fallback={null}>
      <EmbedContent />
    </Suspense>
  );
}
