export default function PickerLoading() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-6"
      aria-busy="true"
      aria-label="Loading the movie picker"
    >
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="h-[34rem] animate-pulse rounded-xl bg-muted" />
        <div className="h-[28rem] animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
