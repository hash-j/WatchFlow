"use client";

import Link from "next/link";
import { Bell, CalendarDays, Database, SlidersHorizontal, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/settings/profile", label: "Profile", icon: UserRound },
  {
    href: "/settings/preferences",
    label: "Preferences",
    icon: SlidersHorizontal,
  },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings/data", label: "Data & Account", icon: Database },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  // The /settings overview already lists every section as a card; rendering
  // the section nav there would show the same five links twice.
  if (pathname === "/settings") return null;

  return (
    <nav
      aria-label="Settings sections"
      className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border bg-card p-2 shadow-sm sm:grid-cols-3 lg:grid-cols-1"
    >
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:px-3",
            pathname === href && "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="min-w-0 break-words">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
