import heroBanner from "@/assets/axis-docs-scanner-banner.jpg";

export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-4 animate-fade-in">
      <img
        src={heroBanner}
        alt="Axis Docs - Gestão Inteligente de Documentos e Informações"
        className="block w-full max-h-[280px] object-cover object-center"
        width={1920}
        height={512}
      />
    </div>
  );
}
