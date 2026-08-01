import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested WatchFlow page does not exist or is no longer
          available.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          Return Home
        </Link>
      </div>
    </main>
  );
}
