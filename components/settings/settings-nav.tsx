import Link from "next/link";
import { Bell, Database, SlidersHorizontal, UserRound } from "lucide-react";

const links = [
  { href: "/settings/profile", label: "Profile", icon: UserRound },
  {
    href: "/settings/preferences",
    label: "Preferences",
    icon: SlidersHorizontal,
  },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/data", label: "Data and Privacy", icon: Database },
] as const;

export function SettingsNav() {
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-2 overflow-x-auto rounded-xl border bg-card p-2 shadow-sm lg:flex-col"
    >
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
