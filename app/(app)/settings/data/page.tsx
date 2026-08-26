import { CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";

import {
  DeleteAccountControl,
  DeleteLibraryControl,
  ExportControls,
} from "@/components/settings/data-controls";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

type DataSettingsPageProps = {
  searchParams: Promise<{ libraryDeleted?: string | string[] }>;
};

export default async function DataSettingsPage({
  searchParams,
}: DataSettingsPageProps) {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");

  const deletedValue = (await searchParams).libraryDeleted;
  const deleted = Array.isArray(deletedValue) ? deletedValue[0] : deletedValue;
  const deletedCount = deleted && /^\d+$/.test(deleted) ? Number(deleted) : null;

  return (
    <div className="space-y-6">
      {deletedCount !== null ? (
        <div
          className="flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          role="status"
        >
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          Deleted {deletedCount} Library {deletedCount === 1 ? "movie" : "movies"}.
          Your account remains active.
        </div>
      ) : null}

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Data & Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a private copy of your data or review permanent account controls.
        </p>
      </div>

      <ExportControls />

      <section aria-labelledby="danger-zone-heading" className="space-y-4">
        <div>
          <h2 id="danger-zone-heading" className="text-xl font-semibold">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These actions are permanent. Read each warning and confirm the exact
            scope before continuing.
          </p>
        </div>
        <DeleteLibraryControl count={data.libraryCount} />
        <DeleteAccountControl />
      </section>
    </div>
  );
}
