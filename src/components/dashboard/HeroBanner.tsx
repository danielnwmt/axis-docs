import heroBanner from "@/assets/axis-docs-banner-v3.png";

export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-0 animate-fade-in -mt-2">
      <img
        src={heroBanner}
        alt="Axis Docs - Gestão Inteligente de Documentos e Informações"
        className="block w-full max-h-[140px] object-cover object-left"
        width={1920}
        height={512}
      />
    </div>
  );
}
