import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function MovieNotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold">Movie not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This movie is not in your library, or the supplied movie ID is invalid.
      </p>
      <Button asChild className="mt-6">
        <Link href="/library">Return to your library</Link>
      </Button>
    </div>
  );
}
