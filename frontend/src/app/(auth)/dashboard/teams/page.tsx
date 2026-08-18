import { AdminOnly } from "@/components/ui/role-guard";
import { TeamsManager } from "@/components/admin/teams";

export default function DashboardTeamsPage() {
  return (
    <AdminOnly>
      <TeamsManager />
    </AdminOnly>
  );
}
