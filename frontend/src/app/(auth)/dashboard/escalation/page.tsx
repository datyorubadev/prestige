import { AdminOnly } from "@/components/ui/role-guard";
import { EscalationRules } from "@/components/admin/escalation-rules";

export default function DashboardEscalationPage() {
  return (
    <AdminOnly>
      <EscalationRules />
    </AdminOnly>
  );
}
