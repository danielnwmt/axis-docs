import { AlertTriangle, FileText, PenTool } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Alert {
  icon: typeof AlertTriangle;
  text: string;
  color: string;
}

export function PendingAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from("documents")
        .select("ocr_status, sign_status")
        .order("created_at", { ascending: false });

      if (data) {
        const ocrPending = data.filter((d) => d.ocr_status === "pendente").length;
        const signPending = data.filter((d) => d.sign_status === "pendente").length;
        const newAlerts: Alert[] = [];

        if (ocrPending > 0) {
          newAlerts.push({
            icon: FileText,
            text: `${ocrPending} documento(s) aguardando processamento OCR`,
            color: "text-warning",
          });
        }
        if (signPending > 0) {
          newAlerts.push({
            icon: PenTool,
            text: `${signPending} documento(s) com assinatura pendente`,
            color: "text-destructive",
          });
        }
        if (newAlerts.length === 0) {
          newAlerts.push({
            icon: AlertTriangle,
            text: "Nenhum alerta pendente no momento.",
            color: "text-muted-foreground",
          });
        }
        setAlerts(newAlerts);
      }
    };
    fetchAlerts();
  }, []);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-display font-semibold text-foreground">Alertas Pendentes</h3>
      </div>
      <div className="divide-y divide-border">
        {alerts.map((a, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3">
            <a.icon className={`w-4 h-4 mt-0.5 shrink-0 ${a.color}`} />
            <span className="text-sm text-foreground">{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
