import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function DocumentsTrendChart() {
  const { data: chartData = [] } = useQuery({
    queryKey: ["documents-trend"],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("created_at, category");
      if (!data) return [];

      // últimos 12 meses
      const now = new Date();
      const months: { key: string; label: string; year: number; month: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`,
          year: d.getFullYear(),
          month: d.getMonth(),
        });
      }

      // categorias top 4
      const catCounts: Record<string, number> = {};
      data.forEach((d) => {
        const c = d.category || "Sem categoria";
        catCounts[c] = (catCounts[c] || 0) + 1;
      });
      const topCats = Object.entries(catCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([n]) => n);

      return months.map((m) => {
        const row: Record<string, string | number> = { name: m.label };
        topCats.forEach((cat) => {
          row[cat] = data.filter((d) => {
            const dt = new Date(d.created_at);
            const cc = d.category || "Sem categoria";
            return dt.getFullYear() === m.year && dt.getMonth() === m.month && cc === cat;
          }).length;
        });
        row.Total = data.filter((d) => {
          const dt = new Date(d.created_at);
          return dt.getFullYear() === m.year && dt.getMonth() === m.month;
        }).length;
        return row;
      });
    },
  });

  const categoryKeys =
    chartData.length > 0
      ? Object.keys(chartData[0]).filter((k) => k !== "name" && k !== "Total")
      : [];

  const colors = [
    "hsl(var(--info))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(var(--destructive))",
    "hsl(var(--primary))",
  ];

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display font-semibold text-foreground">
          Evolução de documentos (12 meses)
        </h3>
      </div>
      <div className="p-5 h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              stroke="hsl(var(--border))"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Line
              type="monotone"
              dataKey="Total"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            {categoryKeys.map((cat, i) => (
              <Line
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
