"use client";

import { FormEvent, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MovieSearchForm() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  return <MovieSearchFormFields key={urlQuery} initialQuery={urlQuery} />;
}

function MovieSearchFormFields({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim().replace(/\s+/g, " ");

    if (!normalized) {
      setError("Enter a movie title to search.");
      return;
    }

    setError(null);
    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(normalized)}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="mt-6 max-w-2xl">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="movie-query" className="sr-only">
            Movie title
          </label>
          <Input
            id="movie-query"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by movie title"
            autoComplete="off"
            aria-describedby={error ? "movie-query-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={isPending} className="w-full sm:min-w-32 sm:w-auto">
          <Search className="mr-2 size-4" aria-hidden="true" />
          {isPending ? "Searching..." : "Search"}
        </Button>
      </div>
      {error ? (
        <p id="movie-query-error" className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
