import { AppLayout } from "@/components/layout/AppLayout";
import { HeroBanner } from "@/components/dashboard/HeroBanner";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecentDocuments } from "@/components/dashboard/RecentDocuments";
import { RecentSearches } from "@/components/dashboard/RecentSearches";
import { PendingAlerts } from "@/components/dashboard/PendingAlerts";
import { FrequentCategories } from "@/components/dashboard/FrequentCategories";

const Index = () => {
  return (
    <AppLayout>
      <HeroBanner />
      <StatsCards />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <RecentDocuments />
        <RecentSearches />
        <PendingAlerts />
      </div>
      <div className="mt-6">
        <FrequentCategories />
      </div>
    </AppLayout>
  );
};

export default Index;
