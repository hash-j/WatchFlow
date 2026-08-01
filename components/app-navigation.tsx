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

const navigation = [
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

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="flex gap-2 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible"
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
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
