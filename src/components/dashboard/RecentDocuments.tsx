import { FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface Doc {
  title: string;
  category: string;
  date: string;
  ocrStatus: string;
  signStatus: string;
}

function StatusBadge({ signStatus }: { signStatus: string }) {
  if (signStatus === "assinado") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success border border-success/30 bg-success/5 px-2.5 py-0.5 rounded-full whitespace-nowrap">
        Assinado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning border border-warning/30 bg-warning/5 px-2.5 py-0.5 rounded-full whitespace-nowrap">
      Pendente
    </span>
  );
}

export function RecentDocuments() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDocs = async () => {
      const { data } = await supabase
        .from("documents")
        .select("title, category, created_at, ocr_status, sign_status")
        .order("created_at", { ascending: false })
        .limit(5);

      if (data) {
        setDocs(
          data.map((d) => ({
            title: d.title,
            category: d.category || "Sem categoria",
            date: format(new Date(d.created_at), "dd/MM/yyyy", { locale: ptBR }),
            ocrStatus: d.ocr_status,
            signStatus: d.sign_status,
          }))
        );
      }
    };
    fetchDocs();
  }, []);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-foreground">Documentos recentes</h3>
        </div>
        <button
          onClick={() => navigate("/documents")}
          className="text-xs font-medium text-info hover:underline"
        >
          Ver todos
        </button>
      </div>
      <div className="divide-y divide-border">
        {docs.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">Nenhum documento encontrado.</p>
        )}
        {docs.map((doc, i) => (
          <div key={doc.title + i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-secondary/50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
              <p className="text-xs text-muted-foreground">{doc.category} · {doc.date}</p>
            </div>
            <StatusBadge ocrStatus={doc.ocrStatus} signStatus={doc.signStatus} />
          </div>
        ))}
      </div>
    </div>
  );
}
