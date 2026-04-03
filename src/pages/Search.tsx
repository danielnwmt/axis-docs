import { AppLayout } from "@/components/layout/AppLayout";
import { Search as SearchIcon, FileText, Eye, Download } from "lucide-react";
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
  file_path: string;
  keywords: string;
  created_at: string;
  drive_file_id: string | null;
  drive_link: string | null;
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
      .select("id, title, category, unit, file_name, file_path, keywords, created_at, drive_file_id, drive_link")
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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  useEffect(() => {
    if (initialQ) doSearch(initialQ);
  }, []);

  const handleView = async (driveFileId: string, driveLink?: string) => {
    const win = window.open("about:blank", "_blank");
    if (driveLink) {
      if (win) win.location.href = driveLink;
      return;
    }
    if (!driveFileId) { win?.close(); return; }
    try {
      const { data } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId, action: "metadata" },
      });
      if (data?.webViewLink && win) win.location.href = data.webViewLink;
      else win?.close();
    } catch { win?.close(); }
  };

  const handleDownload = async (driveFileId: string, fileName: string) => {
    if (!driveFileId) return;
    try {
      const { data, error } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId, action: "download" },
      });
      if (error) throw error;
      const blob = new Blob([data]);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {}
  };

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
            <div key={result.id} className="bg-card rounded-xl border border-border shadow-sm p-5 hover:border-primary/30 transition-colors">
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
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleView(result.drive_file_id || "", result.drive_link || undefined)}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    title="Visualizar"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(result.drive_file_id || "", result.file_name)}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    title="Baixar"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
