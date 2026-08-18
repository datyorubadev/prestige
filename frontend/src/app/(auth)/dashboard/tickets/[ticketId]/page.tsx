"use client";

import { useParams } from "next/navigation";
import { TicketDetail } from "@/components/inbox/ticket-detail";

/** Step 2 of the two-step inbox — opens a single ticket's workspace. */
export default function TicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  return <TicketDetail ticketId={params?.ticketId ?? ""} />;
}
