"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Plus,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { GoalLabel, PriorityBadge } from "@/components/shared/badges";
import { LinkChips } from "@/components/shared/link-chips";
import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import { Button } from "@/components/ui/button";
import {
  addDays,
  formatMonth,
  formatWeekdayShort,
  isWeekend,
  monthDates,
  monthKey,
  shiftMonth,
  weekdayIndex,
} from "@/lib/dates";
import {
  buildPersonCalendar,
  type DayEntry,
  type DayKind,
} from "@/lib/data/calendar";
import { useData, useLookups } from "@/lib/data/store";
import type { ISODate } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { asset } from "@/lib/site";
import { cn, plural } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_LABEL: Record<DayKind, string> = {
  done: "Done",
  working: "In progress",
  blocked: "Blocked",
  planned: "Planned",
  waiting: "Not started",
};

const KIND_CHIP: Record<DayKind, string> = {
  done: "bg-[var(--success-bg)] text-[var(--success-fg)]",
  working: "bg-[var(--reef-bg)] text-[var(--reef-fg)]",
  blocked: "bg-[var(--error-bg)] text-[var(--error-fg)]",
  planned: "border border-dashed border-border-strong text-muted",
  waiting: "bg-[var(--carbon-bg)] text-[var(--carbon-fg)]",
};

const KIND_DOT: Record<DayKind, string> = {
  done: "bg-[var(--success-dot)]",
  working: "bg-[var(--reef-dot)]",
  blocked: "bg-[var(--error-dot)]",
  planned: "border border-border-strong bg-transparent",
  waiting: "bg-[var(--carbon-dot)]",
};

const VISIBLE = 3;

/**
 * WEEKEND DOODLE SIZE — change this to make the Saturday/Sunday drawings bigger or smaller.
 * First value: phones. "sm:" value: tablets and desktops. Width follows automatically.
 * Example: "h-12 sm:h-24" is bigger; "h-8 sm:h-14" was the original size.
 */
const WEEKEND_ART_SIZE = "h-11 sm:h-[76px]";

/** Hand-drawn doodles shown on weekend days with no tasks (index: 5 = Saturday, 6 = Sunday). */
const WEEKEND_ART: Record<
  number,
  { src: string; width: number; height: number } | undefined
> = {
  5: { src: "/saturday-bed.png", width: 526, height: 532 },
  6: { src: "/sunday-esc.png", width: 446, height: 422 },
};

/** Month calendar of one person's tasks, with a panel listing the selected day's tasks. */
export function TaskCalendar({
  personId,
  selected,
  onSelect: setSelected,
}: {
  personId: string;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
}) {
  const { data, today } = useData();
  const [month, setMonth] = useState(() => shiftMonth(selected, 0));
  const focusNext = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => monthDates(month), [month]);
  const calendar = useMemo(
    () => buildPersonCalendar(data, personId, dates, today),
    [data, personId, dates, today],
  );
  const selectedEntries = calendar.get(selected) ?? [];
  const leading = weekdayIndex(dates[0]);

  const select = (d: ISODate) => {
    setSelected(d);
    if (monthKey(d) !== monthKey(month)) setMonth(shiftMonth(d, 0));
  };

  const goMonth = (offset: number) => {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelected(monthKey(today) === monthKey(next) ? today : next);
  };

  // Keep keyboard focus on the selected day after arrow-key moves.
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)
      ?.focus();
  }, [selected, month]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    focusNext.current = true;
    select(addDays(selected, step));
  };

  return (
    <section
      className="rounded-card border border-border bg-surface shadow-card"
      aria-labelledby="calendar-heading"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3
            id="calendar-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <CalendarDays className="size-4 text-subtle" aria-hidden />
            Calendar
            <span className="sr-only" aria-live="polite">
              {formatMonth(month)}
            </span>
          </h3>
          <p className="text-xs text-subtle">
            Past days show what was recorded in check-ins; later days show
            planned work and due dates.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setMonth(shiftMonth(today, 0));
              setSelected(today);
            }}
            title={
              monthKey(month) === monthKey(today)
                ? "Current month"
                : `Back to ${formatMonth(today)}`
            }
            aria-label={
              monthKey(month) === monthKey(today)
                ? `${formatMonth(month)}, current month`
                : `${formatMonth(month)}. Go back to ${formatMonth(today)}`
            }
          >
            {formatMonth(month)}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden>
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={cn(
                  "px-1 text-center text-[11px] font-medium uppercase tracking-wide text-subtle sm:text-left",
                  i >= 5 && "text-subtle/70",
                )}
              >
                {w}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            className="grid grid-cols-7 gap-1"
            role="group"
            aria-label={`${formatMonth(month)} calendar`}
          >
            {Array.from({ length: leading }, (_, i) => (
              <div key={`pad-${i}`} aria-hidden />
            ))}
            {dates.map((d) => (
              <DayCell
                key={d}
                date={d}
                entries={calendar.get(d) ?? []}
                isToday={d === today}
                isSelected={d === selected}
                onSelect={() => select(d)}
                onKeyDown={onKey}
              />
            ))}
          </div>
          <Legend />
        </div>
        <DayPanel date={selected} entries={selectedEntries} />
      </div>
    </section>
  );
}

