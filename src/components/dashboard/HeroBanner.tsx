import heroBanner from "@/assets/axis-docs-banner.png";

export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-0 animate-fade-in -mt-2">
      <img
        src={heroBanner}
        alt="Axis Docs - Gestão Inteligente de Documentos e Informações"
        className="w-full h-[140px] object-cover object-center"
      />
    </div>
  );
}
