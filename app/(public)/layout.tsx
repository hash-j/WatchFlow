import Link from "next/link";
import { Suspense } from "react";

import {
  PublicHeaderAuthAction,
  PublicHeaderSignInLink,
} from "@/components/public-header-auth-action";

export default function PublicInformationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="rounded-sm text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">WatchFlow</Link>
          <Suspense fallback={<PublicHeaderSignInLink />}>
            <PublicHeaderAuthAction />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}