function DayCell({
  date,
  entries,
  isToday,
  isSelected,
  onSelect,
  onKeyDown,
}: {
  date: ISODate;
  entries: DayEntry[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const day = Number(date.slice(-2));
  const hidden = entries.length - VISIBLE;
  const done = entries.filter((e) => e.kind === "done").length;
  const label = `${formatWeekdayShort(date)}: ${entries.length ? plural(entries.length, "task") : "no tasks"}${done ? `, ${done} done` : ""}${entries.some((e) => e.due) ? ", something due" : ""}`;
  return (
    <button
      data-date={date}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={isSelected ? 0 : -1}
      aria-pressed={isSelected}
      aria-label={label}
      className={cn(
        "flex min-h-14 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors sm:min-h-[96px]",
        isWeekend(date) ? "bg-surface-2" : "bg-surface",
        isSelected
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-border-strong",
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
            isToday ? "bg-primary font-semibold text-primary-fg" : "text-muted",
          )}
        >
          {day}
        </span>
        {entries.some((e) => e.due) && (
          <Flag className="size-3 text-[var(--warning-fg)]" aria-hidden />
        )}
      </span>
      {/* Weekend doodles on quiet Saturdays and Sundays. */}
      {entries.length === 0 && WEEKEND_ART[weekdayIndex(date)] && (
        <Image
          src={asset(WEEKEND_ART[weekdayIndex(date)]!.src)}
          alt=""
          width={WEEKEND_ART[weekdayIndex(date)]!.width}
          height={WEEKEND_ART[weekdayIndex(date)]!.height}
          className={cn(
            "pointer-events-none mx-auto mt-auto w-auto select-none opacity-80 mix-blend-multiply dark:opacity-70 dark:invert dark:mix-blend-screen",
            WEEKEND_ART_SIZE,
          )}
        />
      )}
      {/* Phones: dots. Larger screens: title chips. */}
      {entries.length > 0 && (
        <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
          {entries.slice(0, 6).map((e) => (
            <span
              key={e.task.id}
              className={cn("size-1.5 rounded-full", KIND_DOT[e.kind])}
            />
          ))}
        </span>
      )}
      <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
        {entries.slice(0, VISIBLE).map((e) => (
          <span
            key={e.task.id}
            className={cn(
              "truncate rounded px-1 py-0.5 text-[11px] leading-tight",
              KIND_CHIP[e.kind],
            )}
          >
            {e.task.priority !== null && (
              <span className="font-semibold">P{e.task.priority} </span>
            )}
            {e.task.title}
          </span>
        ))}
        {hidden > 0 && (
          <span className="px-1 text-[11px] text-subtle">+{hidden} more</span>
        )}
      </span>
    </button>
  );
}

function DayPanel({ date, entries }: { date: ISODate; entries: DayEntry[] }) {
  const { currentUserId } = useData();
  const { goal, goalTone } = useLookups();
  const { openTask, openTaskForm } = useUI();
  return (
    // The panel never makes the calendar taller: on wide screens it fills the row and scrolls inside.
    <div
      className="relative border-t border-border xl:border-l xl:border-t-0"
      aria-labelledby="day-panel-heading"
    >
      <div className="flex flex-col p-4 xl:absolute xl:inset-0">
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 id="day-panel-heading" className="text-sm font-semibold">
              {formatWeekdayShort(date)}
            </h4>
            <p className="text-xs text-subtle">
              {entries.length
                ? plural(entries.length, "task")
                : "Nothing on this day."}
            </p>
          </div>
          <Button
            variant="secondary"
            size="icon-sm"
            className="size-8"
            onClick={() => openTaskForm({ mode: "create", startDate: date })}
            aria-label={`Add a task on ${formatWeekdayShort(date)}`}
            title="Add a task for this day"
          >
            <Plus />
          </Button>
        </div>
        <ul className="-mr-2 flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-2 xl:max-h-none xl:min-h-0 xl:flex-1">
          {entries.map((e) => {
            const g = goal.get(e.task.goalId);
            return (
              <li
                key={e.task.id}
                className="rounded-lg border border-border p-2.5"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {g && (
                      <GoalLabel
                        tone={goalTone(g.id)}
                        title={g.title}
                        className="max-w-full"
                      />
                    )}
                    <button
                      onClick={() => openTask(e.task.id)}
                      className="mt-0.5 block text-left text-[13px] font-medium leading-snug hover:text-primary-soft-fg hover:underline"
                    >
                      {e.task.title}
                    </button>
                  </div>
                  {e.task.ownerId === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-mr-1 -mt-1 size-7"
                      onClick={() =>
                        openTaskForm({ mode: "edit", taskId: e.task.id })
                      }
                      aria-label={`Edit ${e.task.title}`}
                      title="Edit task"
                    >
                      <EditPencilIcon />
                    </Button>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-medium",
                      KIND_CHIP[e.kind],
                    )}
                  >
                    {KIND_LABEL[e.kind]}
                  </span>
                  {e.due && (
                    <span className="flex items-center gap-1 rounded bg-[var(--warning-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warning-fg)]">
                      <Flag className="size-3" aria-hidden />
                      Due
                    </span>
                  )}
                  {e.task.priority !== null && (
                    <PriorityBadge
                      level={e.task.priority}
                      className="h-5 text-[11px]"
                    />
                  )}
                </div>
                {e.recorded && (
                  <p className="mt-1.5 text-xs text-muted">
                    Check-in: {e.recorded}
                  </p>
                )}
                <LinkChips links={e.task.links} className="mt-2" />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Legend() {
  const items: DayKind[] = ["done", "working", "blocked", "waiting", "planned"];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted">
      {items.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span
            className={cn("size-2.5 rounded-sm", KIND_DOT[k])}
            aria-hidden
          />
          {KIND_LABEL[k]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <Flag className="size-3 text-[var(--warning-fg)]" aria-hidden />
        Due
      </span>
    </div>
  );
}
