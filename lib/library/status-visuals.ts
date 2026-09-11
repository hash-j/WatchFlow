import {
  Bookmark,
  CalendarClock,
  CheckCircle2,
  ListStart,
  PauseCircle,
  PlayCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { LibraryMovieStatus } from "../movies/types";

export type MovieStatusVisual = {
  label: string;
  icon: LucideIcon;
  badgeClasses: string;
  cardAccentClasses: string;
  description: string;
};

export const MOVIE_STATUS_VISUALS: Record<
  LibraryMovieStatus,
  MovieStatusVisual
> = {
  want_to_watch: {
    label: "Saved",
    icon: Bookmark,
    badgeClasses: "border-border bg-muted text-foreground",
    cardAccentClasses: "border-border",
    description: "Saved to watch later.",
  },
  watch_next: {
    label: "Watch Next",
    icon: ListStart,
    badgeClasses:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200",
    cardAccentClasses: "border-blue-300/70 dark:border-blue-900",
    description: "Added to the ordered Watch Next queue.",
  },
  scheduled: {
    label: "Scheduled",
    icon: CalendarClock,
    badgeClasses:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    cardAccentClasses: "border-amber-300/70 dark:border-amber-900",
    description: "A viewing time has been scheduled.",
  },
  currently_watching: {
    label: "Currently Watching",
    icon: PlayCircle,
    badgeClasses:
      "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900 dark:bg-purple-950/60 dark:text-purple-200",
    cardAccentClasses: "border-purple-300/70 dark:border-purple-900",
    description: "Viewing is currently in progress.",
  },
  watched: {
    label: "Watched",
    icon: CheckCircle2,
    badgeClasses:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    cardAccentClasses:
      "border-emerald-400/80 ring-1 ring-emerald-300/50 dark:border-emerald-800 dark:ring-emerald-900",
    description: "This movie has been watched.",
  },
  on_hold: {
    label: "On Hold (legacy)",
    icon: PauseCircle,
    badgeClasses: "border-border bg-muted text-muted-foreground",
    cardAccentClasses: "border-border",
    description: "Legacy status retained for an existing library record.",
  },
  dropped: {
    label: "Dropped (legacy)",
    icon: XCircle,
    badgeClasses: "border-border bg-muted text-muted-foreground",
    cardAccentClasses: "border-border",
    description: "Legacy status retained for an existing library record.",
  },
};
