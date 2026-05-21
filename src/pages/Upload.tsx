import { AppLayout } from "@/components/layout/AppLayout";
import { Upload as UploadIcon, FileUp, X, PenTool, ShieldCheck, Eye, EyeOff, Download, FileText, Loader2, AlertCircle } from "lucide-react";
import { SignaturePlacer, SignaturePosition } from "@/components/signature/SignaturePlacer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PdfPreview } from "@/components/documents/PdfPreview";
import { fetchActiveNames } from "@/lib/adminLookups";
import { isPdfSigned, isPdfIcpBrasilSigned } from "@/lib/pdfSignature";
import { translateError } from "@/lib/errorMessages";
import { useTranslation } from "react-i18next";

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
  const [pfxPassword, setPfxPassword] = useState("");
  const [showPfxPassword, setShowPfxPassword] = useState(false);
  const [signaturePos, setSignaturePos] = useState<SignaturePosition | null>(null);
  const [certCN, setCertCN] = useState<string>("");
  const [hasCert, setHasCert] = useState<boolean | null>(null);
  const [signedFiles, setSignedFiles] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("editId");

  useEffect(() => {
    const loadLists = async () => {
      try {
        const [categoryNames, unitNames] = await Promise.all([
          fetchActiveNames("categories"),
          fetchActiveNames("units"),
        ]);
        setCategorias(categoryNames);
        setUnidades(unitNames);
      } catch (error: any) {
        toast({ title: t("errors.generic"), description: translateError(error.message), variant: "destructive" });
      }
    };
    loadLists();
  }, [toast]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_certificates" as any)
        .select("subject_cn")
        .eq("user_id", user.id)
        .maybeSingle();
      const cn = data && (data as any).subject_cn;
      if (cn) setCertCN(cn);
      setHasCert(!!cn);
    })();
  }, [user]);

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

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
  };

  const handleExistingFileView = async () => {
    if (!existingFile || !existingFileDriveId) return;

    const fileType = existingFile.type || "application/octet-stream";
    setPreviewTitle(existingFile.name);
    setPreviewType(fileType);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });

    try {
      const { data, error } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId: existingFileDriveId, action: "view" },
        headers: { Accept: fileType },
      });
      if (error) throw error;

      const blob = data instanceof Blob ? data : new Blob([data], { type: fileType });
      const blobUrl = URL.createObjectURL(blob);

      setPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return blobUrl;
      });
      logAudit("Visualizou documento", "view", existingFile.name);
    } catch (error: any) {
      closePreview();
      toast({ title: t("errors.generic"), description: translateError(error.message), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExistingFileDownload = async () => {
    if (!existingFile || !existingFileDriveId) return;
    try {
      const { data, error } = await supabase.functions.invoke("serve-drive-file", {
        body: { driveFileId: existingFileDriveId, action: "download" },
        headers: { Accept: "application/octet-stream" },
      });
      if (error) throw error;
      const blob = data instanceof Blob ? data : new Blob([data]);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = existingFile.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      toast({ title: t("errors.generic"), description: translateError(error.message), variant: "destructive" });
    }
  };

  const renderPreview = () => {
    if (previewLoading) {
      return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Carregando arquivo...</p>
        </div>
      );
    }

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
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
          <Button className="gap-2"><Download className="w-4 h-4" /> Baixar arquivo</Button>
        </a>
      </div>
    );
  };

  const checkSignatures = async (incoming: File[]) => {
    for (const f of incoming) {
      if (f.type === "application/pdf") {
        const signed = await isPdfSigned(f);
        const icp = signed && (await isPdfIcpBrasilSigned(f));
        if (icp) {
          setSignedFiles((prev) => new Set(prev).add(f.name));
          setSignDocument(false);
          toast({
            title: "PDF com assinatura ICP-Brasil",
            description: `"${f.name}" já está assinado com certificado ICP-Brasil válido.`,
          });
        } else if (signed) {
          toast({
            title: "Assinatura não é ICP-Brasil",
            description: `"${f.name}" possui assinatura, mas NÃO é ICP-Brasil. Marque "Assinar com Certificado Digital" para reassinar.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Documento não assinado",
            description: `"${f.name}" não possui assinatura digital. Marque a opção "Assinar com Certificado Digital" para assiná-lo.`,
          });

        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
    checkSignatures(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
      checkSignatures(selected);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed) {
        setSignedFiles((s) => {
          const next = new Set(s);
          next.delete(removed.name);
          return next;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
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

    if (!editId && signDocument && hasPdf) {
      if (!pfxPassword) {
        toast({ title: "Senha obrigatória", description: "Digite a senha do seu certificado .pfx para assinar.", variant: "destructive" });
        return;
      }
      if (!signaturePos) {
        toast({ title: "Posicione a assinatura", description: "Clique no PDF para definir o local da assinatura visível.", variant: "destructive" });
        return;
      }
    }

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

      // New document mode — enforce license storage quota first
      const { getStorageQuota, formatBytes } = await import("@/lib/storageQuota");
      const quota = await getStorageQuota();
      if (quota.hasLimit) {
        const incoming = files.reduce((s, f) => s + f.size, 0);
        if (quota.usedBytes + incoming > quota.limitBytes) {
          toast({
            title: "Limite de armazenamento atingido",
            description: `Sua licença permite ${formatBytes(quota.limitBytes)}. Disponível: ${formatBytes(quota.remainingBytes)}.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        if (quota.percent >= 80) {
          toast({
            title: "Atenção: armazenamento alto",
            description: `Você está usando ${quota.percent.toFixed(1)}% da licença.`,
          });
        }
      }

      // New document mode — send file directly to Drive (no Storage middleman)
      for (const file of files) {
        const isPdf = file.type === "application/pdf";
        const alreadyIcp = isPdf && (signedFiles.has(file.name) || (await isPdfIcpBrasilSigned(file)));
        const hasAnySignature = isPdf && !alreadyIcp && (await isPdfSigned(file));
        const shouldSign = signDocument && isPdf && !alreadyIcp;

        // Conformidade Lei 12.682/2012 e Decreto 10.278/2020:
        // somente PDFs com assinatura ICP-Brasil (já presente ou a ser aplicada) são aceitos.
        if (!isPdf) {
          toast({
            title: "Formato não permitido",
            description: `"${file.name}" não é PDF. Apenas PDFs com assinatura ICP-Brasil são aceitos.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        if (hasAnySignature && !shouldSign) {
          toast({
            title: "Certificado não é ICP-Brasil",
            description: `"${file.name}" está assinado, mas o certificado NÃO é ICP-Brasil. Marque "Assinar digitalmente" para reassinar com ICP-Brasil.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        if (!alreadyIcp && !shouldSign) {
          toast({
            title: "Assinatura ICP-Brasil obrigatória",
            description: `"${file.name}" não possui assinatura ICP-Brasil. Marque "Assinar digitalmente" ou envie um PDF já assinado com certificado ICP-Brasil.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }





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

        const filePath = `drive://${driveFileId}`;

        const signedNote = alreadyIcp ? `${notes}\n[Documento já assinado digitalmente — detectado no upload]` : notes;

        const { data: docData, error: dbError } = await supabase.from("documents").insert({
          user_id: user.id,
          title: title || file.name,
          category,
          unit,
          subject,
          keywords,
          notes: shouldSign ? `${notes}\nCertificado: ${certType}` : signedNote,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          drive_file_id: driveFileId,
          drive_link: driveLink,
          sign_status: alreadyIcp ? "assinado" : "pendente",
        } as any).select().single();

        if (dbError) {
          await cleanupDriveFile(driveFileId);
          throw dbError;
        }

        // Se marcou para assinar e é PDF, chamar edge function A1 com posição + senha
        if (shouldSign && docData) {
          try {
            const { data: signResult, error: signError } = await supabase.functions.invoke("sign-pdf-a1", {
              body: {
                documentId: docData.id,
                filePath,
                fileName: file.name,
                password: pfxPassword,
                position: signaturePos,
              },
            });

            if (signError || (signResult as any)?.error) {
              throw new Error((signResult as any)?.error || signError?.message || "Falha na assinatura");
            }
            await supabase
              .from("documents")
              .update({ sign_status: "assinado" })
              .eq("id", docData.id);
          } catch (signErr: any) {
            console.warn("Erro na assinatura:", signErr);
            toast({ title: "Falha ao assinar", description: signErr.message, variant: "destructive" });
          }
        }
      }

      const signMsg = signDocument && hasPdf ? " Assinatura digital ICP-Brasil A1 aplicada." : "";
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
      toast({ title: t("errors.uploadFailed"), description: translateError(error.message), variant: "destructive" });
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
                disabled={!hasPdf || signedFiles.size > 0}
              />
              <label htmlFor="sign" className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                <PenTool className="w-4 h-4 text-primary" />
                Assinar com Certificado Digital ICP-Brasil
              </label>
            </div>

            {!hasPdf && files.length > 0 && (
              <p className="text-xs text-muted-foreground ml-7">Apenas arquivos PDF podem ser assinados digitalmente.</p>
            )}

            {signedFiles.size > 0 && (
              <div className="flex items-start gap-2 bg-success/10 rounded-lg p-2.5 ml-7">
                <ShieldCheck className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                <p className="text-xs text-success">
                  Documento(s) já assinado(s) digitalmente detectado(s): {Array.from(signedFiles).join(", ")}. Serão marcados como assinados automaticamente.
                </p>
              </div>
            )}

            {signDocument && (
              <div className="ml-7 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Senha do certificado (.pfx)</Label>
                  <div className="relative">
                    <Input
                      type={showPfxPassword ? "text" : "password"}
                      value={pfxPassword}
                      onChange={(e) => setPfxPassword(e.target.value)}
                      placeholder="Senha do certificado A1"
                      autoComplete="off"
                      className="pr-10 h-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPfxPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPfxPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-info/10 rounded-lg p-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-info mt-0.5 shrink-0" />
                  <p className="text-xs text-info">Posicione o carimbo no PDF ao lado e informe a senha. Assinatura PAdES ICP-Brasil A1.</p>
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

          {signDocument && hasPdf && files.find((f) => f.type === "application/pdf") && (
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-2">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <PenTool className="w-4 h-4 text-primary" /> Posicionar assinatura
              </h3>
              <SignaturePlacer
                file={files.find((f) => f.type === "application/pdf")!}
                signerLabel={certCN || user?.email?.split("@")[0] || "Assinatura"}
                value={signaturePos}
                onChange={setSignaturePos}
              />
            </div>
          )}


          <Button type="submit" className="w-full gap-2" disabled={(!editId && files.length === 0) || loading}>
            <UploadIcon className="w-4 h-4" />
            {loading ? "Salvando..." : editId ? "Salvar Alterações" : signDocument && hasPdf ? "Enviar e Assinar Documento" : "Enviar Documento"}
          </Button>
        </div>
      </form>

      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {renderPreview()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
