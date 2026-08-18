import { AdminOnly } from "@/components/ui/role-guard";
import { SettingsHub } from "@/components/settings/settings-hub";

export default function DashboardSettingsPage() {
  return (
    <AdminOnly>
      <SettingsHub />
    </AdminOnly>
  );
}
