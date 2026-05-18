import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const KEY = "axisdocs_cookie_consent";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(KEY)) setShow(true);
  }, []);

  const decide = async (accepted: boolean) => {
    localStorage.setItem(KEY, accepted ? "accepted" : "rejected");
    setShow(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc("record_consent", {
          _document_type: "cookies",
          _version: "1.0",
          _ip: null,
          _user_agent: navigator.userAgent,
        });
      }
    } catch {}
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 bg-card border shadow-2xl rounded-xl p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <Cookie className="w-6 h-6 text-info shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <p className="text-sm text-foreground/90">
            Usamos cookies técnicos essenciais para autenticação e funcionamento do sistema. Saiba mais em nossa{" "}
            <Link to="/privacidade" className="text-info underline">Política de Privacidade</Link>.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(true)}>Aceitar</Button>
            <Button size="sm" variant="outline" onClick={() => decide(false)}>Apenas essenciais</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
