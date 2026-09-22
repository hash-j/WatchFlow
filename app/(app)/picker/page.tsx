import { Suspense } from "react";
import { Dices } from "lucide-react";
import { redirect } from "next/navigation";

import {
  DiscoveryLoadError,
  getSafeDiscoveryLoadError,
} from "@/components/discovery/discovery-load-error";
import { MoviePicker } from "@/components/discovery/movie-picker";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { DiscoveryAuthenticationError } from "@/lib/discovery/errors";
import {
  parsePickerSearchParams,
} from "@/lib/discovery/picker";
import { getPickerSetupData } from "@/lib/discovery/supabase-discovery";
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
  let content:
    | {
        status: "ready";
        filters: ReturnType<typeof parsePickerSearchParams>["filters"];
        availableGenres: string[];
        warnings: ReturnType<typeof parsePickerSearchParams>["warnings"];
        libraryCount: number;
        libraryTruncated: boolean;
      }
    | { status: "error"; message: string };

  try {
    const [setup, rawParams] = await Promise.all([
      getPickerSetupData(),
      searchParams,
    ]);
    const parsed = parsePickerSearchParams(rawParams, setup.availableGenres);

    content = {
      status: "ready",
      filters: parsed.filters,
      availableGenres: setup.availableGenres,
      warnings: parsed.warnings,
      libraryCount: setup.totalCount,
      libraryTruncated: setup.truncated,
    };
  } catch (error) {
    if (error instanceof DiscoveryAuthenticationError) {
      redirect("/auth/login");
    }

    content = { status: "error", message: getSafeDiscoveryLoadError(error) };
  }

  if (content.status === "error") {
    return (
      <DiscoveryLoadError
        message={content.message}
        retryHref="/picker"
      />
    );
  }

  return (
    <MoviePicker
      key={JSON.stringify(content.filters)}
      initialFilters={content.filters}
      availableGenres={content.availableGenres}
      initialWarnings={content.warnings}
      libraryCount={content.libraryCount}
      libraryTruncated={content.libraryTruncated}
    />
  );
}

export default function PickerPage(props: PickerPageProps) {
  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2"><Dices className="size-4" aria-hidden="true" />Discover</span>}
        title="Movie Picker"
        description="Can’t decide? Let WatchFlow pick from your own Library, with optional filters you control."
      />

      <Suspense fallback={<PickerContentLoading />}>
        <PickerContent {...props} />
      </Suspense>
    </PageContainer>
  );
}
