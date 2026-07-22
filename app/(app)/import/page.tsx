import { ImportWizard } from "@/components/import/import-wizard";
import { getAuthContext } from "@/lib/supabase/auth";

export default async function ImportPage() {
  await getAuthContext();

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-medium text-muted-foreground">WatchFlow</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Import Movies</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Bring up to 500 movies from a Google Sheets CSV into your private
        library. Nothing is saved until you review the matches and confirm.
      </p>
      <ImportWizard />
    </div>
  );
}
