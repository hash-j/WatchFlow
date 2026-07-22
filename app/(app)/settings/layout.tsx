import { redirect } from "next/navigation";

import { SettingsNav } from "@/components/settings/settings-nav";
import { authenticateSettings } from "@/lib/settings/supabase-settings";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authenticateSettings();
  if (!session) redirect("/auth/login");

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Your account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Manage your private profile, WatchFlow defaults, and account data.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
