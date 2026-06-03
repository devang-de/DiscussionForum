"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Types ────────────────────────────────────────────────

export interface OfficeAgent {
  id: string;
  name: string;
  role?: string;
  spriteIndex: number;
  status: "idle" | "thinking" | "speaking";
  location: "desk" | "conference";
  lastMessage?: string;
  turnsUsed: number;
  maxTurns: number;
  color?: string;
}

// ─── World ────────────────────────────────────────────────

const WORLD = { w: 960, h: 560 };

interface Point { x: number; y: number; }

// ─── Agent colors ──────────────────────────────────────────

export const AGENT_COLORS: Record<string, string> = {
  ethicist:     "#a78bfa",
  optimist:     "#60a5fa",
  skeptic:      "#fbbf24",
  pragmatist:   "#34d399",
  humanist:     "#f472b6",
  technologist: "#22d3ee",
  economist:    "#fb923c",
  designer:     "#e879f9",
  coordinator:  "#818cf8",
  human:        "#c084fc",
};

// ─── Deliberate sprite mapping ─────────────────────────────

export const AGENT_SPRITE_MAP: Record<string, number> = {
  ethicist:     0,
  optimist:     1,
  skeptic:      2,
  pragmatist:   3,
  humanist:     4,
  technologist: 5,
  economist:    2,
  designer:     4,
  coordinator:  3,
  human:        1,
};

// ─── Desk positions — each agent stays at their desk ────────

interface DeskInfo {
  point: Point;
  label: string;
  color: string;
}

const DESK_LAYOUT: Record<string, DeskInfo> = {
  // Left wall
  ethicist:     { point: { x: 52, y: 140 }, label: "Ethicist",     color: AGENT_COLORS.ethicist },
  optimist:     { point: { x: 52, y: 270 }, label: "Optimist",     color: AGENT_COLORS.optimist },
  skeptic:      { point: { x: 52, y: 400 }, label: "Skeptic",      color: AGENT_COLORS.skeptic },

  // Right wall
  pragmatist:   { point: { x: 812, y: 140 }, label: "Pragmatist",   color: AGENT_COLORS.pragmatist },
  humanist:     { point: { x: 812, y: 270 }, label: "Humanist",     color: AGENT_COLORS.humanist },
  technologist: { point: { x: 812, y: 400 }, label: "Technologist", color: AGENT_COLORS.technologist },

  // Top wall
  economist:    { point: { x: 310, y: 68 }, label: "Economist",      color: AGENT_COLORS.economist },
  designer:     { point: { x: 650, y: 68 }, label: "Designer",       color: AGENT_COLORS.designer },

  // Bottom wall
  coordinator:  { point: { x: 420, y: 476 }, label: "Coordinator",  color: AGENT_COLORS.coordinator },
  human:        { point: { x: 540, y: 476 }, label: "You",          color: AGENT_COLORS.human },
};

// ─── Easing ───────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ─── Color helpers ─────────────────────────────────────────

const rgbCache = new Map<string, [number, number, number]>();

