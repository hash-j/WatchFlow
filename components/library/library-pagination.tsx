import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  buildLibraryUrl,
  type LibraryPagination as LibraryPaginationState,
  type LibraryQueryState,
} from "@/lib/library/query";
import { cn } from "@/lib/utils";

type PageItem = number | "ellipsis";

export function getVisibleLibraryPages(
  currentPage: number,
  totalPages: number,
): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const result: PageItem[] = [];

  for (const page of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }

  return result;
}

export function LibraryPagination({
  state,
  pagination,
}: {
  state: LibraryQueryState;
  pagination: LibraryPaginationState;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  const previousDisabled = pagination.page <= 1;
  const nextDisabled = pagination.page >= pagination.totalPages;
  const pages = getVisibleLibraryPages(
    pagination.page,
    pagination.totalPages,
  );

  return (
    <nav
      className="mt-8 grid grid-cols-2 gap-2 min-[480px]:flex min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:justify-center"
      aria-label="Library pagination"
    >
      {previousDisabled ? (
        <button
          type="button"
          disabled
          className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full min-[480px]:w-auto`}
          aria-label="Previous library page"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </button>
      ) : (
        <Link
          href={buildLibraryUrl(state, { page: pagination.page - 1 })}
          className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full min-[480px]:w-auto`}
          aria-label="Previous library page"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </Link>
      )}

      {pages.map((page, index) =>
        page === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="hidden size-11 items-center justify-center min-[480px]:inline-flex"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Link
            key={page}
            href={buildLibraryUrl(state, { page })}
            aria-current={page === pagination.page ? "page" : undefined}
            aria-label={`Library page ${page}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "hidden min-[480px]:inline-flex",
              page === pagination.page && "bg-accent font-bold",
            )}
          >
            {page}
          </Link>
        ),
      )}

      {nextDisabled ? (
        <button
          type="button"
          disabled
          className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full min-[480px]:w-auto`}
          aria-label="Next library page"
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <Link
          href={buildLibraryUrl(state, { page: pagination.page + 1 })}
          className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full min-[480px]:w-auto`}
          aria-label="Next library page"
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}

