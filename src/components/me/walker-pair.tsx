"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * The stick figure and the dog as two draggable characters joined by a
 * stretchy leash. Pick either one up and move it; lift them high and they look
 * scared; let go in the air and they fall (keeping the throw's speed), land,
 * get up and walk back to their place on the path.
 *
 * Coordinates are in px inside the walker box (top-left origin). The drawings
 * share one 170 × 120 viewBox so their parts line up with the leash.
 */

const VB_W = 170;
const VB_H = 120;
const GRAVITY = 2400; // px/s²
const RETURN_SPEED = 180; // px/s
const SCARED_AT = 34; // px above the path

type Face = "happy" | "scared" | "dizzy";
type Mode = "home" | "drag" | "air" | "down" | "return";

interface Body {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  rot: number;
  mode: Mode;
  /** Highest point reached in the current fall (px above the path). */
  peak: number;
  until: number;
}

const rest = (): Body => ({ dx: 0, dy: 0, vx: 0, vy: 0, rot: 0, mode: "home", peak: 0, until: 0 });

function rotateAround(px: number, py: number, cx: number, cy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const x = px - cx;
  const y = py - cy;
  return [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)];
}

export function WalkerPair({
  width,
  ink,
  walking,
  celebrate,
  minDx,
  maxDx,
  maxUp,
}: {
  width: number;
  ink: string;
  /** The pair is walking along the path (legs swing). */
  walking: boolean;
  /** Day done: wave and hop, but only when both are back in place. */
  celebrate: boolean;
  /** How far left / right they may be dragged from their place, in px. */
  minDx: number;
  maxDx: number;
  /** How high they may be lifted, in px. */
  maxUp: number;
}) {
  const s = width / VB_W;
  const height = VB_H * s;
  // The loop and pointer handlers work on the ref; each frame copies it into state for drawing.
  const bodies = useRef<{ person: Body; dog: Body }>({ person: rest(), dog: rest() });
  const [shown, setShown] = useState<{ person: Body; dog: Body }>(() => ({ person: rest(), dog: rest() }));
  const redraw = () => setShown({ person: { ...bodies.current.person }, dog: { ...bodies.current.dog } });
  const drag = useRef<{ who: "person" | "dog"; startX: number; startY: number; dx0: number; dy0: number; samples: { t: number; x: number; y: number }[] } | null>(null);
  const raf = useRef(0);
  const limits = useRef({ minDx, maxDx, maxUp });
  useEffect(() => {
    limits.current = { minDx, maxDx, maxUp };
  }, [minDx, maxDx, maxUp]);

  // One animation loop drives falling, lying down and walking back.
  const loop = () => {
    cancelAnimationFrame(raf.current);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      let active = false;
      for (const who of ["person", "dog"] as const) {
        const b = bodies.current[who];
        const { minDx: lo, maxDx: hi } = limits.current;
        if (b.mode === "air") {
          active = true;
          b.vy += GRAVITY * dt;
          b.vx *= 0.995;
          b.dx += b.vx * dt;
          b.dy += b.vy * dt;
          b.peak = Math.max(b.peak, -b.dy);
          if (b.dx < lo || b.dx > hi) {
            b.dx = Math.min(hi, Math.max(lo, b.dx));
            b.vx = -b.vx * 0.4;
          }
          if (who === "person") b.rot = Math.max(-35, Math.min(35, b.vx * 0.03 + b.vy * 0.01));
          if (b.dy >= 0) {
            // Landed. A big fall knocks the walker over for a moment.
            b.dy = 0;
            b.vx = 0;
            b.vy = 0;
            const hard = b.peak > 60;
            b.mode = hard ? "down" : "return";
            b.rot = hard && who === "person" ? (b.rot >= 0 ? 85 : -85) : 0;
            b.until = now + (hard ? 1000 : 0);
          }
        } else if (b.mode === "down") {
          active = true;
          if (now >= b.until) {
            // Get up: ease back upright, then walk home.
            b.rot *= 0.8;
            if (Math.abs(b.rot) < 2) {
              b.rot = 0;
              b.mode = "return";
            }
          }
        } else if (b.mode === "return") {
          active = true;
          const stepPx = RETURN_SPEED * dt;
          if (Math.abs(b.dx) <= stepPx) {
            Object.assign(b, rest());
          } else b.dx -= Math.sign(b.dx) * stepPx;
        }
      }
      redraw();
      if (active) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const who = e.currentTarget.dataset.who as "person" | "dog";
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const b = bodies.current[who];
    b.mode = "drag";
    b.vx = b.vy = 0;
    b.rot = 0;
    drag.current = { who, startX: e.clientX, startY: e.clientY, dx0: b.dx, dy0: b.dy, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] };
    redraw();
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const b = bodies.current[d.who];
    const { minDx: lo, maxDx: hi, maxUp } = limits.current;
    b.dx = Math.min(hi, Math.max(lo, d.dx0 + e.clientX - d.startX));
    b.dy = Math.min(0, Math.max(-maxUp, d.dy0 + e.clientY - d.startY));
    const now = performance.now();
    d.samples = [...d.samples.filter((p) => now - p.t < 90), { t: now, x: e.clientX, y: e.clientY }];
    // Dangle a little in the direction of the drag.
    const first = d.samples[0];
    const swing = d.samples.length > 1 ? (e.clientX - first.x) / Math.max(16, now - first.t) : 0;
    if (d.who === "person") b.rot = Math.max(-18, Math.min(18, swing * 12));
    redraw();
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const b = bodies.current[d.who];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      Object.assign(b, rest());
      redraw();
      return;
    }
    const first = d.samples[0];
    const dt = Math.max(16, performance.now() - first.t) / 1000;
    b.vx = Math.max(-1800, Math.min(1800, (e.clientX - first.x) / dt));
    b.vy = Math.max(-1800, Math.min(1800, (e.clientY - first.y) / dt));
    b.peak = -b.dy;
    b.mode = b.dy < -2 ? "air" : "return";
    b.rot = 0;
    loop();
  };

  const p = shown.person;
  const dg = shown.dog;
  const personFace: Face = p.mode === "down" ? "dizzy" : (p.mode === "drag" && -p.dy > SCARED_AT) || (p.mode === "air" && p.peak > SCARED_AT) ? "scared" : "happy";
  const dogFace: Face = (dg.mode === "drag" && -dg.dy > SCARED_AT) || (dg.mode === "air" && dg.peak > SCARED_AT) ? "scared" : "happy";
  const atHome = p.mode === "home" && dg.mode === "home";

  // Leash: from the person's hand to the dog's collar, sagging when slack and pulling straight when stretched.
  const pivotP: [number, number] = [42 * s, 102 * s];
  const [hx, hy] = rotateAround(64 * s + p.dx, 61 * s + p.dy, pivotP[0] + p.dx, pivotP[1] + p.dy, p.rot);
  const cx = 137 * s + dg.dx;
  const cy = 78 * s + dg.dy;
  const dist = Math.hypot(cx - hx, cy - hy);
  const sag = Math.max(1.5, (95 * s - dist) * 0.35 + 6 * s);
  const leash = `M${hx} ${hy} Q ${(hx + cx) / 2} ${(hy + cy) / 2 + sag} ${cx} ${cy}`;

  const layer = (b: Body, origin: [number, number]) => ({
    transform: `translate(${b.dx}px, ${b.dy}px) rotate(${b.rot}deg)`,
    transformOrigin: `${origin[0]}px ${origin[1]}px`,
  });

  return (
    <div className="relative" style={{ width, height }}>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
        <path d={leash} stroke={ink} strokeWidth={Math.max(1.5, 2 * s)} fill="none" strokeLinecap="round" />
      </svg>

      <div className="absolute inset-0" style={layer(dg, [124 * s, 104 * s])}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} data-face={dogFace} className={cn("walker walker-dog-layer h-auto w-full overflow-visible", celebrate && atHome && "walker--celebrate")} aria-hidden>
          <Dog ink={ink} face={dogFace} />
        </svg>
        <div
          className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
          style={{ left: 98 * s, top: 50 * s, width: 68 * s, height: 60 * s }}
          data-who="dog"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          title="Drag the dog"
        />
      </div>

      <div className="absolute inset-0" style={layer(p, pivotP)}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          data-face={personFace}
          className={cn("walker walker-person-layer h-auto w-full overflow-visible", (walking || p.mode === "return") && "walker--walking", celebrate && atHome && "walker--celebrate")}
          aria-hidden
        >
          <Person ink={ink} face={personFace} />
        </svg>
        <div
          className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
          style={{ left: 16 * s, top: 0, width: 54 * s, height: 106 * s }}
          data-who="person"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          title="Drag the walker"
        />
      </div>
    </div>
  );
}

