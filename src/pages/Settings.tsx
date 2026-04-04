import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Settings as SettingsIcon, Building, Tag, FolderTree, Sliders, ArrowLeft, Plus, Trash2, Edit2, Save, X, ImageIcon, Upload, HardDrive, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Section = "orgao" | "categorias" | "unidades" | "parametros" | "banner" | "googledrive" | null;

const sectionCards = [
  { id: "orgao" as Section, icon: Building, title: "Dados do Órgão", description: "Nome, CNPJ e informações institucionais" },
  { id: "categorias" as Section, icon: Tag, title: "Categorias Documentais", description: "Gerenciar tipos de documentos" },
  { id: "unidades" as Section, icon: FolderTree, title: "Unidades/Setores", description: "Gerenciar a estrutura organizacional" },
  { id: "parametros" as Section, icon: Sliders, title: "Parâmetros do Sistema", description: "Configurações gerais da plataforma" },
  { id: "banner" as Section, icon: ImageIcon, title: "Banner do Dashboard", description: "Alterar a imagem do banner principal" },
  { id: "googledrive" as Section, icon: HardDrive, title: "Google Drive", description: "Configurar integração com Google Drive via API" },
];

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
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    const { data } = await supabase.from(tableName).select("id, name").order("name");
    if (data) setItems(data);
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

  const removeItem = async (idx: number) => {
    const { error } = await supabase.from(tableName).delete().eq("id", items[idx].id);
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
      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum(a) {itemLabel.toLowerCase()} cadastrado(a).</p>
      )}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
            {editingIdx === idx ? (
              <>
                <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8" onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
                <Button size="icon" variant="ghost" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingIdx(null)}><X className="w-4 h-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{item.name}</span>
                <Button size="icon" variant="ghost" onClick={() => startEdit(idx)}><Edit2 className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BannerSection() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadBanner = async () => {
      const { data, error } = await supabase.storage.from("settings").createSignedUrl("hero-banner", 3600);
      if (!error && data?.signedUrl) setCurrentUrl(data.signedUrl);
    };
    loadBanner();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Erro", description: "Selecione um arquivo de imagem.", variant: "destructive" });
      return;
    }
    setUploading(true);
    // Remove old file first
    await supabase.storage.from("settings").remove(["hero-banner"]);
    const { error } = await supabase.storage.from("settings").upload("hero-banner", file, { upsert: true });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const { data } = await supabase.storage.from("settings").createSignedUrl("hero-banner", 3600);
      if (data?.signedUrl) setCurrentUrl(data.signedUrl);
      toast({ title: "Banner atualizado com sucesso!" });
    }
    setUploading(false);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <Label>Imagem atual do banner</Label>
      {currentUrl ? (
        <img src={currentUrl} alt="Banner atual" className="w-full max-h-48 object-cover rounded-lg border border-border" />
      ) : (
        <div className="w-full h-32 bg-secondary rounded-lg flex items-center justify-center text-muted-foreground text-sm">
          Nenhuma imagem personalizada definida
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
        <Upload className="w-4 h-4" /> {uploading ? "Enviando..." : "Enviar nova imagem"}
      </Button>
    </div>
  );
}

function ParametrosSection() {
  const [params, setParams] = useState({
    retencaoDias: "365",
    tamanhoMaxMB: "50",
    autoOCR: true,
  });

  const handleSave = () => {
    toast({ title: "Parâmetros salvos com sucesso!" });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-1">
        <Label>Retenção de documentos (dias)</Label>
        <Input type="number" value={params.retencaoDias} onChange={(e) => setParams({ ...params, retencaoDias: e.target.value })} />
      </div>
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
      <Button onClick={handleSave} className="mt-2">
        <Save className="w-4 h-4 mr-2" /> Salvar
      </Button>
    </div>
  );
}

