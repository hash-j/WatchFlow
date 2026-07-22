import Link from "next/link";
import { Bell, Database, SlidersHorizontal, UserRound } from "lucide-react";

const sections = [
  {
    href: "/settings/profile",
    title: "Profile",
    description: "Manage your name, country, and scheduling timezone.",
    icon: UserRound,
  },
  {
    href: "/settings/preferences",
    title: "Preferences",
    description: "Choose movie, library, display, and search defaults.",
    icon: SlidersHorizontal,
  },
  {
    href: "/settings/notifications",
    title: "Notifications",
    description: "Store reminder and summary choices for future delivery.",
    icon: Bell,
  },
  {
    href: "/settings/data",
    title: "Data and Privacy",
    description: "Export your data or use protected account controls.",
    icon: Database,
  },
] as const;

export default function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Settings overview</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Your profile, preferences, and private data controls stay scoped to your
        authenticated WatchFlow account.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {sections.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="mt-4 font-semibold group-hover:underline">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
