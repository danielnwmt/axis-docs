import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";

interface Dpo { name: string; email: string; phone: string; privacy_policy_version: string }

export default function Privacy() {
  const [dpo, setDpo] = useState<Dpo>({ name: "A definir", email: "dpo@empresa.com.br", phone: "", privacy_policy_version: "1.0" });

  useEffect(() => {
    supabase.from("dpo_config").select("name,email,phone,privacy_policy_version").maybeSingle()
      .then(({ data }) => { if (data) setDpo(data as Dpo); });
  }, []);

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto bg-card rounded-xl shadow-sm p-8 space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="font-display text-3xl font-bold">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground">Versão {dpo.privacy_policy_version} — em conformidade com a Lei nº 13.709/2018 (LGPD).</p>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">1. Controlador dos Dados</h2>
          <p className="text-sm text-foreground/80">O AxisDocs é mantido pela instituição contratante, responsável pelas decisões sobre o tratamento dos dados pessoais.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">2. Encarregado pelo Tratamento (DPO)</h2>
          <p className="text-sm text-foreground/80"><strong>Nome:</strong> {dpo.name}<br/>
          <strong>E-mail:</strong> <a className="text-info underline" href={`mailto:${dpo.email}`}>{dpo.email}</a><br/>
          <strong>Telefone:</strong> {dpo.phone || "—"}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">3. Dados Coletados</h2>
          <ul className="list-disc pl-6 text-sm text-foreground/80 space-y-1">
            <li>Dados de identificação (e-mail, nome, unidade/setor)</li>
            <li>Dados de autenticação (senha cifrada)</li>
            <li>Documentos enviados e metadados (categoria, palavras-chave, observações)</li>
            <li>Logs de acesso e auditoria (IP, ações realizadas, data/hora)</li>
            <li>Preferências (idioma, cookies)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">4. Bases Legais e Finalidades</h2>
          <ul className="list-disc pl-6 text-sm text-foreground/80 space-y-1">
            <li><strong>Execução de contrato</strong> (Art. 7º, V): gestão documental e prestação do serviço.</li>
            <li><strong>Cumprimento de obrigação legal</strong> (Art. 7º, II): retenção de documentos públicos e logs de auditoria.</li>
            <li><strong>Consentimento</strong> (Art. 7º, I): cookies opcionais e comunicações.</li>
            <li><strong>Legítimo interesse</strong> (Art. 7º, IX): segurança da informação e detecção de fraudes.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">5. Compartilhamento</h2>
          <p className="text-sm text-foreground/80">Os dados são tratados internamente. A assinatura digital ICP-Brasil A1 é processada localmente pelo próprio sistema. Compartilhamos apenas com o provedor de armazenamento (Google Drive), conforme necessidade técnica, com cláusulas contratuais de proteção.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">6. Retenção</h2>
          <p className="text-sm text-foreground/80">Os documentos são mantidos pelo prazo legal aplicável a cada categoria (ex.: contratos por 5 anos). Após o prazo, dados pessoais são anonimizados conforme política configurada pelo controlador.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">7. Seus Direitos (Art. 18 LGPD)</h2>
          <p className="text-sm text-foreground/80">Você pode, a qualquer momento:</p>
          <ul className="list-disc pl-6 text-sm text-foreground/80 space-y-1">
            <li>Confirmar a existência de tratamento;</li>
            <li>Acessar e exportar seus dados (portabilidade);</li>
            <li>Corrigir dados incompletos ou desatualizados;</li>
            <li>Solicitar anonimização ou eliminação;</li>
            <li>Revogar o consentimento.</li>
          </ul>
          <p className="text-sm text-foreground/80">Acesse <Link to="/meus-dados" className="text-info underline">Meus Dados</Link> dentro do sistema ou entre em contato com o DPO.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">8. Segurança</h2>
          <p className="text-sm text-foreground/80">Adotamos criptografia em trânsito (HTTPS), controle de acesso por perfil (RLS), registro imutável de auditoria, e cópias de segurança periódicas.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">9. Incidentes</h2>
          <p className="text-sm text-foreground/80">Em caso de incidente de segurança que possa acarretar risco aos titulares, comunicaremos a ANPD e os afetados em até 72 horas, conforme Art. 48 da LGPD.</p>
        </section>

        <p className="text-xs text-muted-foreground pt-6 border-t">Última atualização: versão {dpo.privacy_policy_version}.</p>
      </div>
    </div>
  );
}
