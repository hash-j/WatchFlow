import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { AppNavigation } from "@/components/app-navigation";
import { LogoutButton } from "@/components/logout-button";
import { MobileAppNavigation } from "@/components/mobile-app-navigation";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserAvatar } from "@/components/artwork/user-avatar";

type AppShellProps = {
  children: React.ReactNode;
  email: string | null;
  profileName: string | null;
  unreadNotificationCount?: number;
  ownerId?: string;
  avatarPath?: string | null;
};

export function AppShell({
  children,
  email,
  profileName,
  unreadNotificationCount = 0,
  ownerId,
  avatarPath,
}: AppShellProps) {
  const identity = profileName ?? email ?? "WatchFlow member";

  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r border-white/10 bg-sidebar text-sidebar-foreground lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between gap-4 border-b border-white/10 px-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-sidebar-active text-rating-foreground">
                <Clapperboard className="size-4" aria-hidden="true" />
              </span>
              WatchFlow
            </Link>
          </div>

          <AppNavigation
            key={`desktop-notifications-${unreadNotificationCount}`}
            className="flex-1 overflow-y-auto"
            unreadCount={unreadNotificationCount}
          />

          <div className="border-t border-white/10 p-4">
            <UserAvatar ownerId={ownerId} path={avatarPath} name={profileName} email={email} className="mb-3" />
            <p className="break-words text-sm font-medium">{identity}</p>
            {profileName && email ? (
              <p className="break-all text-xs text-sidebar-muted">{email}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <LogoutButton className="border-white/20 bg-transparent text-sidebar-foreground hover:border-white/30 hover:bg-white/10 hover:text-sidebar-foreground" />
              <ThemeSwitcher className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground" />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <MobileAppNavigation
          key={`mobile-notifications-${unreadNotificationCount}`}
          identity={identity}
          email={email}
          unreadCount={unreadNotificationCount}
          ownerId={ownerId}
          avatarPath={avatarPath}
        />
        <main className="min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
