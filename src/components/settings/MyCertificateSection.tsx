import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Upload, Trash2, AlertCircle, Loader2, FileKey2 } from "lucide-react";
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
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";
  const expired = cert?.valid_to ? new Date(cert.valid_to) < new Date() : false;

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
        <div className={`rounded-xl border p-5 space-y-3 ${expired ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
          <div className="flex items-center gap-2">
            <FileKey2 className="w-5 h-5 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Certificado ativo</h3>
            {expired && <span className="ml-auto text-xs font-bold text-destructive">EXPIRADO</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Titular (CN)</p><p className="text-foreground font-medium">{cert.subject_cn || "—"}</p></div>
            <div><p className="text-muted-foreground text-xs">CPF</p><p className="text-foreground font-medium">{cert.cpf || "—"}</p></div>
            <div><p className="text-muted-foreground text-xs">Emissor</p><p className="text-foreground font-medium">{cert.issuer || "—"}</p></div>
            <div><p className="text-muted-foreground text-xs">Validade</p><p className="text-foreground font-medium">{fmtDate(cert.valid_from)} → {fmtDate(cert.valid_to)}</p></div>
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
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha do .pfx" autoComplete="off" />
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
