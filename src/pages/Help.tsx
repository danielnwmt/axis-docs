import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  HelpCircle, Search, FileText, Upload, ScanText, PenTool, Shield, Users,
  Settings as SettingsIcon, KeyRound, Mail, BookOpen, LifeBuoy
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const topics = [
  { icon: Upload, title: "Upload de Documentos", desc: "Como enviar arquivos com metadados", path: "/upload" },
  { icon: FileText, title: "Gerenciar Documentos", desc: "Visualizar, editar e organizar", path: "/documents" },
  { icon: ScanText, title: "Scanner & OCR", desc: "Digitalizar e extrair texto", path: "/scanner" },
  { icon: Search, title: "Busca Inteligente", desc: "Pesquise por conteúdo e metadados", path: "/search" },
  { icon: PenTool, title: "Assinatura Digital", desc: "Assinar PDFs com ICP-Brasil", path: "/signature" },
  { icon: Shield, title: "Auditoria", desc: "Acompanhar atividades do sistema", path: "/audit" },
  { icon: Users, title: "Usuários & Permissões", desc: "Gerenciar acesso e papéis", path: "/users" },
  { icon: SettingsIcon, title: "Configurações", desc: "Ajustes gerais do sistema", path: "/settings" },
];

const faqs = [
  {
    q: "Como faço para alterar minha senha?",
    a: "Acesse Configurações → Minha Senha. Informe a senha atual e defina uma nova com no mínimo 10 caracteres, contendo maiúscula, número e símbolo.",
  },
  {
    q: "Como envio um documento?",
    a: "No menu lateral, clique em 'Upload de Documento'. Selecione o arquivo, preencha unidade, categoria e demais metadados obrigatórios e confirme o envio.",
  },
  {
    q: "Posso editar um documento já enviado?",
    a: "Edições destrutivas não são permitidas. Alterações geram uma nova versão do documento, mantendo o histórico íntegro e registrado em auditoria.",
  },
  {
    q: "Como funciona o OCR?",
    a: "O Scanner extrai automaticamente o texto de imagens e PDFs digitalizados. O texto reconhecido fica indexado para busca futura.",
  },
  {
    q: "Como assino digitalmente um PDF?",
    a: "Em Assinatura Digital, faça upload do PDF, posicione a assinatura e utilize seu certificado A1/A3 ICP-Brasil. O documento assinado é registrado e armazenado.",
  },
  {
    q: "Como cadastro um novo usuário?",
    a: "Apenas Administradores podem cadastrar usuários. Acesse 'Usuários e Permissões', clique em 'Novo Usuário' e preencha os dados, definindo o papel adequado.",
  },
  {
    q: "Esqueci minha senha. O que faço?",
    a: "Na tela de login, clique em 'Esqueci minha senha' ou solicite ao Administrador que envie uma nova senha temporária.",
  },
  {
    q: "Onde vejo o uso de armazenamento?",
    a: "No topo da tela, clique no ícone de HD. É exibido o consumo atual e o limite da licença.",
  },
];

export default function Help() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const filtered = faqs.filter(
    (f) => f.q.toLowerCase().includes(q.toLowerCase()) || f.a.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Central de Ajuda</h1>
            <p className="text-sm text-muted-foreground">Tire dúvidas e aprenda a usar o AxisDocs</p>
          </div>
        </div>

        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar na ajuda..."
              className="pl-10"
            />
          </div>
        </Card>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Tópicos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {topics.map((t) => (
              <button
                key={t.title}
                onClick={() => navigate(t.path)}
                className="text-left p-4 rounded-xl border border-border bg-card hover:bg-secondary/40 transition-colors"
              >
                <t.icon className="w-5 h-5 text-info mb-2" />
                <p className="text-sm font-semibold text-foreground">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> Perguntas Frequentes
          </h2>
          <Card className="p-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma pergunta encontrada.</p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {filtered.map((f, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="px-3 text-left text-sm">{f.q}</AccordionTrigger>
                    <AccordionContent className="px-3 text-sm text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <LifeBuoy className="w-4 h-4" /> Precisa de mais ajuda?
          </h2>
          <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Contate o suporte</p>
                <p className="text-xs text-muted-foreground">Nossa equipe responde em até 1 dia útil.</p>
              </div>
            </div>
            <a href="mailto:contato@axisdocs.xyz">
              <Button className="gap-2"><Mail className="w-4 h-4" /> contato@axisdocs.xyz</Button>
            </a>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
