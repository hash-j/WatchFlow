import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

const LIBRARY_DERIVED_PATHS = [
  ["/dashboard"],
  ["/library"],
  ["/library/[movieId]", "page"],
  ["/statistics"],
  ["/watch-next"],
  ["/schedule"],
  ["/lists"],
  ["/lists/[listId]", "page"],
  ["/picker"],
  ["/recommendations"],
] as const;

export function revalidateLibraryDerivedViews(options: {
  movieDetails?: boolean;
} = {}) {
  after(() => {
    for (const [path, type] of LIBRARY_DERIVED_PATHS) {
      if (path === "/library/[movieId]" && options.movieDetails === false) {
        continue;
      }

      if (type) {
        revalidatePath(path, type);
      } else {
        revalidatePath(path);
      }
    }
  });
}

export function revalidateQueueViews() {
  revalidatePath("/dashboard");
  revalidatePath("/watch-next");
}

export function revalidateListViews(options: {
  allMovieDetails?: boolean;
} = {}) {
  after(() => {
    revalidatePath("/lists");
    revalidatePath("/lists/[listId]", "page");

    if (options.allMovieDetails) {
      revalidatePath("/library/[movieId]", "page");
    }
  });
}

export function revalidateListOrderViews() {
  revalidatePath("/lists");
}

export function revalidateNotificationViews() {
  revalidatePath("/notifications");
  after(() => revalidatePath("/", "layout"));
}

export function revalidateOnboardingPreferenceViews() {
  after(() => {
    for (const path of [
      "/onboarding",
      "/dashboard",
      "/search",
      "/library",
      "/schedule",
      "/statistics",
    ]) {
      revalidatePath(path);
    }
  });
}

export function revalidateApplicationPreferenceViews() {
  after(() => {
    for (const path of [
      "/dashboard",
      "/search",
      "/library",
      "/schedule",
      "/statistics",
      "/settings/preferences",
    ]) {
      revalidatePath(path);
    }
  });
}
