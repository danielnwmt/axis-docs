import { AppLayout } from "@/components/layout/AppLayout";
import { HeroBanner } from "@/components/dashboard/HeroBanner";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecentDocuments } from "@/components/dashboard/RecentDocuments";
import { FrequentCategories } from "@/components/dashboard/FrequentCategories";

const Index = () => {
  return (
    <AppLayout>
      <HeroBanner />
      <div className="mb-1">
        <h1 className="text-2xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral do acervo documental</p>
      </div>
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
