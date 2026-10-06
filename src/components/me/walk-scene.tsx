"use client";

import { Check, Pause, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProgressItem } from "@/lib/pace/day-progress";
import { cn } from "@/lib/utils";
import { WalkerPair } from "./walker-pair";

// ── Sky: smooth colour over the day ────────────────────────────────────────

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** Sky colours (top, middle, horizon) through a day. Interpolated continuously between these hours. */
const SKY_KEYS: { h: number; c: [string, string, string] }[] = [
  { h: 0, c: ["#0b1030", "#1a2250", "#2b3670"] },
  { h: 4.5, c: ["#141c46", "#2e3570", "#5a4b88"] },
  { h: 5.75, c: ["#3d4a8c", "#b07fb0", "#f6b1b6"] },
  { h: 7, c: ["#ffd86b", "#ffe9a8", "#ffc4d3"] }, // morning: yellow to pink
  { h: 9.5, c: ["#8fcbff", "#cfe9ff", "#fff3d1"] },
  { h: 12.5, c: ["#3d9ef0", "#86c6fb", "#d8efff"] }, // day: clear blue
  { h: 16, c: ["#5aa8ec", "#a9d3f5", "#ffe0b5"] },
  { h: 17.75, c: ["#6b3fc6", "#cc5aa6", "#ffad66"] }, // evening: purple, pink, orange
  { h: 19.25, c: ["#2c2878", "#6a3d93", "#c45f86"] },
  { h: 20.75, c: ["#101542", "#202b60", "#3a3f7c"] },
  { h: 24, c: ["#0b1030", "#1a2250", "#2b3670"] },
];

function skyAt(hour: number): [RGB, RGB, RGB] {
  const h = ((hour % 24) + 24) % 24;
  const i = SKY_KEYS.findIndex((k, j) => h >= k.h && h < SKY_KEYS[j + 1]?.h);
  const a = SKY_KEYS[Math.max(0, i)];
  const b = SKY_KEYS[Math.max(0, i) + 1] ?? a;
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  // Ease so the colour changes feel natural rather than linear.
  const e = t * t * (3 - 2 * t);
  return [0, 1, 2].map((k) => mix(hex(a.c[k]), hex(b.c[k]), e)) as [RGB, RGB, RGB];
}

/** 0 in daylight, 1 in deep night, with gentle ramps at dawn and dusk. */
function nightAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  if (h < 12) return 1 - ramp(h, 4.5, 6.75);
  return ramp(h, 18.25, 20.75);
}

export type DayPhase = "morning" | "afternoon" | "evening" | "night";
export function phaseAt(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "afternoon";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}
const PHASE_LABEL: Record<DayPhase, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };

