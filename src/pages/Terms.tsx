import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto bg-card rounded-xl shadow-sm p-8 space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="font-display text-3xl font-bold">Termos de Uso</h1>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">1. Aceitação</h2>
          <p className="text-sm text-foreground/80">Ao acessar o AxisDocs, você concorda com estes Termos e com a <Link to="/privacidade" className="text-info underline">Política de Privacidade</Link>.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">2. Conta de Usuário</h2>
          <p className="text-sm text-foreground/80">A conta é pessoal e intransferível. Você é responsável pela guarda da senha e por todas as ações realizadas com seu login.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">3. Uso Aceitável</h2>
          <ul className="list-disc pl-6 text-sm text-foreground/80 space-y-1">
            <li>Enviar somente documentos lícitos e de sua titularidade ou autorização;</li>
            <li>Não tentar burlar mecanismos de segurança;</li>
            <li>Não usar o sistema para fins ilegais ou que violem direitos de terceiros.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">4. Integridade dos Documentos</h2>
          <p className="text-sm text-foreground/80">O sistema impede edições destrutivas: alterações geram novas versões e ficam registradas em auditoria imutável.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">5. Assinatura Digital</h2>
          <p className="text-sm text-foreground/80">Assinaturas ICP-Brasil (A1/A3) realizadas via ZapSign possuem validade jurídica conforme MP 2.200-2/2001.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">6. Encerramento</h2>
          <p className="text-sm text-foreground/80">A conta pode ser desativada por inatividade, violação destes Termos ou solicitação do titular. Documentos institucionais podem ser retidos pelo prazo legal mesmo após o encerramento.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-lg">7. Disposições Gerais</h2>
          <p className="text-sm text-foreground/80">Fica eleito o foro da sede da instituição contratante para dirimir quaisquer questões oriundas destes Termos.</p>
        </section>
      </div>
    </div>
  );
}
