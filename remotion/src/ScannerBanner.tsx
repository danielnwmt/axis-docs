import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import React from "react";

function seeded(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

const STREAK_COUNT = 50;
const streaks = Array.from({ length: STREAK_COUNT }, (_, i) => ({
  startX: seeded(i * 11 + 1) * 2200 - 100,
  startY: seeded(i * 11 + 2) * 700 - 50,
  angle: seeded(i * 11 + 3) * 40 + 20,
  length: seeded(i * 11 + 4) * 120 + 40,
  speed: seeded(i * 11 + 5) * 2.5 + 0.8,
  thickness: seeded(i * 11 + 6) * 2 + 0.5,
  brightness: seeded(i * 11 + 7) * 0.5 + 0.2,
  delay: seeded(i * 11 + 8) * 300,
  headSize: seeded(i * 11 + 9) * 3 + 2,
  color: seeded(i * 11 + 10) > 0.3 ? "100,180,255" : "80,255,180",
}));

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  x: seeded(i * 17 + 200) * 1920,
  y: seeded(i * 17 + 201) * 540,
  size: seeded(i * 17 + 202) * 3 + 1,
  speed: seeded(i * 17 + 203) * 0.04 + 0.02,
  drift: seeded(i * 17 + 204) * 15,
  phase: seeded(i * 17 + 205) * Math.PI * 2,
}));

const DOC_W = 200;
const DOC_H = 270;
const DOC_X = 1920 / 2;
const DOC_Y = 540 / 2 + 10;

