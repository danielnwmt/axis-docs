import { FileText, ScanSearch, PenTool, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StatData {
  icon: typeof FileText;
  label: string;
  value: number;
  subtitle: string;
  trend: string;
  trendUp: boolean;
  iconBg: string;
  iconColor: string;
}

export function StatsCards() {
  const [totalDocs, setTotalDocs] = useState(0);
  const [ocrDocs, setOcrDocs] = useState(0);
  const [signedDocs, setSignedDocs] = useState(0);
  const [pendingSign, setPendingSign] = useState(0);

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
      }
    };
    fetchStats();
  }, []);

  const stats: StatData[] = [
    {
      icon: FileText,
      label: "Total de documentos",
      value: totalDocs,
      subtitle: "12 novos hoje",
      trend: "+8% este mês",
      trendUp: true,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      icon: ScanSearch,
      label: "OCR Processado",
      value: ocrDocs,
      subtitle: "5 processados hoje",
      trend: "+12% este mês",
      trendUp: true,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      icon: PenTool,
      label: "Documentos Assinados",
      value: signedDocs,
      subtitle: "3 assinados hoje",
      trend: "+5% este mês",
      trendUp: true,
      iconBg: "bg-accent/10",
      iconColor: "text-accent",
    },
    {
      icon: AlertTriangle,
      label: "Assinaturas Pendentes",
      value: pendingSign,
      subtitle: pendingSign > 0 ? "Ação necessária" : "Tudo em dia",
      trend: pendingSign > 0 ? "Requer atenção" : "Sem pendências",
      trendUp: pendingSign === 0,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-xl p-5 border border-border shadow-sm animate-fade-in"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold font-display text-foreground leading-none">
                {stat.value.toLocaleString("pt-BR")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{stat.subtitle}</p>
              <div className={`flex items-center gap-1 mt-1.5 text-xs ${stat.trendUp ? "text-success" : "text-warning"}`}>
                {stat.trendUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>{stat.trend}</span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-lg ${stat.iconBg} flex items-center justify-center shrink-0 ml-3`}>
              <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
            </div>
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-3 uppercase tracking-wide">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
