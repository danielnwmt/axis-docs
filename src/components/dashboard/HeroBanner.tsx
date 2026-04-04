import heroBanner from "@/assets/axis-docs-banner.png";

export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-6 animate-fade-in">
      <img
        src={heroBanner}
        alt="Axis Docs - Gestão Inteligente de Documentos e Informações"
        className="w-full h-auto object-cover"
      />
    </div>
  );
}
