export function HeroBanner() {
  return (
    <div className="rounded-xl overflow-hidden mb-4 animate-fade-in">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="block w-full max-h-[180px] object-cover object-center"
        width={1920}
        height={540}
      >
        <source src="/scanner-banner.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