function hexToRgb(hex: string): [number, number, number] {
  const cached = rgbCache.get(hex);
  if (cached) return cached;
  const h = hex.replace("#", "");
  const rgb: [number, number, number] = [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
  rgbCache.set(hex, rgb);
  return rgb;
}

export function rgbString(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Particle system ──────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

// ─── Hover tooltip ────────────────────────────────────────

function HoverTooltip({ agent, agentId }: { agent: OfficeAgent | undefined; agentId: string }) {
  const hc = agent?.color || DESK_LAYOUT[agentId]?.color || "#818cf8";
  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-xs shadow-xl pointer-events-none z-10 animate-fade-up"
      style={{
        background: `linear-gradient(135deg, ${rgbString(hc, 0.2)}, ${rgbString(hc, 0.08)})`,
        border: `1px solid ${rgbString(hc, 0.3)}`,
        backdropFilter: "blur(16px)",
        color: rgbString(hc, 0.9),
      }}
    >
      {agent?.name}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function PixelOffice({
  agents,
  onAgentClick,
}: {
  agents: OfficeAgent[];
  onAgentClick?: (agentId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const spritesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<OfficeAgent | null>(null);
  const [size, setSize] = useState({ w: 960, h: 560 });
  const bubblesRef = useRef<Array<{
    agentId: string; text: string; opacity: number; timer: number; color: string;
  }>>([]);
  const particlesRef = useRef<Particle[]>([]);
  const ambientParticlesRef = useRef<Particle[]>([]);
  const agentsRef = useRef(agents);
  const hoveredRef = useRef<string | null>(null);
  const positionsRef = useRef<Record<string, Point>>({});
  const moveProgressRef = useRef<Record<string, { from: Point; to: Point; progress: number; speed: number }>>({});
  agentsRef.current = agents;
  hoveredRef.current = hoveredAgent;

  // ── Responsive ──────────────────────────────────────
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width || 960, h: e.contentRect.height || 560 });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Load sprites ────────────────────────────────────
  useEffect(() => {
    for (let i = 0; i < 6; i++) {
      const img = new Image();
      img.src = `/pixel-agents/characters/char_${i}.png`;
      spritesRef.current.set(`char_${i}`, img);
    }
    const wallImg = new Image();
    wallImg.src = "/pixel-agents/walls/wall_0.png";
    spritesRef.current.set("WALL_0", wallImg);
    const floorImg = new Image();
    floorImg.src = "/pixel-agents/floors/floor_0.png";
    spritesRef.current.set("FLOOR_0", floorImg);
    const furniture = [
      "DESK_FRONT", "DESK_SIDE", "CUSHIONED_CHAIR_FRONT", "CUSHIONED_CHAIR_SIDE",
      "TABLE_FRONT", "WHITEBOARD", "PLANT_2", "CACTUS", "DOUBLE_BOOKSHELF",
      "COFFEE_TABLE", "COFFEE", "CUSHIONED_BENCH", "CLOCK", "SMALL_PAINTING",
      "SMALL_PAINTING_2", "LARGE_PAINTING", "HANGING_PLANT", "LARGE_PLANT",
      "PC_FRONT_ON_1", "POT",
    ];
    for (const n of furniture) {
      const img = new Image();
      img.src = `/pixel-agents/furniture/${n}.png`;
      spritesRef.current.set(n, img);
    }
  }, []);

  // ── Init ambient particles ──────────────────────────
  useEffect(() => {
    const colors = Object.values(AGENT_COLORS);
    const particles: Particle[] = [];
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: 40 + Math.random() * (WORLD.w - 80),
        y: 60 + Math.random() * (WORLD.h - 100),
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: Math.random() * 3,
        maxLife: 3 + Math.random() * 4,
        size: 1 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    ambientParticlesRef.current = particles;
  }, []);

  // ── Track speaking → bubbles ────────────────────────
  useEffect(() => {
    for (const a of agents) {
      if (a.status === "speaking" && a.lastMessage) {
        const exist = bubblesRef.current.find(
          (b) => b.agentId === a.id && b.text === a.lastMessage
        );
        if (!exist) {
          const info = DESK_LAYOUT[a.id];
          bubblesRef.current.push({
            agentId: a.id,
            text: a.lastMessage.slice(0, 140),
            opacity: 0,
            timer: 0,
            color: a.color || info?.color || "#818cf8",
          });
          if (bubblesRef.current.length > 8) bubblesRef.current.shift();
        }
      }
    }
  }, [agents]);

  // ── Spawn thinking particles ────────────────────────
  const spawnParticles = useCallback((agentId: string, x: number, y: number, color: string) => {
    const info = DESK_LAYOUT[agentId];
    const c = info?.color || color || "#fbbf24";
    for (let i = 0; i < 3; i++) {
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y - 14 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 25 - 8,
        life: 0,
        maxLife: 0.7 + Math.random() * 0.7,
        size: 2 + Math.random() * 3,
        color: c,
      });
    }
    if (particlesRef.current.length > 80) particlesRef.current.splice(0, 10);
  }, []);

  // ── Update positions with easing ────────────────────
  // Agents ALWAYS stay at their desks — no conference movement
  const updatePositions = (dt: number) => {
    const current = agentsRef.current;

    for (const agent of current) {
      const deskInfo = DESK_LAYOUT[agent.id];
      const target = deskInfo?.point || { x: 480, y: 280 };

      const pos = positionsRef.current[agent.id];
      if (!pos) {
        positionsRef.current[agent.id] = { ...target };
        continue;
      }

      const key = agent.id;
      let mp = moveProgressRef.current[key];
      if (!mp || mp.to.x !== target.x || mp.to.y !== target.y) {
        mp = { from: { ...pos }, to: { ...target }, progress: 0, speed: 1.5 };
        moveProgressRef.current[key] = mp;
      }
      if (mp.progress < 1) {
        mp.progress = Math.min(1, mp.progress + dt * mp.speed);
        const e = easeOutCubic(mp.progress);
        positionsRef.current[agent.id] = {
          x: mp.from.x + (mp.to.x - mp.from.x) * e,
          y: mp.from.y + (mp.to.y - mp.from.y) * e,
        };
      }
    }
  };

  // ── Draw ────────────────────────────────────────────
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const now = performance.now();
    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = now;
    timeRef.current += dt;

    updatePositions(dt);

    const t = timeRef.current;
    const { w, h } = size;
    c.width = w; c.height = h;
    const sc = Math.min(w / WORLD.w, h / WORLD.h);
    const ox = (w - WORLD.w * sc) / 2;
    const oy = (h - WORLD.h * sc) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);

    // ── Background ────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    const hueShift = Math.sin(t * 0.15) * 15;
    bgGrad.addColorStop(0, `hsl(${250 + hueShift}, 40%, 8%)`);
    bgGrad.addColorStop(0.5, `hsl(${270 + hueShift}, 35%, 7%)`);
    bgGrad.addColorStop(1, `hsl(${230 + hueShift}, 35%, 9%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    // Floor texture
    const floorSprite = spritesRef.current.get("FLOOR_0");
    if (floorSprite?.complete) {
      for (let x = 32; x < WORLD.w - 32; x += 72) {
        for (let y = 64; y < WORLD.h - 40; y += 72) {
          ctx.drawImage(floorSprite, x, y, 72, 72);
        }
      }
    }
    for (let x = 32; x < WORLD.w - 32; x += 40) {
      for (let y = 64; y < WORLD.h - 40; y += 40) {
        const checker = ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0);
        const colorIdx = Math.floor((x + y) / 80) % Object.keys(AGENT_COLORS).length;
        const colorKeys = Object.keys(AGENT_COLORS);
        const tileColor = AGENT_COLORS[colorKeys[colorIdx]];
        const alpha = checker ? 0.025 : 0.008;
        ctx.fillStyle = rgbString(tileColor, alpha);
        ctx.fillRect(x + 2, y + 2, 36, 36);
      }
    }

    // Wall panel
    const wallSprite = spritesRef.current.get("WALL_0");
    if (wallSprite?.complete) {
      for (let x = 28; x < WORLD.w - 28; x += 48) {
        ctx.drawImage(wallSprite, x, 24, 48, 32);
      }
    }

    // Ambient glow spots
    for (let i = 0; i < 5; i++) {
      const gx = 120 + i * 180 + Math.sin(t * 0.3 + i) * 40;
      const gy = 160 + Math.cos(t * 0.4 + i * 1.3) * 120;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 120);
      const hue = (t * 25 + i * 60) % 360;
      grad.addColorStop(0, `hsla(${hue}, 80%, 50%, 0.04)`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    }

    // Room border
    const borderHue = (t * 40) % 360;
    ctx.strokeStyle = `hsla(${borderHue}, 60%, 55%, 0.15)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 48, WORLD.w - 56, WORLD.h - 72);
    ctx.strokeStyle = `hsla(${(borderHue + 30) % 360}, 60%, 55%, 0.08)`;
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 48, WORLD.w - 56, WORLD.h - 72);

    // ── Environment ───────────────────────────────────
    drawEnvironment(ctx, spritesRef.current);

    // ── Draw all desks + agents ───────────────────────
    drawAllDesks(ctx, spritesRef.current, t);

    // ── Draw agents by position ───────────────────────
    const currAgents = agentsRef.current;
    const currHovered = hoveredRef.current;

    // Filter to only agents with desk positions (no duplicates)
    const placedAgents = currAgents.filter((a) => DESK_LAYOUT[a.id]);

    const sorted = [...placedAgents].sort((a, b) => {
      const pa = positionsRef.current[a.id] || DESK_LAYOUT[a.id]?.point || { x: 480, y: 280 };
      const pb = positionsRef.current[b.id] || DESK_LAYOUT[b.id]?.point || { x: 480, y: 280 };
      return pa.y - pb.y;
    });

    // Spawn thinking particles
    for (const agent of sorted) {
      if (agent.status === "thinking") {
        const pos = positionsRef.current[agent.id] || DESK_LAYOUT[agent.id]?.point || { x: 480, y: 280 };
        const info = DESK_LAYOUT[agent.id];
        spawnParticles(agent.id, pos.x, pos.y, info?.color || "#fbbf24");
      }
    }

    // ── Ambient particles ─────────────────────────────
    for (const ap of ambientParticlesRef.current) {
      ap.life += dt;
      if (ap.life >= ap.maxLife) {
        ap.life = 0;
        ap.x = 40 + Math.random() * (WORLD.w - 80);
        ap.y = 60 + Math.random() * (WORLD.h - 100);
      }
      ap.x += ap.vx * dt;
      ap.y += ap.vy * dt;
      if (ap.x < 40 || ap.x > WORLD.w - 40) ap.vx *= -1;
      if (ap.y < 60 || ap.y > WORLD.h - 60) ap.vy *= -1;
      const alpha = Math.sin(ap.life / ap.maxLife * Math.PI) * 0.25;
      ctx.fillStyle = rgbString(ap.color, alpha);
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, ap.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Thinking particles ────────────────────────────
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particlesRef.current.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = 1 - p.life / p.maxLife;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      glow.addColorStop(0, rgbString(p.color, alpha));
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Draw each agent ───────────────────────────────
    for (const agent of sorted) {
      const pos = positionsRef.current[agent.id] || DESK_LAYOUT[agent.id]?.point || { x: 480, y: 280 };
      const isHovered = currHovered === agent.id;
      const charImg = spritesRef.current.get(`char_${agent.spriteIndex}`);
      const info = DESK_LAYOUT[agent.id];
      const color = agent.color || info?.color || "#818cf8";

      // Bounce animations
      const idleBounce = agent.status === "idle" ? Math.sin(t * 2.5 + pos.x * 0.02) * 1.0 : 0;
      const thinkBounce = agent.status === "thinking" ? Math.sin(t * 4 + pos.x * 0.03) * 2.2 : 0;
      const speakBounce = agent.status === "speaking" ? Math.sin(t * 6) * 1.8 : 0;
      const bounce = idleBounce + thinkBounce + speakBounce;

      // ── Hover highlight ──
      if (isHovered) {
        const hoverGrad = ctx.createRadialGradient(pos.x, pos.y - 4, 6, pos.x, pos.y - 4, 38);
        hoverGrad.addColorStop(0, rgbString(color, 0.25));
        hoverGrad.addColorStop(1, "transparent");
        ctx.fillStyle = hoverGrad;
        ctx.beginPath();
        ctx.roundRect(pos.x - 24, pos.y - 32, 48, 56, 10);
        ctx.fill();
        ctx.strokeStyle = rgbString(color, 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ── Neon glow (speaking) ──
      if (agent.status === "speaking") {
        const glowAlpha = 0.12 + Math.sin(t * 3) * 0.06;
        const gradient = ctx.createRadialGradient(pos.x, pos.y - 6, 6, pos.x, pos.y - 6, 34);
        gradient.addColorStop(0, rgbString(color, glowAlpha));
        gradient.addColorStop(0.6, rgbString(color, glowAlpha * 0.5));
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 6, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgbString(color, 0.3 + Math.sin(t * 4) * 0.15);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 6, 28, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Thinking aura ──
      if (agent.status === "thinking") {
        const gradient = ctx.createRadialGradient(pos.x, pos.y - 4, 3, pos.x, pos.y - 4, 24);
        gradient.addColorStop(0, rgbString("#fbbf24", 0.15 + Math.sin(t * 5) * 0.05));
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 4, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Shadow ──
      const shadowGrad = ctx.createRadialGradient(pos.x + 2, pos.y + 12 + bounce * 0.4, 2, pos.x + 2, pos.y + 12 + bounce * 0.4, 14);
      shadowGrad.addColorStop(0, "rgba(0,0,0,0.3)");
      shadowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(pos.x + 2, pos.y + 12 + bounce * 0.4, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Character sprite ──
      const ax = pos.x;
      const ay = pos.y - 12 + bounce;

      if (charImg?.complete) {
        // Color-tinted underglow
        const underglow = ctx.createRadialGradient(pos.x + 12, pos.y + 8, 2, pos.x + 12, pos.y + 8, 28);
        underglow.addColorStop(0, rgbString(color, 0.12));
        underglow.addColorStop(1, "transparent");
        ctx.fillStyle = underglow;
        ctx.fillRect(pos.x - 10, pos.y - 8, 44, 40);

        ctx.drawImage(charImg, ax, ay, 24, 48);

        // Color tint overlay
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = color;
        ctx.fillRect(ax, ay, 24, 48);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(ax, ay, 20, 28);
      }

      // ── Status dot ──
      const dotColor = agent.status === "speaking" ? color : agent.status === "thinking" ? "#fbbf24" : "#6b7280";
      const dotX = pos.x + 4;
      const dotY = pos.y - 16 + bounce;

      if (agent.status !== "idle") {
        const pulseSize = 3.5 + Math.sin(t * (agent.status === "speaking" ? 6 : 4)) * 1;
        ctx.strokeStyle = rgbString(dotColor, 0.3 + Math.sin(t * 5) * 0.15);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(dotX, dotY, pulseSize, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(dotX - 0.5, dotY - 0.8, 1, 0, Math.PI * 2);
      ctx.fill();

      // ── Name label ──
      ctx.font = "600 8px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      const di = DESK_LAYOUT[agent.id];
      const nx = pos.x + 12;
      const ny = pos.y - 20;
      ctx.fillStyle = rgbString(color, 0.35);
      ctx.fillText(agent.name, nx + 0.5, ny + 0.5);
      ctx.fillStyle = rgbString(color, 0.85);
      ctx.fillText(agent.name, nx, ny);
    }

    // ── Speech bubbles ────────────────────────────────
    for (let b = bubblesRef.current.length - 1; b >= 0; b--) {
      const bubble = bubblesRef.current[b];
      const pos = positionsRef.current[bubble.agentId] || DESK_LAYOUT[bubble.agentId]?.point || { x: 480, y: 280 };
      bubble.timer += dt;

      if (bubble.timer < 0.3) {
        bubble.opacity = Math.min(1, bubble.timer / 0.3);
      } else if (bubble.timer > 4.5) {
        bubble.opacity = Math.max(0, bubble.opacity - dt * 1.5);
      } else {
        bubble.opacity = 1;
      }

      ctx.globalAlpha = Math.min(1, bubble.opacity);
      drawBubble(ctx, pos.x, pos.y - 42, bubble.text, bubble.color);
      ctx.globalAlpha = 1;

      if (bubble.opacity <= 0 && bubble.timer > 5) bubblesRef.current.splice(b, 1);
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(draw);
  }, [size, spawnParticles]);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // ── Mouse ────────────────────────────────────────────
  const handleMouse = useCallback((e: React.MouseEvent, click: boolean) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const scRatio = Math.min(size.w / WORLD.w, size.h / WORLD.h);
    const offX = (size.w - WORLD.w * scRatio) / 2;
    const offY = (size.h - WORLD.h * scRatio) / 2;
    const cx = (e.clientX - rect.left - offX) / scRatio;
    const cy = (e.clientY - rect.top - offY) / scRatio;

    let found: string | null = null;
    for (const a of agents) {
      const pos = positionsRef.current[a.id] || DESK_LAYOUT[a.id]?.point || { x: 480, y: 280 };
      if (cx > pos.x - 18 && cx < pos.x + 32 && cy > pos.y - 30 && cy < pos.y + 18) {
        found = a.id;
        break;
      }
    }
    setHoveredAgent(found);
    if (click) {
      const sel = found ? agents.find((a) => a.id === found) || null : null;
      setSelectedAgent(sel);
      if (sel && onAgentClick) onAgentClick(sel.id);
    }
  }, [agents, onAgentClick, size]);

  const selectedColor = selectedAgent
    ? (selectedAgent.color || DESK_LAYOUT[selectedAgent.id]?.color || "#818cf8")
    : "#818cf8";

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
        onMouseMove={(e) => handleMouse(e, false)}
        onClick={(e) => handleMouse(e, true)}
      />

      {selectedAgent && (
        <div
          className="absolute bottom-4 left-4 rounded-2xl p-5 w-72 text-white z-10 shadow-2xl animate-fade-up"
          style={{
            background: `linear-gradient(135deg, ${rgbString(selectedColor, 0.15)}, ${rgbString(selectedColor, 0.05)})`,
            border: `1px solid ${rgbString(selectedColor, 0.25)}`,
            backdropFilter: "blur(24px)",
          }}
        >
          <button onClick={() => setSelectedAgent(null)} className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-all text-sm">&times;</button>
          <div className="flex items-center gap-3.5 mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${rgbString(selectedColor, 0.3)}, ${rgbString(selectedColor, 0.1)})`, border: `2px solid ${rgbString(selectedColor, 0.4)}`, boxShadow: `0 0 20px ${rgbString(selectedColor, 0.2)}` }}>
              <img src={`/pixel-agents/characters/char_${selectedAgent.spriteIndex}.png`} alt="" className="w-8 h-8" style={{ imageRendering: "pixelated" }} />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate" style={{ color: rgbString(selectedColor, 1) }}>{selectedAgent.name}</div>
              {selectedAgent.role && <div className="text-[11px] text-white/40 truncate leading-tight mt-0.5">{selectedAgent.role}</div>}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] py-1.5 px-2.5 rounded-lg" style={{ background: rgbString(selectedColor, 0.08) }}>
              <span className="text-white/40">Status</span>
              <span className="capitalize font-medium" style={{ color: statusColor(selectedAgent.status) }}>
                {selectedAgent.status === "speaking" && "● "}{selectedAgent.status === "thinking" && "◉ "}{selectedAgent.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] py-1.5 px-2.5 rounded-lg" style={{ background: rgbString(selectedColor, 0.06) }}>
              <span className="text-white/40">Turns</span>
              <span className="font-mono tabular-nums">
                <span style={{ color: turnColor(selectedAgent.turnsUsed, selectedAgent.maxTurns) }}>{selectedAgent.turnsUsed}</span>
                <span className="text-white/20">/{selectedAgent.maxTurns}</span>
              </span>
            </div>
          </div>
          {selectedAgent.lastMessage && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: rgbString(selectedColor, 0.1) }}>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Last message</p>
              <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">{selectedAgent.lastMessage.slice(0, 180)}</p>
            </div>
          )}
        </div>
      )}

      {hoveredAgent && !selectedAgent && (
        <HoverTooltip agent={agents.find((a) => a.id === hoveredAgent)} agentId={hoveredAgent} />
      )}

      <div className="absolute top-4 right-4 flex gap-3 pointer-events-none z-10">
        <div className="flex items-center gap-1.5 text-[10px] text-white/30"><span className="w-2 h-2 rounded-full" style={{ background: "#6b7280" }} />Idle</div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/30"><span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: "#fbbf24", boxShadow: "0 0 6px #fbbf24" }} />Thinking</div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/30"><span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: "#a78bfa", boxShadow: "0 0 6px #a78bfa" }} />Speaking</div>
      </div>
    </div>
  );
}

