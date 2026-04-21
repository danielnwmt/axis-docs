import { PieChart as PieIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "hsl(var(--info))",
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--success))",
  "hsl(220 70% 50%)",
];

export function CategoryDonutChart() {
  const { data = [] } = useQuery({
    queryKey: ["category-donut"],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("category");
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach((d) => {
        const c = d.category || "Sem categoria";
        counts[c] = (counts[c] || 0) + 1;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value]) => ({ name, value }));
    },
  });

  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in h-full">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <PieIcon className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display font-semibold text-foreground">
          Distribuição por categoria
        </h3>
      </div>
      <div className="p-5 h-[320px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Nenhum documento cadastrado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => {
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                  return [`${value} (${pct}%)`, "Documentos"];
                }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                iconSize={10}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
