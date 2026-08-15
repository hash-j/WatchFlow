import { ImportWizard } from "@/components/import/import-wizard";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { getAuthContext } from "@/lib/supabase/auth";

export default async function ImportPage() {
  await getAuthContext();

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="WatchFlow"
        title="Import Movies"
        description="Bring up to 500 movies from a Google Sheets CSV into your private library. Nothing is saved until you review the matches and confirm."
        className="mb-0"
      />
      <ImportWizard />
    </PageContainer>
  );
}
