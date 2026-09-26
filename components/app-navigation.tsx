"use client";

import { useEffect, useState } from "react";
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
  Bell,
  Search,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const navigationGroups = [
  {
    label: "Home",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Your movies",
    items: [
      { href: "/library", label: "Library", icon: Library },
      { href: "/watch-next", label: "Watch Next", icon: Clapperboard },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/lists", label: "Lists", icon: ListPlus },
    ],
  },
  {
    label: "Discover",
    items: [
      { href: "/search", label: "Search", icon: Search },
      { href: "/picker", label: "Movie Picker", icon: Dices },
      { href: "/recommendations", label: "Recommendations", icon: Sparkles },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/statistics", label: "Statistics", icon: ChartBarBig },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/import", label: "Import Movies", icon: FileUp },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const satisfies readonly NavigationGroup[];

export const navigation = navigationGroups.flatMap<NavigationItem>((group) => [
  ...group.items,
]);

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
  unreadCount = 0,
}: {
  onNavigate?: () => void;
  className?: string;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const [visibleUnreadCount, setVisibleUnreadCount] = useState(unreadCount);

  useEffect(() => {
    const updateUnreadCount = (event: Event) => {
      const nextUnreadCount = (event as CustomEvent<unknown>).detail;
      if (
        typeof nextUnreadCount === "number" &&
        Number.isSafeInteger(nextUnreadCount) &&
        nextUnreadCount >= 0
      ) {
        setVisibleUnreadCount(nextUnreadCount);
      }
    };

    window.addEventListener(
      "watchflow:notification-unread-count",
      updateUnreadCount,
    );
    return () =>
      window.removeEventListener(
        "watchflow:notification-unread-count",
        updateUnreadCount,
      );
  }, []);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn("flex min-w-0 flex-col gap-1 p-3", className)}
    >
      {navigationGroups.map((group) => {
        const groupId = `primary-navigation-${group.label.toLowerCase().replaceAll(" ", "-")}`;

        return (
          <div
            key={group.label}
            role="group"
            aria-labelledby={groupId}
            className="mt-3 first:mt-0"
          >
            <h2
              id={groupId}
              className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-sidebar-muted"
            >
              {group.label}
            </h2>
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
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
                      "flex min-h-11 min-w-0 items-center gap-3 rounded-r-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium text-sidebar-muted transition-[color,background-color,border-color] hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                      current &&
                        "border-sidebar-active bg-sidebar-foreground/[0.06] text-sidebar-active",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    {href === "/notifications" && visibleUnreadCount > 0 ? (
                      <span
                        className="min-w-5 rounded-full bg-sidebar-active px-1.5 py-0.5 text-center text-[0.6875rem] font-semibold leading-none text-rating-foreground"
                        aria-label={`${visibleUnreadCount} unread notifications`}
                      >
                        {visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
