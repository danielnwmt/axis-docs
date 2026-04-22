import { Search, Bell, Mail, Settings, FileText, Download, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfPreview } from "@/components/documents/PdfPreview";
import { Button } from "@/components/ui/button";

interface SearchResult {
  id: string;
  title: string;
  category: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  drive_file_id: string | null;
  drive_link: string | null;
}

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === "/";
  const { user } = useAuth();
  const email = user?.email ?? "";
  const initials = email
    .split("@")[0]
    .split(/[._-]/)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    const q = term.trim();
    const { data } = await supabase
      .from("documents")
      .select("id, title, category, file_path, file_name, file_type, drive_file_id, drive_link")
      .or(`title.ilike."%${q}%",subject.ilike."%${q}%",notes.ilike."%${q}%",keywords.ilike."%${q}%",ocr_text.ilike."%${q}%"`)
      .order("created_at", { ascending: false })
      .limit(8);
    setResults(data || []);
    setShowDropdown(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    } catch {
      console.error("Erro ao baixar arquivo do Drive");
    }
  };

  const closePreview = () => {
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
  };

  const handleView = async (result: SearchResult) => {
    if (!result.drive_file_id) return;
    try {
      const { data, error } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId: result.drive_file_id, action: "view" },
        headers: { Accept: result.file_type || "application/octet-stream" },
      });
      if (error) throw error;
      const blob = data instanceof Blob ? data : new Blob([data], { type: result.file_type || "application/octet-stream" });
      const blobUrl = URL.createObjectURL(blob);
      setShowDropdown(false);
      setPreviewType(result.file_type || "application/octet-stream");
      setPreviewTitle(result.title);
      setPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return blobUrl;
      });
    } catch {}
  };

  const renderPreview = () => {
    if (!previewUrl) return null;
    if (previewType.startsWith("image/")) {
      return <img src={previewUrl} alt={previewTitle} className="w-full max-h-[70vh] object-contain rounded-lg" />;
    }
    if (previewType.includes("pdf")) {
      return <PdfPreview fileUrl={previewUrl} title={previewTitle} />;
    }
    return (
      <div className="text-center py-12 space-y-4">
        <FileText className="w-16 h-16 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">Pré-visualização não disponível para este tipo de arquivo.</p>
        <a href={previewUrl} download={previewTitle}>
          <Button className="gap-2"><Download className="w-4 h-4" /> Baixar arquivo</Button>
        </a>
      </div>
    );
  };

  return (
    <header className="flex items-center justify-between h-16 px-6 bg-card border-b border-border">
      {/* Search */}
      {isDashboard ? (
        <div ref={wrapperRef} className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar documentos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-80 overflow-auto">
              {loading && (
                <div className="flex justify-center py-4">
                  <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              )}
              {!loading && results.length === 0 && query.trim() && (
                <p className="px-4 py-3 text-sm text-muted-foreground text-center">Nenhum documento encontrado.</p>
              )}
              {!loading && results.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors border-b border-border last:border-b-0">
                  <div className="w-7 h-7 rounded-md bg-info/10 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.category || "Sem categoria"}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleView(r)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Visualizar"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDownload(r.drive_file_id || "", r.file_name)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Baixar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right */}
      <div className="flex items-center gap-3 ml-6">
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <Bell className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <Mail className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <Settings className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 ml-2 pl-4 border-l border-border">
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground leading-tight">{email}</p>
            <p className="text-xs text-muted-foreground">Administrador</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {initials}
          </div>
        </div>
      </div>
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {renderPreview()}
        </DialogContent>
      </Dialog>
    </header>
  );
}
