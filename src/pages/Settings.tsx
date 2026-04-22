import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Settings as SettingsIcon, Building, Tag, FolderTree, Sliders, ArrowLeft, Plus, Trash2, Edit2, Save, X, Upload, HardDrive, CheckCircle, AlertCircle, RefreshCw, DatabaseBackup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedList } from "@/lib/adminLookups";

type Section = "orgao" | "categorias" | "unidades" | "parametros" | "googledrive" | null;

const sectionCards = [
  { id: "orgao" as Section, icon: Building, title: "Dados do Órgão", description: "Nome, CNPJ e informações institucionais" },
  { id: "categorias" as Section, icon: Tag, title: "Categorias Documentais", description: "Gerenciar tipos de documentos" },
  { id: "unidades" as Section, icon: FolderTree, title: "Unidades/Setores", description: "Gerenciar a estrutura organizacional" },
  { id: "parametros" as Section, icon: Sliders, title: "Parâmetros do Sistema", description: "Configurações gerais da plataforma" },
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

  const handleSave = () => {
    toast({ title: "Parâmetros salvos com sucesso!" });
  };

  const handleSystemUpdate = () => {
    toast({ title: "Atualização do sistema", description: "No servidor, execute: sudo /opt/axisdocs/update.sh" });
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
      <Button onClick={handleSave} className="mt-2">
        <Save className="w-4 h-4 mr-2" /> Salvar
      </Button>

      <div className="pt-4 mt-4 border-t border-border space-y-3">
        <Label>Manutenção do sistema</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={handleSystemUpdate} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Atualizar sistema
          </Button>
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



export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>(null);

  const renderContent = () => {
    switch (activeSection) {
      case "orgao": return <OrgaoSection />;
      case "categorias": return <ListManager itemLabel="Categoria" tableName="categories" />;
      case "unidades": return <ListManager itemLabel="Unidade/Setor" tableName="units" />;
      case "parametros": return <ParametrosSection />;
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
