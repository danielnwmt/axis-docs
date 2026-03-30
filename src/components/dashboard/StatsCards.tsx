import { FileText, ScanSearch, PenTool, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function StatsCards() {
  const [totalDocs, setTotalDocs] = useState(0);
  const [ocrDocs, setOcrDocs] = useState(0);
  const [signedDocs, setSignedDocs] = useState(0);
  const [pendingOcr, setPendingOcr] = useState(0);
  const [pendingSign, setPendingSign] = useState(0);
  const [ocrError, setOcrError] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase
        .from("documents")
        .select("ocr_status, sign_status");
      if (data) {
        setTotalDocs(data.length);
        setOcrDocs(data.filter((d) => d.ocr_status === "concluido").length);
        setSignedDocs(data.filter((d) => d.sign_status === "assinado").length);
        setPendingSign(data.filter((d) => d.sign_status === "pendente").length);
        setPendingOcr(data.filter((d) => d.ocr_status === "pendente").length);
        setOcrError(data.filter((d) => d.ocr_status === "erro").length);
      }
    };
    fetchStats();
  }, []);

  const ocrPercent = totalDocs > 0 ? Math.round((ocrDocs / totalDocs) * 100) : 0;

  const stats = [
    {
      label: "Total de documentos",
      value: totalDocs,
      subtitle: "12 novos hoje",
      trend: "↑ +8% este mês",
      trendColor: "text-success",
      icon: FileText,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      label: "OCR processado",
      value: ocrDocs,
      subtitle: `${ocrPercent}% do acervo`,
      trend: "↑ +12% este mês",
      trendColor: "text-success",
      icon: ScanSearch,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      label: "Documentos assinados",
      value: signedDocs,
      subtitle: `${pendingSign} pendentes`,
      trend: "↑ +5% este mês",
      trendColor: "text-success",
      icon: PenTool,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      label: "Pendências OCR",
      value: pendingOcr,
      subtitle: `${ocrError} com erro`,
      trend: pendingOcr > 0 ? "↓ -3% este mês" : "Sem pendências",
      trendColor: pendingOcr > 0 ? "text-warning" : "text-success",
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
          {stat.trend && (
            <p className={`text-xs font-medium mt-0.5 ${stat.trendColor}`}>{stat.trend}</p>
          )}
        </div>
      ))}
    </div>
  );
}
