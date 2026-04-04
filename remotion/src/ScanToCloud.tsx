import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import React from "react";

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// Floating particles
const PARTICLES = 40;
const particles = Array.from({ length: PARTICLES }, (_, i) => ({
  x: seededRandom(i * 11 + 1) * 1920,
  y: seededRandom(i * 11 + 2) * 1080,
  size: seededRandom(i * 11 + 3) * 4 + 1,
  speed: seededRandom(i * 11 + 4) * 0.02 + 0.005,
  brightness: seededRandom(i * 11 + 5) * 0.5 + 0.2,
  phase: seededRandom(i * 11 + 6) * Math.PI * 2,
}));

// Data stream dots
const STREAM_DOTS = 20;
const streamDots = Array.from({ length: STREAM_DOTS }, (_, i) => ({
  delay: i * 8,
  offsetX: seededRandom(i * 17 + 50) * 30 - 15,
  size: seededRandom(i * 17 + 51) * 4 + 2,
  brightness: seededRandom(i * 17 + 52) * 0.6 + 0.4,
}));

// Document lines for the page
const DOC_LINES = 8;

export const ScanToCloud: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // --- DOCUMENT ---
  // Document gently floats
  const docY = Math.sin(frame * 0.015) * 8;
  const docX = 480;
  const docTopY = 300 + docY;

  // --- SCAN LINE ---
  // Scan line sweeps repeatedly
  const scanCycle = 120; // frames per sweep
  const scanProgress = (frame % scanCycle) / scanCycle;
  const scanLineY = interpolate(scanProgress, [0, 0.5, 1], [0, 280, 0]);
  const scanOpacity = interpolate(scanProgress, [0, 0.1, 0.45, 0.55, 0.9, 1], [0, 0.9, 0.9, 0.9, 0.9, 0]);

  // --- DATA STREAM (document to cloud) ---
  const cloudX = 1400;
  const cloudY = 280;

  // --- CLOUD ---
  const cloudPulse = Math.sin(frame * 0.04) * 0.03 + 1;
  const cloudGlow = Math.sin(frame * 0.06) * 0.15 + 0.4;

  // Checkmark appears periodically
  const checkCycle = 150;
  const checkProgress = (frame % checkCycle) / checkCycle;
  const checkScale = spring({
    frame: Math.max(0, (frame % checkCycle) - 80),
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const checkOpacity = interpolate(checkProgress, [0.5, 0.6, 0.85, 0.95], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Deep navy gradient */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 30% 40%, #0c2244 0%, #071528 40%, #040d18 100%)",
        }}
      />

      {/* Ambient glow behind document */}
      <div
        style={{
          position: "absolute",
          left: docX - 100,
          top: docTopY - 100,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(30,120,220,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Ambient glow behind cloud */}
      <div
        style={{
          position: "absolute",
          left: cloudX - 150,
          top: cloudY - 100,
          width: 500,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(50,150,255,${cloudGlow * 0.15}) 0%, transparent 70%)`,
        }}
      />

      {/* Floating particles */}
      <svg width="1920" height="1080" style={{ position: "absolute", top: 0, left: 0 }}>
        {particles.map((p, i) => {
          const px = (p.x + Math.sin(frame * p.speed + p.phase) * 60) % 1920;
          const py = (p.y + Math.cos(frame * p.speed * 0.7 + p.phase) * 40) % 1080;
          const opacity = p.brightness * (0.5 + Math.sin(frame * 0.03 + p.phase) * 0.5);
          return (
            <circle
              key={`p-${i}`}
              cx={px}
              cy={py}
              r={p.size}
              fill={`rgba(100,180,255,${opacity})`}
            />
          );
        })}
      </svg>

      {/* DOCUMENT */}
      <div
        style={{
          position: "absolute",
          left: docX,
          top: docTopY,
          width: 240,
          height: 320,
          background: "linear-gradient(135deg, rgba(220,230,245,0.95), rgba(200,215,240,0.9))",
          borderRadius: 8,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4), 0 0 20px rgba(50,120,220,0.15)",
          overflow: "hidden",
          transform: `rotate(-2deg)`,
        }}
      >
        {/* Document header */}
        <div
          style={{
            padding: "20px 20px 10px",
            borderBottom: "2px solid rgba(50,100,180,0.2)",
          }}
        >
          <div
            style={{
              width: 100,
              height: 8,
              borderRadius: 4,
              background: "rgba(40,80,160,0.3)",
              marginBottom: 8,
            }}
          />
          <div
            style={{
              width: 60,
              height: 6,
              borderRadius: 3,
              background: "rgba(40,80,160,0.15)",
            }}
          />
        </div>

        {/* Document lines */}
        <div style={{ padding: "15px 20px" }}>
          {Array.from({ length: DOC_LINES }, (_, i) => (
            <div
              key={`line-${i}`}
              style={{
                width: `${70 + seededRandom(i + 100) * 30}%`,
                height: 5,
                borderRadius: 3,
                background: `rgba(40,80,160,${0.12 + seededRandom(i + 200) * 0.08})`,
                marginBottom: 12,
              }}
            />
          ))}
        </div>

        {/* SCAN LINE */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: scanLineY,
            height: 3,
            background: `linear-gradient(90deg, transparent, rgba(0,180,255,${scanOpacity}), rgba(0,220,255,${scanOpacity * 0.8}), transparent)`,
            boxShadow: `0 0 20px rgba(0,180,255,${scanOpacity * 0.6}), 0 0 40px rgba(0,180,255,${scanOpacity * 0.3})`,
          }}
        />

        {/* Scan glow overlay */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: scanLineY - 30,
            height: 60,
            background: `linear-gradient(180deg, transparent, rgba(0,180,255,${scanOpacity * 0.05}), transparent)`,
          }}
        />
      </div>

      {/* DATA STREAM: dots flowing from document to cloud */}
      <svg width="1920" height="1080" style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Path line (faint) */}
        <path
          d={`M ${docX + 250} ${docTopY + 160} C ${docX + 450} ${docTopY + 100}, ${cloudX - 200} ${cloudY + 100}, ${cloudX + 40} ${cloudY + 80}`}
          fill="none"
          stroke="rgba(50,150,255,0.08)"
          strokeWidth="2"
          strokeDasharray="8 8"
        />

        {/* Flowing data dots */}
        {streamDots.map((dot, i) => {
          const t = ((frame + dot.delay) % 60) / 60;
          // Bezier curve from doc to cloud
          const startX = docX + 250;
          const startY = docTopY + 160;
          const cp1X = docX + 450;
          const cp1Y = docTopY + 100;
          const cp2X = cloudX - 200;
          const cp2Y = cloudY + 100;
          const endX = cloudX + 40;
          const endY = cloudY + 80;

          const mt = 1 - t;
          const cx = mt * mt * mt * startX + 3 * mt * mt * t * cp1X + 3 * mt * t * t * cp2X + t * t * t * endX;
          const cy = mt * mt * mt * startY + 3 * mt * mt * t * cp1Y + 3 * mt * t * t * cp2Y + t * t * t * endY;

          const opacity = interpolate(t, [0, 0.1, 0.8, 1], [0, dot.brightness, dot.brightness * 0.6, 0]);

          return (
            <g key={`sd-${i}`}>
              <circle
                cx={cx + dot.offsetX * t}
                cy={cy}
                r={dot.size}
                fill={`rgba(80,180,255,${opacity})`}
              />
              <circle
                cx={cx + dot.offsetX * t}
                cy={cy}
                r={dot.size * 2.5}
                fill={`rgba(80,180,255,${opacity * 0.15})`}
              />
            </g>
          );
        })}
      </svg>

      {/* CLOUD */}
      <div
        style={{
          position: "absolute",
          left: cloudX - 60,
          top: cloudY,
          transform: `scale(${cloudPulse})`,
          transformOrigin: "center",
        }}
      >
        <svg width="200" height="140" viewBox="0 0 200 140">
          {/* Cloud glow */}
          <defs>
            <filter id="cloudGlow">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Cloud shape */}
          <path
            d="M160,90 C170,90 180,80 180,68 C180,56 170,46 158,46 C156,46 154,46 152,47 C148,30 133,18 115,18 C100,18 87,27 81,40 C78,38 74,37 70,37 C56,37 44,49 44,64 C44,65 44,66 44,67 C32,70 24,80 24,92 C24,106 36,118 50,118 L155,118 C170,118 182,106 182,92 C182,91 182,91 182,90 Z"
            fill={`rgba(40,100,200,${0.15 + cloudGlow * 0.1})`}
            stroke={`rgba(80,160,255,${0.3 + cloudGlow * 0.2})`}
            strokeWidth="1.5"
            filter="url(#cloudGlow)"
          />

          {/* Upload arrow inside cloud */}
          <g transform="translate(100, 72)">
            <line
              x1="0"
              y1="18"
              x2="0"
              y2={-8 + Math.sin(frame * 0.08) * 3}
              stroke={`rgba(100,200,255,${0.5 + cloudGlow * 0.3})`}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polyline
              points="-10,2 0,-10 10,2"
              fill="none"
              stroke={`rgba(100,200,255,${0.5 + cloudGlow * 0.3})`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={`translate(0, ${Math.sin(frame * 0.08) * 3})`}
            />
          </g>
        </svg>

        {/* Checkmark */}
        {checkOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              top: -20,
              right: -10,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(40,200,120,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${checkScale})`,
              opacity: checkOpacity,
              boxShadow: "0 0 15px rgba(40,200,120,0.5)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <polyline
                points="4,10 8,14 16,6"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Connection lines in background */}
      <svg width="1920" height="1080" style={{ position: "absolute", top: 0, left: 0, opacity: 0.06 }}>
        {Array.from({ length: 15 }, (_, i) => {
          const x1 = seededRandom(i * 31 + 300) * 1920;
          const y1 = seededRandom(i * 31 + 301) * 1080;
          const x2 = seededRandom(i * 31 + 302) * 1920;
          const y2 = seededRandom(i * 31 + 303) * 1080;
          return (
            <line
              key={`bg-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(80,150,255,1)"
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(3,8,16,0.7) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
