import { FileText, ScanSearch, FolderOpen, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function StatsCards() {
  const navigate = useNavigate();
  const [totalDocs, setTotalDocs] = useState(0);
  const [ocrDocs, setOcrDocs] = useState(0);
  const [categories, setCategories] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase
        .from("documents")
        .select("ocr_status, category");

      if (data) {
        setTotalDocs(data.length);
        setOcrDocs(data.filter((d) => d.ocr_status === "concluido").length);
        const uniqueCats = new Set(data.map((d) => d.category).filter(Boolean));
        setCategories(uniqueCats.size);
      }
    };
    fetchStats();
  }, []);

  const stats = [
    {
      icon: FileText,
      badge: String(totalDocs),
      badgeColor: "bg-info/10 text-info",
      label: "Documentos Digitalizados",
      value: String(totalDocs),
    },
    {
      icon: ScanSearch,
      badge: String(ocrDocs),
      badgeColor: "bg-success/10 text-success",
      label: "Com OCR Pesquisável",
      value: String(ocrDocs),
    },
    {
      icon: FolderOpen,
      badge: String(categories),
      badgeColor: "bg-accent/10 text-accent",
      label: "Categorias",
      value: String(categories),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-xl p-5 border border-border shadow-sm animate-fade-in"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${stat.badgeColor}`}>
              {stat.badge}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
          <p className="text-2xl font-bold font-display text-foreground">{stat.value}</p>
        </div>
      ))}

      <button
        type="button"
        onClick={() => navigate("/upload")}
        className="bg-card rounded-xl p-5 border-2 border-dashed border-accent/40 shadow-sm flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent/5 transition-colors group animate-fade-in"
      >
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center group-hover:scale-105 transition-transform">
          <Plus className="w-6 h-6 text-accent-foreground" />
        </div>
        <span className="text-sm font-semibold text-accent">Novo Documento</span>
      </button>
    </div>
  );
}
