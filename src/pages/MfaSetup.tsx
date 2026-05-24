import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { ShieldCheck, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

export default function MfaSetup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [factorId, setFactorId] = useState<string>("");
  const [qr, setQr] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [code, setCode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Remove fatores TOTP não verificados pendentes (evita duplicidade)
        const { data: list } = await supabase.auth.mfa.listFactors();
        const pending = (list?.all || []).filter(
          (f: any) => f.factor_type === "totp" && f.status !== "verified",
        );
        for (const f of pending) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `AxisDocs ${new Date().toISOString().slice(0, 10)}`,
        });
        if (error) throw error;
        setFactorId(data.id);
        setQr(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
        navigate("/settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, toast]);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      const { data: chal, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: chal.id,
        code,
      });
      if (vErr) throw vErr;
      await logAudit("Ativou autenticação em 2 fatores (TOTP)", "edit", factorId);
      toast({ title: "MFA ativado", description: "A partir do próximo login será exigido um código." });
      navigate("/settings");
    } catch (e: any) {
      toast({ title: "Código inválido", description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto bg-card border border-border rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <h1 className="font-display text-2xl font-bold text-foreground">Ativar 2FA (TOTP)</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Use um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password, Authy)
              para escanear o QR code abaixo, ou digite a chave manualmente.
            </p>

            <div className="flex justify-center bg-white p-4 rounded-lg border border-border">
              {qr && <QRCodeSVG value={qr} size={200} />}
            </div>

            <div className="space-y-1">
              <Label>Chave manual</Label>
              <code className="block w-full px-3 py-2 bg-secondary rounded text-xs font-mono break-all">
                {secret}
              </code>
            </div>

            <div className="space-y-2">
              <Label>Digite o código de 6 dígitos gerado pelo app</Label>
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => navigate("/settings")}>Cancelar</Button>
              <Button onClick={handleVerify} disabled={code.length !== 6 || verifying}>
                {verifying ? "Verificando..." : "Ativar 2FA"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
