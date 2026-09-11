import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CalendarClock,
  LibraryBig,
  ListChecks,
  Sparkles,
} from "lucide-react";

import { FinishSetupForm } from "@/components/onboarding/finish-setup-form";
import { OnboardingMovieAddForm } from "@/components/onboarding/movie-add-form";
import { OnboardingMovieSearchForm } from "@/components/onboarding/movie-search-form";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { PersonalizeForm } from "@/components/onboarding/personalize-form";
import { SkipSetupForm } from "@/components/onboarding/skip-setup-form";
import { MoviePoster } from "@/components/movies/movie-poster";
import { Button } from "@/components/ui/button";
import {
  EmptyMovieQueryError,
  MovieProviderError,
  MovieSearchValidationError,
} from "@/lib/movies/errors";
import { getMovieReleaseYear } from "@/lib/movies/images";
import { searchTmdbMoviesForCurrentUser } from "@/lib/movies/server-search";
import {
  authenticateOnboarding,
  countOwnedOnboardingMovies,
  hasVerifiedEmail,
  readOnboardingProfile,
  readOwnedOnboardingMovieStates,
} from "@/lib/onboarding/supabase-onboarding";
import { parseOnboardingStep } from "@/lib/onboarding/types";
import { readUserPreferences } from "@/lib/settings/supabase-settings";

type OnboardingPageProps = {
  searchParams: Promise<{
    step?: string | string[];
    q?: string | string[];
  }>;
};

const benefits = [
  {
    title: "Build your movie library",
    description: "Save movies you love, have watched, or want to see.",
    icon: LibraryBig,
  },
  {
    title: "Plan what to watch next",
    description: "Keep a clear queue and schedule movie nights in your timezone.",
    icon: CalendarClock,
  },
  {
    title: "Keep everything together",
    description: "Ratings, lists, schedules, statistics, and recommendations stay private.",
    icon: ListChecks,
  },
] as const;

function WelcomeStep() {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8 lg:p-10">
      <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="size-4" aria-hidden="true" />
        Welcome to WatchFlow
      </p>
      <h1 className="mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        Your movie life, organized in one private place.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
        Organize what you want to watch, decide what comes next, and keep track of what you&apos;ve already seen.
      </p>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {benefits.map(({ title, description, icon: Icon }) => (
          <li key={title} className="min-w-0 rounded-xl bg-muted/60 p-4">
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-3 border-t pt-5 min-[420px]:flex-row min-[420px]:items-center">
        <Button asChild className="w-full min-[420px]:w-auto">
          <Link href="/onboarding?step=2">Get started</Link>
        </Button>
        <SkipSetupForm />
      </div>
    </section>
  );
}

async function FirstMoviesStep({
  query,
  client,
  userId,
  libraryCount,
}: {
  query: string | undefined;
  client: SupabaseClient;
  userId: string;
  libraryCount: number;
}) {
  let results: Awaited<ReturnType<typeof searchTmdbMoviesForCurrentUser>> = [];
  let searchError: string | null = null;

  if (query !== undefined) {
    try {
      results = await searchTmdbMoviesForCurrentUser(query);
    } catch (error) {
      searchError =
        error instanceof EmptyMovieQueryError ||
        error instanceof MovieSearchValidationError ||
        error instanceof MovieProviderError
          ? error.message
          : "Movie search is unavailable right now. Please try again.";
    }
  }

  const existing = await readOwnedOnboardingMovieStates(
    client,
    userId,
    results.map((movie) => movie.tmdbId),
  );

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6 lg:p-8">
      <div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Build your first library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Search for a few movies you love, have watched, or want to watch. Three is a useful start, never a requirement.
          </p>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {libraryCount} {libraryCount === 1 ? "movie" : "movies"} saved to your library
      </p>
      <OnboardingMovieSearchForm initialQuery={query ?? ""} />

      {searchError ? (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p className="text-sm text-destructive">{searchError}</p>
        </div>
      ) : query !== undefined && results.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed p-6 text-center">
          <h2 className="font-semibold">No movies found</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try another title or check the spelling.</p>
        </div>
      ) : results.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {results.map((movie) => (
            <article key={movie.tmdbId} data-tmdb-id={movie.tmdbId} className="flex min-w-0 gap-4 rounded-xl border p-3 sm:p-4">
              <div className="w-24 shrink-0 sm:w-28">
                <MoviePoster path={movie.posterPath} title={movie.title} sizes="112px" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="font-semibold leading-tight">{movie.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getMovieReleaseYear(movie.releaseDate) ?? "Year unavailable"}
                </p>
                <OnboardingMovieAddForm
                  tmdbId={movie.tmdbId}
                  title={movie.title}
                  existingStatus={existing.get(movie.tmdbId) ?? null}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Search by title when you&apos;re ready. You can also finish with no movies and add them later.
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
        <Button asChild variant="outline" className="w-full min-[420px]:w-auto">
          <Link href="/onboarding?step=2">Back</Link>
        </Button>
        <div className="flex min-w-0 flex-col gap-2 min-[420px]:items-end">
          <FinishSetupForm />
          <SkipSetupForm />
        </div>
      </div>
    </section>
  );
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  await connection();
  const [session, params] = await Promise.all([
    authenticateOnboarding(),
    searchParams,
  ]);

  if (!session) redirect("/auth/login");
  if (!hasVerifiedEmail(session.user)) redirect("/auth/verify-email");

  const profile = await readOnboardingProfile(session.client, session.user.id);
  if (profile.completed || !profile.profileExists) redirect("/dashboard");

  const step = parseOnboardingStep(params.step);
  const queryValue = Array.isArray(params.q) ? params.q[0] : params.q;
  const [preferences, libraryCount] = await Promise.all([
    readUserPreferences(session.client, session.user.id),
    countOwnedOnboardingMovies(session.client, session.user.id),
  ]);

  return (
    <OnboardingShell step={step}>
      {step === 1 ? (
        <WelcomeStep />
      ) : step === 2 ? (
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Make WatchFlow feel like yours</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose three defaults that already shape schedules, search, and your Library. Everything remains editable in Settings.
          </p>
          <div className="mt-7 border-t pt-6">
            <PersonalizeForm
              preferences={{
                timezone: profile.timezone,
                defaultLibraryView: preferences.defaultLibraryView,
                preferredLanguage: preferences.preferredLanguage,
              }}
            />
          </div>
        </section>
      ) : (
        <FirstMoviesStep
          query={queryValue}
          client={session.client}
          userId={session.user.id}
          libraryCount={libraryCount}
        />
      )}
    </OnboardingShell>
  );
}
