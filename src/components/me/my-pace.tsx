"use client";

import { Gauge, Lock } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/shared/badges";
import { Checkbox } from "@/components/ui/checkbox";
import { addDays, formatWeekdayShort, isWeekend, weekdayIndex } from "@/lib/dates";
import { buildPersonCalendar } from "@/lib/data/calendar";
import { useData } from "@/lib/data/store";
import { dayProgress, formatPercent, PRIORITY_WEIGHT, weekAverage, type DayProgress, type ProgressItem } from "@/lib/pace/day-progress";
import type { ISODate } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, plural } from "@/lib/utils";
import { WalkScene } from "./walk-scene";

/**
 * My pace for the selected day: the day's tasks as a segmented progress bar
 * (P0 first, each segment sized by estimate × priority) and a checklist to
 * tick tasks off. Calculated automatically; private to the signed-in person.
 */
export function MyPace({ personId, date }: { personId: string; date: ISODate }) {
  const { data, today, currentUserId, changeTaskStatus } = useData();
  const { openTask } = useUI();
  const toggle = (item: ProgressItem, done: boolean) => {
    const res = changeTaskStatus(item.task.id, { status: done ? "done" : "in_progress" });
    if (!res.ok) return void toast.error(res.error);
    toast.success(done ? "Nice, crossed off" : "Marked as in progress", { description: item.task.title });
  };
  const monday = addDays(date, -weekdayIndex(date));
  const weekDates = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(monday, i)), [monday]);
  const doneSeq = useMemo(() => {
    const seq = new Map<string, number>();
    data.events.forEach((e, i) => {
      if (e.type === "status_changed" && e.to === "done") seq.set(e.taskId, i);
    });
    return seq;
  }, [data.events]);
  const calendar = useMemo(() => buildPersonCalendar(data, personId, [...new Set([...weekDates, date])], today), [data, personId, weekDates, date, today]);

  // Only your own pace is ever shown.
  if (personId !== currentUserId) return null;

  // Today reflects live status; past days use what was recorded that day.
  const progressFor = (d: ISODate): DayProgress =>
    dayProgress((calendar.get(d) ?? []).map((e) => ({ task: e.task, done: d === today ? e.task.status === "done" : e.kind === "done" })));
  const day = progressFor(date);
  // Priority order (P0, P0, P1, …). Within a priority, finished tasks come first in the order they were finished.
  const ordered = [...day.items].sort(
    (a, b) =>
      a.priority - b.priority ||
      Number(b.done) - Number(a.done) ||
      (a.done && b.done ? (doneSeq.get(a.task.id) ?? 0) - (doneSeq.get(b.task.id) ?? 0) : a.task.estimate - b.task.estimate),
  );
  const week = weekAverage(weekDates.filter((d) => d <= today).map((d) => progressFor(d).percent));
  const isToday = date === today;
  const isFuture = date > today;
  const empty = day.items.length === 0;

  const summary = empty
    ? `${formatWeekdayShort(date)}: ${isWeekend(date) ? "rest day" : "no tasks"}.`
    : isFuture
      ? `${formatWeekdayShort(date)}: ${plural(day.items.length, "task")} planned.`
      : `${formatWeekdayShort(date)}: ${formatPercent(day.percent)} done, ${day.doneCount} of ${plural(day.items.length, "task")}.`;

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5" aria-labelledby="pace-heading">
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id="pace-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="size-4 text-subtle" aria-hidden />
            My pace · {formatWeekdayShort(date)}
          </h3>
          <p className="text-xs text-subtle">
            {isToday ? "Walk through today's tasks. Tick them off as you finish." : isFuture ? "Tasks planned for this day." : "What got done that day, from your check-ins."}
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
          <Lock className="size-3" aria-hidden />
          Only you can see this
        </span>
      </div>

      {empty ? (
        <p className="rounded-lg bg-surface-2 px-3 py-4 text-sm text-muted">{isWeekend(date) ? "Rest day. Nothing planned." : "No tasks on this day."}</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="flex shrink-0 items-center gap-4 sm:w-40 sm:flex-col sm:justify-center sm:gap-2">
              <ProgressRing percent={isFuture ? null : day.percent} />
              <div className="text-xs text-muted sm:text-center">
                <p className="font-medium text-text">{isFuture ? `${plural(day.items.length, "task")} planned` : `${day.doneCount} of ${plural(day.items.length, "task")} done`}</p>
                <p className="mt-0.5">
                  This week: {week.average === null ? "–" : `${formatPercent(week.average)} avg`}
                  {week.days > 0 && <span className="text-subtle"> · {plural(week.days, "day")}</span>}
                </p>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <WalkScene items={ordered} isToday={isToday} onOpen={openTask} resetKey={date} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-subtle">
            Each board is a task in priority order; within a priority, finished ones come first. Click a board to open it; tick tasks off below. Psst: you can pick up the walker or the dog. The percentage weighs tasks by estimate × priority (P0 {PRIORITY_WEIGHT[0]} · P1{" "}
            {PRIORITY_WEIGHT[1]} · P2 {PRIORITY_WEIGHT[2]} · P3 {PRIORITY_WEIGHT[3]}).
          </p>

          <Checklist items={ordered} editable={isToday} onToggle={toggle} />
        </>
      )}
    </section>
  );
}

/** The day's weighted percentage in a ring. */
function ProgressRing({ percent }: { percent: number | null }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const share = percent === null ? 0 : Math.min(1, percent / 100);
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={percent === null ? "Planned" : `${formatPercent(percent)} done`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        {share > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--success-dot)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${share * C} ${C}`}
            className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums">{percent === null ? "–" : formatPercent(percent)}</span>
    </div>
  );
}

function Checklist({ items, editable, onToggle: toggle }: { items: ProgressItem[]; editable: boolean; onToggle: (item: ProgressItem, done: boolean) => void }) {
  const { currentUserId } = useData();
  const { openTask } = useUI();

  return (
    <ul className="mt-4 flex flex-col divide-y divide-border rounded-lg border border-border">
      {items.map((i) => {
        const canTick = editable && i.task.ownerId === currentUserId && i.task.status !== "dropped" && i.task.status !== "carried_over";
        return (
          <li key={i.task.id} className="flex items-center gap-3 px-3 py-2.5">
            <Checkbox
              checked={i.done}
              disabled={!canTick}
              onCheckedChange={(v) => toggle(i, v === true)}
              aria-label={`${i.done ? "Done" : "Not done"}: ${i.task.title}`}
            />
            <PriorityBadge level={i.priority} className="h-5 text-[11px]" />
            <button
              onClick={() => openTask(i.task.id)}
              className={cn("min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline", i.done && "text-subtle line-through decoration-1")}
            >
              {i.task.title}
            </button>
            {i.task.status === "blocked" && !i.done && <span className="shrink-0 text-[11px] font-medium text-[var(--error-fg)]">Blocked</span>}
            <span className="shrink-0 text-[11px] tabular-nums text-subtle" title="Estimate × priority weight">
              {i.task.estimate}d × {PRIORITY_WEIGHT[i.priority]} = {i.weight}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
