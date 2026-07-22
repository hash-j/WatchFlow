export default function ImportLoading() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true">
      <span className="sr-only">Loading CSV importer</span>
      <div className="h-9 w-52 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-96 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
