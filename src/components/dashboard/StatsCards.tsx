import { FileText, ScanSearch, PenTool, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function StatsCards() {
  const [totalDocs, setTotalDocs] = useState(0);
  const [ocrDocs, setOcrDocs] = useState(0);
  const [signedDocs, setSignedDocs] = useState(0);
  const [pendingOcr, setPendingOcr] = useState(0);
  const [pendingSign, setPendingSign] = useState(0);
  const [ocrError, setOcrError] = useState(0);
  const [newToday, setNewToday] = useState(0);
  const [monthGrowth, setMonthGrowth] = useState(0);
  const [ocrToday, setOcrToday] = useState(0);
  const [signedThisMonth, setSignedThisMonth] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase
        .from("documents")
        .select("ocr_status, sign_status, created_at");
      if (data) {
        setTotalDocs(data.length);
        setOcrDocs(data.filter((d) => d.ocr_status === "concluido").length);
        setSignedDocs(data.filter((d) => d.sign_status === "assinado").length);
        setPendingSign(data.filter((d) => d.sign_status === "pendente").length);
        setPendingOcr(data.filter((d) => d.ocr_status === "pendente").length);
        setOcrError(data.filter((d) => d.ocr_status === "erro").length);

        // Novos hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDocs = data.filter((d) => new Date(d.created_at) >= today);
        setNewToday(todayDocs.length);

        // OCR concluído hoje
        setOcrToday(todayDocs.filter((d) => d.ocr_status === "concluido").length);

        // Assinados este mês
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setSignedThisMonth(data.filter((d) => d.sign_status === "assinado" && new Date(d.created_at) >= monthStart).length);

        // Crescimento mensal (%)
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        const thisMonthDocs = data.filter((d) => new Date(d.created_at) >= monthStart).length;
        const lastMonthDocs = data.filter((d) => {
          const dt = new Date(d.created_at);
          return dt >= lastMonthStart && dt <= lastMonthEnd;
        }).length;
        if (lastMonthDocs > 0) {
          setMonthGrowth(Math.round(((thisMonthDocs - lastMonthDocs) / lastMonthDocs) * 100));
        } else {
          setMonthGrowth(thisMonthDocs > 0 ? 100 : 0);
        }
      }
    };
    fetchStats();
  }, []);

  const ocrPercent = totalDocs > 0 ? Math.round((ocrDocs / totalDocs) * 100) : 0;
  const signedPercent = totalDocs > 0 ? Math.round((signedDocs / totalDocs) * 100) : 0;

  const stats = [
    {
      label: "Total de documentos",
      value: totalDocs,
      subtitle: newToday > 0 ? `${newToday} novos hoje` : "No acervo",
      trend: monthGrowth,
      trendLabel: "este mês",
      icon: FileText,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      label: "OCR processado",
      value: ocrDocs,
      subtitle: totalDocs > 0 ? `${ocrPercent}% do acervo` : "Nenhum documento",
      trend: ocrToday > 0 ? ocrToday : null,
      trendLabel: ocrToday > 0 ? `processados hoje` : "",
      icon: ScanSearch,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      label: "Documentos assinados",
      value: signedDocs,
      subtitle: totalDocs > 0 ? `${signedPercent}% do acervo` : "Nenhum documento",
      trend: pendingSign > 0 ? pendingSign : null,
      trendLabel: pendingSign > 0 ? "pendentes" : "",
      icon: PenTool,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      label: "Pendências OCR",
      value: pendingOcr,
      subtitle: ocrError > 0 ? `${ocrError} com erro` : "Sem erros",
      trend: null,
      trendLabel: "",
      icon: AlertCircle,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
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
          {stat.trend !== null && stat.trend !== 0 && (
            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${
              typeof stat.trend === "number" && stat.label === "Total de documentos"
                ? stat.trend > 0 ? "text-success" : "text-destructive"
                : stat.label === "Documentos assinados" ? "text-warning" : "text-success"
            }`}>
              {stat.label === "Total de documentos" && (
                <>
                  {stat.trend > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>↑ +{Math.abs(stat.trend)}% {stat.trendLabel}</span>
                </>
              )}
              {stat.label !== "Total de documentos" && (
                <span>{stat.trend} {stat.trendLabel}</span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