// ─── Status helpers ─────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) { case "speaking": return "#c084fc"; case "thinking": return "#fbbf24"; default: return "#6b7280"; }
}

function turnColor(used: number, max: number): string {
  if (used >= max) return "#f87171";
  if (used >= max * 0.7) return "#fbbf24";
  return "#a78bfa";
}

// ─── Environment ────────────────────────────────────────────

function drawEnvironment(ctx: CanvasRenderingContext2D, sprites: Map<string, HTMLImageElement>) {
  const bookshelf = sprites.get("DOUBLE_BOOKSHELF");
  if (bookshelf?.complete) ctx.drawImage(bookshelf, 140, 56, 72, 72);

  const clock = sprites.get("CLOCK");
  if (clock?.complete) ctx.drawImage(clock, 460, 56, 24, 24);

  const whiteboard = sprites.get("WHITEBOARD");
  if (whiteboard?.complete) ctx.drawImage(whiteboard, 396, 52, 168, 64);

  const painting1 = sprites.get("SMALL_PAINTING");
  if (painting1?.complete) ctx.drawImage(painting1, 888, 184, 32, 32);

  const painting2 = sprites.get("SMALL_PAINTING_2");
  if (painting2?.complete) ctx.drawImage(painting2, 888, 300, 32, 32);

  const largePlant = sprites.get("LARGE_PLANT");
  if (largePlant?.complete) ctx.drawImage(largePlant, 36, 420, 44, 64);

  const hangingPlant = sprites.get("HANGING_PLANT");
  if (hangingPlant?.complete) ctx.drawImage(hangingPlant, 880, 52, 32, 32);

  const plant2 = sprites.get("PLANT_2");
  if (plant2?.complete) { ctx.drawImage(plant2, 28, 72, 28, 36); ctx.drawImage(plant2, 904, 72, 28, 36); }

  const cactus = sprites.get("CACTUS");
  if (cactus?.complete) ctx.drawImage(cactus, 34, 385, 16, 24);

  // Coffee area
  const coffeeTable = sprites.get("COFFEE_TABLE");
  if (coffeeTable?.complete) ctx.drawImage(coffeeTable, 756, 446, 48, 36);
  const coffee = sprites.get("COFFEE");
  if (coffee?.complete) ctx.drawImage(coffee, 768, 442, 12, 12);
  const bench = sprites.get("CUSHIONED_BENCH");
  if (bench?.complete) ctx.drawImage(bench, 812, 446, 48, 24);
  const pot = sprites.get("POT");
  if (pot?.complete) ctx.drawImage(pot, 782, 438, 16, 16);

  const pc = sprites.get("PC_FRONT_ON_1");
  if (pc?.complete) ctx.drawImage(pc, 430, 460, 24, 16);
}

