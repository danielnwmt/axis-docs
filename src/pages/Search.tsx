import { AppLayout } from "@/components/layout/AppLayout";
import { Search as SearchIcon, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";

interface SearchResult {
  id: string;
  title: string;
  category: string;
  unit: string;
  file_name: string;
  keywords: string;
  created_at: string;
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);

    const q = term.trim();
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, category, unit, file_name, keywords, created_at")
      .or(`title.ilike."%${q}%",category.ilike."%${q}%",unit.ilike."%${q}%",keywords.ilike."%${q}%",file_name.ilike."%${q}%",subject.ilike."%${q}%",ocr_text.ilike."%${q}%"`)
      .order("created_at", { ascending: false })
      .limit(50);

    setResults(error ? [] : (data as SearchResult[]));
    setLoading(false);

    try {
      const stored = JSON.parse(localStorage.getItem("recent_searches") || "[]") as string[];
      const updated = [q, ...stored.filter((s) => s !== q)].slice(0, 10);
      localStorage.setItem("recent_searches", JSON.stringify(updated));
    } catch {}
  }, []);

  // Live search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Initial search from URL param
  useEffect(() => {
    if (initialQ) doSearch(initialQ);
  }, []);

  return (
    <AppLayout>
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">Busca Inteligente</h1>

      <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Busque por nome, categoria, palavras-chave, conteúdo..."
            className="pl-12 h-12 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {searched && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {results.length} resultado(s) encontrado(s) para "{query}"
          </p>
          {results.length === 0 && (
            <div className="bg-card rounded-xl border border-border shadow-sm p-8 text-center text-muted-foreground">
              Nenhum documento encontrado para essa busca.
            </div>
          )}
          {results.map((result) => (
            <div key={result.id} className="bg-card rounded-xl border border-border shadow-sm p-5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{result.title}</h3>
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{result.category}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{result.file_name}</p>
                  {result.keywords && (
                    <p className="text-xs text-info mt-1">Palavras-chave: {result.keywords}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.unit} • {new Date(result.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}