function stroke(ink: string, width = 3) {
  return { stroke: ink, strokeWidth: width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
}

/** The stick figure. Face: happy smile, scared (wide eyes, raised brows, "O" mouth, sweat drop) or dizzy (X eyes). */
function Person({ ink, face }: { ink: string; face: Face }) {
  const s = stroke(ink);
  return (
    <g className="walker-person">
      <circle cx="40" cy="20" r="15" {...s} fill="#ffffff" />
      {face === "happy" && (
        <>
          <circle cx="35" cy="16" r="1.6" fill={ink} />
          <circle cx="45" cy="16" r="1.6" fill={ink} />
          <path d="M33 23 C 37 28, 44 28, 48 22" {...s} strokeWidth={2.4} />
        </>
      )}
      {face === "scared" && (
        <>
          <circle cx="35" cy="16" r="3" {...s} strokeWidth={1.6} fill="#ffffff" />
          <circle cx="45" cy="16" r="3" {...s} strokeWidth={1.6} fill="#ffffff" />
          <circle cx="35" cy="16.5" r="1.2" fill={ink} />
          <circle cx="45" cy="16.5" r="1.2" fill={ink} />
          <path d="M31 10 L 37 8.5 M43 8.5 L 49 10" {...s} strokeWidth={1.6} />
          <ellipse cx="40" cy="26" rx="3" ry="3.6" {...s} strokeWidth={2} fill={ink} />
          <path d="M55 9 C 52 13, 53 16, 55.5 16 C 58 16, 58.5 13, 55 9 Z" fill="#7cc4f2" stroke={ink} strokeWidth="1" />
        </>
      )}
      {face === "dizzy" && (
        <>
          <path d="M32.5 13.5 L 37.5 18.5 M37.5 13.5 L 32.5 18.5 M42.5 13.5 L 47.5 18.5 M47.5 13.5 L 42.5 18.5" {...s} strokeWidth={1.8} />
          <path d="M33 26 C 35 24, 37 28, 40 26 S 45 24, 47 26" {...s} strokeWidth={2} />
        </>
      )}
      <path d="M40 35 L 42 72" {...s} />
      <g className="walker-arm walker-arm--back">
        <path d="M41 44 L 28 62" {...s} />
        <circle cx="27" cy="64" r="3.5" {...s} fill="#ffffff" />
      </g>
      <g className="walker-arm walker-arm--leash">
        <path d="M41 44 L 62 60" {...s} />
        <circle cx="64" cy="61" r="3.5" {...s} fill="#ffffff" />
      </g>
      <g className="walker-leg walker-leg--a">
        <path d="M42 72 L 30 100 L 22 102" {...s} />
      </g>
      <g className="walker-leg walker-leg--b">
        <path d="M42 72 L 52 100 L 60 100" {...s} />
      </g>
    </g>
  );
}

/** The dog. Face: happy, or scared (wide eye, open mouth) when lifted or falling. */
function Dog({ ink, face }: { ink: string; face: Face }) {
  const s = stroke(ink);
  return (
    <g className="walker-dog">
      <g className="walker-tail">
        <path d="M108 80 C 102 72, 100 66, 104 60" {...s} />
      </g>
      <path d="M108 80 C 108 72, 126 70, 136 74 C 142 78, 142 90, 134 92 C 124 94, 112 94, 108 88 Z" {...s} fill="#ffffff" />
      <path d="M114 92 L 110 106 M122 93 L 124 106 M132 92 L 136 106" {...s} />
      <g className="walker-dog-head">
        <path d="M132 74 C 130 62, 138 56, 148 58 C 156 60, 162 66, 160 72 C 158 78, 150 80, 142 80 C 136 80, 133 78, 132 74 Z" {...s} fill="#ffffff" />
        <path d="M140 60 C 134 60, 130 66, 132 74 C 136 72, 140 68, 141 62" {...s} strokeWidth={2.4} fill="#ffffff" />
        {face === "scared" ? (
          <>
            <circle cx="150" cy="65" r="3.2" {...s} strokeWidth={1.5} fill="#ffffff" />
            <circle cx="150" cy="65.5" r="1.3" fill={ink} />
            <path d="M146 59 L 153 58" {...s} strokeWidth={1.5} />
            <ellipse cx="154" cy="76" rx="2.4" ry="2.8" fill={ink} />
          </>
        ) : (
          <>
            <circle cx="150" cy="65" r="1.8" fill={ink} />
            <path d="M150 74 C 153 77, 157 76, 158 73" {...s} strokeWidth={2} />
          </>
        )}
        <ellipse cx="160" cy="69" rx="2.6" ry="2" fill={ink} />
        <path d="M133 76 C 136 79, 140 80, 144 79" {...s} strokeWidth={4} stroke="#d3302f" />
      </g>
    </g>
  );
}
