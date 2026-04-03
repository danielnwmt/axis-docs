import { AppLayout } from "@/components/layout/AppLayout";
import { Search, Filter, Plus, FileText, Download, Eye, Trash2, ScanText, PenTool, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Documents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<typeof documents[0] | null>(null);
  const { toast } = useToast();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.unit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ocrBadge = (status: string) => {
    const map: Record<string, string> = {
      processado: "bg-success/10 text-success",
      pendente: "bg-warning/10 text-warning",
      erro: "bg-destructive/10 text-destructive",
    };
    return map[status] || "bg-secondary text-muted-foreground";
  };

  const signBadge = (status: string) => {
    const map: Record<string, string> = {
      assinado: "bg-primary/10 text-primary",
      pendente: "bg-warning/10 text-warning",
    };
    return map[status] || "bg-secondary text-muted-foreground";
  };

  const getSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(filePath, 3600);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível acessar o arquivo.", variant: "destructive" });
      return null;
    }
    return data.signedUrl;
  };

  const handleView = async (doc: typeof documents[0]) => {
    const url = await getSignedUrl(doc.file_path);
    if (url) {
      setPreviewUrl(url);
      setPreviewType(doc.file_type || "");
      setPreviewTitle(doc.title);
      logAudit("Visualizou documento", "view", doc.title);
    }
  };

  const handleDownload = async (doc: typeof documents[0]) => {
    const url = await getSignedUrl(doc.file_path);
    if (url) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        logAudit("Baixou documento", "download", doc.title);
      } catch {
        toast({ title: "Erro", description: "Não foi possível baixar o arquivo.", variant: "destructive" });
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    const docTitle = deleteDoc.title;

    if (!deleteDoc.drive_file_id) {
      toast({
        title: "Erro",
        description: "Este documento não está vinculado ao Google Drive, então a exclusão foi bloqueada para evitar dessincronização.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: driveResult, error: driveError } = await supabase.functions.invoke("delete-from-drive", {
        body: { driveFileId: deleteDoc.drive_file_id },
      });

      if (driveError || !driveResult?.success) {
        throw new Error(driveError?.message || driveResult?.error || "Não foi possível excluir o arquivo no Google Drive.");
      }
    } catch (driveErr) {
      console.warn("Erro ao excluir do Google Drive:", driveErr);
      toast({
        title: "Erro",
        description: "O arquivo não foi removido do Google Drive. O documento foi mantido no sistema para evitar inconsistência.",
        variant: "destructive",
      });
      return;
    }

    const { error: storageError } = await supabase.storage.from("documents").remove([deleteDoc.file_path]);
    if (storageError) {
      toast({ title: "Erro", description: "O arquivo foi removido do Google Drive, mas não do armazenamento interno.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("documents").delete().eq("id", deleteDoc.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível apagar o documento.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: "Documento apagado com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      logAudit("Excluiu documento", "delete", docTitle);
    }
    setDeleteDoc(null);
  };

  const renderPreview = () => {
    if (!previewUrl) return null;
    if (previewType.startsWith("image/")) {
      return <img src={previewUrl} alt={previewTitle} className="w-full max-h-[70vh] object-contain rounded-lg" />;
    }
    if (previewType === "application/pdf") {
      return (
        <object data={previewUrl} type="application/pdf" className="w-full h-[70vh] rounded-lg">
          <iframe src={`https://docs.google.com/gview?url=${encodeURIComponent(previewUrl)}&embedded=true`} className="w-full h-[70vh] rounded-lg border-0" title={previewTitle} />
        </object>
      );
    }
    return (
      <div className="text-center py-12 space-y-4">
        <FileText className="w-16 h-16 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">Pré-visualização não disponível para este tipo de arquivo.</p>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
          <Button className="gap-2"><Download className="w-4 h-4" /> Baixar arquivo</Button>
        </a>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Documentos</h1>
        <Button onClick={() => navigate("/upload")} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Documento
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documentos..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" /> Filtros
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-5 py-3 font-semibold text-foreground">Documento</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Categoria</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Unidade</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Data</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">OCR</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Assinatura</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Nenhum documento encontrado</td></tr>
            ) : (
              filtered.map((doc) => (
                <tr key={doc.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{doc.title}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{doc.category}</td>
                  <td className="px-5 py-3 text-muted-foreground">{doc.unit}</td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(doc.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => navigate(`/scanner?docId=${doc.id}&filePath=${encodeURIComponent(doc.file_path)}&fileName=${encodeURIComponent(doc.file_name)}`)}
                      className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                    >
                      Abrir
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    {doc.sign_status === "pendente" ? (
                      <button
                        onClick={() => navigate(`/signature?docId=${doc.id}&filePath=${encodeURIComponent(doc.file_path)}&fileName=${encodeURIComponent(doc.file_name)}`)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-warning/10 text-warning hover:bg-warning/20 transition-colors cursor-pointer"
                        title="Assinar documento"
                      >
                        <PenTool className="w-3 h-3" />
                        {doc.sign_status}
                      </button>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${signBadge(doc.sign_status)}`}>
                        {doc.sign_status}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleView(doc)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
                        title="Visualizar"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/upload?editId=${doc.id}`)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
                        title="Baixar"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteDoc(doc)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        title="Apagar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {renderPreview()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja apagar "{deleteDoc?.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
