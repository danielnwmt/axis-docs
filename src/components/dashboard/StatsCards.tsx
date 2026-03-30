import { FileText, ScanSearch, PenTool, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StatData {
  icon: typeof FileText;
  label: string;
  value: number;
  trend: string;
  trendUp: boolean;
  badgeColor: string;
  iconBg: string;
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
        .select("ocr_status, sign_status");

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
      label: "Total de Documentos",
      value: totalDocs,
      trend: "+12% este mês",
      trendUp: true,
      badgeColor: "text-success",
      iconBg: "bg-info/10",
    },
    {
      icon: ScanSearch,
      label: "OCR Processado",
      value: ocrDocs,
      trend: "+8% este mês",
      trendUp: true,
      badgeColor: "text-success",
      iconBg: "bg-success/10",
    },
    {
      icon: PenTool,
      label: "Documentos Assinados",
      value: signedDocs,
      trend: "+5 hoje",
      trendUp: true,
      badgeColor: "text-success",
      iconBg: "bg-accent/10",
    },
    {
      icon: AlertTriangle,
      label: "Assinaturas Pendentes",
      value: pendingSign,
      trend: pendingSign > 0 ? "Ação necessária" : "Tudo em dia",
      trendUp: pendingSign === 0,
      badgeColor: pendingSign > 0 ? "text-warning" : "text-success",
      iconBg: "bg-warning/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-xl p-5 border border-border shadow-sm animate-fade-in"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`w-10 h-10 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display text-foreground">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          <div className={`flex items-center gap-1 mt-2 text-xs ${stat.badgeColor}`}>
            {stat.trendUp ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>{stat.trend}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
