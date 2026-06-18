import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Settings as SettingsIcon, Building, Tag, FolderTree, Sliders, ArrowLeft, Plus, Trash2, Edit2, Save, X, Upload, HardDrive, CheckCircle, AlertCircle, RefreshCw, DatabaseBackup, FileSignature, Eye, EyeOff, Download, KeyRound, ShieldCheck, ShieldAlert, Smartphone, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedList } from "@/lib/adminLookups";
import { loadLicenseConfig, saveLicenseConfig, validateLicense, clearLicenseCache, unlockTemporary, normalizeLicenseServerUrl, type LicenseInfo } from "@/lib/license";
import { getStorageQuota, formatBytes, type StorageQuota } from "@/lib/storageQuota";
import { MyCertificateSection } from "@/components/settings/MyCertificateSection";
import { SystemUpdateSection } from "@/components/settings/SystemUpdateSection";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { isLocalInstall } from "@/lib/adminApi";

type Section = "orgao" | "categorias" | "unidades" | "parametros" | "googledrive" | "meucertificado" | "backup" | "licenca" | "mobile" | "minhasenha" | "mfa" | "sistema" | null;

// Apenas Administrador
const ADMIN_ONLY_SECTIONS: Section[] = ["orgao", "categorias", "unidades", "parametros", "googledrive", "licenca", "sistema"];
// Administrador + Operador (escondidas apenas para Usuário)
const STAFF_SECTIONS: Section[] = ["backup"];

const sectionCards = [
  { id: "orgao" as Section, icon: Building, title: "Dados do Órgão", description: "Nome, CNPJ e informações institucionais" },
  { id: "categorias" as Section, icon: Tag, title: "Categorias Documentais", description: "Gerenciar tipos de documentos" },
  { id: "unidades" as Section, icon: FolderTree, title: "Unidades/Setores", description: "Gerenciar a estrutura organizacional" },
  { id: "parametros" as Section, icon: Sliders, title: "Parâmetros do Sistema", description: "Configurações gerais da plataforma" },
  { id: "googledrive" as Section, icon: HardDrive, title: "Google Drive", description: "Configurar integração com Google Drive via API" },

  { id: "meucertificado" as Section, icon: ShieldCheck, title: "Meu Certificado", description: "Cadastre seu certificado A1 (.pfx) ICP-Brasil para assinar documentos" },
  { id: "minhasenha" as Section, icon: KeyRound, title: "Minha Senha", description: "Alterar a sua senha de acesso ao sistema" },
  { id: "mfa" as Section, icon: ShieldCheck, title: "Autenticação 2 Fatores", description: "Ative o segundo fator (TOTP) usando Google Authenticator, Authy, 1Password etc." },
  { id: "backup" as Section, icon: DatabaseBackup, title: "Backup & Restauração", description: "Exportar e importar usuários, auditoria e referências de documentos" },
  { id: "licenca" as Section, icon: KeyRound, title: "Licença", description: "Ativar e consultar o status da licença do AxisDocs" },
  { id: "mobile" as Section, icon: Smartphone, title: "Acesso Mobile", description: "QR Code para abrir o sistema no aplicativo" },
  { id: "sistema" as Section, icon: RefreshCw, title: "Gerenciamento do Sistema", description: "Verificar e aplicar atualizações do AxisDocs na VPS" },
];

function MyPasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 10 || !/[A-Z]/.test(next) || !/[0-9]/.test(next) || !/[^A-Za-z0-9]/.test(next)) {
      toast({ title: "Senha fraca", description: "Mínimo 10 caracteres, com maiúscula, número e símbolo.", variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (!user?.email) {
      toast({ title: "Erro", description: "Sessão inválida.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (signInError) throw new Error("Senha atual incorreta.");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      toast({ title: "Senha alterada", description: "Sua senha foi atualizada com sucesso." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const renderField = (id: string, label: string, value: string, set: (v: string) => void, show: boolean, setShow: (f: (v: boolean) => boolean) => void) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => set(e.target.value)} required className="pr-10" autoComplete="new-password" />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={show ? "Ocultar" : "Mostrar"}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {renderField("current-pw", "Senha atual", current, setCurrent, showCurrent, setShowCurrent)}
      {renderField("new-pw", "Nova senha", next, setNext, showNext, setShowNext)}
      <p className="text-[11px] text-muted-foreground -mt-2">Mín. 10 caracteres, com maiúscula, número e símbolo.</p>
      {renderField("confirm-pw", "Confirmar nova senha", confirm, setConfirm, showConfirm, setShowConfirm)}
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : "Alterar Senha"}
      </Button>
    </form>
  );
}

function MobileAccessSection() {
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "URL copiada" });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  };
  const handleDownload = () => {
    const svg = document.getElementById("axis-mobile-qrcode");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const data = serializer.serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "axisdocs-qrcode.svg";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-muted-foreground">
        Aponte a câmera do aplicativo para o QR Code abaixo para abrir esta instalação do AxisDocs.
      </p>
      <div className="flex flex-col items-center gap-4 p-6 bg-secondary/40 rounded-xl border border-border">
        <div className="bg-white p-4 rounded-lg">
          <QRCodeSVG id="axis-mobile-qrcode" value={url} size={224} level="H" includeMargin={false} />
        </div>
        <code className="text-xs text-muted-foreground break-all text-center">{url}</code>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCopy} className="flex-1">
          <Copy className="w-4 h-4 mr-2" /> Copiar URL
        </Button>
        <Button variant="outline" onClick={handleDownload} className="flex-1">
          <Download className="w-4 h-4 mr-2" /> Baixar QR Code
        </Button>
      </div>
    </div>
  );
}

