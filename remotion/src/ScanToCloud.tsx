import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import React from "react";

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// Floating particles
const PARTICLES = 50;
const particles = Array.from({ length: PARTICLES }, (_, i) => ({
  x: seededRandom(i * 11 + 1) * 1920,
  y: seededRandom(i * 11 + 2) * 1080,
  size: seededRandom(i * 11 + 3) * 3 + 1,
  speed: seededRandom(i * 11 + 4) * 0.02 + 0.005,
  brightness: seededRandom(i * 11 + 5) * 0.4 + 0.15,
  phase: seededRandom(i * 11 + 6) * Math.PI * 2,
}));

// Multiple scan units spread around edges (avoiding center where card is)
interface ScanUnit {
  docX: number;
  docY: number;
  cloudX: number;
  cloudY: number;
  scale: number;
  scanSpeed: number;
  streamPhase: number;
  rotation: number;
}

const scanUnits: ScanUnit[] = [
  // Top-left
  { docX: 60, docY: 40, cloudX: 280, cloudY: 30, scale: 0.35, scanSpeed: 100, streamPhase: 0, rotation: -3 },
  // Top-right
  { docX: 1520, docY: 60, cloudX: 1740, cloudY: 50, scale: 0.32, scanSpeed: 130, streamPhase: 20, rotation: 2 },
  // Bottom-left
  { docX: 80, docY: 680, cloudX: 300, cloudY: 660, scale: 0.38, scanSpeed: 110, streamPhase: 40, rotation: -1 },
  // Bottom-right
  { docX: 1500, docY: 700, cloudX: 1720, cloudY: 680, scale: 0.34, scanSpeed: 90, streamPhase: 60, rotation: 3 },
  // Far left middle
  { docX: 30, docY: 380, cloudX: 230, cloudY: 350, scale: 0.3, scanSpeed: 120, streamPhase: 30, rotation: -2 },
  // Far right middle
  { docX: 1560, docY: 400, cloudX: 1760, cloudY: 370, scale: 0.33, scanSpeed: 105, streamPhase: 50, rotation: 1 },
  // Top center-left
  { docX: 350, docY: 20, cloudX: 540, cloudY: 15, scale: 0.28, scanSpeed: 115, streamPhase: 10, rotation: -4 },
  // Top center-right
  { docX: 1150, docY: 25, cloudX: 1340, cloudY: 20, scale: 0.27, scanSpeed: 95, streamPhase: 45, rotation: 2 },
  // Bottom center-left
  { docX: 320, docY: 750, cloudX: 510, cloudY: 730, scale: 0.3, scanSpeed: 125, streamPhase: 15, rotation: 1 },
  // Bottom center-right
  { docX: 1180, docY: 740, cloudX: 1370, cloudY: 720, scale: 0.29, scanSpeed: 108, streamPhase: 55, rotation: -2 },
];