function GoogleDriveSection() {
  const [authMode, setAuthMode] = useState<"service-account" | "oauth2">("oauth2");
  const [jsonContent, setJsonContent] = useState("");
  const [rootFolderId, setRootFolderId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
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
          if (config.oauth2) {
            setAuthMode("oauth2");
            setClientId(config.oauth2.clientId || "");
            setClientSecret(config.oauth2.clientSecret || "");
            setRefreshToken(config.oauth2.refreshToken || "");
          } else if (config.serviceAccount) {
            setAuthMode("service-account");
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
    if (authMode === "oauth2") {
      if (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()) {
        toast({ title: "Erro", description: "Preencha Client ID, Client Secret e Refresh Token.", variant: "destructive" });
        return;
      }
    } else {
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
    }

    setSaving(true);
    try {
      const config: Record<string, unknown> = {
        authMode,
        rootFolderId: rootFolderId.trim(),
        ownerEmail: ownerEmail.trim(),
      };

      if (authMode === "oauth2") {
        config.oauth2 = {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          refreshToken: refreshToken.trim(),
        };
      } else {
        config.serviceAccount = JSON.parse(jsonContent);
      }

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
          <p>Configure a integração com o Google Drive. Escolha o modo de autenticação abaixo.</p>
          <p className="mt-1"><strong>OAuth2 (Recomendado)</strong>: Usa a cota da sua conta pessoal. Ideal para contas @gmail.com.</p>
          <p className="mt-1"><strong>Conta de Serviço</strong>: Para contas Google Workspace com domínio corporativo.</p>
        </div>
      </div>

      {/* Auth Mode Toggle */}
      <div className="space-y-2">
        <Label>Modo de Autenticação</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={authMode === "oauth2" ? "default" : "outline"}
            size="sm"
            onClick={() => { setAuthMode("oauth2"); setStatus("idle"); }}
          >
            OAuth2 (Pessoal)
          </Button>
          <Button
            type="button"
            variant={authMode === "service-account" ? "default" : "outline"}
            size="sm"
            onClick={() => { setAuthMode("service-account"); setStatus("idle"); }}
          >
            Conta de Serviço
          </Button>
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

      {authMode === "oauth2" ? (
        <>
          <div className="p-3 rounded-lg bg-accent/30 border border-border space-y-1">
            <p className="text-sm font-medium text-foreground">Como obter as credenciais OAuth2:</p>
            <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
              <li>Acesse o <strong>Google Cloud Console</strong> → APIs &amp; Services → Credentials</li>
              <li>Crie um <strong>OAuth 2.0 Client ID</strong> (tipo: Web application)</li>
              <li>Ative a <strong>Google Drive API</strong> no projeto</li>
              <li>Use o <strong>OAuth 2.0 Playground</strong> (developers.google.com/oauthplayground) para gerar o Refresh Token com o escopo <code>https://www.googleapis.com/auth/drive</code></li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input
              placeholder="xxxxxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setStatus("idle"); }}
            />
          </div>

          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input
              type="password"
              placeholder="GOCSPX-..."
              value={clientSecret}
              onChange={(e) => { setClientSecret(e.target.value); setStatus("idle"); }}
            />
          </div>

          <div className="space-y-2">
            <Label>Refresh Token</Label>
            <Input
              type="password"
              placeholder="1//0..."
              value={refreshToken}
              onChange={(e) => { setRefreshToken(e.target.value); setStatus("idle"); }}
            />
            <p className="text-xs text-muted-foreground">O refresh token não expira, mas pode ser revogado nas configurações de segurança da conta Google.</p>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}

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



export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>(null);

  const renderContent = () => {
    switch (activeSection) {
      case "orgao": return <OrgaoSection />;
      case "categorias": return <ListManager itemLabel="Categoria" tableName="categories" />;
      case "unidades": return <ListManager itemLabel="Unidade/Setor" tableName="units" />;
      case "parametros": return <ParametrosSection />;
      case "banner": return <BannerSection />;
      case "googledrive": return <GoogleDriveSection />;
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
          {sectionCards.map((section) => (
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
