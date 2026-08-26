export default function OnboardingLoading() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-4" aria-busy="true">
      <div className="w-full max-w-3xl space-y-5">
        <span className="sr-only">Loading onboarding</span>
        <div className="h-12 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl border bg-card" />
      </div>
    </main>
  );
}
