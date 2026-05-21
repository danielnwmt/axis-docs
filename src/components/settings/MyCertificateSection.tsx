import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Upload, Trash2, AlertCircle, Loader2, FileKey2, KeyRound, Eye, EyeOff } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type CertMeta = {
  subject_cn: string;
  cpf: string;
  issuer: string;
  valid_from: string | null;
  valid_to: string | null;
  fingerprint_sha256: string;
  uploaded_at: string;
};

export function MyCertificateSection() {
  const [cert, setCert] = useState<CertMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Alterar senha do certificado
  const [changing, setChanging] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("user_certificates" as any)
      .select("subject_cn, cpf, issuer, valid_from, valid_to, fingerprint_sha256, uploaded_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setCert((data as any) || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    if (!file) { toast({ title: "Selecione o arquivo .pfx", variant: "destructive" }); return; }
    if (!password) { toast({ title: "Informe a senha do certificado", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ""; const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      const pfxBase64 = btoa(bin);
      const { data, error } = await supabase.functions.invoke("upload-certificate", {
        body: { pfxBase64, password },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Falha ao processar certificado");
      }
      toast({ title: "Certificado cadastrado!", description: `CN: ${(data as any).subject_cn}` });
      setFile(null); setPassword("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("user_certificates" as any).delete().eq("user_id", user.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Certificado removido" });
    setCert(null);
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) {
      toast({ title: "Preencha todos os campos", variant: "destructive" }); return;
    }
    if (newPwd.length < 4) {
      toast({ title: "Senha muito curta", description: "Mínimo 4 caracteres.", variant: "destructive" }); return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: "Senhas não coincidem", variant: "destructive" }); return;
    }
    setChanging(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-certificate-password", {
        body: { currentPassword: currentPwd, newPassword: newPwd },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Falha ao alterar senha");
      }
      toast({ title: "Senha alterada!", description: "Use a nova senha nas próximas assinaturas." });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setChanging(false);
    }
  };

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";
  const expired = cert?.valid_to ? new Date(cert.valid_to) < new Date() : false;
  const daysLeft = cert?.valid_to ? Math.ceil((new Date(cert.valid_to).getTime() - Date.now()) / 86400000) : null;
  const expiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

  if (loading) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-info/10 rounded-lg p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-info mt-0.5 shrink-0" />
        <div className="text-sm text-info">
          <p className="font-semibold mb-1">Certificado Digital A1 (ICP-Brasil)</p>
          <p>Envie seu arquivo <code>.pfx</code> + senha. O arquivo é criptografado (AES-256-GCM) no servidor. A senha <strong>não é armazenada</strong> — você a digita a cada assinatura.</p>
        </div>
      </div>

      {cert ? (
        <div className={`rounded-xl border p-5 space-y-4 ${expired ? "border-destructive/40 bg-destructive/5" : expiringSoon ? "border-warning/40 bg-warning/5" : "border-success/40 bg-success/5"}`}>
          <div className="flex items-center gap-2">
            <FileKey2 className="w-5 h-5 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Meu Certificado</h3>
            <span className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              expired ? "bg-destructive text-destructive-foreground" :
              expiringSoon ? "bg-warning text-warning-foreground" :
              "bg-success text-success-foreground"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {expired ? "EXPIRADO" : expiringSoon ? `EXPIRA EM ${daysLeft}D` : "ATIVO"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-muted-foreground text-xs mb-1">Data de emissão</p>
              <p className="text-foreground font-semibold text-base">{fmtDate(cert.valid_from)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-muted-foreground text-xs mb-1">Data de expiração</p>
              <p className={`font-semibold text-base ${expired ? "text-destructive" : expiringSoon ? "text-warning" : "text-foreground"}`}>{fmtDate(cert.valid_to)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm pt-1">
            <div><p className="text-muted-foreground text-xs">Titular (CN)</p><p className="text-foreground font-medium">{cert.subject_cn || "—"}</p></div>
            <div><p className="text-muted-foreground text-xs">CPF</p><p className="text-foreground font-medium">{cert.cpf || "—"}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground text-xs">Emissor</p><p className="text-foreground font-medium">{cert.issuer || "—"}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground text-xs">Fingerprint SHA-256</p><p className="font-mono text-xs break-all text-foreground">{cert.fingerprint_sha256}</p></div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setCert(null)}><Upload className="w-4 h-4 mr-2" /> Substituir</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover certificado?</AlertDialogTitle>
                  <AlertDialogDescription>Você não poderá assinar documentos até cadastrar outro .pfx.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Enviar certificado .pfx
          </h3>
          <div className="space-y-2">
            <Label>Arquivo .pfx / .p12</Label>
            <Input ref={fileRef} type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="space-y-2">
            <Label>Senha do certificado</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha do .pfx"
                autoComplete="off"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              A senha é usada apenas para validar e extrair os metadados. Não fica salva.
            </p>
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file || !password} className="w-full">
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            {uploading ? "Validando e criptografando…" : "Cadastrar certificado"}
          </Button>
        </div>
      )}
    </div>
  );
}
