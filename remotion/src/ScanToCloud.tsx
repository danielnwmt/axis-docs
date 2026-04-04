import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
} from "remotion";
import React from "react";

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// Grid nodes for circuit/network
const COLS = 16;
const ROWS = 9;
const SPACING_X = 1920 / (COLS - 1);
const SPACING_Y = 1080 / (ROWS - 1);

interface Node {
  x: number;
  y: number;
  pulsePhase: number;
  size: number;
  brightness: number;
}

const nodes: Node[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    nodes.push({
      x: c * SPACING_X + (seededRandom(i * 7 + 1) - 0.5) * 30,
      y: r * SPACING_Y + (seededRandom(i * 7 + 2) - 0.5) * 30,
      pulsePhase: seededRandom(i * 7 + 3) * Math.PI * 2,
      size: seededRandom(i * 7 + 4) * 2.5 + 1.5,
      brightness: seededRandom(i * 7 + 5) * 0.5 + 0.3,
    });
  }
}

// Connections between nearby nodes
interface Connection {
  from: number;
  to: number;
  pulseDelay: number;
}

const connections: Connection[] = [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const dx = nodes[i].x - nodes[j].x;
    const dy = nodes[i].y - nodes[j].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 220 && seededRandom(i * 100 + j) > 0.35) {
      connections.push({ from: i, to: j, pulseDelay: seededRandom(i * 50 + j) * 200 });
    }
  }
}

// Traveling data pulses along connections
const PULSE_COUNT = 30;
const pulses = Array.from({ length: PULSE_COUNT }, (_, i) => ({
  connectionIdx: Math.floor(seededRandom(i * 19 + 500) * connections.length),
  speed: seededRandom(i * 19 + 501) * 0.015 + 0.008,
  phase: seededRandom(i * 19 + 502) * 1000,
  color: seededRandom(i * 19 + 503) > 0.7 ? "0,220,180" : seededRandom(i * 19 + 503) > 0.4 ? "80,160,255" : "0,200,255",
  size: seededRandom(i * 19 + 504) * 3 + 2,
}));

// Hex grid overlay
const HEX_COUNT = 8;
const hexagons = Array.from({ length: HEX_COUNT }, (_, i) => ({
  cx: seededRandom(i * 23 + 700) * 1920,
  cy: seededRandom(i * 23 + 701) * 1080,
  radius: seededRandom(i * 23 + 702) * 60 + 30,
  rotSpeed: (seededRandom(i * 23 + 703) - 0.5) * 0.4,
  phase: seededRandom(i * 23 + 704) * Math.PI * 2,
  opacity: seededRandom(i * 23 + 705) * 0.08 + 0.03,
}));

// Binary streams
const BINARY_STREAMS = 6;
const streams = Array.from({ length: BINARY_STREAMS }, (_, i) => ({
  x: seededRandom(i * 37 + 800) * 1920,
  speed: seededRandom(i * 37 + 801) * 1.5 + 0.5,
  chars: Array.from({ length: 20 }, (_, j) => (seededRandom(i * 37 + j * 3 + 900) > 0.5 ? "1" : "0")),
  opacity: seededRandom(i * 37 + 802) * 0.06 + 0.02,
}));

// Radar sweep
const RADAR_COUNT = 3;
const radars = Array.from({ length: RADAR_COUNT }, (_, i) => ({
  cx: seededRandom(i * 41 + 1000) * 1600 + 160,
  cy: seededRandom(i * 41 + 1001) * 880 + 100,
  radius: seededRandom(i * 41 + 1002) * 80 + 50,
  speed: seededRandom(i * 41 + 1003) * 0.03 + 0.01,
  phase: seededRandom(i * 41 + 1004) * Math.PI * 2,
}));

function hexPath(cx: number, cy: number, r: number, rot: number): string {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const angle = (Math.PI / 3) * k + rot;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return `M${pts.join("L")}Z`;
}

