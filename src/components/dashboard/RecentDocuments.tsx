import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Doc {
  name: string;
  type: string;
  time: string;
}

export function RecentDocuments() {
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    const fetchDocs = async () => {
      const { data } = await supabase
        .from("documents")
        .select("title, category, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (data) {
        setDocs(
          data.map((d) => ({
            name: d.title,
            type: d.category || "Sem categoria",
            time: formatDistanceToNow(new Date(d.created_at), {
              addSuffix: true,
              locale: ptBR,
            }),
          }))
        );
      }
    };
    fetchDocs();
  }, []);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-display font-semibold text-foreground">Documentos Recentes</h3>
      </div>
      <div className="divide-y divide-border">
        {docs.length === 0 && (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum documento encontrado.</p>
        )}
        {docs.map((doc) => (
          <div key={doc.name + doc.time} className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
              <p className="text-xs text-info font-medium">{doc.type}</p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{doc.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