export const ScannerBanner: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scanPhaseStart = 30;
  const scanPhaseEnd = 160;
  const scanY = interpolate(frame, [scanPhaseStart, scanPhaseEnd], [-10, DOC_H + 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const docScale = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 120 } });
  const docOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Logo appears after scan
  const logoOpacity = interpolate(frame, [170, 190], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoScale = spring({ frame: frame - 170, fps, config: { damping: 15, stiffness: 100 } });

  const camX = Math.sin(frame * 0.008) * 8;
  const camY = Math.cos(frame * 0.006) * 5;

  return (
    <AbsoluteFill>
      {/* Background */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #0c1e3a 0%, #060e1f 50%, #030812 100%)" }} />

      {/* Ambient glows */}
      <div style={{
        position: "absolute", left: `${48 + Math.sin(frame * 0.01) * 5}%`, top: `${40 + Math.cos(frame * 0.008) * 8}%`,
        width: 500, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(20,80,180,0.1) 0%, transparent 70%)",
        transform: "translate(-50%,-50%)",
      }} />

      <svg width="1920" height="540" style={{ position: "absolute", transform: `translate(${camX}px, ${camY}px)` }}>
        <defs>
          <filter id="g"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="gs"><feGaussianBlur stdDeviation="10" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,255,200,0)" />
            <stop offset="40%" stopColor="rgba(0,255,200,0.7)" />
            <stop offset="50%" stopColor="rgba(50,255,220,1)" />
            <stop offset="60%" stopColor="rgba(0,255,200,0.7)" />
            <stop offset="100%" stopColor="rgba(0,255,200,0)" />
          </linearGradient>
          <clipPath id="dc"><rect x={DOC_X - DOC_W / 2} y={DOC_Y - DOC_H / 2} width={DOC_W} height={DOC_H} /></clipPath>
        </defs>

        {/* Streaks */}
        {streaks.map((s, i) => {
          const progress = ((frame * s.speed + s.delay) % 350) / 350;
          const op = interpolate(progress, [0, 0.05, 0.15, 0.85, 0.95, 1], [0, s.brightness, s.brightness * 0.8, s.brightness * 0.4, 0, 0]);
          if (op < 0.01) return null;
          const a = (s.angle * Math.PI) / 180;
          const mx = frame * s.speed * Math.cos(a) * 1.2;
          const my = frame * s.speed * Math.sin(a) * 1.2;
          const x1 = ((s.startX + mx) % 2200) - 100;
          const y1 = ((s.startY + my) % 700) - 50;
          const x2 = x1 + s.length * Math.cos(a);
          const y2 = y1 + s.length * Math.sin(a);
          return (
            <g key={`s${i}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`rgba(${s.color},${op * 0.5})`} strokeWidth={s.thickness} strokeLinecap="round" />
              <circle cx={x2} cy={y2} r={s.headSize} fill={`rgba(${s.color},${op})`} filter="url(#g)" />
            </g>
          );
        })}

        {/* Particles */}
        {PARTICLES.map((p, i) => {
          const pulse = Math.sin(frame * p.speed + p.phase) * 0.5 + 0.5;
          const mx = Math.sin(frame * 0.01 + p.phase) * p.drift;
          const my = Math.cos(frame * 0.008 + p.phase) * p.drift * 0.7;
          return <circle key={`p${i}`} cx={p.x + mx} cy={p.y + my} r={p.size * (0.6 + pulse * 0.5)} fill={`rgba(100,180,255,${0.08 + pulse * 0.2})`} filter="url(#g)" />;
        })}

        {/* Document */}
        {docOpacity > 0 && (
          <g opacity={docOpacity} transform={`translate(${DOC_X},${DOC_Y}) scale(${docScale}) translate(${-DOC_X},${-DOC_Y})`}>
            {/* Shadow docs */}
            {[8, 4].map((off, idx) => (
              <rect key={`ds${idx}`} x={DOC_X - DOC_W / 2 + off} y={DOC_Y - DOC_H / 2 - off} width={DOC_W} height={DOC_H} fill="none" stroke={`rgba(80,160,255,${0.06 - idx * 0.02})`} strokeWidth="1" rx="3" />
            ))}
            <rect x={DOC_X - DOC_W / 2} y={DOC_Y - DOC_H / 2} width={DOC_W} height={DOC_H} fill="rgba(10,25,50,0.4)" stroke="rgba(100,200,255,0.35)" strokeWidth="1.5" rx="3" />

            {/* Text lines */}
            {Array.from({ length: 8 }, (_, i) => {
              const ly = DOC_Y - DOC_H / 2 + 30 + i * 28;
              const lw = i === 0 ? DOC_W * 0.5 : DOC_W * (0.4 + seeded(i * 7) * 0.4);
              const la = interpolate(frame, [scanPhaseStart + i * 4, scanPhaseStart + 10 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return <rect key={`l${i}`} x={DOC_X - DOC_W / 2 + 20} y={ly} width={lw * la} height={2.5} fill={`rgba(80,160,255,${0.2 + seeded(i) * 0.15})`} rx="1" />;
            })}

            {/* Scan effect */}
            {frame >= scanPhaseStart && frame <= scanPhaseEnd && (
              <g clipPath="url(#dc)">
                <rect x={DOC_X - DOC_W / 2} y={DOC_Y - DOC_H / 2 + scanY - 25} width={DOC_W} height={50} fill="url(#sg)" filter="url(#gs)" />
                <line x1={DOC_X - DOC_W / 2} y1={DOC_Y - DOC_H / 2 + scanY} x2={DOC_X + DOC_W / 2} y2={DOC_Y - DOC_H / 2 + scanY} stroke="rgba(50,255,220,0.9)" strokeWidth="2" filter="url(#gs)" />
              </g>
            )}

            {/* Scanned area highlight */}
            {frame >= scanPhaseStart && frame <= scanPhaseEnd && (
              <rect x={DOC_X - DOC_W / 2} y={DOC_Y - DOC_H / 2} width={DOC_W} height={Math.max(0, scanY)} fill="rgba(0,255,200,0.025)" clipPath="url(#dc)" />
            )}
          </g>
        )}

        {/* Data particles flying up after scan */}
        {frame > scanPhaseEnd - 20 && Array.from({ length: 20 }, (_, i) => {
          const sf = scanPhaseEnd - 20 + i * 2;
          const t = interpolate(frame, [sf, sf + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (t <= 0 || t >= 1) return null;
          const sx = DOC_X + (seeded(i * 31) - 0.5) * DOC_W * 0.7;
          const sy = DOC_Y + (seeded(i * 31 + 1) - 0.5) * DOC_H * 0.5;
          const ex = DOC_X + (seeded(i * 31 + 2) - 0.5) * 80;
          const ey = 50;
          const px = sx + (ex - sx) * t;
          const py = sy + (ey - sy) * t - Math.sin(t * Math.PI) * 50;
          const op = interpolate(t, [0, 0.1, 0.7, 1], [0, 0.7, 0.5, 0]);
          const c = seeded(i * 31 + 3) > 0.5 ? "100,255,200" : "80,200,255";
          return <circle key={`dp${i}`} cx={px} cy={py} r={2.5} fill={`rgba(${c},${op})`} filter="url(#g)" />;
        })}
      </svg>

      {/* AXIS DOCS text */}
      <div style={{
        position: "absolute", left: 80, top: "50%", transform: "translateY(-50%)",
        opacity: logoOpacity,
      }}>
        <div style={{
          transform: `scale(${logoScale})`,
          transformOrigin: "left center",
        }}>
          <div style={{ fontFamily: "sans-serif", fontWeight: 800, fontSize: 56, letterSpacing: -1 }}>
            <span style={{ color: "#0ea5e9" }}>AXIS</span>
            <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 300, fontSize: 40, marginLeft: 8 }}>DOCS</span>
          </div>
          <div style={{ fontFamily: "sans-serif", fontWeight: 300, fontSize: 18, color: "rgba(200,220,255,0.6)", marginTop: 4 }}>
            Gestão inteligente de Documentos e Informações
          </div>
        </div>
      </div>

      {/* Vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(3,8,18,0.6) 100%)" }} />
    </AbsoluteFill>
  );
};