/** Local hour, refreshed every 30 s. Null until mounted so server and client match. */
function useClockHour(): number | null {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setHour(d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return hour;
}

// ── Park ───────────────────────────────────────────────────────────────────

const VB_W = 1200;
const VB_H = 300;
const PATH_FAR = 236; // far edge of the footpath (boards stand here)
const PATH_NEAR = 266; // near edge (the walker walks here)

/** The park: skyline, bushes, trees, lamps, benches, lawn and footpath. Tinted by time of day. */
function Park({ night, hour }: { night: number; hour: number }) {
  const evening = Math.max(0, 1 - Math.abs(hour - 18) / 1.6);
  const skyline = css(mix(mix(hex("#b9dedd"), hex("#d7a9c9"), evening), hex("#2a3266"), night));
  const tint = (light: string, dark: string) => [css(mix(hex(light), hex("#22402a"), night * 0.75)), css(mix(hex(dark), hex("#173020"), night * 0.75))];
  const [leaf, leafDark] = tint("#8bd14f", "#5fae34");
  const [lawn, lawnDark] = tint("#9ad55a", "#7cc043");
  const path = css(mix(hex("#e3d2b6"), hex("#4a4a63"), night * 0.8));
  const trunk = css(mix(hex("#8a5a2f"), hex("#3a2a1f"), night * 0.7));
  const wood = css(mix(hex("#9b6a3c"), hex("#3e2d22"), night * 0.7));
  const lampOn = night > 0.35;

  const tree = (x: number, s = 1) => (
    <g key={`t${x}`} transform={`translate(${x} ${PATH_FAR - 4}) scale(${s})`}>
      <path d="M-7 0 L -5 -70 L 5 -70 L 7 0 Z" fill={trunk} />
      <path d="M-2 -55 L -22 -78 M 2 -60 L 20 -84" stroke={trunk} strokeWidth="5" strokeLinecap="round" />
      <circle cx="-26" cy="-92" r="30" fill={leafDark} />
      <circle cx="24" cy="-96" r="32" fill={leafDark} />
      <circle cx="0" cy="-118" r="36" fill={leaf} />
      <circle cx="-30" cy="-100" r="22" fill={leaf} />
      <circle cx="28" cy="-104" r="22" fill={leaf} />
      <circle cx="-8" cy="-128" r="12" fill="#ffffff" opacity={0.18 * (1 - night)} />
    </g>
  );
  const lamp = (x: number) => (
    <g key={`l${x}`} transform={`translate(${x} ${PATH_FAR})`}>
      {lampOn && <circle cx="0" cy="-92" r="26" fill="#ffe7a3" opacity={0.35 * night} />}
      <rect x="-2.5" y="-90" width="5" height="90" fill={css(mix(hex("#6b7280"), hex("#3b3f55"), night))} />
      <path d="M-8 -90 L 8 -90 L 5 -104 L -5 -104 Z" fill={lampOn ? "#fff1b8" : "#cfe7f5"} stroke="#5b6172" strokeWidth="1.5" />
      <circle cx="0" cy="-107" r="3" fill="#5b6172" />
    </g>
  );
  const bench = (x: number) => (
    <g key={`b${x}`} transform={`translate(${x} ${PATH_FAR - 2})`} fill={wood}>
      <rect x="-34" y="-30" width="68" height="6" rx="1.5" />
      <rect x="-34" y="-21" width="68" height="6" rx="1.5" />
      <rect x="-36" y="-12" width="72" height="5" rx="1.5" />
      <rect x="-30" y="-12" width="4" height="12" />
      <rect x="26" y="-12" width="4" height="12" />
    </g>
  );

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
      {/* City skyline, soft and far away. */}
      <g fill={skyline} opacity="0.75">
        <path d="M120 200 V 120 H 160 V 90 H 180 V 120 H 210 V 200 Z" />
        <path d="M230 200 V 60 L 245 20 L 260 60 V 200 Z" />
        <path d="M300 200 V 110 H 360 V 70 H 400 V 200 Z" />
        <path d="M430 200 V 130 H 470 V 100 H 500 V 200 Z" />
        <path d="M560 200 V 90 A 30 30 0 0 1 620 90 V 200 Z" />
        <g opacity="0.7" fill="none" stroke={skyline} strokeWidth="6">
          <path d="M640 170 C 700 70, 860 70, 920 170" />
          <path d="M630 170 H 930" strokeWidth="8" />
          {[680, 720, 760, 800, 840, 880].map((bx) => (
            <path key={bx} d={`M${bx} ${170 - Math.sin(((bx - 640) / 280) * Math.PI) * 74} V 170`} strokeWidth="3" />
          ))}
        </g>
        <path d="M940 200 V 105 H 990 V 80 H 1020 V 200 Z" />
        <path d="M1040 200 V 125 H 1090 V 200 Z" />
      </g>
      {/* Bushes along the back of the lawn. */}
      <g fill={leafDark}>
        {Array.from({ length: 16 }, (_, i) => (
          <ellipse key={i} cx={i * 80 + 20} cy={PATH_FAR - 30} rx="52" ry="26" />
        ))}
      </g>
      <rect x="0" y={PATH_FAR - 26} width={VB_W} height={VB_H} fill={lawn} />
      {tree(70, 1.05)}
      {tree(300, 0.85)}
      {bench(470)}
      {lamp(560)}
      {tree(1010, 0.95)}
      {lamp(880)}
      {bench(760)}
      {tree(1160, 1.1)}
      {/* Footpath with soft edges. */}
      <rect x="0" y={PATH_FAR} width={VB_W} height={PATH_NEAR - PATH_FAR} fill={path} />
      <rect x="0" y={PATH_FAR} width={VB_W} height="3" fill="#000" opacity="0.06" />
      <rect x="0" y={PATH_NEAR} width={VB_W} height={VB_H - PATH_NEAR} fill={lawnDark} />
      {/* Grass tufts. */}
      <g stroke={leafDark} strokeWidth="2.5" strokeLinecap="round">
        {[40, 190, 330, 520, 640, 810, 960, 1110].map((x) => (
          <path key={x} d={`M${x} ${PATH_NEAR + 20} l -4 -10 M${x + 5} ${PATH_NEAR + 20} l 0 -13 M${x + 10} ${PATH_NEAR + 20} l 4 -9`} />
        ))}
      </g>
      {/* Night falls over the park. */}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="#0b1030" opacity={night * 0.35} />
    </svg>
  );
}

