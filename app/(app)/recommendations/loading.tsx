export default function RecommendationsLoading() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-8"
      aria-busy="true"
      aria-label="Loading rule-based recommendations"
    >
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <section key={sectionIndex} className="space-y-4">
          <div className="h-8 w-72 animate-pulse rounded bg-muted" />
          <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((__, cardIndex) => (
              <div
                key={cardIndex}
                className="h-[24rem] animate-pulse rounded-xl bg-muted sm:h-[28rem]"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