// ─── Desk drawing ───────────────────────────────────────────

function drawAllDesks(
  ctx: CanvasRenderingContext2D,
  sprites: Map<string, HTMLImageElement>,
  t: number,
) {
  const deskF = sprites.get("DESK_FRONT");
  const deskS = sprites.get("DESK_SIDE");
  const chairF = sprites.get("CUSHIONED_CHAIR_FRONT");
  const chairS = sprites.get("CUSHIONED_CHAIR_SIDE");

  for (const [agentId, info] of Object.entries(DESK_LAYOUT)) {
    drawDeskSlot(ctx, info, deskF, deskS, chairF, chairS, t);
  }
}

function drawDeskSlot(
  ctx: CanvasRenderingContext2D,
  info: DeskInfo,
  deskF: HTMLImageElement | undefined,
  deskS: HTMLImageElement | undefined,
  chairF: HTMLImageElement | undefined,
  chairS: HTMLImageElement | undefined,
  t: number,
) {
  const { point: p, color, label } = info;
  const pulse = Math.sin(t * 1.5 + p.x * 0.01 + p.y * 0.01) * 0.03;

  // Determine which side this desk is on
  const isLeft = p.x < 200;
  const isRight = p.x > 750;
  const isTop = p.y < 150;
  // bottom otherwise

  if (isLeft) {
    // LEFT wall desks — desk to the right of agent position
    const glow = ctx.createRadialGradient(p.x + 44, p.y, 8, p.x + 44, p.y, 36);
    glow.addColorStop(0, rgbString(color, 0.1 + pulse));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.roundRect(p.x + 22, p.y - 22, 60, 40, 6);
    ctx.fill();

    if (deskS?.complete) {
      ctx.drawImage(deskS, p.x + 28, p.y - 14, 52, 28);
    } else {
      ctx.fillStyle = "#1e1e32";
      ctx.fillRect(p.x + 28, p.y - 14, 52, 28);
      ctx.strokeStyle = rgbString(color, 0.2);
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + 28, p.y - 14, 52, 28);
    }

    if (chairS?.complete) {
      ctx.drawImage(chairS, p.x + 12, p.y - 4, 22, 22);
    }

    ctx.fillStyle = rgbString(color, 0.1);
    ctx.beginPath();
    ctx.roundRect(p.x + 30, p.y + 16, 48, 14, 3);
    ctx.fill();
    ctx.strokeStyle = rgbString(color, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgbString(color, 0.85);
    ctx.font = "600 7px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x + 54, p.y + 26);
  } else if (isRight) {
    // RIGHT wall desks — desk to the left of agent
    const glow = ctx.createRadialGradient(p.x - 44, p.y, 8, p.x - 44, p.y, 36);
    glow.addColorStop(0, rgbString(color, 0.1 + pulse));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.roundRect(p.x - 22, p.y - 22, 60, 40, 6);
    ctx.fill();

    if (deskS?.complete) {
      ctx.save();
      ctx.translate(p.x - 28, p.y - 14);
      ctx.scale(-1, 1);
      ctx.drawImage(deskS, -52, 0, 52, 28);
      ctx.restore();
    } else {
      ctx.fillStyle = "#1e1e32";
      ctx.fillRect(p.x - 28, p.y - 14, 52, 28);
      ctx.strokeStyle = rgbString(color, 0.2);
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 28, p.y - 14, 52, 28);
    }

    if (chairS?.complete) {
      ctx.save();
      ctx.translate(p.x + 12, p.y - 4);
      ctx.scale(-1, 1);
      ctx.drawImage(chairS, -22, 0, 22, 22);
      ctx.restore();
    }

    ctx.fillStyle = rgbString(color, 0.1);
    ctx.beginPath();
    ctx.roundRect(p.x - 30, p.y + 16, 48, 14, 3);
    ctx.fill();
    ctx.strokeStyle = rgbString(color, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgbString(color, 0.85);
    ctx.font = "600 7px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x - 6, p.y + 26);
  } else if (isTop) {
    // TOP wall desks
    const glow = ctx.createRadialGradient(p.x, p.y + 34, 6, p.x, p.y + 34, 30);
    glow.addColorStop(0, rgbString(color, 0.08 + pulse));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.roundRect(p.x - 26, p.y + 24, 52, 32, 6);
    ctx.fill();

    ctx.fillStyle = "#1e1e30";
    ctx.fillRect(p.x - 22, p.y + 30, 44, 18);
    ctx.strokeStyle = rgbString(color, 0.2);
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - 22, p.y + 30, 44, 18);

    if (chairF?.complete) {
      ctx.drawImage(chairF, p.x - 6, p.y + 12, 20, 20);
    }

    ctx.fillStyle = rgbString(color, 0.1);
    ctx.beginPath();
    ctx.roundRect(p.x - 24, p.y + 48, 48, 14, 3);
    ctx.fill();
    ctx.strokeStyle = rgbString(color, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgbString(color, 0.85);
    ctx.font = "600 7px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x, p.y + 58);
  } else {
    // BOTTOM wall desks
    const glow = ctx.createRadialGradient(p.x, p.y - 18, 6, p.x, p.y - 18, 30);
    glow.addColorStop(0, rgbString(color, 0.1 + pulse));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.roundRect(p.x - 28, p.y - 32, 56, 36, 6);
    ctx.fill();

    if (deskF?.complete) {
      ctx.drawImage(deskF, p.x - 28, p.y - 32, 56, 32);
    } else {
      ctx.fillStyle = "#1e1e30";
      ctx.fillRect(p.x - 24, p.y - 20, 48, 22);
      ctx.strokeStyle = rgbString(color, 0.2);
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 24, p.y - 20, 48, 22);
    }

    ctx.fillStyle = rgbString(color, 0.1);
    ctx.beginPath();
    ctx.roundRect(p.x - 18, p.y - 38, 36, 14, 3);
    ctx.fill();
    ctx.strokeStyle = rgbString(color, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgbString(color, 0.85);
    ctx.font = "600 7px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x, p.y - 28);
  }
}

// ─── Speech bubble ─────────────────────────────────────────

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = "7.5px 'Inter', system-ui, sans-serif";
  const maxW = 170;
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tst = cur ? cur + " " + w : w;
    if (ctx.measureText(tst).width > maxW && cur) { lines.push(cur); cur = w; }
    else { cur = tst; }
  }
  if (cur) lines.push(cur);

  const lh = 11;
  const bw = maxW + 16;
  const bh = lines.length * lh + 14;
  const bx = x - bw / 2;
  const by = y - bh;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.roundRect(bx + 2, by + 2, bw, bh, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(15,15,30,0.92)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();

  ctx.strokeStyle = rgbString(color, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(15,15,30,0.92)";
  ctx.beginPath();
  ctx.moveTo(x - 5, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 5, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgbString(color, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, by + 7 + i * lh);
  }
}
