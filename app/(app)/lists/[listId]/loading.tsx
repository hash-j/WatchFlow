export default function ListDetailLoadingPage() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse" aria-busy="true">
      <span className="sr-only">Loading custom list</span>
      <div className="h-5 w-28 rounded bg-muted" />
      <div className="mt-6 h-44 rounded-xl border bg-card" />
      <div className="mt-8 h-7 w-48 rounded bg-muted" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-36 rounded-xl border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
