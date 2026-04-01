import heroBanner from "@/assets/axis-docs-banner.png";

export function HeroBanner() {
  return (
    <div
      className="relative rounded-xl overflow-hidden mb-6 animate-fade-in"
      style={{
        backgroundImage: `url(${heroBanner})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="bg-primary/60 backdrop-blur-[2px] px-8 py-8">
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
