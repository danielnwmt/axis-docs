import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldCheck, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";
import axisLogo from "@/assets/axis-logo.png";

export default function MfaVerify() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (levels?.currentLevel === "aal2" || levels?.nextLevel !== "aal2") {
          navigate("/", { replace: true });
          return;
        }
        const { data: list, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const totp = (list?.totp || []).find((f: any) => f.status === "verified");
        if (!totp) {
          navigate("/", { replace: true });
          return;
        }
        setFactorId(totp.id);
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
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
      await logAudit("Verificou 2FA no login", "login", factorId);
      navigate("/", { replace: true });
    } catch (e: any) {
      toast({ title: "Código inválido", description: e.message, variant: "destructive" });
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8">
        <div className="text-center mb-6">
          <img src={axisLogo} alt="Axis Docs" className="h-24 mx-auto" />
        </div>
        <div className="flex items-center gap-3 mb-4 justify-center">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="font-display text-xl font-bold text-foreground">Verificação em 2 fatores</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground text-center">
              Digite o código de 6 dígitos exibido no seu app autenticador.
            </p>

            <div className="space-y-2">
              <Label className="sr-only">Código TOTP</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <Button onClick={handleVerify} disabled={code.length !== 6 || verifying} className="w-full">
              {verifying ? "Verificando..." : "Verificar"}
            </Button>

            <button
              onClick={() => signOut()}
              className="block mx-auto text-sm text-muted-foreground hover:text-foreground"
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
