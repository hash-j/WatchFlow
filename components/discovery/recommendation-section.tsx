import type { RecommendationSection as RecommendationSectionValue } from "@/lib/discovery/types";

import { RecommendationCard } from "./recommendation-card";

export function RecommendationSection({
  section,
}: {
  section: RecommendationSectionValue;
}) {
  const headingId = `recommendation-section-${section.id}`;

  return (
    <section aria-labelledby={headingId}>
      <div>
        <h2 id={headingId} className="text-xl font-semibold">
          {section.title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {section.description}
        </p>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item) => (
          <RecommendationCard key={item.movie.userMovieId} item={item} />
        ))}
      </div>
    </section>
  );
}
