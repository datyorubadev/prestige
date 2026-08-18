"use client";

import { useParams } from "next/navigation";
import { CustomerChat } from "@/components/portal/customer-chat";

/** Canonical tenant chat route: /[tenantSlug]/chat (e.g. /nairawave/chat) */
export default function TenantChatPage() {
  const params = useParams<{ tenantSlug: string }>();
  return <CustomerChat tenantId={params?.tenantSlug ?? "nairawave"} />;
}
