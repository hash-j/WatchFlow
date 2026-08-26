import { redirect } from "next/navigation";

import { SettingsNav } from "@/components/settings/settings-nav";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { authenticateSettings } from "@/lib/settings/supabase-settings";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authenticateSettings();
  if (!session) redirect("/auth/login");

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="Your account"
        title="Settings"
        description="Manage your profile, preferences, future notifications, and private data."
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
