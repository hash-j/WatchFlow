export default function PickerLoading() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-6"
      aria-busy="true"
      aria-label="Loading the movie picker"
    >
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="h-[28rem] animate-pulse rounded-xl bg-muted sm:h-[34rem]" />
        <div className="h-[22rem] animate-pulse rounded-xl bg-muted sm:h-[28rem]" />
      </div>
    </div>
  );
}
