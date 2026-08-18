import { AdminOnly } from "@/components/ui/role-guard";
import { AgentsManager } from "@/components/admin/agents";

export default function DashboardAgentsPage() {
  return (
    <AdminOnly>
      <AgentsManager />
    </AdminOnly>
  );
}
