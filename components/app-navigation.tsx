"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChartBarBig,
  Clapperboard,
  Dices,
  FileUp,
  LayoutDashboard,
  Library,
  ListPlus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search Movies", icon: Search },
  { href: "/library", label: "My Library", icon: Library },
  { href: "/statistics", label: "Statistics", icon: ChartBarBig },
  { href: "/lists", label: "My Lists", icon: ListPlus },
  { href: "/picker", label: "Movie Picker", icon: Dices },
  { href: "/recommendations", label: "Recommendations", icon: Sparkles },
  { href: "/import", label: "Import Movies", icon: FileUp },
  { href: "/watch-next", label: "Watch Next", icon: Clapperboard },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function getNavigationTitle(pathname: string) {
  const match = navigation.find(
    ({ href }) =>
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(`${href}/`)),
  );

  return match?.label ?? "WatchFlow";
}

export function AppNavigation({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className={cn("flex min-w-0 flex-col gap-1 p-3", className)}
    >
      {navigation.map(({ href, label, icon: Icon }) => {
        const current =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
