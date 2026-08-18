import { AdminOnly } from "@/components/ui/role-guard";
import { AiToolsTab } from "@/components/settings/ai-tools-tab";

export default function DashboardToolsPage() {
  return (
    <AdminOnly>
      <AiToolsTab />
    </AdminOnly>
  );
}
