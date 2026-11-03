import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { countUnreadNotifications } from "@/lib/notifications/supabase-notifications";
import { getAuthContext } from "@/lib/supabase/auth";

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { user, profile, profileName, client } = await getAuthContext();
  const unreadNotificationCount = await countUnreadNotifications(
    client,
    user.id,
  );

  return (
    <AppShell
      email={user.email}
      profileName={profileName}
      ownerId={user.id}
      avatarPath={typeof profile?.avatar_url === "string" ? profile.avatar_url : null}
      unreadNotificationCount={unreadNotificationCount}
    >
      {children}
    </AppShell>
  );
}

function ShellLoading() {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-foreground" />
        Loading your WatchFlow workspace...
      </div>
    </div>
  );
}

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense fallback={<ShellLoading />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
