import { AppLayout } from "@/components/layout/AppLayout";
import { Shield, Upload, Edit, Trash2, LogIn, PenTool, Eye, Download, ScanText, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const actionIcons: Record<string, typeof Upload> = {
  upload: Upload,
  view: Eye,
  download: Download,
  edit: Edit,
  delete: Trash2,
  sign: PenTool,
  login: LogIn,
  ocr: ScanText,
};

const actionLabels: Record<string, string> = {
  upload: "Upload",
  view: "Visualização",
  download: "Download",
  edit: "Edição",
  delete: "Exclusão",
  sign: "Assinatura",
  login: "Login",
  ocr: "OCR",
};

export default function Audit() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500) as any);
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = logs.filter((log: any) => {
    const matchesSearch =
      !search ||
      log.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      log.target?.toLowerCase().includes(search.toLowerCase()) ||
      log.action?.toLowerCase().includes(search.toLowerCase());
    const matchesAction = actionFilter === "all" || log.action_type === actionFilter;
    return matchesSearch && matchesAction;
  });

  const exportCSV = () => {
    const headers = ["Data/Hora", "Ação", "Tipo", "Usuário", "Documento/Alvo", "Detalhes"];
    const rows = filtered.map((log: any) => [
      format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss"),
      log.action,
      actionLabels[log.action_type] || log.action_type,
      log.user_email,
      log.target,
      log.details || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${format(new Date(), "yyyy-MM-dd_HHmmss")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-primary" />
          <h1 className="font-display text-2xl font-bold text-foreground">Auditoria</h1>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2">
          <FileDown className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Filtrar por usuário, documento ou ação..."
          className="max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(actionLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-5 py-3 font-semibold text-foreground">Ação</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Usuário</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Documento/Alvo</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">Nenhum registro de auditoria encontrado.</td></tr>
            ) : (
              filtered.map((log: any) => {
                const Icon = actionIcons[log.action_type] || Shield;
                return (
                  <tr key={log.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="font-medium text-foreground">{log.action}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{log.user_email}</td>
                    <td className="px-5 py-3 text-muted-foreground">{log.target}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