export const ScanToCloud: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      {/* Deep dark tech gradient */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 40% 35%, #0a1a30 0%, #060e1c 45%, #020810 100%)",
        }}
      />

      {/* Subtle grid overlay */}
      <svg width="1920" height="1080" style={{ position: "absolute", opacity: 0.03 }}>
        {Array.from({ length: 20 }, (_, i) => (
          <line key={`gv-${i}`} x1={i * 100} y1="0" x2={i * 100} y2="1080" stroke="rgba(80,180,255,1)" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`gh-${i}`} x1="0" y1={i * 100} x2="1920" y2={i * 100} stroke="rgba(80,180,255,1)" strokeWidth="0.5" />
        ))}
      </svg>

      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glowStrong">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="radarGrad">
            <stop offset="0%" stopColor="rgba(0,200,255,0.15)" />
            <stop offset="100%" stopColor="rgba(0,200,255,0)" />
          </radialGradient>
        </defs>

        {/* Connections */}
        {connections.map((conn, i) => {
          const a = nodes[conn.from];
          const b = nodes[conn.to];
          const pulse = Math.sin((frame + conn.pulseDelay) * 0.025) * 0.5 + 0.5;
          const opacity = 0.04 + pulse * 0.06;
          return (
            <line key={`c-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={`rgba(40,120,200,${opacity})`} strokeWidth="0.8" />
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const pulse = Math.sin(frame * 0.04 + n.pulsePhase) * 0.5 + 0.5;
          const opacity = n.brightness * (0.3 + pulse * 0.7);
          const r = n.size * (0.8 + pulse * 0.3);
          return (
            <g key={`n-${i}`}>
              <circle cx={n.x} cy={n.y} r={r * 3} fill={`rgba(40,150,255,${opacity * 0.08})`} />
              <circle cx={n.x} cy={n.y} r={r} fill={`rgba(80,180,255,${opacity})`} filter="url(#glow)" />
            </g>
          );
        })}

        {/* Traveling pulses */}
        {pulses.map((p, i) => {
          const conn = connections[p.connectionIdx];
          if (!conn) return null;
          const a = nodes[conn.from];
          const b = nodes[conn.to];
          const t = ((frame * p.speed + p.phase) % 1 + 1) % 1;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          const op = interpolate(t, [0, 0.1, 0.9, 1], [0, 0.8, 0.8, 0]);
          return (
            <g key={`tp-${i}`}>
              <circle cx={px} cy={py} r={p.size * 2} fill={`rgba(${p.color},${op * 0.15})`} />
              <circle cx={px} cy={py} r={p.size} fill={`rgba(${p.color},${op})`} filter="url(#glow)" />
            </g>
          );
        })}

        {/* Hexagons */}
        {hexagons.map((h, i) => {
          const rot = frame * h.rotSpeed + h.phase;
          return (
            <path key={`hex-${i}`} d={hexPath(h.cx, h.cy, h.radius, rot)}
              fill="none" stroke={`rgba(60,160,255,${h.opacity})`} strokeWidth="1" />
          );
        })}

        {/* Radar sweeps */}
        {radars.map((r, i) => {
          const angle = frame * r.speed + r.phase;
          const endX = r.cx + r.radius * Math.cos(angle);
          const endY = r.cy + r.radius * Math.sin(angle);
          // Trailing arc
          const trailAngle = angle - 0.8;
          const arcEndX = r.cx + r.radius * Math.cos(trailAngle);
          const arcEndY = r.cy + r.radius * Math.sin(trailAngle);
          return (
            <g key={`radar-${i}`}>
              <circle cx={r.cx} cy={r.cy} r={r.radius} fill="none"
                stroke="rgba(0,200,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx={r.cx} cy={r.cy} r={r.radius * 0.4} fill="none"
                stroke="rgba(0,200,255,0.04)" strokeWidth="0.8" />
              <line x1={r.cx} y1={r.cy} x2={endX} y2={endY}
                stroke="rgba(0,220,255,0.3)" strokeWidth="1.5" filter="url(#glow)" />
              <circle cx={endX} cy={endY} r="3" fill="rgba(0,220,255,0.6)" filter="url(#glowStrong)" />
              {/* Sweep cone */}
              <path
                d={`M${r.cx},${r.cy} L${endX},${endY} A${r.radius},${r.radius} 0 0,0 ${arcEndX},${arcEndY} Z`}
                fill="rgba(0,200,255,0.04)" />
            </g>
          );
        })}

        {/* Binary streams */}
        {streams.map((s, i) =>
          s.chars.map((ch, j) => {
            const y = ((j * 50 - frame * s.speed + s.x) % 1100 + 1100) % 1100 - 10;
            return (
              <text key={`bs-${i}-${j}`} x={s.x} y={y}
                fill={`rgba(0,200,255,${s.opacity})`}
                fontSize="14" fontFamily="monospace">{ch}</text>
            );
          })
        )}
      </svg>

      {/* Ambient light spots */}
      <div style={{ position: "absolute", left: `${30 + Math.sin(frame * 0.008) * 10}%`, top: `${25 + Math.cos(frame * 0.006) * 8}%`,
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,100,200,0.06) 0%, transparent 70%)", transform: "translate(-50%,-50%)" }} />
      <div style={{ position: "absolute", left: `${70 + Math.sin(frame * 0.01) * 8}%`, top: `${65 + Math.cos(frame * 0.007) * 10}%`,
        width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,180,150,0.04) 0%, transparent 70%)", transform: "translate(-50%,-50%)" }} />

      {/* Vignette */}
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(2,6,14,0.75) 100%)",
      }} />
    </AbsoluteFill>
  );
};
