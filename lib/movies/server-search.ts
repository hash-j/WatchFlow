import "server-only";

import { enforceTmdbRateLimit } from "@/lib/movies/rate-limit";
import { tmdbMovieProvider } from "@/lib/movies/tmdb-provider";
import { validateMovieSearchQuery } from "@/lib/movies/validation";
import { readUserPreferences } from "@/lib/settings/supabase-settings";
import { getAuthContext } from "@/lib/supabase/auth";

const inFlightSearches = new Map<
  string,
  ReturnType<typeof tmdbMovieProvider.searchMovies>
>();

export async function searchTmdbMoviesForCurrentUser(query: string) {
  const normalizedQuery = validateMovieSearchQuery(query);
  const { client, user } = await getAuthContext();

  const preferences = await readUserPreferences(client, user.id);
  const options = {
    includeAdult: preferences.showAdultResults,
    includeUnreleased: preferences.includeUnreleasedMovies,
    language: preferences.preferredLanguage,
  };
  const key = [
    user.id,
    normalizedQuery.toLocaleLowerCase("en-US"),
    options.includeAdult ? "adult" : "standard",
    options.includeUnreleased ? "all-releases" : "released",
    options.language,
  ].join(":");
  const active = inFlightSearches.get(key);
  if (active) {
    return active;
  }

  const pending = (async () => {
    await enforceTmdbRateLimit(client, "search");
    return tmdbMovieProvider.searchMovies(normalizedQuery, options);
  })().finally(() => {
    inFlightSearches.delete(key);
  });
  inFlightSearches.set(key, pending);
  return pending;
}
