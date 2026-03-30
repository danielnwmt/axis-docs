import { FileText, CheckCircle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Doc {
  name: string;
  category: string;
  time: string;
  signStatus: string;
}

export function RecentDocuments() {
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    const fetchDocs = async () => {
      const { data } = await supabase
        .from("documents")
        .select("title, category, created_at, sign_status")
        .order("created_at", { ascending: false })
        .limit(6);

      if (data) {
        setDocs(
          data.map((d) => ({
            name: d.title,
            category: d.category || "Sem categoria",
            time: formatDistanceToNow(new Date(d.created_at), {
              addSuffix: true,
              locale: ptBR,
            }),
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
        <h3 className="font-display font-semibold text-foreground">Documentos Recentes</h3>
        <span className="text-xs text-muted-foreground">{docs.length} documentos</span>
      </div>
      <div className="divide-y divide-border">
        {docs.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">Nenhum documento encontrado.</p>
        )}
        {docs.map((doc, i) => (
          <div key={doc.name + i} className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
              <p className="text-xs text-muted-foreground">{doc.category}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {doc.signStatus === "assinado" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Assinado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  Pendente
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">{doc.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
