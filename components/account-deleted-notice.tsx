"use client";

import { useSearchParams } from "next/navigation";

export function AccountDeletedNotice() {
  const searchParams = useSearchParams();

  if (searchParams.get("accountDeleted") !== "1") {
    return null;
  }

  return (
    <div
      className="mx-auto mt-6 max-w-6xl px-4 text-sm text-muted-foreground sm:px-6"
      role="status"
    >
      Your WatchFlow account has been deleted.
    </div>
  );
}
