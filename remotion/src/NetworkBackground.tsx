import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import React from "react";

// Generate deterministic particles
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

interface Particle {
  x: number;
  y: number;
  length: number;
  angle: number;
  speed: number;
  brightness: number;
  size: number;
  delay: number;
}

const PARTICLE_COUNT = 60;

const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  x: seededRandom(i * 7 + 1) * 2200 - 150,
  y: seededRandom(i * 7 + 2) * 1300 - 100,
  length: seededRandom(i * 7 + 3) * 120 + 40,
  angle: seededRandom(i * 7 + 4) * 60 + 15, // 15-75 degrees
  speed: seededRandom(i * 7 + 5) * 2 + 0.5,
  brightness: seededRandom(i * 7 + 6) * 0.6 + 0.3,
  size: seededRandom(i * 7 + 7) * 3 + 1,
  delay: seededRandom(i * 7 + 8) * 100,
}));

// Glowing dots at intersections
const DOTS_COUNT = 25;
const dots = Array.from({ length: DOTS_COUNT }, (_, i) => ({
  x: seededRandom(i * 13 + 100) * 1920,
  y: seededRandom(i * 13 + 101) * 1080,
  size: seededRandom(i * 13 + 102) * 8 + 4,
  pulseSpeed: seededRandom(i * 13 + 103) * 0.03 + 0.01,
  brightness: seededRandom(i * 13 + 104) * 0.7 + 0.3,
  delay: seededRandom(i * 13 + 105) * 200,
}));

export const NetworkBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill>
      {/* Deep navy gradient background */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 50% 50%, #0a1e3d 0%, #060f1f 50%, #030810 100%)",
        }}
      />

      {/* Subtle secondary glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(30,80,160,0.15) 0%, transparent 70%)",
          left: `${interpolate(frame, [0, durationInFrames], [10, 30])}%`,
          top: `${interpolate(frame, [0, durationInFrames], [20, 40])}%`,
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(20,60,140,0.1) 0%, transparent 70%)",
          right: `${interpolate(frame, [0, durationInFrames], [5, 20])}%`,
          bottom: `${interpolate(frame, [0, durationInFrames], [10, 30])}%`,
          transform: "translate(50%, 50%)",
        }}
      />

      {/* Animated light lines / streaks */}
      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {particles.map((p, i) => {
          const progress = ((frame * p.speed + p.delay) % 200) / 200;
          const opacity = interpolate(
            progress,
            [0, 0.1, 0.5, 0.9, 1],
            [0, p.brightness, p.brightness * 0.8, p.brightness * 0.3, 0]
          );
          const angleRad = (p.angle * Math.PI) / 180;
          const moveX = frame * p.speed * Math.cos(angleRad) * 0.8;
          const moveY = frame * p.speed * Math.sin(angleRad) * 0.8;
          const x1 = ((p.x + moveX) % 2200) - 150;
          const y1 = ((p.y + moveY) % 1300) - 100;
          const x2 = x1 + p.length * Math.cos(angleRad);
          const y2 = y1 + p.length * Math.sin(angleRad);

          return (
            <line
              key={`line-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={`rgba(120, 180, 255, ${opacity})`}
              strokeWidth={p.size}
              strokeLinecap="round"
              filter="url(#glow)"
            />
          );
        })}

        {/* Glowing dots */}
        {dots.map((d, i) => {
          const pulse = Math.sin((frame + d.delay) * d.pulseSpeed) * 0.5 + 0.5;
          const opacity = d.brightness * (0.4 + pulse * 0.6);
          const size = d.size * (0.8 + pulse * 0.4);
          const moveX = Math.sin((frame + d.delay) * 0.008) * 15;
          const moveY = Math.cos((frame + d.delay) * 0.006) * 10;

          return (
            <circle
              key={`dot-${i}`}
              cx={d.x + moveX}
              cy={d.y + moveY}
              r={size}
              fill={`rgba(150, 200, 255, ${opacity})`}
              filter="url(#dotGlow)"
            />
          );
        })}

        {/* SVG filters for glow */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Vignette overlay */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(3,8,16,0.6) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
