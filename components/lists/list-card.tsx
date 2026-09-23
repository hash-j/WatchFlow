import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CustomListSummary } from "@/lib/lists/types";

import { EditListDialog } from "./edit-list-dialog";
import { ListPosterCollage } from "./list-poster-collage";
import { ListSummaryOrderControls } from "./list-summary-order-controls";

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

export function ListCard({
  list,
  isFirst,
  isLast,
}: {
  list: CustomListSummary;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-sm">
      <ListPosterCollage
        posterPaths={list.posterPaths}
        listName={list.name}
      />

      <div className="flex-1 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-lg font-semibold">
            {list.name}
          </h2>
          <Badge variant="outline" className="gap-1">
            <LockKeyhole className="size-3" aria-hidden="true" />
            Private
          </Badge>
        </div>

        {list.description ? (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
            {list.description}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No description added.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Movies</dt>
            <dd className="font-medium">{list.movieCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last updated</dt>
            <dd className="font-medium">{formatListDate(list.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 border-t pt-4">
        <Button asChild size="sm">
          <Link href={`/lists/${list.id}`}>Open List</Link>
        </Button>
        <EditListDialog list={list} compact />
        <ListSummaryOrderControls
          listId={list.id}
          listName={list.name}
          isFirst={isFirst}
          isLast={isLast}
        />
      </div>
    </article>
  );
}
