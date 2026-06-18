import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function RecentSearches() {
  const [searches, setSearches] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("recent_searches");
      if (stored) {
        setSearches(JSON.parse(stored));
      }
    } catch {}
  }, []);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-display font-semibold text-foreground">Pesquisas Recentes</h3>
      </div>
      <div className="divide-y divide-border">
        {searches.length === 0 && (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nenhuma pesquisa recente.</p>
        )}
        {searches.map((s) => (
          <div
            key={s}
            className="flex items-center justify-between px-5 py-3 hover:bg-secondary/50 transition-colors cursor-pointer"
            onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)}
          >
            <span className="text-sm text-foreground">{s}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}
