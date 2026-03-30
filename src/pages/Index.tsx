import { AppLayout } from "@/components/layout/AppLayout";
import { HeroBanner } from "@/components/dashboard/HeroBanner";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecentDocuments } from "@/components/dashboard/RecentDocuments";
import { FrequentCategories } from "@/components/dashboard/FrequentCategories";

const Index = () => {
  return (
    <AppLayout>
      <HeroBanner />
      <StatsCards />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <RecentDocuments />
        </div>
        <div>
          <FrequentCategories />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