function OrgaoSection() {
  const [data, setData] = useState({
    nome: "",
    cnpj: "",
    endereco: "",
    telefone: "",
    email: "",
    responsavel: "",
  });

  const handleSave = () => {
    toast({ title: "Dados salvos com sucesso!" });
  };

  return (
    <div className="space-y-4 max-w-xl">
      {[
        { key: "nome", label: "Nome do Órgão" },
        { key: "cnpj", label: "CNPJ" },
        { key: "endereco", label: "Endereço" },
        { key: "telefone", label: "Telefone" },
        { key: "email", label: "E-mail institucional" },
        { key: "responsavel", label: "Responsável" },
      ].map((field) => (
        <div key={field.key} className="space-y-1">
          <Label>{field.label}</Label>
          <Input
            value={data[field.key as keyof typeof data]}
            onChange={(e) => setData({ ...data, [field.key]: e.target.value })}
            placeholder={field.label}
          />
        </div>
      ))}
      <Button onClick={handleSave} className="mt-2">
        <Save className="w-4 h-4 mr-2" /> Salvar
      </Button>
    </div>
  );
}


function ListManager({ itemLabel, tableName }: { itemLabel: string; tableName: "categories" | "units" }) {
  const [items, setItems] = useState<{ id: string; name: string; active: boolean; is_default: boolean }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const fetchItems = async () => {
    try {
      const data = await fetchManagedList(tableName);
      setItems(data);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || `Não foi possível carregar ${itemLabel.toLowerCase()}.`, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [tableName]);

  const addItem = async () => {
    if (!newItem.trim()) return;
    const { error } = await supabase.from(tableName).insert({ name: newItem.trim() });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewItem("");
    toast({ title: `${itemLabel} adicionado(a)!` });
    fetchItems();
  };

  const toggleActive = async (idx: number) => {
    const item = items[idx];
    const { error } = await supabase.from(tableName).update({ active: !item.active }).eq("id", item.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: item.active ? `${itemLabel} inativado(a)!` : `${itemLabel} ativado(a)!` });
    fetchItems();
  };

  const removeItem = async (idx: number) => {
    const item = items[idx];
    if (item.is_default) {
      toast({ title: "Não permitido", description: "Itens padrão do sistema não podem ser excluídos, apenas inativados.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from(tableName).delete().eq("id", item.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${itemLabel} removido(a)!` });
    fetchItems();
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(items[idx].name);
  };

  const saveEdit = async () => {
    if (editingIdx === null || !editValue.trim()) return;
    const { error } = await supabase.from(tableName).update({ name: editValue.trim() }).eq("id", items[editingIdx].id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setEditingIdx(null);
    toast({ title: `${itemLabel} atualizado(a)!` });
    fetchItems();
  };

  const filteredItems = showInactive ? items : items.filter(i => i.active);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Nome do(a) ${itemLabel.toLowerCase()}`}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <Button onClick={addItem} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Adicionar
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="showInactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded border-border"
        />
        <Label htmlFor="showInactive" className="text-sm text-muted-foreground cursor-pointer">Mostrar inativos</Label>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && filteredItems.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum(a) {itemLabel.toLowerCase()} cadastrado(a).</p>
      )}
      <div className="space-y-2">
        {filteredItems.map((item) => {
          const idx = items.indexOf(item);
          return (
            <div key={item.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${item.active ? "bg-secondary/50" : "bg-secondary/20 opacity-60"}`}>
              {editingIdx === idx ? (
                <>
                  <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8" onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
                  <Button size="icon" variant="ghost" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingIdx(null)}><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-foreground">
                    {item.name}
                    {item.is_default && <span className="ml-2 text-xs text-muted-foreground">(padrão)</span>}
                    {!item.active && <span className="ml-2 text-xs text-destructive">(inativo)</span>}
                  </span>
                  {!item.is_default && <Button size="icon" variant="ghost" onClick={() => startEdit(idx)}><Edit2 className="w-4 h-4" /></Button>}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleActive(idx)}
                    title={item.active ? "Inativar" : "Ativar"}
                  >
                    {item.active ? <X className="w-4 h-4 text-warning" /> : <Save className="w-4 h-4 text-primary" />}
                  </Button>
                  {!item.is_default && (
                    <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParametrosSection() {
  const [params, setParams] = useState({
    tamanhoMaxMB: "50",
    autoOCR: true,
  });
  const [updating, setUpdating] = useState(false);
  const [versionInfo, setVersionInfo] = useState<{ version: string; commit?: string; built_at?: string }>({ version: "" });

  useEffect(() => {
    import("@/lib/version").then(async (m) => {
      setVersionInfo({ version: m.APP_VERSION });
      const info = await m.fetchSystemVersion();
      setVersionInfo(info);
    });
  }, []);

  const handleSave = () => {
    localStorage.removeItem("allow_unsigned_uploads");
    toast({ title: "Parâmetros salvos com sucesso!" });
  };

  const handleSystemUpdate = async () => {
    if (!confirm("Deseja atualizar o AxisDocs agora?\n\nO sistema buscará a última versão oficial e refará o build.\nIsso pode levar alguns minutos e a página será recarregada ao final.")) return;
    setUpdating(true);
    try {
      const { triggerSystemUpdate } = await import("@/lib/version");
      const res = await triggerSystemUpdate();
      if (!res.ok) {
        toast({ title: "Falha ao iniciar atualização", description: res.message || "Verifique se você está em uma instalação local.", variant: "destructive" });
        setUpdating(false);
        return;
      }
      toast({ title: "Atualização iniciada", description: "Aguarde o rebuild concluir. A página recarregará automaticamente em ~90s." });
      setTimeout(() => window.location.reload(), 90_000);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setUpdating(false);
    }
  };

  const handleSystemBackup = () => {
    toast({ title: "Backup do sistema", description: "No servidor, execute: sudo /opt/axisdocs/backup.sh" });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-1">
        <Label>Tamanho máximo de arquivo (MB)</Label>
        <Input type="number" value={params.tamanhoMaxMB} onChange={(e) => setParams({ ...params, tamanhoMaxMB: e.target.value })} />
      </div>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="autoOCR"
          checked={params.autoOCR}
          onChange={(e) => setParams({ ...params, autoOCR: e.target.checked })}
          className="rounded border-border"
        />
        <Label htmlFor="autoOCR">Ativar OCR automático nos uploads</Label>
      </div>
      <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
        <div className="flex-1">
          <p className="text-sm font-medium">Assinatura ICP-Brasil obrigatória</p>
          <p className="text-xs text-muted-foreground mt-1">
            Conforme a Lei 12.682/2012 e o Decreto 10.278/2020, o sistema aceita apenas PDFs já assinados com certificado ICP-Brasil ou que serão assinados no momento do envio. Não é possível desativar esta exigência.
          </p>
        </div>
      </div>
      <Button onClick={handleSave} className="mt-2">
        <Save className="w-4 h-4 mr-2" /> Salvar
      </Button>

      <div className="pt-4 mt-4 border-t border-border space-y-3">
        <div>
          <Label>Versão do sistema</Label>
          <div className="text-sm text-foreground mt-1">
            <span className="font-mono font-semibold">v{versionInfo.version || "—"}</span>
            {versionInfo.commit && (
              <span className="text-xs text-muted-foreground ml-2">• commit {versionInfo.commit}</span>
            )}
            {versionInfo.built_at && (
              <span className="text-xs text-muted-foreground ml-2">
                • build {new Date(versionInfo.built_at).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>

        <Label>Manutenção do sistema</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={handleSystemBackup} className="gap-2">
            <DatabaseBackup className="w-4 h-4" /> Fazer backup
          </Button>
        </div>
      </div>
    </div>
  );
}

function GoogleDriveSection() {
  const [jsonContent, setJsonContent] = useState("");
  const [rootFolderId, setRootFolderId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data } = await supabase.storage.from("settings").download("google-drive-config.json");
        if (data) {
          const text = await data.text();
          const config = JSON.parse(text);
          setRootFolderId(config.rootFolderId || "");
          setOwnerEmail(config.ownerEmail || "");
          if (config.serviceAccount) {
            setJsonContent(JSON.stringify(config.serviceAccount, null, 2));
          }
          setStatus("saved");
        }
      } catch {
        // No config yet
      }
    };
    loadConfig();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        JSON.parse(text);
        setJsonContent(text);
        setStatus("idle");
      } catch {
        toast({ title: "Erro", description: "Arquivo JSON inválido.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!jsonContent.trim()) {
      toast({ title: "Erro", description: "Cole ou envie o JSON da conta de serviço.", variant: "destructive" });
      return;
    }
    try {
      const parsed = JSON.parse(jsonContent);
      if (!parsed.client_email || !parsed.private_key) {
        toast({ title: "Erro", description: "JSON precisa conter 'client_email' e 'private_key'.", variant: "destructive" });
        return;
      }
    } catch {
      toast({ title: "Erro", description: "JSON inválido.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const config = {
        authMode: "service-account",
        rootFolderId: rootFolderId.trim(),
        ownerEmail: ownerEmail.trim(),
        serviceAccount: JSON.parse(jsonContent),
      };

      const blob = new Blob([JSON.stringify(config)], { type: "application/json" });
      await supabase.storage.from("settings").remove(["google-drive-config.json"]);
      const { error } = await supabase.storage.from("settings").upload("google-drive-config.json", blob, { upsert: true });
      if (error) throw error;

      setStatus("saved");
      toast({ title: "Configuração do Google Drive salva!" });
    } catch (err: unknown) {
      setStatus("error");
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
        <HardDrive className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <p>Configure a integração com o Google Drive usando uma <strong>Conta de Serviço</strong>.</p>
          <p className="mt-1">A conta de serviço permite acesso programático ao Drive sem interação do usuário.</p>
        </div>
      </div>

      {/* Root Folder ID */}
      <div className="space-y-2">
        <Label>ID da Pasta Raiz no Google Drive</Label>
        <Input
          placeholder="Ex: 1A2B3C4D5E6F..."
          value={rootFolderId}
          onChange={(e) => { setRootFolderId(e.target.value); setStatus("idle"); }}
        />
        <p className="text-xs text-muted-foreground">O ID está na URL da pasta: drive.google.com/drive/folders/<strong>ID_AQUI</strong></p>
      </div>

      <div className="space-y-2">
        <Label>E-mail do Proprietário (para transferência de cota)</Label>
        <Input
          type="email"
          placeholder="seuemail@gmail.com"
          value={ownerEmail}
          onChange={(e) => { setOwnerEmail(e.target.value); setStatus("idle"); }}
        />
      </div>

      <div className="space-y-2">
        <Label>JSON da Conta de Serviço</Label>
        <div className="flex gap-2 mb-2">
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
            <Upload className="w-4 h-4" /> Carregar arquivo .json
          </Button>
        </div>
        <textarea
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[200px]"
          placeholder='Cole aqui o conteúdo do arquivo JSON da conta de serviço...'
          value={jsonContent}
          onChange={(e) => { setJsonContent(e.target.value); setStatus("idle"); }}
        />
      </div>

      {status === "saved" && (
        <div className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle className="w-4 h-4" /> Configuração salva e ativa
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" /> Erro na configuração
        </div>
      )}

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar Configuração"}
      </Button>
    </div>
  );
}

interface BackupSettingsRow {
  id: string;
  retention_days: number;
  auto_cleanup: boolean;
  drive_folder_id: string | null;
  schedule_time: string;
  schedule_enabled: boolean;
  last_scheduled_run: string | null;
}
interface BackupFileRow {
  id: string;
  file_name: string;
  drive_link: string | null;
  file_size: number;
  retention_days: number;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
  sha256?: string | null;
  encrypted?: boolean | null;
  encryption_algo?: string | null;
}

function BackupSection() {
  const [exporting, setExporting] = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastStats, setLastStats] = useState<Record<string, number> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<BackupSettingsRow | null>(null);
  const [retentionInput, setRetentionInput] = useState<number>(5);
  const [autoCleanup, setAutoCleanup] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [files, setFiles] = useState<BackupFileRow[]>([]);
  const [scheduleTime, setScheduleTime] = useState<string>("02:00");
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false);

  const loadSettings = async () => {
    const { data } = await (supabase as any).from("backup_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setSettings(data);
      setRetentionInput(data.retention_days);
      setAutoCleanup(data.auto_cleanup);
      setScheduleTime(String(data.schedule_time || "02:00:00").slice(0, 5));
      setScheduleEnabled(!!data.schedule_enabled);
    }
  };
  const loadFiles = async () => {
    const { data } = await (supabase as any).from("backup_files").select("*").order("created_at", { ascending: false }).limit(20);
    setFiles((data as BackupFileRow[]) || []);
  };
  useEffect(() => { loadSettings(); loadFiles(); }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    const days = Math.max(1, Math.min(365, Number(retentionInput) || 5));
    const timeValue = /^\d{2}:\d{2}$/.test(scheduleTime) ? `${scheduleTime}:00` : "02:00:00";
    const { error } = await (supabase as any).from("backup_settings").update({
      retention_days: days,
      auto_cleanup: autoCleanup,
      schedule_time: timeValue,
      schedule_enabled: scheduleEnabled,
      updated_at: new Date().toISOString(),
    }).eq("id", settings.id);
    setSavingSettings(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rotina de backup salva", description: scheduleEnabled ? `Backup diário às ${scheduleTime}. Retenção: ${days} dias.` : `Retenção: ${days} dias. Agendamento desativado.` });
      loadSettings();
    }
  };

  const callBackupFn = async (action: string, body?: unknown) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-restore?action=${action}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
    if (!resp.ok) throw new Error(parsed?.error || raw || `HTTP ${resp.status}`);
    return parsed;
  };

  const handleExportDrive = async () => {
    setExportingDrive(true);
    try {
      const data = await callBackupFn("export-to-drive");
      toast({ title: "Backup enviado ao Google Drive", description: `Expira em ${(data as any).file?.retention_days} dias.` });
      loadFiles();
    } catch (err: unknown) {
      toast({ title: "Erro ao enviar para o Drive", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setExportingDrive(false);
    }
  };

  const handleCleanupNow = async () => {
    setCleaning(true);
    try {
      const data = await callBackupFn("cleanup-now");
      toast({ title: "Limpeza concluída", description: `${(data as any).deleted || 0} arquivo(s) removido(s).` });
      loadFiles();
    } catch (err: unknown) {
      toast({ title: "Erro na limpeza", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    if (!confirm("Excluir este backup do Google Drive?")) return;
    try {
      await callBackupFn("delete-drive-backup", { id });
      toast({ title: "Backup excluído" });
      loadFiles();
    } catch (err: unknown) {
      toast({ title: "Erro ao excluir", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await callBackupFn("export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `axisdocs-backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup gerado", description: `Arquivo cifrado salvo.` });
    } catch (err: unknown) {
      toast({ title: "Erro ao exportar", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };


  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("Restaurar o backup pode sobrescrever dados existentes. Continuar?")) {
      e.target.value = "";
      return;
    }
    setImporting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const text = await file.text();
      const backup = JSON.parse(text);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-restore?action=import`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ backup }),
      });
      const raw = await resp.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
      if (!resp.ok) {
        throw new Error(parsed?.error || raw || `HTTP ${resp.status}`);
      }
      setLastStats(parsed?.stats);
      toast({ title: "Backup restaurado com sucesso!" });
    } catch (err: unknown) {
      toast({ title: "Erro ao restaurar", description: err instanceof Error ? err.message : "Arquivo inválido", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
        <DatabaseBackup className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <p>O backup gera um arquivo <strong>.json</strong> contendo perfis, auditoria, metadados de documentos, categorias e unidades.</p>
          <p className="mt-2 text-xs">⚠️ Os arquivos físicos no Google Drive não são incluídos — apenas as referências (IDs).</p>
        </div>
      </div>

      {/* Rotina automática */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          <Label className="text-base font-semibold">Rotina de Backup no Google Drive</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Defina o horário em que o backup automático será enviado ao Google Drive todos os dias. Cada arquivo é mantido pelo período de retenção e removido automaticamente após esse prazo (verificação diária às 03:00, horário de Brasília).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="schedule-time">Horário do backup diário</Label>
            <Input id="schedule-time" type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Fuso: Brasília (UTC−3). Verificação a cada hora.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="retention">Retenção (dias)</Label>
            <Input id="retention" type="number" min={1} max={365}
              value={retentionInput}
              onChange={(e) => setRetentionInput(Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">Após esse prazo o backup é apagado do Drive.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} className="h-4 w-4" />
            Backup automático agendado ativo
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={autoCleanup} onChange={(e) => setAutoCleanup(e.target.checked)} className="h-4 w-4" />
            Limpeza automática de expirados ativa
          </label>
          <Button onClick={handleSaveSettings} disabled={savingSettings} className="gap-2 sm:ml-auto">
            <Save className="w-4 h-4" /> {savingSettings ? "Salvando..." : "Salvar rotina"}
          </Button>
        </div>
        {settings?.last_scheduled_run && (
          <p className="text-xs text-muted-foreground pt-1">
            Último backup automático: <strong>{new Date(settings.last_scheduled_run).toLocaleDateString("pt-BR")}</strong>
          </p>
        )}
      </div>

      {/* Ações de backup */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button onClick={handleExportDrive} disabled={exportingDrive} className="gap-2">
          <HardDrive className="w-4 h-4" /> {exportingDrive ? "Enviando..." : "Fazer backup no Google Drive"}
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
          <Download className="w-4 h-4" /> {exporting ? "Gerando..." : "Baixar backup (.json)"}
        </Button>
      </div>

      {/* Lista de backups no Drive */}
      <div className="space-y-2 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Backups no Google Drive</Label>
          <Button size="sm" variant="ghost" onClick={handleCleanupNow} disabled={cleaning} className="gap-2">
            <Trash2 className="w-4 h-4" /> {cleaning ? "Limpando..." : "Limpar expirados agora"}
          </Button>
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
            Nenhum backup enviado ao Drive ainda.
          </p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {files.map((f) => {
              const expired = !f.deleted_at && new Date(f.expires_at) <= new Date();
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleString("pt-BR")} · {(f.file_size / 1024).toFixed(1)} KB · retenção {f.retention_days}d
                      {f.encrypted && <span className="ml-2 text-success">🔒 {f.encryption_algo || "AES-256-GCM"}</span>}
                    </div>
                    {f.sha256 && <div className="text-[10px] text-muted-foreground font-mono truncate">SHA-256: {f.sha256}</div>}
                    <div className={`text-xs ${f.deleted_at ? "text-muted-foreground" : expired ? "text-destructive" : "text-primary"}`}>
                      {f.deleted_at
                        ? `Removido em ${new Date(f.deleted_at).toLocaleString("pt-BR")}`
                        : `Expira em ${new Date(f.expires_at).toLocaleString("pt-BR")}${expired ? " (aguardando limpeza)" : ""}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f.drive_link && !f.deleted_at && (
                      <a href={f.drive_link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        Abrir no Drive
                      </a>
                    )}
                    {!f.deleted_at && (
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteBackup(f.id)} className="h-7 w-7 p-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Restaurar */}
      <div className="space-y-3 pt-4 border-t border-border">
        <Label className="text-base font-semibold">Restaurar Backup</Label>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-2">
          <Upload className="w-4 h-4" /> {importing ? "Restaurando..." : "Selecionar arquivo .json"}
        </Button>
        {lastStats && (
          <div className="text-sm text-muted-foreground p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="flex items-center gap-2 text-primary mb-1"><CheckCircle className="w-4 h-4" /> Restauração concluída</div>
            <ul className="text-xs space-y-0.5">
              {Object.entries(lastStats).map(([k, v]) => (<li key={k}>{k}: {v}</li>))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function LicencaSection() {
  const [config, setConfig] = useState<LicenseInfo | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [quota, setQuota] = useState<StorageQuota | null>(null);

  const refreshQuota = async () => {
    try { setQuota(await getStorageQuota()); } catch {}
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const res = await unlockTemporary();
      if (res.ok) {
        clearLicenseCache();
        await validateLicense();
        const c = await loadLicenseConfig();
        setConfig(c);
        await refreshQuota();
        toast({
          title: "Sistema desbloqueado",
          description: res.valid_until
            ? `Válido até ${new Date(res.valid_until).toLocaleString("pt-BR")}`
            : "Desbloqueio temporário ativado por 24h.",
        });
      } else {
        toast({ title: "Não foi possível desbloquear", description: res.message || "Tente novamente mais tarde.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Falha no desbloqueio", description: e.message, variant: "destructive" });
    } finally {
      setUnlocking(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const c = await loadLicenseConfig();
        if (c) {
          setConfig(c);
          setServerUrl(c.server_url || "");
          setLicenseKey(c.license_key || "");
        }
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    refreshQuota();
  }, []);

  const handleSave = async () => {
    if (!serverUrl.trim() || !licenseKey.trim()) {
      toast({ title: "Preencha URL e chave", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveLicenseConfig(normalizeLicenseServerUrl(serverUrl), licenseKey.trim());
      clearLicenseCache();
      toast({ title: "Configuração salva. Validando..." });
      await handleValidate();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setChecking(true);
    try {
      const parseCustomer = (raw?: string | null) => {
        if (!raw) return { cpf_cnpj: "", name: "" };
        try {
          const p = JSON.parse(raw);
          return {
            cpf_cnpj: String(p?.cpf_cnpj || p?.cpf || p?.cnpj || "").trim(),
            name: String(p?.full_name || p?.name || p?.email || "").trim(),
          };
        } catch {
          return { cpf_cnpj: "", name: raw };
        }
      };
      const prev = parseCustomer(config?.customer_name);
      const res = await validateLicense();
      const c = await loadLicenseConfig();
      setConfig(c);
      await refreshQuota();
      const next = parseCustomer(res.customer_name || c?.customer_name);
      if (res.status === "active") {
        const desc = next.name || next.cpf_cnpj || "Validação concluída.";
        toast({ title: "Licença ativa", description: desc });
        if (prev.cpf_cnpj && next.cpf_cnpj && prev.cpf_cnpj !== next.cpf_cnpj) {
          toast({
            title: "CPF/CNPJ da licença foi alterado",
            description: `Anterior: ${prev.cpf_cnpj} → Atual: ${next.cpf_cnpj}${next.name ? ` (${next.name})` : ""}`,
          });
        }
      } else {
        toast({
          title: `Status: ${res.status}`,
          description: res.message || "Verifique a chave e o servidor.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Falha na validação", description: e.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const status = config?.status || "inactive";
  const statusColor =
    status === "active"
      ? "text-success"
      : status === "blocked" || status === "expired" || status === "invalid"
      ? "text-destructive"
      : "text-muted-foreground";
  const StatusIcon = status === "active" ? ShieldCheck : ShieldAlert;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status atual */}
      <div className="bg-muted/30 rounded-lg p-4 border border-border">
        <div className="flex items-center gap-3 mb-3">
          <StatusIcon className={`w-6 h-6 ${statusColor}`} />
          <div>
            <p className="text-sm text-muted-foreground">Status da licença</p>
            <p className={`text-lg font-semibold capitalize ${statusColor}`}>{status}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {config?.customer_name && (() => {
            let parsed: any = null;
            try { parsed = JSON.parse(config.customer_name); } catch { /* not json */ }
            if (parsed && typeof parsed === "object") {
              return parsed.cpf_cnpj ? (
                <div><span className="text-muted-foreground">CPF/CNPJ:</span> <span className="font-medium">{parsed.cpf_cnpj}</span></div>
              ) : null;
            }
            return null;
          })()}
          {quota && (
            <>
              <div>
                <span className="text-muted-foreground">Armazenamento:</span>{" "}
                <span className="font-medium">
                  {formatBytes(quota.usedBytes)} / {quota.hasLimit ? formatBytes(quota.limitBytes) : "Sem limite"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Utilizado:</span>{" "}
                <span className={`font-medium ${quota.hasLimit ? (quota.level === "full" ? "text-destructive" : quota.level === "warn" ? "text-warning" : "text-success") : "text-muted-foreground"}`}>
                  {quota.hasLimit ? `${quota.percent.toFixed(1)}%` : "—"}
                </span>
              </div>
            </>
          )}
          {config?.last_check && (
            <div><span className="text-muted-foreground">Última verificação:</span> <span className="font-medium">{new Date(config.last_check).toLocaleString("pt-BR")}</span></div>
          )}
          {config?.hardware_id && (
            <div className="truncate"><span className="text-muted-foreground">ID hardware:</span> <span className="font-mono text-xs">{config.hardware_id}</span></div>
          )}
        </div>
        {config?.message && (
          <p className="mt-3 text-xs text-muted-foreground italic">{config.message}</p>
        )}
      </div>

      {/* Armazenamento da licença */}
      {quota && quota.hasLimit && (() => {
        // formatBytes imported at top
        const barColor = quota.level === "full" ? "bg-destructive" : quota.level === "warn" ? "bg-warning" : "bg-primary";
        return (
          <div className="bg-muted/30 rounded-lg p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Armazenamento da licença</p>
              <p className="text-xs text-muted-foreground">{quota.percent.toFixed(1)}% usado</p>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${quota.percent}%` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-3">
              <div><span className="text-muted-foreground">Usado:</span> <span className="font-medium">{formatBytes(quota.usedBytes)}</span></div>
              <div><span className="text-muted-foreground">Limite:</span> <span className="font-medium">{formatBytes(quota.limitBytes)}</span></div>
              <div>
                <span className="text-muted-foreground">Disponível:</span>{" "}
                <span className={`font-medium ${quota.level === "full" ? "text-destructive" : quota.level === "warn" ? "text-warning" : "text-success"}`}>
                  {formatBytes(quota.remainingBytes)}
                </span>
              </div>
            </div>
            {quota.level === "full" && (
              <p className="mt-3 text-xs text-destructive font-medium">Limite atingido. Novos uploads estão bloqueados.</p>
            )}
            {quota.level === "warn" && (
              <p className="mt-3 text-xs text-warning font-medium">Atenção: você ultrapassou 80% do limite contratado.</p>
            )}
          </div>
        );
      })()}

      <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
        <div>
          <h3 className="text-base font-semibold text-foreground">Desbloqueio temporário (24h)</h3>
          <p className="text-xs text-muted-foreground">
            Libere o sistema por 24 horas mesmo que a licença esteja bloqueada ou o servidor inacessível. Disponível apenas uma vez a cada 30 dias.
          </p>
          {config?.temp_unlock_until && new Date(config.temp_unlock_until).getTime() > Date.now() && (
            <p className="mt-2 text-xs text-success font-medium">
              Desbloqueio ativo até {new Date(config.temp_unlock_until).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <Button onClick={handleUnlock} disabled={unlocking} className="w-full sm:w-auto">
          <KeyRound className="w-4 h-4 mr-2" />
          {unlocking ? "Liberando..." : "Desbloquear por 24 horas"}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>URL do servidor de licenças</Label>
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://licencas.suaempresa.com/api/validar"
          />
          <p className="text-xs text-muted-foreground">
            Endpoint POST que recebe <code>{`{ license_key, hostname }`}</code> e retorna{" "}
            <code>{`{ ok?, status: "active|blocked|expired|invalid", customer_name?, expires_at?, message? }`}</code>.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Chave de licença</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="AXIS-XXXX-XXXX-XXXX"
              className="pr-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || checking}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvando..." : "Salvar e ativar"}
          </Button>
          <Button variant="outline" onClick={handleValidate} disabled={checking || saving || !config?.server_url}>
            <RefreshCw className={`w-4 h-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            Verificar status
          </Button>
        </div>
      </div>
    </div>
  );
}

function MfaSection() {
  const [loading, setLoading] = useState(true);
  const [hasFactor, setHasFactor] = useState(false);
  const [factorId, setFactorId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp || []).find((f: any) => f.status === "verified");
      setHasFactor(!!verified);
      setFactorId(verified?.id || "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDisable = async () => {
    if (!factorId) return;
    if (!confirm("Desativar a autenticação em 2 fatores? Você poderá ativá-la novamente depois.")) return;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast({ title: "2FA desativado", description: "O segundo fator foi removido da sua conta." });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="p-4 rounded-lg border border-border bg-secondary/30">
        <div className="flex items-center gap-2 mb-2">
          {hasFactor ? (
            <>
              <ShieldCheck className="w-5 h-5 text-success" />
              <span className="font-semibold text-foreground">2FA ativo</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-5 h-5 text-warning" />
              <span className="font-semibold text-foreground">2FA não está ativo</span>
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {hasFactor
            ? "A cada login será solicitado um código de 6 dígitos do seu aplicativo autenticador."
            : "Recomendamos ativar a autenticação em 2 fatores para proteger sua conta contra acessos indevidos."}
        </p>
      </div>

      {hasFactor ? (
        <Button variant="destructive" onClick={handleDisable} className="gap-2">
          <ShieldAlert className="w-4 h-4" /> Desativar 2FA
        </Button>
      ) : (
        <Button onClick={() => (window.location.href = "/mfa-setup")} className="gap-2">
          <ShieldCheck className="w-4 h-4" /> Ativar 2FA
        </Button>
      )}
    </div>
  );
}



export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>(null);
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile-role-settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });
  const isAdmin = profile?.role === "Administrador";
  const isOperator = profile?.role === "Operador";
  const canSee = (id: Section) => {
    if (ADMIN_ONLY_SECTIONS.includes(id)) return isAdmin;
    if (STAFF_SECTIONS.includes(id)) return isAdmin || isOperator;
    return true;
  };
  const visibleCards = sectionCards.filter((s) => canSee(s.id)).filter((s) => !(isLocalInstall() && s.id === "mfa"));

  const renderContent = () => {
    if (activeSection && !canSee(activeSection)) return null;
    switch (activeSection) {
      case "orgao": return <OrgaoSection />;
      case "categorias": return <ListManager itemLabel="Categoria" tableName="categories" />;
      case "unidades": return <ListManager itemLabel="Unidade/Setor" tableName="units" />;
      case "parametros": return <ParametrosSection />;
      case "googledrive": return <GoogleDriveSection />;
      
      case "meucertificado": return <MyCertificateSection />;
      case "backup": return <BackupSection />;
      case "licenca": return <LicencaSection />;
      case "mobile": return <MobileAccessSection />;
      case "minhasenha": return <MyPasswordSection />;
      case "mfa": return <MfaSection />;
      case "sistema": return <SystemUpdateSection />;
      default: return null;
    }
  };

  const activeCard = sectionCards.find((s) => s.id === activeSection);

  return (
    <AppLayout>
      <div className="flex items-center gap-3 mb-6">
        {activeSection && (
          <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <SettingsIcon className="w-7 h-7 text-primary" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          {activeCard ? activeCard.title : "Configurações"}
        </h1>
      </div>

      {!activeSection ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleCards.map((section) => (
            <div
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className="bg-card rounded-xl border border-border shadow-sm p-6 hover:border-primary/30 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <section.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">{section.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm p-6">
          {renderContent()}
        </div>
      )}
    </AppLayout>
  );
}