const ScanUnitComponent: React.FC<{ unit: ScanUnit; frame: number; fps: number }> = ({
  unit,
  frame,
  fps,
}) => {
  const { docX, docY, cloudX, cloudY, scale, scanSpeed, streamPhase, rotation } = unit;

  const float = Math.sin((frame + streamPhase) * 0.018) * 5;
  const scanProgress = ((frame + streamPhase) % scanSpeed) / scanSpeed;
  const scanLineY = interpolate(scanProgress, [0, 0.5, 1], [0, 280, 0]);
  const scanOpacity = interpolate(scanProgress, [0, 0.08, 0.45, 0.55, 0.92, 1], [0, 0.9, 0.9, 0.9, 0.9, 0]);
  const cloudPulse = Math.sin((frame + streamPhase) * 0.04) * 0.04 + 1;
  const cloudGlow = Math.sin((frame + streamPhase) * 0.06) * 0.2 + 0.4;

  const checkCycle = 150;
  const checkFrame = (frame + streamPhase) % checkCycle;
  const checkScale = spring({ frame: Math.max(0, checkFrame - 80), fps, config: { damping: 12, stiffness: 150 } });
  const checkOpacity = interpolate(checkFrame / checkCycle, [0.5, 0.6, 0.85, 0.95], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Stream dots
  const DOTS = 8;

  return (
    <g transform={`translate(${docX}, ${docY + float}) scale(${scale})`}>
      {/* Document */}
      <g transform={`rotate(${rotation})`}>
        <rect x="0" y="0" width="240" height="320" rx="8" fill="rgba(210,225,245,0.9)"
          stroke="rgba(100,150,220,0.2)" strokeWidth="1" />
        {/* Header */}
        <rect x="20" y="20" width="100" height="8" rx="4" fill="rgba(40,80,160,0.25)" />
        <rect x="20" y="36" width="60" height="6" rx="3" fill="rgba(40,80,160,0.12)" />
        {/* Lines */}
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x="20" y={60 + i * 22} width={140 + seededRandom(i + docX) * 60} height="5" rx="3"
            fill={`rgba(40,80,160,${0.1 + seededRandom(i + docY) * 0.08})`} />
        ))}
        {/* Scan line */}
        <rect x="0" y={scanLineY} width="240" height="3" rx="1"
          fill={`rgba(0,180,255,${scanOpacity})`}
          style={{ filter: `drop-shadow(0 0 8px rgba(0,180,255,${scanOpacity * 0.6}))` }} />
      </g>

      {/* Data stream dots */}
      {Array.from({ length: DOTS }, (_, i) => {
        const t = ((frame + streamPhase + i * 7) % 50) / 50;
        const sx = 250;
        const sy = 160;
        const ex = cloudX - docX;
        const ey = cloudY - docY + 60;
        const cpx1 = sx + (ex - sx) * 0.3;
        const cpy1 = sy - 40;
        const cpx2 = sx + (ex - sx) * 0.7;
        const cpy2 = ey + 30;
        const mt = 1 - t;
        const cx = mt * mt * mt * sx + 3 * mt * mt * t * cpx1 + 3 * mt * t * t * cpx2 + t * t * t * ex;
        const cy = mt * mt * mt * sy + 3 * mt * mt * t * cpy1 + 3 * mt * t * t * cpy2 + t * t * t * ey;
        const op = interpolate(t, [0, 0.1, 0.8, 1], [0, 0.7, 0.5, 0]);
        return (
          <circle key={i} cx={cx} cy={cy} r={3 + seededRandom(i + docX) * 2}
            fill={`rgba(80,180,255,${op})`} />
        );
      })}

      {/* Cloud */}
      <g transform={`translate(${cloudX - docX - 30}, ${cloudY - docY - 10}) scale(${cloudPulse})`}>
        <path
          d="M80,50 C85,50 90,45 90,38 C90,31 85,26 79,26 C78,26 77,26 76,27 C74,18 66,12 57,12 C50,12 43,17 40,24 C39,23 37,22 35,22 C28,22 22,28 22,36 C22,36 22,37 22,37 C16,39 12,44 12,50 C12,57 18,63 25,63 L78,63 C85,63 91,57 91,50 C91,50 91,50 91,50 Z"
          fill={`rgba(40,100,200,${0.15 + cloudGlow * 0.1})`}
          stroke={`rgba(80,160,255,${0.3 + cloudGlow * 0.2})`}
          strokeWidth="1.2"
        />
        {/* Arrow */}
        <line x1="50" y1="48" x2="50" y2={33 + Math.sin((frame + streamPhase) * 0.08) * 2}
          stroke={`rgba(100,200,255,${0.5 + cloudGlow * 0.3})`} strokeWidth="2" strokeLinecap="round" />
        <polyline points="44,37 50,31 56,37" fill="none"
          stroke={`rgba(100,200,255,${0.5 + cloudGlow * 0.3})`} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          transform={`translate(0, ${Math.sin((frame + streamPhase) * 0.08) * 2})`} />

        {/* Checkmark */}
        {checkOpacity > 0 && (
          <g transform={`translate(82, 8) scale(${checkScale})`} opacity={checkOpacity}>
            <circle cx="0" cy="0" r="12" fill="rgba(40,200,120,0.9)" />
            <polyline points="-5,0 -2,3 5,-4" fill="none" stroke="white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </g>
    </g>
  );
};

export const ScanToCloud: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      {/* Deep navy gradient */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 30% 40%, #0c2244 0%, #071528 40%, #040d18 100%)",
        }}
      />

      {/* Floating particles */}
      <svg width="1920" height="1080" style={{ position: "absolute", top: 0, left: 0 }}>
        {particles.map((p, i) => {
          const px = (p.x + Math.sin(frame * p.speed + p.phase) * 60) % 1920;
          const py = (p.y + Math.cos(frame * p.speed * 0.7 + p.phase) * 40) % 1080;
          const opacity = p.brightness * (0.5 + Math.sin(frame * 0.03 + p.phase) * 0.5);
          return (
            <circle key={`p-${i}`} cx={px} cy={py} r={p.size} fill={`rgba(100,180,255,${opacity})`} />
          );
        })}
      </svg>

      {/* All scan units */}
      <svg width="1920" height="1080" style={{ position: "absolute", top: 0, left: 0 }}>
        {scanUnits.map((unit, i) => (
          <ScanUnitComponent key={`su-${i}`} unit={unit} frame={frame} fps={fps} />
        ))}
      </svg>

      {/* Faint connection lines background */}
      <svg width="1920" height="1080" style={{ position: "absolute", top: 0, left: 0, opacity: 0.04 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`bg-${i}`}
            x1={seededRandom(i * 31 + 300) * 1920} y1={seededRandom(i * 31 + 301) * 1080}
            x2={seededRandom(i * 31 + 302) * 1920} y2={seededRandom(i * 31 + 303) * 1080}
            stroke="rgba(80,150,255,1)" strokeWidth="1" />
        ))}
      </svg>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(3,8,16,0.7) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
