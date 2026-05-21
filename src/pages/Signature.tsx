import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect } from "react";
import { PenTool, CheckCircle, Loader2, AlertCircle, ShieldCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignatureStep = "idle" | "signing" | "done";

export default function Signature() {
  const [step, setStep] = useState<SignatureStep>("idle");
  const [pfxPassword, setPfxPassword] = useState<string>("");
  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [docId, setDocId] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    setDocId(searchParams.get("docId"));
    setFilePath(searchParams.get("filePath"));
    setFileName(searchParams.get("fileName") || "documento.pdf");
  }, [searchParams]);

  const handleSign = async () => {
    if (!docId || !filePath || !user) return;
    if (!pfxPassword) {
      toast({ title: "Senha obrigatória", description: "Digite a senha do seu certificado .pfx", variant: "destructive" });
      return;
    }
    setSigning(true);
    setStep("signing");
    setProgress(30);

    try {
      setProgress(60);
      const { data: signResult, error: signError } = await supabase.functions.invoke("sign-pdf-a1", {
        body: { documentId: docId, filePath, fileName, password: pfxPassword },
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
      setStep("idle");
    } finally {
      setSigning(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Assinatura Digital</h1>
          <p className="text-sm text-muted-foreground mt-1">Assine documentos PDF com certificado ICP-Brasil</p>
        </div>
      </div>

      {!docId || !filePath ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <p className="text-lg font-semibold text-foreground">Nenhum documento selecionado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Selecione um documento na lista de documentos e clique em "Assinar" para iniciar.
              </p>
            </div>
            <Button onClick={() => navigate("/documents")} className="gap-2">
              <FileText className="w-4 h-4" />
              Ir para Documentos
            </Button>
          </CardContent>
        </Card>
      ) : step === "idle" ? (
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Assinatura ICP-Brasil A1
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Documento</p>
              <p className="text-sm text-muted-foreground truncate">{fileName}</p>
            </div>

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
              <Button onClick={handleSign} className="flex-1 gap-2" size="lg">
                <PenTool className="w-4 h-4" />
                Assinar com Certificado Digital
              </Button>
              <Button onClick={() => navigate("/documents")} variant="outline" size="lg">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : step === "signing" ? (
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
      ) : (
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
              <Button onClick={() => navigate("/documents")} className="gap-2">
                <FileText className="w-4 h-4" />
                Ver documentos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
