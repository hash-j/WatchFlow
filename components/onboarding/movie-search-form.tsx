"use client";

import { type FormEvent, useState, useTransition } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OnboardingMovieSearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!normalized) {
      setError("Enter a movie title to search.");
      return;
    }

    setError(null);
    startTransition(() => {
      router.push(`/onboarding?step=3&q=${encodeURIComponent(normalized)}`);
    });
  }

  return (
    <form onSubmit={submit} role="search" className="mt-5">
      <label htmlFor="onboarding-movie-query" className="block text-sm font-medium">
        Movie title
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <Input
          id="onboarding-movie-query"
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try Inception or Spirited Away"
          autoComplete="off"
          maxLength={120}
          aria-describedby={error ? "onboarding-query-error" : undefined}
        />
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className="w-full sm:w-32"
        >
          {isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Search aria-hidden="true" />
          )}
          {isPending ? "Searching" : "Search"}
        </Button>
      </div>
      <div className="min-h-6 pt-1" aria-live="polite">
        {error ? (
          <p id="onboarding-query-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : isPending ? (
          <p className="text-sm text-muted-foreground">Searching for movies</p>
        ) : null}
      </div>
    </form>
  );
}
