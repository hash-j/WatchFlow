export default function ListsLoadingPage() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse" aria-busy="true">
      <span className="sr-only">Loading your custom lists</span>
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="mt-3 h-10 w-52 rounded bg-muted" />
      <div className="mt-3 h-5 max-w-2xl rounded bg-muted" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-80 rounded-xl border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
