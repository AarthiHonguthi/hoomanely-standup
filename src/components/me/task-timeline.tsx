"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { dotClasses, GoalDot, statusTone } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/config";
import { addDays, compareDates, diffDays, eachDate, formatRange, formatShort, isWeekend } from "@/lib/dates";
import type { TaskTimeline } from "@/lib/data/timeline";
import { useLookups } from "@/lib/data/store";
import type { ISODate, TaskStatus } from "@/lib/types";
import { cn, plural } from "@/lib/utils";

const DAY_W = 30;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEGEND: TaskStatus[] = ["not_started", "in_progress", "blocked", "done", "carried_over", "dropped"];

export interface TimelineGroup {
  goalId: string;
  title: string;
  rows: TaskTimeline[];
}

interface Props {
  groups: TimelineGroup[];
  from: ISODate;
  to: ISODate;
  today: ISODate;
  onShift: (days: number) => void;
  onToday: () => void;
  onOpenTask: (id: string) => void;
}

/** Personal Gantt-style timeline: one row per task, bars split by the statuses it actually went through. */
export function TaskTimelineChart({ groups, from, to, today, onShift, onToday, onOpenTask }: Props) {
  const { goalTone } = useLookups();
  const days = eachDate(from, to);
  const width = days.length * DAY_W;
  const x = (d: ISODate) => diffDays(from, d) * DAY_W;
  const clip = (start: ISODate, end: ISODate) => {
    const s = compareDates(start, from) < 0 ? from : start;
    const e = compareDates(end, addDays(to, 1)) > 0 ? addDays(to, 1) : end;
    return compareDates(e, s) > 0 ? { left: x(s), width: diffDays(s, e) * DAY_W } : null;
  };
  const inWindow = (d: ISODate) => compareDates(d, from) >= 0 && compareDates(d, to) <= 0;
  const todayInWindow = inWindow(today);
  const empty = groups.every((g) => g.rows.length === 0);

  return (
    <section className="rounded-card border border-border bg-surface shadow-card" aria-labelledby="timeline-heading">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 id="timeline-heading" className="text-sm font-semibold">
            Timeline
          </h3>
          <p className="text-xs text-subtle">{formatRange(from, to)}, both included. Bars show what actually happened; hatched days are still planned.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onShift(-7)} aria-label="Show one week earlier">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="sm" onClick={onToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onShift(7)} aria-label="Show one week later">
            <ChevronRight />
          </Button>
        </div>
      </div>

      {empty ? (
        <p className="px-4 py-10 text-center text-sm text-subtle">No tasks in these dates. Use the arrows to look earlier or later.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `minmax(180px, 260px) ${width}px` }}>
            {/* Header */}
            <div className="sticky left-0 z-20 border-b border-r border-border bg-surface px-4 py-2 text-xs font-medium text-subtle">Task</div>
            <div className="relative border-b border-border" style={{ width }}>
              <div className="flex">
                {days.map((d) => {
                  const [, m, dd] = d.split("-");
                  const firstOfMonth = dd === "01" || d === from;
                  return (
                    <div key={d} className={cn("flex h-11 shrink-0 flex-col items-center justify-end pb-1.5 text-[11px]", isWeekend(d) && "bg-surface-2", d === today && "font-semibold text-primary-soft-fg")} style={{ width: DAY_W }}>
                      <span className={cn("text-[10px] uppercase text-subtle", !firstOfMonth && "invisible")}>{MONTHS[Number(m) - 1]}</span>
                      <span className={cn(d !== today && "text-muted")}>{Number(dd)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {groups.map((g) =>
              g.rows.length === 0 ? null : (
                <Fragment key={g.goalId}>
                  <div className="sticky left-0 z-20 flex items-center gap-2 border-b border-r border-border bg-surface-2 px-4 py-1.5 text-xs font-semibold text-muted">
                    <GoalDot tone={goalTone(g.goalId)} />
                    <span className="truncate">{g.title}</span>
                  </div>
                  <div className="border-b border-border bg-surface-2" style={{ width }} />
                  {g.rows.map((row) => {
                    const t = row.task;
                    const history = row.segments.map((s) => `${STATUS_LABELS[s.status]} ${formatRange(s.start, addDays(s.end, -1))}`).join("; ");
                    const moved = t.originalTargetDate !== t.targetDate;
                    return (
                      <Fragment key={t.id}>
                        <div className="sticky left-0 z-20 border-b border-r border-border bg-surface px-4 py-2">
                          <button onClick={() => onOpenTask(t.id)} className="block w-full truncate text-left text-[13px] font-medium hover:text-primary-soft-fg hover:underline" title={t.title}>
                            {t.title}
                          </button>
                          <p className="truncate text-[11px] text-subtle">
                            {STATUS_LABELS[t.status]} · target {formatShort(t.targetDate)}
                            {row.lateBy > 0 && <span className="font-medium text-[var(--error-fg)]"> · {plural(row.lateBy, "day")} late</span>}
                          </p>
                        </div>
                        <div className="relative h-[52px] border-b border-border" style={{ width }}>
                          {/* Weekend shading */}
                          {days.map((d) => (isWeekend(d) ? <div key={d} className="absolute inset-y-0 bg-surface-2" style={{ left: x(d), width: DAY_W }} aria-hidden /> : null))}
                          {todayInWindow && <div className="absolute inset-y-0 w-px bg-primary/50" style={{ left: x(today) + DAY_W / 2 }} aria-hidden />}
                          <span className="sr-only">
                            {t.title}. History: {history || "not started yet"}. Current target {formatShort(t.targetDate)}
                            {moved ? `, originally ${formatShort(t.originalTargetDate)}` : ""}.
                          </span>
                          {/* Actual history */}
                          {row.segments.map((s, i) => {
                            const box = clip(s.start, s.end);
                            if (!box) return null;
                            return (
                              <div
                                key={i}
                                title={`${STATUS_LABELS[s.status]}: ${formatRange(s.start, addDays(s.end, -1))}`}
                                className={cn(
                                  "absolute top-[17px] h-[18px] border-r-2 border-surface",
                                  i === 0 && "rounded-l-md",
                                  i === row.segments.length - 1 && !row.planned && "rounded-r-md",
                                  dotClasses[statusTone(s.status)],
                                  s.status === "not_started" && "opacity-50",
                                )}
                                style={box}
                                aria-hidden
                              />
                            );
                          })}
                          {/* Still planned */}
                          {row.planned &&
                            (() => {
                              const box = clip(row.planned.start, row.planned.end);
                              return box ? (
                                <div
                                  title={`Planned until ${formatShort(t.targetDate)}`}
                                  className="absolute top-[17px] h-[18px] rounded-r-md border border-dashed border-border-strong bg-[repeating-linear-gradient(135deg,var(--surface-3)_0_4px,transparent_4px_8px)]"
                                  style={box}
                                  aria-hidden
                                />
                              ) : null;
                            })()}
                          {/* Days past target */}
                          {row.lateBy > 0 &&
                            (() => {
                              const box = clip(addDays(t.targetDate, 1), addDays(today, 1));
                              return box ? <div title={`${plural(row.lateBy, "day")} past target`} className="absolute top-[38px] h-[3px] rounded-full bg-[var(--error-dot)]" style={box} aria-hidden /> : null;
                            })()}
                          {/* Original target, when it moved */}
                          {moved && inWindow(t.originalTargetDate) && (
                            <div
                              title={`Original target ${formatShort(t.originalTargetDate)}`}
                              className="absolute top-[6px] size-2 rotate-45 border border-text bg-surface"
                              style={{ left: x(t.originalTargetDate) + DAY_W / 2 - 4 }}
                              aria-hidden
                            />
                          )}
                          {/* Current target */}
                          {inWindow(t.targetDate) && (
                            <div title={`Target ${formatShort(t.targetDate)}`} className="absolute top-[12px] h-[28px] w-[2px] rounded bg-text/70" style={{ left: x(t.targetDate) + DAY_W - 2 }} aria-hidden />
                          )}
                        </div>
                      </Fragment>
                    );
                  })}
                </Fragment>
              ),
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-[11px] text-muted">
        {LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-4 rounded-sm", dotClasses[statusTone(s)], s === "not_started" && "opacity-50")} aria-hidden />
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-dashed border-border-strong bg-[repeating-linear-gradient(135deg,var(--surface-3)_0_3px,transparent_3px_6px)]" aria-hidden />
          Planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-[2px] rounded bg-text/70" aria-hidden />
          Target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rotate-45 border border-text" aria-hidden />
          Original target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full bg-[var(--error-dot)]" aria-hidden />
          Past target
        </span>
        {todayInWindow && <span className="ml-auto text-subtle">Today is {formatShort(today)}</span>}
      </div>
    </section>
  );
}