// ── Scene ──────────────────────────────────────────────────────────────────

const WALKER_W = { sm: 104, lg: 140 };
const WALK_SPEED = 140; // px per second
const DAY_PREVIEW_MS = 12_000;

/**
 * The day as a walk through the park. Finished tasks come first (in the order
 * they were finished), then the rest by priority; each is a wooden board on the
 * path. The person and dog stand before the next unfinished board and walk on
 * when it's done; at 100% they reach the flag. The sky follows the clock.
 */
export function WalkScene({ items, isToday, onOpen, resetKey }: { items: ProgressItem[]; isToday: boolean; onOpen: (taskId: string) => void; resetKey: string }) {
  const clock = useClockHour();

  // "Play the day": run the sky through a whole day in a few seconds.
  const [preview, setPreview] = useState<number | null>(null);
  // Bumped when "Play the day" starts so the walk replays alongside the sky.
  const [walkRun, setWalkRun] = useState(0);
  useEffect(() => {
    if (preview === null) return;
    let raf = 0;
    const start = performance.now() - ((preview - 5) / 19) * DAY_PREVIEW_MS;
    const step = (t: number) => {
      const p = (t - start) / DAY_PREVIEW_MS;
      if (p >= 1) return setPreview(null);
      setPreview(5 + p * 19);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per play
  }, [preview === null]);

  const hour = preview ?? (isToday ? (clock ?? 9) : 18.4);
  const [top, mid, horizon] = skyAt(hour);
  const night = nightAt(hour);
  const ink = "#1b1b1b";

  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 224 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Map the park's footpath (in SVG units) to px, matching preserveAspectRatio="xMidYMax slice".
  const walkerW = box.w < 520 ? WALKER_W.sm : WALKER_W.lg;
  const scale = Math.max(Math.max(box.w, walkerW + 24 + items.length * 66 + 110) / VB_W, box.h / VB_H);
  const farY = (VB_H - PATH_FAR) * scale;
  const nearY = (VB_H - PATH_NEAR) * scale;

  const n = items.length;
  const pathStart = walkerW + 24;
  // Each board needs room; when they don't fit, the park scrolls sideways.
  const trackW = Math.max(box.w, pathStart + n * 66 + 110);
  const finishX = trackW - 46;
  const stopX = (i: number) => pathStart + ((i + 0.5) * (finishX - pathStart - 30)) / Math.max(n, 1);
  const firstOpen = items.findIndex((i) => !i.done);
  const allDone = n > 0 && firstOpen === -1;
  const targetX = allDone ? finishX - walkerW * 0.82 : firstOpen <= 0 ? 8 : Math.max(8, stopX(firstOpen) - walkerW - 4);

  const [x, setX] = useState(8);
  const [walking, setWalking] = useState(false);
  const [duration, setDuration] = useState(0);
  const xRef = useRef(8);
  const walkTimer = useRef<number | undefined>(undefined);

  // New day: start from the beginning of the path.
  useEffect(() => {
    clearTimeout(walkTimer.current);
    xRef.current = 8;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the walk for the newly selected day
    setDuration(0);
    setX(8);
    setWalking(false);
  }, [resetKey, walkRun]);

  // Walk to the target at a steady pace.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dx = Math.abs(targetX - xRef.current);
    clearTimeout(walkTimer.current);
    if (reduced || dx < 2) {
      xRef.current = targetX;
      setDuration(0);
      setX(targetX);
      setWalking(false);
      return;
    }
    const ms = Math.min(3200, Math.max(500, (dx / WALK_SPEED) * 1000));
    const raf = requestAnimationFrame(() => {
      xRef.current = targetX;
      setDuration(ms);
      setX(targetX);
      setWalking(true);
      walkTimer.current = window.setTimeout(() => setWalking(false), ms);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(walkTimer.current);
    };
  }, [targetX, resetKey, walkRun]);

  // Keep the walker in view when the park is wider than the screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.25), behavior: duration ? "smooth" : "auto" });
  }, [x, duration]);

  // Sun 6:00 → 19:00 and moon 19:00 → 6:00, each on a gentle arc behind the skyline.
  const arc = (t: number) => ({ left: 6 + t * 88, top: 70 - Math.sin(t * Math.PI) * 58 });
  const sunT = (hour - 6) / 13;
  const moonT = (((hour - 19) % 24) + 24) % 24 / 11;
  const sunWarm = Math.min(1, Math.abs(sunT - 0.5) * 2.2);
  const label = preview !== null ? `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}` : isToday ? PHASE_LABEL[phaseAt(hour)] : "Day's end";

  return (
    <div
      ref={wrapRef}
      className="walk-scene relative h-56 overflow-hidden rounded-xl border border-border"
      style={{ background: `linear-gradient(180deg, ${css(top)} 0%, ${css(mid)} 48%, ${css(horizon)} 78%)` }}
    >
      {/* Stars fade in at dusk. */}
      <div className="absolute inset-0" style={{ opacity: night }} aria-hidden>
        {[6, 14, 22, 31, 38, 47, 55, 63, 71, 79, 86, 93].map((l, i) => (
          <span key={l} className="walk-star absolute rounded-full bg-white" style={{ left: `${l}%`, top: `${5 + ((i * 23) % 38)}%`, width: i % 3 ? 2 : 3, height: i % 3 ? 2 : 3, animationDelay: `${(i % 5) * 0.5}s` }} />
        ))}
      </div>
      {/* Sun with a soft glow; it warms towards the horizon. */}
      {sunT > -0.05 && sunT < 1.05 && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${arc(sunT).left}%`, top: `${arc(sunT).top}%` }} aria-hidden>
          <div className="size-28 rounded-full" style={{ background: `radial-gradient(circle, rgb(255 236 170 / ${0.55 * (1 - night)}) 0%, transparent 65%)` }} />
          <div
            className="absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: css(mix(hex("#ffe066"), hex("#ff9a4d"), sunWarm)), boxShadow: `0 0 24px 6px ${css(mix(hex("#fff2a8"), hex("#ffc08a"), sunWarm))}` }}
          />
        </div>
      )}
      {/* Moon. */}
      {moonT >= 0 && moonT <= 1 && night > 0.05 && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${arc(moonT).left}%`, top: `${arc(moonT).top}%`, opacity: night }} aria-hidden>
          <div className="relative size-10 rounded-full bg-[#eceff4] shadow-[0_0_24px_6px_rgb(220_230_255_/_0.35)]">
            <span className="absolute left-2 top-2 size-2.5 rounded-full bg-[#cfd5df]" />
            <span className="absolute bottom-2.5 right-2 size-3 rounded-full bg-[#cfd5df]" />
            <span className="absolute bottom-2 left-3 size-1.5 rounded-full bg-[#cfd5df]" />
          </div>
        </div>
      )}
      {/* Clouds drift slowly; their colour follows the sky. */}
      {[
        { top: 10, w: 120, d: 70, delay: -10 },
        { top: 24, w: 90, d: 95, delay: -50 },
        { top: 6, w: 70, d: 120, delay: -80 },
      ].map((c, i) => (
        <div key={i} className="walk-cloud absolute left-0" style={{ top: `${c.top}%`, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s` }} aria-hidden>
          <svg width={c.w} height={c.w * 0.42} viewBox="0 0 120 50">
            <path
              d="M18 44 C 4 44, 2 28, 16 26 C 16 12, 36 8, 44 18 C 50 4, 76 4, 80 20 C 96 14, 112 26, 104 40 C 104 44, 100 46, 96 46 Z"
              fill={css(mix(mix(hex("#ffffff"), hex("#f8d6e6"), Math.max(0, 1 - Math.abs(hour - 18) / 1.5)), hex("#3a4378"), night))}
              opacity="0.92"
            />
          </svg>
        </div>
      ))}

      <div ref={scrollRef} className="absolute inset-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]" tabIndex={trackW > box.w + 4 ? 0 : -1} aria-label="Today's walk. Scroll sideways to see the finish.">
        <div className="relative h-full" style={{ width: trackW }}>
          <Park night={night} hour={hour} />

      {/* Task boards along the far edge of the path. */}
      <ol aria-label="Your tasks along today's walk">
        {items.map((it, i) => (
          <li key={it.task.id} className="absolute -translate-x-1/2" style={{ left: stopX(i), bottom: farY - 2 }}>
            <Board item={it} next={i === firstOpen} onOpen={onOpen} />
          </li>
        ))}
      </ol>

      {/* Finish flag. */}
      <div className="pointer-events-none absolute flex -translate-x-1/2 flex-col-reverse items-center" style={{ left: finishX, bottom: farY - 2 }} aria-hidden>
        <svg viewBox="0 0 30 50" className="h-12 w-auto">
          <path d="M6 48 L 6 4" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M6 5 C 14 2, 18 9, 27 6 L 27 18 C 18 21, 14 14, 6 17 Z" fill={allDone ? "#4ca152" : "#ffffff"} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <span className={cn("mb-0.5 whitespace-nowrap rounded px-1.5 text-[10px] font-semibold", allDone ? "bg-[var(--success-dot)] text-white" : "bg-white/75 text-muted")}>
          {allDone ? "Day done!" : "Finish"}
        </span>
      </div>

      {/* The walker and the dog, on the near side of the path. */}
      <div
        className="pointer-events-none absolute left-0 motion-reduce:transition-none"
        style={{ bottom: nearY - 4, width: walkerW, transform: `translateX(${x}px)`, transition: duration ? `transform ${duration}ms linear` : "none" }}
        aria-hidden
      >
        <WalkerPair
          width={walkerW}
          ink={ink}
          walking={walking}
          celebrate={allDone && !walking}
          minDx={-x}
          maxDx={trackW - x - walkerW}
          maxUp={Math.max(0, box.h - (nearY - 4) - (walkerW * 120) / 170 - 4)}
        />
      </div>
        </div>
      </div>

      <div className="absolute left-3 top-2.5 z-10 flex items-center gap-1.5">
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur", night > 0.5 ? "bg-white/15 text-white" : "bg-white/70 text-muted")}>{label}</span>
        <button
          onClick={() => {
            if (preview === null) setWalkRun((r) => r + 1);
            setPreview((p) => (p === null ? 5 : null));
          }}
          className={cn("flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium backdrop-blur", night > 0.5 ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/70 text-muted hover:bg-white")}
          aria-label={preview === null ? "Play a whole day of sky" : "Stop the sky preview"}
        >
          {preview === null ? <Play className="size-3" /> : <Pause className="size-3" />}
          {preview === null ? "Play the day" : "Stop"}
        </button>
      </div>

    </div>
  );
}

/** A small wooden board showing just the priority. Clicking it opens the task. */
function Board({ item, next, onOpen }: { item: ProgressItem; next: boolean; onOpen: (taskId: string) => void }) {
  return (
    <button
      onClick={() => onOpen(item.task.id)}
      title={item.task.title}
      aria-label={`${item.task.title}, P${item.priority}, ${item.done ? "done" : next ? "next up" : "not done"}. Open task`}
      className={cn("group relative flex flex-col items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", next && "walk-next")}
    >
      {item.done && (
        <span className="absolute -right-2 -top-2 z-10 flex size-5 items-center justify-center rounded-full bg-[var(--success-dot)] text-white shadow-card ring-2 ring-white">
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      )}
      <span
        className={cn(
          "flex h-8 w-12 items-center justify-center rounded-[4px] border-2 text-[13px] font-bold transition-transform group-hover:-translate-y-0.5",
          item.done ? "border-[#6b4423] bg-[#c99a62] text-[#3b230f]" : "border-[#6b4423] bg-[#e7c99a] text-[#3b230f]",
        )}
        style={{ boxShadow: "inset 0 -3px 0 rgb(0 0 0 / 0.12)" }}
      >
        P{item.priority}
      </span>
      <span className="flex w-8 justify-between">
        <span className="h-4 w-1.5 rounded-b-sm bg-[#6b4423]" />
        <span className="h-4 w-1.5 rounded-b-sm bg-[#6b4423]" />
      </span>
    </button>
  );
}
