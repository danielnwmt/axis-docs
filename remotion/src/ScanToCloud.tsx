import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
  Sequence,
} from "remotion";
import React from "react";

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ─── Light Streaks (like the reference video) ───
const STREAK_COUNT = 80;
const streaks = Array.from({ length: STREAK_COUNT }, (_, i) => ({
  startX: seededRandom(i * 11 + 1) * 2400 - 200,
  startY: seededRandom(i * 11 + 2) * 1400 - 200,
  angle: seededRandom(i * 11 + 3) * 40 + 20, // 20-60 degrees
  length: seededRandom(i * 11 + 4) * 150 + 60,
  speed: seededRandom(i * 11 + 5) * 3 + 1,
  thickness: seededRandom(i * 11 + 6) * 3 + 1,
  brightness: seededRandom(i * 11 + 7) * 0.7 + 0.3,
  delay: seededRandom(i * 11 + 8) * 300,
  headSize: seededRandom(i * 11 + 9) * 5 + 3,
  color: seededRandom(i * 11 + 10) > 0.3
    ? "120,180,255"
    : seededRandom(i * 11 + 10) > 0.1
    ? "180,220,255"
    : "100,255,200",
}));

// ─── Floating particles ───
const PARTICLE_COUNT = 40;
const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  x: seededRandom(i * 17 + 200) * 1920,
  y: seededRandom(i * 17 + 201) * 1080,
  size: seededRandom(i * 17 + 202) * 4 + 1,
  pulseSpeed: seededRandom(i * 17 + 203) * 0.05 + 0.02,
  drift: seededRandom(i * 17 + 204) * 20,
  phase: seededRandom(i * 17 + 205) * Math.PI * 2,
}));

// ─── Network nodes ───
const NODE_COUNT = 20;
const netNodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
  x: seededRandom(i * 23 + 400) * 1920,
  y: seededRandom(i * 23 + 401) * 1080,
  size: seededRandom(i * 23 + 402) * 3 + 2,
  pulse: seededRandom(i * 23 + 403) * Math.PI * 2,
}));

// ─── Network connections ───
interface NetConn { from: number; to: number; }
const netConns: NetConn[] = [];
for (let i = 0; i < netNodes.length; i++) {
  for (let j = i + 1; j < netNodes.length; j++) {
    const dx = netNodes[i].x - netNodes[j].x;
    const dy = netNodes[i].y - netNodes[j].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 350 && seededRandom(i * 100 + j) > 0.5) {
      netConns.push({ from: i, to: j });
    }
  }
}

// ─── Document wireframe lines ───
const DOC_W = 380;
const DOC_H = 500;

