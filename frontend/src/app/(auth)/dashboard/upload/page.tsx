import { AdminOnly } from "@/components/ui/role-guard";
import { KnowledgeUpload } from "@/components/upload/knowledge-upload";

export default function UploadRoute() {
  return (
    <AdminOnly>
      <KnowledgeUpload />
    </AdminOnly>
  );
}
