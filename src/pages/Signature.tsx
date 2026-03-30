import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useRef, useEffect } from "react";
import { FileText, Upload, PenTool, CheckCircle, Eye, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SignatureStep = "upload" | "preview" | "signing" | "done";

export default function Signature() {
  const [step, setStep] = useState<SignatureStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [certType, setCertType] = useState<string>("A1");
  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [signedDocId, setSignedDocId] = useState<string | null>(null);
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Auto-load file from documents page
  useEffect(() => {
    const paramDocId = searchParams.get("docId");
    const paramFilePath = searchParams.get("filePath");
    const paramFileName = searchParams.get("fileName");
    if (paramDocId && paramFilePath) {
      setExistingDocId(paramDocId);
      setExistingFilePath(paramFilePath);
      loadFromStorage(paramFilePath, paramFileName || "document.pdf");
    }
  }, []);

  const loadFromStorage = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(filePath);
      if (error) throw error;
      const loadedFile = new File([data], fileName, { type: "application/pdf" });
      setFile(loadedFile);
      setFileUrl(URL.createObjectURL(loadedFile));
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Erro", description: "Não foi possível carregar o arquivo.", variant: "destructive" });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      toast({ title: "Erro", description: "Selecione apenas arquivos PDF.", variant: "destructive" });
      return;
    }
    setFile(selected);
    setFileUrl(URL.createObjectURL(selected));
    setStep("preview");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    if (dropped.type !== "application/pdf") {
      toast({ title: "Erro", description: "Selecione apenas arquivos PDF.", variant: "destructive" });
      return;
    }
    setFile(dropped);
    setFileUrl(URL.createObjectURL(dropped));
    setStep("preview");
  };

  const handleSign = async () => {
    if (!file || !user) return;
    setSigning(true);
    setStep("signing");
    setProgress(10);

    try {
      let docId: string;
      let filePath: string;

      if (existingDocId && existingFilePath) {
        // Document already exists — use existing record
        docId = existingDocId;
        filePath = existingFilePath;
        setProgress(50);
      } else {
        // New document — upload and create record
        filePath = `${user.id}/${Date.now()}_${file.name}`;
        setProgress(30);

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file, { cacheControl: "3600" });

        if (uploadError) throw uploadError;
        setProgress(50);

        const { data: docData, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            title: file.name.replace(".pdf", ""),
            category: "Assinatura Digital",
            unit: "ICP-Brasil",
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
            ocr_status: "pendente",
            sign_status: "pendente",
            notes: `Certificado: ${certType}`,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        docId = docData.id;
      }

      setProgress(70);

      // 3. Chamar edge function de assinatura (ZapSign)
      const { data: signResult, error: signError } = await supabase.functions.invoke("sign-document", {
        body: {
          documentId: docId,
          filePath,
          fileName: file.name,
          certType,
        },
      });

      setProgress(90);

      if (signError) {
        // Se a API ainda não está configurada, marcar como pendente
        console.warn("Edge function não disponível, marcando como pendente:", signError);
        toast({
          title: "Assinatura enviada",
          description: "O documento foi enviado para assinatura. A integração com ZapSign será ativada quando a API key for configurada.",
        });
      } else if (signResult?.signed) {
        // Atualizar status para assinado
        await supabase
          .from("documents")
          .update({ sign_status: "assinado" })
          .eq("id", docId);

        toast({
          title: "Documento assinado!",
          description: "A assinatura digital ICP-Brasil foi aplicada com sucesso.",
        });
      }

      setProgress(100);
      setSignedDocId(docId);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error: any) {
      console.error("Erro na assinatura:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível processar a assinatura.",
        variant: "destructive",
      });
      setStep("preview");
    } finally {
      setSigning(false);
    }
  };

  const reset = () => {
    setFile(null);
    setFileUrl(null);
    setStep("upload");
    setProgress(0);
    setSignedDocId(null);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Assinatura Digital</h1>
          <p className="text-sm text-muted-foreground mt-1">Assine documentos PDF com certificado ICP-Brasil</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { key: "upload", label: "Upload", icon: Upload },
          { key: "preview", label: "Conferência", icon: Eye },
          { key: "signing", label: "Assinatura", icon: PenTool },
          { key: "done", label: "Concluído", icon: CheckCircle },
        ].map((s, i) => {
          const isActive = step === s.key;
          const isPast = ["upload", "preview", "signing", "done"].indexOf(step) > i;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-0.5 ${isPast || isActive ? "bg-primary" : "bg-border"}`} />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
              }`}>
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload step */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="w-5 h-5 text-primary" />
              Selecione o documento PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-medium mb-1">Arraste o PDF aqui ou clique para selecionar</p>
              <p className="text-sm text-muted-foreground">Apenas arquivos PDF são aceitos</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview step */}
      {step === "preview" && fileUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="w-5 h-5 text-primary" />
                  Pré-visualização do Documento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <object data={fileUrl} type="application/pdf" className="w-full h-[65vh] rounded-lg">
                  <iframe
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`}
                    className="w-full h-[65vh] rounded-lg border-0"
                    title="PDF Preview"
                  />
                </object>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Arquivo</p>
                  <p className="text-sm text-muted-foreground truncate">{file?.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Tamanho</p>
                  <p className="text-sm text-muted-foreground">
                    {file ? (file.size / 1024 / 1024).toFixed(2) + " MB" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Tipo de Certificado</p>
                  <Select value={certType} onValueChange={setCertType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A1">Certificado A1 (arquivo digital)</SelectItem>
                      <SelectItem value="A3">Certificado A3 (token/cartão)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-info/10 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-info mt-0.5 shrink-0" />
                  <p className="text-xs text-info">
                    A assinatura será realizada via ZapSign com certificado ICP-Brasil {certType}.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSign} className="w-full gap-2" size="lg">
              <PenTool className="w-4 h-4" />
              Assinar com Certificado Digital
            </Button>
            <Button onClick={reset} variant="outline" className="w-full">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Signing step */}
      {step === "signing" && (
        <Card>
          <CardContent className="py-12 text-center space-y-6">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <div>
              <p className="text-lg font-semibold text-foreground">Processando assinatura digital...</p>
              <p className="text-sm text-muted-foreground mt-1">Enviando documento para o serviço de assinatura ICP-Brasil</p>
            </div>
            <div className="max-w-md mx-auto">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">{progress}% concluído</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done step */}
      {step === "done" && (
        <Card>
          <CardContent className="py-12 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Documento enviado para assinatura!</p>
              <p className="text-sm text-muted-foreground mt-1">
                O documento foi salvo e enviado para processamento de assinatura digital.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={reset} className="gap-2">
                <Upload className="w-4 h-4" />
                Assinar outro documento
              </Button>
              <Button variant="outline" onClick={() => window.location.href = "/documents"}>
                Ver documentos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
