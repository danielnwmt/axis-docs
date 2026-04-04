import { FolderOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function FrequentCategories() {
  const { data: categories = [] } = useQuery({
    queryKey: ["frequent-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("category");
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach((d) => {
        const cat = d.category || "Sem categoria";
        counts[cat] = (counts[cat] || 0) + 1;
      });
      const max = Math.max(...Object.values(counts), 1);
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({
          name,
          count,
          percentage: Math.round((count / max) * 100),
        }));
    },
  });

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in h-full">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display font-semibold text-foreground">Categorias mais usadas</h3>
      </div>
      <div className="p-5 space-y-5">
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma categoria encontrada.</p>
        )}
        {categories.map((cat) => (
          <div key={cat.name}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground">{cat.name}</span>
              <span className="text-sm font-semibold text-foreground">{cat.count}</span>
            </div>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-info transition-all duration-500"
                style={{ width: `${cat.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
