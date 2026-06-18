import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { isLocalInstall } from "@/lib/adminApi";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const recoveryToken = searchParams.get("token");
  const apiBaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLocalInstall() && recoveryToken) {
        const resp = await fetch(`${apiBaseUrl}/auth/v1/recover/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: publishableKey },
          body: JSON.stringify({ token: recoveryToken, password }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.error) throw new Error(data?.error || "Não foi possível redefinir a senha.");
        toast({ title: "Senha atualizada!", description: "Faça login com a nova senha." });
        navigate("/login");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Senha atualizada!", description: "Você já pode acessar o sistema." });
      navigate("/");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8">
        <h1 className="font-display text-2xl font-bold text-foreground text-center mb-6">Nova Senha</h1>
        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Redefinir Senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
