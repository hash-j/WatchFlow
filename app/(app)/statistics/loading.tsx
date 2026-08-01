export default function StatisticsLoading() {
  return (
    <div
      className="mx-auto max-w-7xl space-y-8"
      aria-busy="true"
      aria-live="polite"
    >
      <header>
        <p className="text-sm font-medium text-muted-foreground">
          Personal viewing insights
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Statistics</h1>
        <p className="sr-only">Loading your private viewing statistics.</p>
        <div className="mt-3 h-5 max-w-2xl animate-pulse rounded bg-muted" />
      </header>

      <section aria-labelledby="statistics-loading-summary">
        <h2 id="statistics-loading-summary" className="text-xl font-semibold">
          Library summary
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-xl border bg-card"
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <section key={index} aria-label="Loading statistics distribution">
            <div className="h-80 animate-pulse rounded-xl border bg-card" />
          </section>
        ))}
      </div>
      <section aria-label="Loading watched activity">
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
      </section>
    </div>
  );
}
