import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axisLogo from "@/assets/axis-logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
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
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Conta criada!", description: "Verifique seu e-mail para confirmar o cadastro." });
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
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8 animate-fade-in relative z-10">
        <div className="text-center mb-8">
          <img src={axisLogo} alt="Axis Docs" className="h-12 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground">
            {isResetting ? "Recuperar Senha" : isSignUp ? "Criar Conta" : "Entrar"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isResetting
              ? "Informe seu e-mail para redefinir a senha"
              : "Digitalize, encontre, controle"}
          </p>
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
              : isSignUp
              ? "Criar Conta"
              : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {!isResetting && (
            <button
              onClick={() => setIsResetting(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Esqueceu a senha?
            </button>
          )}
          <div>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setIsResetting(false);
              }}
              className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
            >
              {isSignUp ? "Já tem conta? Entrar" : "Criar nova conta"}
            </button>
          </div>
          {isResetting && (
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
