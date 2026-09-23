import { Suspense } from "react";
import { Clapperboard } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { redirect } from "next/navigation";

import { CreateListDialog } from "@/components/lists/create-list-dialog";
import { ListCard } from "@/components/lists/list-card";
import {
  getSafeListLoadError,
  ListLoadError,
} from "@/components/lists/list-load-error";
import { ListsAuthenticationError } from "@/lib/lists/errors";
import { getCustomListSummaries } from "@/lib/lists/supabase-lists";

type ListsPageProps = {
  searchParams: Promise<{
    create?: string | string[];
    deleted?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ListsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading your custom lists</span>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
    </div>
  );
}

async function ListsContent({ searchParams }: ListsPageProps) {
  const params = await searchParams;
  let lists;

  try {
    lists = await getCustomListSummaries();
  } catch (error) {
    if (error instanceof ListsAuthenticationError) {
      redirect("/auth/login");
    }

    return <ListLoadError message={getSafeListLoadError(error)} />;
  }

  const createOpen = first(params.create) === "1";
  const listDeleted = first(params.deleted) === "1";

  return (
    <div className="space-y-6">
      {listDeleted ? (
        <p
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          role="status"
        >
          List deleted. Its movies remain in your personal library.
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {lists.length} {lists.length === 1 ? "list" : "lists"} total
          </p>
        </div>
        <CreateListDialog defaultOpen={createOpen} />
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center sm:p-10">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rating text-rating-foreground shadow-sm">
            <Clapperboard className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">
            You have not created any Lists yet.
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Lists are custom collections, unlike the ordered Watch Next queue.
            Try Weekend Movies, Family Favourites, or Best Thrillers.
          </p>
          <div className="mt-6 flex justify-center">
            <CreateListDialog
              idPrefix="empty-create-list"
              triggerLabel="Create your first list"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((list, index) => (
            <ListCard
              key={list.id}
              list={list}
              isFirst={index === 0}
              isLast={index === lists.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ListsPage({ searchParams }: ListsPageProps) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Your movies"
        title="Lists"
        description="Group Library movies into private custom collections. Use Watch Next for your immediate ordered queue."
      />

      <Suspense fallback={<ListsLoading />}>
        <ListsContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
