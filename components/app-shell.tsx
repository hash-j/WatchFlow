import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { AppNavigation } from "@/components/app-navigation";
import { LogoutButton } from "@/components/logout-button";
import { MobileAppNavigation } from "@/components/mobile-app-navigation";
import { ThemeSwitcher } from "@/components/theme-switcher";

type AppShellProps = {
  children: React.ReactNode;
  email: string | null;
  profileName: string | null;
};

export function AppShell({ children, email, profileName }: AppShellProps) {
  const identity = profileName ?? email ?? "WatchFlow member";

  return (
    <div className="min-h-svh bg-muted/30 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r bg-background lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between gap-4 border-b px-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Clapperboard className="size-4" aria-hidden="true" />
              </span>
              WatchFlow
            </Link>
          </div>

          <AppNavigation className="flex-1 overflow-y-auto" />

          <div className="border-t p-4">
            <p className="break-words text-sm font-medium">{identity}</p>
            {profileName && email ? (
              <p className="break-all text-xs text-muted-foreground">{email}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <LogoutButton />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <MobileAppNavigation identity={identity} email={email} />
        <main className="min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
