import { redirect } from "next/navigation";
import { connection } from "next/server";

import { StatisticsDashboard } from "@/components/statistics/statistics-dashboard";
import { StatisticsAuthenticationError } from "@/lib/statistics/errors";
import { getPersonalStatistics } from "@/lib/statistics/supabase-statistics";

export default async function StatisticsPage() {
  await connection();
  let statistics;

  try {
    statistics = await getPersonalStatistics();
  } catch (error) {
    if (error instanceof StatisticsAuthenticationError) {
      redirect("/auth/login");
    }

    throw error;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">
          Personal viewing insights
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Statistics</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          A private, server-calculated view of the movies, ratings, and watched
          dates stored in your own WatchFlow library.
        </p>
      </header>

      <StatisticsDashboard result={statistics} />
    </div>
  );
}