export const ScanToCloud: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Scene phases
  const phase1End = 90;   // Streaks converge
  const phase2Start = 60; // Document appears
  const phase2End = 180;  // Scanning
  const phase3Start = 150; // Logo + cloud
  
  // Document position (perspective)
  const docCenterX = 960;
  const docCenterY = 580;

  // Scan line progress
  const scanY = interpolate(
    frame,
    [phase2Start, phase2End],
    [-20, DOC_H + 20],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Document appearance
  const docOpacity = interpolate(
    frame, [phase2Start, phase2Start + 20], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Logo scale
  const logoScale = spring({
    frame: frame - phase3Start,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const logoOpacity = interpolate(
    frame, [phase3Start, phase3Start + 15], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Subtle camera drift
  const camX = Math.sin(frame * 0.008) * 15;
  const camY = Math.cos(frame * 0.006) * 10;

  return (
    <AbsoluteFill>
      {/* Deep dark background */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, #0a1a35 0%, #050d1e 40%, #020610 100%)",
        }}
      />

      {/* Ambient glow spots */}
      <div
        style={{
          position: "absolute",
          left: `${45 + Math.sin(frame * 0.01) * 8}%`,
          top: `${35 + Math.cos(frame * 0.008) * 6}%`,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(20,80,180,0.12) 0%, transparent 70%)",
          transform: "translate(-50%,-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `${60 + Math.sin(frame * 0.012) * 6}%`,
          top: `${60 + Math.cos(frame * 0.009) * 8}%`,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,150,120,0.06) 0%, transparent 70%)",
          transform: "translate(-50%,-50%)",
        }}
      />

      <svg
        width="1920"
        height="1080"
        style={{
          position: "absolute",
          transform: `translate(${camX}px, ${camY}px)`,
        }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowStrong">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowScan">
            <feGaussianBlur stdDeviation="12" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(120,255,0,0)" />
            <stop offset="40%" stopColor="rgba(180,255,0,0.8)" />
            <stop offset="50%" stopColor="rgba(200,255,50,1)" />
            <stop offset="60%" stopColor="rgba(180,255,0,0.8)" />
            <stop offset="100%" stopColor="rgba(120,255,0,0)" />
          </linearGradient>
          <clipPath id="docClip">
            <rect
              x={docCenterX - DOC_W / 2}
              y={docCenterY - DOC_H / 2}
              width={DOC_W}
              height={DOC_H}
            />
          </clipPath>
        </defs>

        {/* ─── Network connections (subtle background) ─── */}
        {netConns.map((c, i) => {
          const a = netNodes[c.from];
          const b = netNodes[c.to];
          const pulse = Math.sin(frame * 0.03 + i) * 0.5 + 0.5;
          return (
            <line
              key={`nc-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={`rgba(40,100,200,${0.03 + pulse * 0.04})`}
              strokeWidth="0.5"
            />
          );
        })}

        {/* ─── Network nodes ─── */}
        {netNodes.map((n, i) => {
          const pulse = Math.sin(frame * 0.04 + n.pulse) * 0.5 + 0.5;
          return (
            <circle
              key={`nn-${i}`}
              cx={n.x}
              cy={n.y}
              r={n.size * (0.8 + pulse * 0.4)}
              fill={`rgba(80,160,255,${0.15 + pulse * 0.2})`}
              filter="url(#glow)"
            />
          );
        })}

        {/* ─── Light Streaks (main effect like reference) ─── */}
        {streaks.map((s, i) => {
          const progress = ((frame * s.speed + s.delay) % 350) / 350;
          const opacity = interpolate(
            progress,
            [0, 0.05, 0.15, 0.85, 0.95, 1],
            [0, s.brightness, s.brightness * 0.9, s.brightness * 0.5, 0, 0]
          );
          if (opacity < 0.01) return null;
          const angleRad = (s.angle * Math.PI) / 180;
          const moveX = frame * s.speed * Math.cos(angleRad) * 1.2;
          const moveY = frame * s.speed * Math.sin(angleRad) * 1.2;
          const x1 = ((s.startX + moveX) % 2400) - 200;
          const y1 = ((s.startY + moveY) % 1400) - 200;
          const x2 = x1 + s.length * Math.cos(angleRad);
          const y2 = y1 + s.length * Math.sin(angleRad);

          return (
            <g key={`s-${i}`}>
              {/* Streak trail */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`rgba(${s.color},${opacity * 0.6})`}
                strokeWidth={s.thickness}
                strokeLinecap="round"
              />
              {/* Bright head */}
              <circle
                cx={x2}
                cy={y2}
                r={s.headSize}
                fill={`rgba(${s.color},${opacity})`}
                filter="url(#glow)"
              />
              {/* Extra glow on head */}
              <circle
                cx={x2}
                cy={y2}
                r={s.headSize * 2.5}
                fill={`rgba(${s.color},${opacity * 0.15})`}
              />
            </g>
          );
        })}

        {/* ─── Floating particles ─── */}
        {particles.map((p, i) => {
          const pulse = Math.sin(frame * p.pulseSpeed + p.phase) * 0.5 + 0.5;
          const mx = Math.sin(frame * 0.01 + p.phase) * p.drift;
          const my = Math.cos(frame * 0.008 + p.phase) * p.drift * 0.7;
          return (
            <circle
              key={`p-${i}`}
              cx={p.x + mx}
              cy={p.y + my}
              r={p.size * (0.6 + pulse * 0.6)}
              fill={`rgba(100,180,255,${0.1 + pulse * 0.25})`}
              filter="url(#glow)"
            />
          );
        })}

        {/* ─── Document wireframe (holographic style) ─── */}
        {docOpacity > 0 && (
          <g opacity={docOpacity}>
            {/* Document stack (multiple pages behind) */}
            {[12, 8, 4].map((offset, idx) => (
              <rect
                key={`dstack-${idx}`}
                x={docCenterX - DOC_W / 2 + offset}
                y={docCenterY - DOC_H / 2 - offset}
                width={DOC_W}
                height={DOC_H}
                fill="none"
                stroke={`rgba(100,180,255,${0.08 - idx * 0.02})`}
                strokeWidth="1"
                rx="4"
              />
            ))}

            {/* Main document */}
            <rect
              x={docCenterX - DOC_W / 2}
              y={docCenterY - DOC_H / 2}
              width={DOC_W}
              height={DOC_H}
              fill="rgba(10,30,60,0.3)"
              stroke="rgba(120,200,255,0.4)"
              strokeWidth="1.5"
              rx="4"
            />

            {/* Document content lines */}
            {Array.from({ length: 14 }, (_, i) => {
              const lineY = docCenterY - DOC_H / 2 + 50 + i * 32;
              const lineW = i === 0 ? DOC_W * 0.6 : i === 13 ? DOC_W * 0.4 : DOC_W * (0.5 + seededRandom(i * 7) * 0.35);
              const lineAppear = interpolate(
                frame,
                [phase2Start + 10 + i * 3, phase2Start + 20 + i * 3],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              return (
                <rect
                  key={`dl-${i}`}
                  x={docCenterX - DOC_W / 2 + 30}
                  y={lineY}
                  width={lineW * lineAppear}
                  height={3}
                  fill={`rgba(80,160,255,${0.2 + seededRandom(i) * 0.15})`}
                  rx="1.5"
                />
              );
            })}

            {/* ─── Scan line (yellow-green like reference) ─── */}
            {frame >= phase2Start && frame <= phase2End && (
              <g clipPath="url(#docClip)">
                {/* Scan beam */}
                <rect
                  x={docCenterX - DOC_W / 2}
                  y={docCenterY - DOC_H / 2 + scanY - 30}
                  width={DOC_W}
                  height={60}
                  fill="url(#scanGrad)"
                  filter="url(#glowScan)"
                />
                {/* Scan line */}
                <line
                  x1={docCenterX - DOC_W / 2}
                  y1={docCenterY - DOC_H / 2 + scanY}
                  x2={docCenterX + DOC_W / 2}
                  y2={docCenterY - DOC_H / 2 + scanY}
                  stroke="rgba(200,255,50,0.9)"
                  strokeWidth="2"
                  filter="url(#glowScan)"
                />
              </g>
            )}

            {/* Scanned region glow */}
            {frame >= phase2Start && frame <= phase2End && (
              <rect
                x={docCenterX - DOC_W / 2}
                y={docCenterY - DOC_H / 2}
                width={DOC_W}
                height={Math.max(0, scanY)}
                fill="rgba(120,255,0,0.03)"
                clipPath="url(#docClip)"
              />
            )}
          </g>
        )}

        {/* ─── Data particles flying to cloud after scan ─── */}
        {frame > phase2End - 30 &&
          Array.from({ length: 25 }, (_, i) => {
            const startFrame = phase2End - 30 + i * 3;
            const t = interpolate(
              frame,
              [startFrame, startFrame + 60],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            if (t <= 0 || t >= 1) return null;
            const sx = docCenterX + (seededRandom(i * 31) - 0.5) * DOC_W * 0.8;
            const sy = docCenterY + (seededRandom(i * 31 + 1) - 0.5) * DOC_H * 0.6;
            const ex = 960 + (seededRandom(i * 31 + 2) - 0.5) * 100;
            const ey = 200;
            const px = sx + (ex - sx) * t;
            const py = sy + (ey - sy) * t - Math.sin(t * Math.PI) * 80;
            const op = interpolate(t, [0, 0.1, 0.8, 1], [0, 0.8, 0.6, 0]);
            const color = seededRandom(i * 31 + 3) > 0.5 ? "180,255,80" : "80,200,255";
            return (
              <circle
                key={`dp-${i}`}
                cx={px}
                cy={py}
                r={3}
                fill={`rgba(${color},${op})`}
                filter="url(#glow)"
              />
            );
          })}

        {/* ─── Cloud icon (wireframe) ─── */}
        {frame > phase3Start - 20 && (
          <g
            opacity={interpolate(
              frame,
              [phase3Start - 20, phase3Start],
              [0, 0.5],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )}
          >
            {/* Simple cloud shape */}
            <path
              d="M910,200 Q910,160 940,150 Q950,120 980,120 Q1010,120 1020,145 Q1050,140 1060,165 Q1080,170 1080,195 Q1080,215 1060,220 L920,220 Q900,220 900,200 Z"
              fill="none"
              stroke="rgba(100,220,180,0.4)"
              strokeWidth="1.5"
              filter="url(#glow)"
            />
            {/* Upload arrow */}
            <path
              d="M985,240 L985,180 M970,195 L985,175 L1000,195"
              fill="none"
              stroke={`rgba(120,255,120,${0.3 + Math.sin(frame * 0.08) * 0.15})`}
              strokeWidth="2"
              strokeLinecap="round"
              filter="url(#glow)"
            />
          </g>
        )}
      </svg>

      {/* ─── Axis Logo (centered, appears with spring) ─── */}
      {logoOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${logoScale * 0.6})`,
            opacity: logoOpacity * interpolate(
              frame,
              [phase3Start, phase3Start + 30, durationInFrames - 30, durationInFrames],
              [0, 1, 1, 0.8],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
          }}
        >
          <Img
            src={staticFile("images/axis-logo.jpeg")}
            style={{
              width: 600,
              height: "auto",
              filter: `drop-shadow(0 0 30px rgba(0,150,255,0.3)) drop-shadow(0 0 60px rgba(0,100,200,0.15))`,
            }}
          />
        </div>
      )}

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(2,6,14,0.7) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
