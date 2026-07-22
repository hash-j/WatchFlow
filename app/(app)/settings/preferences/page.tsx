import { redirect } from "next/navigation";

import { PreferencesForm } from "@/components/settings/preferences-form";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

export default async function PreferencesSettingsPage() {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Application preferences</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These defaults apply when a URL or form does not explicitly choose a
        different value.
      </p>
      <div className="mt-6 border-t pt-6">
        <PreferencesForm preferences={data.preferences} />
      </div>
    </section>
  );
}
