import heroBanner from "@/assets/axis-docs-banner-v2.png";

export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-4 animate-fade-in">
      <img
        src={heroBanner}
        alt="Axis Docs - Gestão Inteligente de Documentos e Informações"
        className="block w-full max-h-[160px] object-cover object-center"
      />
    </div>
  );
}
