import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useRef, useEffect } from "react";
import { FileText, Upload, PenTool, CheckCircle, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { fetchDriveFileBlob } from "@/lib/driveFile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePlacer, SignaturePosition } from "@/components/signature/SignaturePlacer";

type SignatureStep = "upload" | "signing" | "done";

export default function Signature() {
  const [step, setStep] = useState<SignatureStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pfxPassword, setPfxPassword] = useState<string>("");
  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signaturePos, setSignaturePos] = useState<SignaturePosition | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

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
      let blob: Blob;
      if (filePath.startsWith("drive://")) {
        const driveId = filePath.replace("drive://", "");
        blob = await fetchDriveFileBlob(driveId, "view", "application/pdf");
      } else {
        const { data, error } = await supabase.storage.from("documents").download(filePath);
        if (error) throw error;
        blob = data;
      }
      setFile(new File([blob], fileName, { type: "application/pdf" }));
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
  };

  const handleSign = async () => {
    if (!file || !user) return;
    if (!pfxPassword) {
      toast({ title: "Senha obrigatória", description: "Digite a senha do seu certificado .pfx", variant: "destructive" });
      return;
    }
    setSigning(true);
    setStep("signing");
    setProgress(10);

    try {
      let docId: string;
      let filePath: string;

      if (existingDocId && existingFilePath) {
        docId = existingDocId;
        filePath = existingFilePath;
        setProgress(40);
      } else {
        setProgress(20);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", file.name);
        formData.append("unitName", "ICP-Brasil");
        const { data: driveResult, error: driveError } = await supabase.functions.invoke("upload-to-drive", { body: formData });
        if (driveError || !driveResult?.success || !driveResult?.driveFileId) {
          throw new Error(driveError?.message || driveResult?.error || "Falha ao enviar para o Google Drive.");
        }
        filePath = `drive://${driveResult.driveFileId}`;
        setProgress(40);
        const { data: docData, error: insertError } = await supabase
          .from("documents").insert({
            user_id: user.id,
            title: file.name.replace(".pdf", ""),
            category: "Assinatura Digital",
            unit: "ICP-Brasil",
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
            drive_file_id: driveResult.driveFileId,
            drive_link: driveResult.driveLink || null,
            ocr_status: "pendente",
            sign_status: "pendente",
          } as any).select().single();
        if (insertError) throw insertError;
        docId = docData.id;
      }

      setProgress(60);
      const { data: signResult, error: signError } = await supabase.functions.invoke("sign-pdf-a1", {
        body: { documentId: docId, filePath, fileName: file.name, password: pfxPassword, position: signaturePos },
      });

      setProgress(90);
      if (signError || (signResult as any)?.error) {
        throw new Error((signResult as any)?.error || signError?.message || "Falha na assinatura");
      }

      toast({ title: "Documento assinado!", description: "Assinatura PAdES ICP-Brasil A1 aplicada com sucesso." });
      setProgress(100);
      setStep("done");
      setPfxPassword("");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error: any) {
      console.error("Erro na assinatura:", error);
      toast({ title: "Erro", description: error.message || "Não foi possível processar a assinatura.", variant: "destructive" });
      setStep("upload");
    } finally {
      setSigning(false);
    }
  };

  const reset = () => {
    setFile(null);
    setStep("upload");
    setProgress(0);
    setExistingDocId(null);
    setExistingFilePath(null);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Assinatura Digital</h1>
          <p className="text-sm text-muted-foreground mt-1">Assine documentos PDF com certificado ICP-Brasil</p>
        </div>
      </div>

      {step === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="w-5 h-5 text-primary" />
                Documento PDF
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-medium text-sm mb-1">Arraste o PDF aqui ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground">Apenas arquivos PDF</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  {!existingDocId && (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                      Trocar arquivo
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Certificado ICP-Brasil A1
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Senha do seu certificado (.pfx)</Label>
                <Input
                  type="password"
                  value={pfxPassword}
                  onChange={(e) => setPfxPassword(e.target.value)}
                  placeholder="Senha do certificado A1"
                  autoComplete="off"
                  className="mt-2"
                />
              </div>

              <div className="bg-info/10 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-info mt-0.5 shrink-0" />
                <p className="text-xs text-info">
                  Assinatura PAdES local com seu certificado A1 ICP-Brasil. A senha é usada apenas para esta assinatura e não fica armazenada.
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSign} disabled={!file} className="flex-1 gap-2" size="lg">
                  <PenTool className="w-4 h-4" />
                  Assinar
                </Button>
                <Button onClick={reset} variant="outline" size="lg">
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "signing" && (
        <Card>
          <CardContent className="py-12 text-center space-y-6">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <div>
              <p className="text-lg font-semibold text-foreground">Processando assinatura digital...</p>
              <p className="text-sm text-muted-foreground mt-1">Aplicando assinatura ICP-Brasil no documento</p>
            </div>
            <div className="max-w-md mx-auto">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">{progress}% concluído</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="py-12 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Documento assinado com sucesso!</p>
              <p className="text-sm text-muted-foreground mt-1">A assinatura ICP-Brasil A1 foi aplicada ao documento.</p>
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={reset} className="gap-2">
                <Upload className="w-4 h-4" />
                Assinar outro
              </Button>
              <Button variant="outline" onClick={() => navigate("/documents")}>
                Ver documentos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
