import Link from "next/link";
import {
  CalendarDays,
  Clapperboard,
  FileUp,
  LayoutDashboard,
  Library,
  ListPlus,
  Search,
  Settings,
} from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search Movies", icon: Search },
  { href: "/library", label: "My Library", icon: Library },
  { href: "/lists", label: "My Lists", icon: ListPlus },
  { href: "/import", label: "Import Movies", icon: FileUp },
  { href: "/watch-next", label: "Watch Next", icon: Clapperboard },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

type AppShellProps = {
  children: React.ReactNode;
  email: string | null;
  profileName: string | null;
};

export function AppShell({ children, email, profileName }: AppShellProps) {
  const identity = profileName ?? email ?? "WatchFlow member";

  return (
    <div className="min-h-svh bg-muted/30 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="border-b bg-background lg:sticky lg:top-0 lg:h-svh lg:border-b-0 lg:border-r">
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
            <div className="lg:hidden">
              <ThemeSwitcher />
            </div>
          </div>

          <nav
            aria-label="Primary navigation"
            className="flex gap-2 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible"
          >
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="hidden border-t p-4 lg:block">
            <p className="truncate text-sm font-medium">{identity}</p>
            {profileName && email ? (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <LogoutButton />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{identity}</p>
            <p className="text-xs text-muted-foreground">Your movie workspace</p>
          </div>
          <div className="lg:hidden">
            <LogoutButton />
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
