import { ImportWizard } from "@/components/import/import-wizard";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { getAuthContext } from "@/lib/supabase/auth";

export default async function ImportPage() {
  await getAuthContext();

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="Account tool"
        title="Import Movies"
        description="Move an existing collection into your private Library from a CSV file. WatchFlow helps match each row before anything is saved."
        className="mb-0"
      />
      <ImportWizard />
    </PageContainer>
  );
}
