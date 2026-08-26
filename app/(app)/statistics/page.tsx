import { redirect } from "next/navigation";
import { connection } from "next/server";

import { StatisticsDashboard } from "@/components/statistics/statistics-dashboard";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
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
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Insights"
        title="Statistics"
        description="See patterns in your Library, personal ratings, and watched history."
        className="mb-0"
      />

      <StatisticsDashboard result={statistics} />
    </PageContainer>
  );
}
