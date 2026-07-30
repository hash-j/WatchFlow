import { Suspense } from "react";
import { Dices } from "lucide-react";
import { redirect } from "next/navigation";

import {
  DiscoveryLoadError,
  getSafeDiscoveryLoadError,
} from "@/components/discovery/discovery-load-error";
import { MoviePicker } from "@/components/discovery/movie-picker";
import { DiscoveryAuthenticationError } from "@/lib/discovery/errors";
import {
  getAvailableGenres,
  parsePickerSearchParams,
} from "@/lib/discovery/picker";
import { getDiscoveryDataset } from "@/lib/discovery/supabase-discovery";
import type { RawPickerSearchParams } from "@/lib/discovery/types";

type PickerPageProps = {
  searchParams: Promise<RawPickerSearchParams>;
};

function PickerContentLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading the private movie picker</span>
      <div className="h-96 animate-pulse rounded-2xl border bg-card" />
    </div>
  );
}

async function PickerContent({ searchParams }: PickerPageProps) {
  try {
    const [dataset, rawParams] = await Promise.all([
      getDiscoveryDataset(),
      searchParams,
    ]);
    const availableGenres = getAvailableGenres(dataset.movies);
    const parsed = parsePickerSearchParams(rawParams, availableGenres);

    return (
      <MoviePicker
        key={JSON.stringify(parsed.filters)}
        initialFilters={parsed.filters}
        availableGenres={availableGenres}
        initialWarnings={parsed.warnings}
        libraryCount={dataset.totalCount}
        libraryTruncated={dataset.truncated}
      />
    );
  } catch (error) {
    if (error instanceof DiscoveryAuthenticationError) {
      redirect("/auth/login");
    }

    return (
      <DiscoveryLoadError
        message={getSafeDiscoveryLoadError(error)}
        retryHref="/picker"
      />
    );
  }
}

export default function PickerPage(props: PickerPageProps) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Dices className="size-4" aria-hidden="true" />
          Private library discovery
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Movie Picker
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Choose transparent filters, then let WatchFlow randomly select one
          eligible movie from your own library. No movie is changed by being
          picked.
        </p>
      </header>

      <Suspense fallback={<PickerContentLoading />}>
        <PickerContent {...props} />
      </Suspense>
    </div>
  );
}
