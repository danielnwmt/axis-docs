import { AppLayout } from "@/components/layout/AppLayout";
import { Upload as UploadIcon, FileUp, X, PenTool, ShieldCheck, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { logAudit } from "@/lib/auditLog";

export default function Upload() {
  const [files, setFiles] = useState<File[]>([]);
  const [existingFile, setExistingFile] = useState<{ name: string; path: string; size: number | null; type: string | null } | null>(null);
  const [existingFileDriveId, setExistingFileDriveId] = useState<string | null>(null);
  const [existingFileDriveLink, setExistingFileDriveLink] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [signDocument, setSignDocument] = useState(false);
  const [certType, setCertType] = useState("A1");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("editId");

  useEffect(() => {
    const loadLists = async () => {
      const [catRes, unitRes] = await Promise.all([
        supabase.from("categories").select("name").order("name"),
        supabase.from("units").select("name").order("name"),
      ]);
      if (catRes.data) setCategorias(catRes.data.map(c => c.name));
      if (unitRes.data) setUnidades(unitRes.data.map(u => u.name));
    };
    loadLists();
  }, []);

  useEffect(() => {
    if (!editId) return;
    const loadDoc = async () => {
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("id", editId)
        .single();
      if (data) {
        setTitle(data.title);
        setCategory(data.category || "");
        setUnit(data.unit || "");
        setSubject(data.subject || "");
        setKeywords(data.keywords || "");
        setNotes(data.notes || "");
        setExistingFile({
          name: data.file_name,
          path: data.file_path,
          size: data.file_size,
          type: data.file_type,
        });
        setExistingFileDriveId(data.drive_file_id);
        setExistingFileDriveLink((data as any).drive_link);
      }
    };
    loadDoc();
  }, [editId]);

  const hasPdf = files.some((f) => f.type === "application/pdf") || existingFile?.type === "application/pdf";

  const handleExistingFileView = async () => {
    if (!existingFile || !existingFileDriveId) return;
    try {
      const { data, error } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId: existingFileDriveId, action: "view" },
      });
      if (error) throw error;
      // Open drive link directly
      if (existingFileDriveLink) {
        window.open(existingFileDriveLink, "_blank", "noopener,noreferrer");
      }
    } catch (error: any) {
      toast({ title: "Erro ao visualizar", description: error.message, variant: "destructive" });
    }
  };

  const handleExistingFileDownload = async () => {
    if (!existingFile || !existingFileDriveId) return;
    try {
      const { data, error } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId: existingFileDriveId, action: "download" },
      });
      if (error) throw error;
      const blob = new Blob([data]);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = existingFile.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      toast({ title: "Erro ao baixar", description: error.message, variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const cleanupDriveFile = async (driveFileId?: string | null) => {
    if (driveFileId) {
      try {
        await supabase.functions.invoke("delete-from-drive", {
          body: { driveFileId },
        });
      } catch (error) {
        console.warn("Falha ao reverter arquivo no Google Drive:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!editId && files.length === 0)) return;

    setLoading(true);
    try {
      // Edit mode — update metadata only
      if (editId) {
        const { error } = await supabase.from("documents").update({
          title,
          category,
          unit,
          subject,
          keywords,
          notes,
        }).eq("id", editId);
        if (error) throw error;
        toast({ title: "Documento atualizado!", description: "Os dados foram salvos com sucesso." });
        logAudit("Editou documento", "edit", title);
        navigate("/documents");
        return;
      }

      // New document mode — send file directly to Drive (no Storage middleman)
      for (const file of files) {
        const isPdf = file.type === "application/pdf";
        const shouldSign = signDocument && isPdf;

        let driveFileId: string | null = null;
        let driveLink: string | null = null;

        try {
          // Send file directly to edge function via FormData
          const formData = new FormData();
          formData.append("file", file);
          formData.append("fileName", file.name);
          formData.append("unitName", unit);

          const { data: driveResult, error: driveError } = await supabase.functions.invoke("upload-to-drive", {
            body: formData,
          });

          if (driveError || !driveResult?.success || !driveResult?.driveFileId) {
            throw new Error(driveError?.message || driveResult?.error || "Falha ao enviar para o Google Drive.");
          }

          console.log("Arquivo enviado ao Google Drive:", driveResult.driveLink);
          driveFileId = driveResult.driveFileId;
          driveLink = driveResult.driveLink || null;
        } catch (driveErr: any) {
          throw new Error(driveErr?.message || "Não foi possível armazenar o arquivo no Google Drive.");
        }

        const { data: docData, error: dbError } = await supabase.from("documents").insert({
          user_id: user.id,
          title: title || file.name,
          category,
          unit,
          subject,
          keywords,
          notes: shouldSign ? `${notes}\nCertificado: ${certType}` : notes,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          drive_file_id: driveFileId,
          drive_link: driveLink,
          sign_status: shouldSign ? "pendente" : "pendente",
        } as any).select().single();

        if (dbError) {
          await cleanupFailedUpload(filePath, driveFileId);
          throw dbError;
        }

        // Se marcou para assinar e é PDF, chamar edge function
        if (shouldSign && docData) {
          try {
            const { data: signResult, error: signError } = await supabase.functions.invoke("sign-document", {
              body: {
                documentId: docData.id,
                filePath,
                fileName: file.name,
                certType,
              },
            });

            if (signError) {
              console.warn("Assinatura pendente:", signError);
            } else if (signResult?.signed) {
              await supabase
                .from("documents")
                .update({ sign_status: "assinado" })
                .eq("id", docData.id);
            }
          } catch (signErr) {
            console.warn("Erro na assinatura, documento salvo como pendente:", signErr);
          }
        }
      }

      const signMsg = signDocument && hasPdf ? " Assinatura digital solicitada." : "";
      toast({ title: "Documento cadastrado!", description: `${files.length} arquivo(s) enviado(s) com sucesso.${signMsg}` });
      for (const file of files) {
        logAudit("Enviou documento", "upload", title || file.name);
      }
      setFiles([]);
      setTitle("");
      setCategory("");
      setUnit("");
      setSubject("");
      setKeywords("");
      setNotes("");
      setSignDocument(false);
      navigate("/documents");
    } catch (error: any) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">{editId ? "Editar Documento" : "Upload de Documentos"}</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
          <h2 className="font-display font-semibold text-foreground text-lg">Dados do Documento</h2>

          <div className="space-y-2">
            <Label>Título</Label>
            <Input placeholder="Nome do documento" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Unidade/Setor</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a unidade/setor" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input placeholder="Assunto do documento" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Palavras-chave</Label>
            <Input placeholder="Separadas por vírgula" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
              placeholder="Observações adicionais"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Assinatura Digital */}
          <div className="border border-border rounded-xl p-4 space-y-3 bg-secondary/30">
            <div className="flex items-center gap-3">
              <Checkbox
                id="sign"
                checked={signDocument}
                onCheckedChange={(checked) => setSignDocument(checked === true)}
                disabled={!hasPdf}
              />
              <label htmlFor="sign" className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                <PenTool className="w-4 h-4 text-primary" />
                Assinar com Certificado Digital ICP-Brasil
              </label>
            </div>

            {!hasPdf && files.length > 0 && (
              <p className="text-xs text-muted-foreground ml-7">Apenas arquivos PDF podem ser assinados digitalmente.</p>
            )}

            {signDocument && (
              <div className="ml-7 space-y-2">
                <Label className="text-xs">Tipo de Certificado</Label>
                <Select value={certType} onValueChange={setCertType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A1">Certificado A1 (arquivo digital)</SelectItem>
                    <SelectItem value="A3">Certificado A3 (token/cartão)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-start gap-2 bg-info/10 rounded-lg p-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-info mt-0.5 shrink-0" />
                  <p className="text-xs text-info">A assinatura será processada via ZapSign com certificado ICP-Brasil.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="bg-card rounded-xl border-2 border-dashed border-accent/40 shadow-sm p-8 flex flex-col items-center justify-center gap-4 min-h-[300px] hover:border-accent transition-colors cursor-pointer"
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
              <UploadIcon className="w-8 h-8 text-accent" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">{editId ? "Adicionar novos arquivos" : "Arraste arquivos aqui"}</p>
              <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG, DOCX, XLSX</p>
            </div>
            <input id="file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" className="hidden" onChange={handleFileSelect} />
          </div>

          {editId && existingFile && (
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
              <h3 className="font-semibold text-foreground text-sm">Arquivo anexado</h3>
              <div className="flex flex-col gap-3 rounded-lg bg-secondary/50 px-3 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileUp className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{existingFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {existingFile.size ? `${(existingFile.size / 1024).toFixed(0)} KB` : "Tamanho não informado"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleExistingFileView}>
                    <Eye className="w-4 h-4" />
                    Visualizar
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleExistingFileDownload}>
                    <Download className="w-4 h-4" />
                    Baixar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-2">
              <h3 className="font-semibold text-foreground text-sm">Arquivos selecionados ({files.length})</h3>
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <FileUp className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground truncate max-w-[200px]">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={(!editId && files.length === 0) || loading}>
            <UploadIcon className="w-4 h-4" />
            {loading ? "Salvando..." : editId ? "Salvar Alterações" : signDocument && hasPdf ? "Enviar e Assinar Documento" : "Enviar Documento"}
          </Button>
        </div>
      </form>
    </AppLayout>
  );
}
