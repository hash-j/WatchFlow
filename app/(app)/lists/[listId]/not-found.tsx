import Link from "next/link";
import { FolderX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ListNotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
      <FolderX
        className="mx-auto size-10 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="mt-4 text-2xl font-semibold">List not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This private list is unavailable, or the supplied list ID is invalid.
      </p>
      <Button asChild className="mt-6">
        <Link href="/lists">Return to My Lists</Link>
      </Button>
    </div>
  );
}
