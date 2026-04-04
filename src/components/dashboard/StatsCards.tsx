import { FileText, ScanSearch, PenTool, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function computeStats(data: { ocr_status: string; sign_status: string; created_at: string }[]) {
  const totalDocs = data.length;
  const ocrDocs = data.filter((d) => d.ocr_status === "concluido").length;
  const signedDocs = data.filter((d) => d.sign_status === "assinado").length;
  const pendingOcr = data.filter((d) => d.ocr_status === "pendente").length;
  const ocrError = data.filter((d) => d.ocr_status === "erro").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newToday = data.filter((d) => new Date(d.created_at) >= today).length;

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const calcGrowth = (filterFn: (d: typeof data[0]) => boolean) => {
    const thisM = data.filter((d) => new Date(d.created_at) >= monthStart && filterFn(d)).length;
    const lastM = data.filter((d) => {
      const dt = new Date(d.created_at);
      return dt >= lastMonthStart && dt <= lastMonthEnd && filterFn(d);
    }).length;
    if (lastM > 0) return Math.round(((thisM - lastM) / lastM) * 100);
    return thisM > 0 ? 100 : 0;
  };

  return {
    totalDocs, ocrDocs, signedDocs, pendingOcr, ocrError, newToday,
    monthGrowth: calcGrowth(() => true),
    ocrGrowth: calcGrowth((d) => d.ocr_status === "concluido"),
    signGrowth: calcGrowth((d) => d.sign_status === "assinado"),
    pendingGrowth: calcGrowth((d) => d.ocr_status === "pendente" || d.ocr_status === "erro"),
  };
}

export function StatsCards() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("ocr_status, sign_status, created_at");
      return computeStats(data || []);
    },
  });

  const s = stats || { totalDocs: 0, ocrDocs: 0, signedDocs: 0, pendingOcr: 0, ocrError: 0, newToday: 0, monthGrowth: 0, ocrGrowth: 0, signGrowth: 0, pendingGrowth: 0 };
  const ocrPercent = s.totalDocs > 0 ? Math.round((s.ocrDocs / s.totalDocs) * 100) : 0;
  const signedPercent = s.totalDocs > 0 ? Math.round((s.signedDocs / s.totalDocs) * 100) : 0;

  const cards = [
    {
      label: "Total de documentos",
      value: s.totalDocs,
      subtitle: s.newToday > 0 ? `${s.newToday} novos hoje` : "No acervo",
      trend: s.monthGrowth,
      icon: FileText,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      label: "OCR processado",
      value: s.ocrDocs,
      subtitle: s.totalDocs > 0 ? `${ocrPercent}% do acervo` : "Nenhum documento",
      trend: s.ocrGrowth,
      icon: ScanSearch,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      label: "Documentos assinados",
      value: s.signedDocs,
      subtitle: s.totalDocs > 0 ? `${signedPercent}% do acervo` : "Nenhum documento",
      trend: s.signGrowth,
      icon: PenTool,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      label: "Pendências OCR",
      value: s.pendingOcr,
      subtitle: s.ocrError > 0 ? `${s.ocrError} com erro` : "Sem erros",
      trend: s.pendingGrowth,
      icon: AlertCircle,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-xl px-5 py-4 border border-border shadow-sm animate-fade-in"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
            <div className={`w-8 h-8 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
              <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
            </div>
          </div>
          <p className="text-3xl font-bold font-display text-foreground leading-none">
            {stat.value.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">{stat.subtitle}</p>
          {stat.trend !== 0 && (
            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${
              stat.trend > 0 ? "text-success" : "text-destructive"
            }`}>
              {stat.trend > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{stat.trend > 0 ? "+" : ""}{stat.trend}% este mês</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
