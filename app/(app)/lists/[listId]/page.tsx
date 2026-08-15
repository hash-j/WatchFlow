import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowLeft,
  CalendarDays,
  FolderOpen,
  LockKeyhole,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { AddMoviesDialog } from "@/components/lists/add-movies-dialog";
import { DeleteListDialog } from "@/components/lists/delete-list-dialog";
import { EditListDialog } from "@/components/lists/edit-list-dialog";
import {
  getSafeListLoadError,
  ListLoadError,
} from "@/components/lists/list-load-error";
import { ListMovieRow } from "@/components/lists/list-movie-row";
import { Badge } from "@/components/ui/badge";
import {
  PageContainer,
  ResponsiveActions,
} from "@/components/ui/responsive-layout";
import {
  ListsAuthenticationError,
  ListsNotFoundError,
} from "@/lib/lists/errors";
import { getCustomListDetail } from "@/lib/lists/supabase-lists";
import {
  listUuidSchema,
  parseListPickerState,
} from "@/lib/lists/validation";

type ListDetailPageProps = {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{
    add?: string | string[];
    created?: string | string[];
    listQuery?: string | string[];
    listStatus?: string | string[];
    listFavourite?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatListDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function DetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading custom list</span>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-xl border bg-card"
        />
      ))}
    </div>
  );
}

async function ListDetailContent({
  params,
  searchParams,
}: ListDetailPageProps) {
  const [{ listId: rawListId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const parsedListId = listUuidSchema.safeParse(rawListId);
  if (!parsedListId.success) {
    notFound();
  }

  const listId = parsedListId.data;
  const picker = parseListPickerState(query);
  const pickerOpen = first(query.add) === "1";
  let data;

  try {
    data = await getCustomListDetail(listId, picker, pickerOpen);
  } catch (error) {
    if (error instanceof ListsAuthenticationError) {
      redirect("/auth/login");
    }

    if (error instanceof ListsNotFoundError) {
      notFound();
    }

    return <ListLoadError message={getSafeListLoadError(error)} />;
  }

  if (!data) {
    notFound();
  }

  const created = first(query.created) === "1";

  return (
    <div className="space-y-8">
      {created ? (
        <p
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          role="status"
        >
          Your private list was created.
        </p>
      ) : null}

      <header className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <LockKeyhole className="size-3" aria-hidden="true" />
                Private
              </Badge>
              <span className="text-sm text-muted-foreground">
                {data.movies.length}{" "}
                {data.movies.length === 1 ? "movie" : "movies"}
              </span>
            </div>
            <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
              {data.list.name}
            </h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              {data.list.description ?? "No description added."}
            </p>
          </div>

          <ResponsiveActions className="lg:w-auto">
            <AddMoviesDialog
              listId={data.list.id}
              listName={data.list.name}
              candidates={data.candidates}
              candidateTotal={data.candidateTotal}
              picker={data.picker}
              open={pickerOpen}
            />
            <EditListDialog list={data.list} />
            <DeleteListDialog
              list={data.list}
              movieCount={data.movies.length}
            />
          </ResponsiveActions>
        </div>

        <dl className="mt-6 grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarDays
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {formatListDate(data.list.createdAt)}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <dt className="text-muted-foreground">Last updated</dt>
              <dd className="font-medium">
                {formatListDate(data.list.updatedAt)}
              </dd>
            </div>
          </div>
        </dl>
      </header>

      <section aria-labelledby="list-movies-heading">
        <h2
          id="list-movies-heading"
          tabIndex={-1}
          className="text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Movies in this list
        </h2>

        {data.movies.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed bg-card p-8 text-center">
            <FolderOpen
              className="mx-auto size-10 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-lg font-semibold">This list is empty</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Add one or more movies from your personal library. A movie can
              belong to several custom lists.
            </p>
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {data.movies.map((item, index) => (
              <ListMovieRow
                key={item.listMovieId}
                item={item}
                listName={data.list.name}
                isFirst={index === 0}
                isLast={index === data.movies.length - 1}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function ListDetailPage(props: ListDetailPageProps) {
  return (
    <PageContainer className="max-w-6xl">
      <Link
        href="/lists"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to My Lists
      </Link>
      <Suspense fallback={<DetailLoading />}>
        <ListDetailContent {...props} />
      </Suspense>
    </PageContainer>
  );
}
