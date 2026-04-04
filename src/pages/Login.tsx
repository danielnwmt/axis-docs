import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axisLogo from "@/assets/axis-logo-full.jpeg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isResetting) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "E-mail enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
        setIsResetting(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4 relative overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        src="/videos/login-bg.mp4"
      />
      <div className="absolute inset-0 bg-primary/60 z-0" />
      <div className="w-full max-w-md bg-card/30 backdrop-blur-md rounded-2xl shadow-xl p-8 animate-fade-in relative z-10 border border-white/20">
        <div className="text-center mb-8">
          <img src={axisLogo} alt="Axis Docs" className="h-36 mx-auto" />
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {!isResetting && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Carregando..."
              : isResetting
              ? "Enviar Link"
              : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {!isResetting ? (
            <button
              onClick={() => setIsResetting(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Esqueceu a senha?
            </button>
          ) : (
            <button
              onClick={() => setIsResetting(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Voltar ao login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
