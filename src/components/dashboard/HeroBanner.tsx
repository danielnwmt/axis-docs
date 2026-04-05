import bannerBg from "@/assets/axis-docs-scanner-banner.jpg";
import axisLogo from "@/assets/axis-logo.webp";

export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-4 animate-fade-in relative">
      <img
        src={bannerBg}
        alt="Axis Docs - Gestão Inteligente de Documentos e Informações"
        className="block w-full max-h-[280px] object-cover object-center"
        width={1920}
        height={512}
      />
      <div className="absolute inset-0 flex items-center pl-8 md:pl-14">
        <img
          src={axisLogo}
          alt="Axis Logo"
          className="h-[120px] md:h-[160px] w-auto drop-shadow-lg"
        />
      </div>
    </div>
  );
}
