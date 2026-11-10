import { SettingsNav } from "@/components/settings/settings-nav";
import { PublicInformationLinks } from "@/components/public-information";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { getAuthContext } from "@/lib/supabase/auth";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getAuthContext();

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="Your account"
        title="Settings"
        description="Manage your profile, preferences, notifications, calendar, and private data."
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
      <div className="mt-8 border-t pt-4 text-muted-foreground">
        <PublicInformationLinks label="Help and policies" />
      </div>
    </PageContainer>
  );
}
