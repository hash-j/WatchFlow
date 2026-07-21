type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">WatchFlow</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      </div>

      <section className="rounded-xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-medium">Coming in a later phase</p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          This route is ready inside the authenticated application shell. Its
          product functionality has intentionally not been implemented in
          Phase 1.
        </p>
      </section>
    </div>
  );
}
