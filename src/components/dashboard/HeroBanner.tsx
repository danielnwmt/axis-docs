import heroBanner from "@/assets/axis-docs-banner.png";

export function HeroBanner() {
  return (
    <div className="relative rounded-xl overflow-hidden bg-primary mb-6 animate-fade-in">
      <img
        src={heroBanner}
        alt="Axis Docs"
        className="absolute inset-0 w-full h-full object-cover opacity-40"
        width={1024}
        height={512}
      />
      <div className="relative z-10 px-8 py-8">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-primary-foreground mb-2">
          Bem-vindo ao Axis Docs
        </h2>
        <p className="text-primary-foreground/80 text-sm md:text-base max-w-lg">
          Digitalize, organize e encontre documentos públicos com tecnologia de ponta.
        </p>
      </div>
    </div>
  );
}
