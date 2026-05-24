import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import axisLogo from "@/assets/axis-logo.png";

export default function ChangePassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      toast({ title: "Senha fraca", description: "Mínimo 10 caracteres, com maiúscula, número e símbolo.", variant: "destructive" });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }

    if (!acceptTerms) {
      toast({ title: "Aceite obrigatório", description: "Você deve aceitar a Política de Privacidade e os Termos de Uso.", variant: "destructive" });
      return;
    }

    if (!session || !user) {
      toast({ title: "Erro", description: "Sessão expirada. Faça login novamente.", variant: "destructive" });
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) throw pwError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      if (profileError) throw profileError;

      // Registrar consentimentos LGPD (prova legal — Art. 8º §1º)
      const ua = navigator.userAgent;
      await supabase.rpc("record_consent", { _document_type: "privacy_policy", _version: "1.0", _ip: null, _user_agent: ua });
      await supabase.rpc("record_consent", { _document_type: "terms_of_use", _version: "1.0", _ip: null, _user_agent: ua });

      await queryClient.invalidateQueries({ queryKey: ["profile-access-check", user.id] });
      await queryClient.refetchQueries({ queryKey: ["profile-access-check", user.id] });

      toast({ title: "Senha alterada", description: "Sua senha foi atualizada com sucesso." });
      navigate("/", { replace: true });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4 relative overflow-hidden">
      <video
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        src="/videos/login-bg.mp4"
      />
      <div className="absolute inset-0 bg-primary/60 z-0" />
      <div className="w-full max-w-md bg-card/30 backdrop-blur-md rounded-2xl shadow-xl p-8 animate-fade-in relative z-10 border border-white/20">
        <div className="text-center mb-6">
          <img src={axisLogo} alt="Axis Docs" className="h-24 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground">Alteração de Senha Obrigatória</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Por segurança, altere sua senha no primeiro acesso.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova Senha</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={10}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showNew ? "Ocultar senha" : "Mostrar senha"}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Mín. 10 caracteres, com maiúscula, número e símbolo.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={10}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Checkbox id="accept" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} />
            <Label htmlFor="accept" className="text-xs leading-snug cursor-pointer">
              Li e aceito a{" "}
              <Link to="/privacidade" target="_blank" className="text-info underline">Política de Privacidade</Link>{" "}
              e os{" "}
              <Link to="/termos" target="_blank" className="text-info underline">Termos de Uso</Link>.
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading || !acceptTerms}>
            {loading ? "Salvando..." : "Alterar Senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
