"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatShort, formatWeekdayShort } from "@/lib/dates";
import { formatDays, type BurndownPoint } from "@/lib/data/sprint-report";

const H = 260;
const M = { top: 14, right: 84, bottom: 26, left: 34 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = v <= 10 ? 2 : v <= 25 ? 5 : v <= 60 ? 10 : 20;
  return Math.ceil(v / step) * step;
}

/**
 * Burndown: estimated days of work left per working day, against an even
 * "ideal pace" line. Hover or arrow keys show each day's numbers; a table
 * view carries the same data.
 */
export function BurndownChart({ points }: { points: BurndownPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.ideal, p.remaining ?? 0))));
  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => M.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];

  const actual = points.map((p, i) => ({ i, v: p.remaining })).filter((p): p is { i: number; v: number } => p.v !== null);
  const last = actual[actual.length - 1];
  const actualPath = actual.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
  const idealPath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.ideal)}`).join(" ");
  const xLabels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  const pick = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = (clientX - rect.left - M.left) / innerW;
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1)))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.min(points.length - 1, Math.max(0, (h ?? (last?.i ?? 0)) + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const hp = hover !== null ? points[hover] : null;
  const summary = last
    ? `Burndown. ${formatDays(points[0].ideal)} planned; ${formatDays(last.v)} left on ${formatWeekdayShort(points[last.i].date)}, against ${formatDays(points[last.i].ideal)} on the ideal pace.`
    : "Burndown. The sprint hasn't started yet.";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" />
          Work left
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-subtle" />
          Ideal pace
        </span>
      </div>
      <div
        ref={wrapRef}
        className="relative outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ring/40"
        tabIndex={0}
        role="img"
        aria-label={summary}
        onKeyDown={onKey}
        onFocus={() => setHover(last?.i ?? 0)}
        onBlur={() => setHover(null)}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={H} className="block max-w-full" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--text-subtle)] text-[11px] tabular-nums">
                {Math.round(t * 10) / 10}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-[var(--text-subtle)] text-[11px]">
              {formatShort(points[i].date)}
            </text>
          ))}
          <path d={idealPath} fill="none" stroke="var(--text-subtle)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
          <path d={actualPath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last && (
            <>
              <circle cx={x(last.i)} cy={y(last.v)} r={4.5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
              {/* Direct label in the right margin, clear of both lines. */}
              <text
                x={x(last.i) + 8}
                y={y(last.v)}
                dominantBaseline="middle"
                className="fill-[var(--text)] text-[11px] font-medium"
              >
                {formatDays(last.v)} left
              </text>
            </>
          )}
          {hp && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} stroke="var(--text-subtle)" strokeWidth={1} opacity={0.5} />
              <circle cx={x(hover)} cy={y(hp.ideal)} r={4} fill="var(--surface)" stroke="var(--text-subtle)" strokeWidth={1.5} />
              {hp.remaining !== null && <circle cx={x(hover)} cy={y(hp.remaining)} r={4.5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />}
            </g>
          )}
        </svg>
        {hp && hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
            style={{ left: Math.min(Math.max(x(hover) - 72, 0), width - 150) }}
          >
            <p className="mb-1 font-semibold">{formatWeekdayShort(hp.date)}</p>
            <p className="flex justify-between gap-4 text-muted">
              Work left <span className="font-medium text-text tabular-nums">{hp.remaining === null ? "Not yet" : formatDays(hp.remaining)}</span>
            </p>
            <p className="flex justify-between gap-4 text-muted">
              Ideal pace <span className="font-medium text-text tabular-nums">{formatDays(hp.ideal)}</span>
            </p>
          </div>
        )}
      </div>
      <button onClick={() => setShowTable((v) => !v)} className="mt-1 text-xs font-medium text-muted underline underline-offset-2 hover:text-text" aria-expanded={showTable}>
        {showTable ? "Hide table" : "Show as table"}
      </button>
      {showTable && (
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-subtle">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Work left</th>
              <th className="py-1 font-medium">Ideal pace</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {points.map((p) => (
              <tr key={p.date} className="border-t border-border">
                <td className="py-1">{formatWeekdayShort(p.date)}</td>
                <td className="py-1">{p.remaining === null ? "–" : formatDays(p.remaining)}</td>
                <td className="py-1">{formatDays(p.ideal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
