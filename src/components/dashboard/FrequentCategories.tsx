import { Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CategoryStat {
  name: string;
  count: number;
  percentage: number;
}

const barColors = [
  "bg-info",
  "bg-success",
  "bg-warning",
  "bg-accent",
  "bg-primary",
  "bg-destructive",
];

export function FrequentCategories() {
  const [categories, setCategories] = useState<CategoryStat[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("documents")
        .select("category");

      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((d) => {
          const cat = d.category || "Sem categoria";
          counts[cat] = (counts[cat] || 0) + 1;
        });
        const total = data.length || 1;
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, count]) => ({
            name,
            count,
            percentage: Math.round((count / total) * 100),
          }));
        setCategories(sorted);
      }
    };
    fetchCategories();
  }, []);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-display font-semibold text-foreground">Categorias Frequentes</h3>
      </div>
      <div className="p-5 space-y-4">
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma categoria encontrada.</p>
        )}
        {categories.map((cat, i) => (
          <div key={cat.name}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{cat.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{cat.count} docs · {cat.percentage}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColors[i % barColors.length]} transition-all duration-500`}
                style={{ width: `${cat.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
