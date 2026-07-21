export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6" aria-busy="true">
      <span className="sr-only">Loading your workspace</span>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-9 w-56 rounded bg-muted" />
        <div className="h-5 w-full max-w-xl rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-36 rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}
