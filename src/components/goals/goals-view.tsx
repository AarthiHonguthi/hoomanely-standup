"use client";

import { ArrowLeft, Plus, Target } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AvatarStack } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { formatRange } from "@/lib/dates";
import {
  currentSprint,
  goalProgress,
  goalsForSprint,
  goalTasks,
  sortedSprints,
  type GoalProgress,
} from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import type { Goal, Sprint } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, firstName, plural } from "@/lib/utils";
import { GoalDetail } from "./goal-detail";

const ALL = "all";

/** Sprint picked in the URL (?sprint=s-6 or ?sprint=all); defaults to the current sprint. */
function useSprintParam(): {
  sprint: Sprint | null;
  value: string;
  setValue: (v: string) => void;
  query: string;
} {
  const { data, today } = useData();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("sprint");
  const sprint =
    raw === ALL
      ? null
      : (data.sprints.find((s) => s.id === raw) ?? currentSprint(data, today));
  const value = sprint?.id ?? ALL;
  const setValue = (v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("sprint", v);
    next.delete("goal");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { sprint, value, setValue, query: `sprint=${value}` };
}

export function GoalsView() {
  const { data, today } = useData();
  const { setGoalFormOpen } = useUI();
  const params = useSearchParams();
  const { sprint, value, setValue, query } = useSprintParam();
  const selectedId = params.get("goal");
  const selected = data.goals.find((g) => g.id === selectedId) ?? null;
  const sprints = useMemo(
    () =>
      sortedSprints(data)
        .filter(
          (s) => s.startDate <= (currentSprint(data, today)?.endDate ?? today),
        )
        .reverse(),
    [data, today],
  );

  const goals = useMemo(() => {
    const list = goalsForSprint(data, sprint).map((g) => ({
      goal: g,
      progress: goalProgress(data, g, sprint?.id),
    }));
    // Unfinished goals first (most open work first), finished ones at the end.
    const open = (p: GoalProgress) => p.counted - p.done;
    return list.sort(
      (a, b) =>
        Number(open(a.progress) === 0 && a.progress.counted > 0) -
          Number(open(b.progress) === 0 && b.progress.counted > 0) ||
        open(b.progress) - open(a.progress),
    );
  }, [data, sprint]);

  if (selected) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <Link
          href={`/goals?${query}`}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All goals
        </Link>
        {/* Links from elsewhere (no ?sprint) show the goal across all sprints. */}
        <GoalDetail
          key={selected.id}
          goal={selected}
          sprint={params.get("sprint") ? sprint : null}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Goals</h2>
        <label className="sr-only" htmlFor="goals-sprint">
          Sprint
        </label>
        <NativeSelect
          id="goals-sprint"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-auto min-w-56"
        >
          <option value={ALL}>All sprints</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatRange(s.startDate, s.endDate)}
              {s.id === currentSprint(data, today)?.id ? " (current)" : ""}
            </option>
          ))}
        </NativeSelect>
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => setGoalFormOpen(true)}
        >
          <Plus />
          New goal
        </Button>
      </div>

      {selectedId && (
        <p className="mb-4 text-sm text-muted">
          The goal in the link no longer exists.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {goals.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
            <Target className="mx-auto mb-3 size-6 text-subtle" aria-hidden />
            <p className="font-medium">
              No goals in {sprint ? sprint.name : "any sprint"} yet
            </p>
            <p className="mt-1 text-sm text-muted">
              Create a goal, or add a task to an existing goal in this sprint.
            </p>
          </div>
        ) : (
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Goals"
          >
            {goals.map(({ goal, progress }) => (
              <li key={goal.id}>
                <GoalCard
                  goal={goal}
                  progress={progress}
                  sprint={sprint}
                  query={query}
                />
              </li>
            ))}
          </ul>
        )}
        <SprintSummary goals={goals} sprint={sprint} />
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  progress,
  sprint,
  query,
}: {
  goal: Goal;
  progress: GoalProgress;
  sprint: Sprint | null;
  query: string;
}) {
  const { data } = useData();
  const { goalTone } = useLookups();
  const tone = goalTone(goal.id);
  const next = goalTasks(data, goal.id, sprint?.id)
    .filter(
      (t) =>
        t.status === "in_progress" ||
        t.status === "blocked" ||
        t.status === "not_started",
    )
    .slice(0, 2);
  const complete = progress.counted > 0 && progress.done === progress.counted;
  return (
    <Link
      href={`/goals?${query}&goal=${goal.id}`}
      className="group relative flex h-full flex-col rounded-[18px] border border-border bg-surface p-5 pl-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop"
    >
      {/* Colour tab on the left edge, like a folder tab. */}
      <span
        className="absolute left-0 top-5 h-7 w-1.5 rounded-r-full"
        style={{ background: `var(--${tone}-dot)` }}
        aria-hidden
      />
      <p className="text-[15px] font-semibold leading-snug">{goal.title}</p>
      <p className="mt-1 text-xs text-subtle">
        {progress.total ? (
          <>
            <span
              className={cn(
                "font-medium",
                complete ? "text-[var(--success-fg)]" : "text-muted",
              )}
            >
              {progress.done} of {progress.counted} done
            </span>
            {progress.blocked > 0 && (
              <span className="text-[var(--error-fg)]">
                {" "}
                · {progress.blocked} blocked
              </span>
            )}
            {progress.dropped > 0 && <span> · {progress.dropped} dropped</span>}
          </>
        ) : (
          "No tasks yet"
        )}
      </p>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-[var(--success-dot)]"
          style={{
            width: `${progress.counted ? (progress.done / progress.counted) * 100 : 0}%`,
          }}
        />
      </div>

      <ul className="mt-3 flex-1 space-y-1 text-[13px] text-muted">
        {next.length > 0 ? (
          next.map((t) => (
            <li key={t.id} className="truncate">
              – {t.title}
            </li>
          ))
        ) : (
          <li className="text-subtle">
            {complete
              ? "All tasks done."
              : goal.notes
                ? goal.notes.split("\n")[0]
                : "Add the first task from the goal page."}
          </li>
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-2">
        {progress.contributors.length > 0 ? (
          <AvatarStack people={progress.contributors} max={4} />
        ) : (
          <span />
        )}
        <span className="text-xs text-subtle">
          {plural(progress.contributors.length, "person", "people")}
        </span>
      </div>
    </Link>
  );
}

/** Ring of goals completed in the sprint, with the list of goals beside it. */
function SprintSummary({
  goals,
  sprint,
}: {
  goals: { goal: Goal; progress: GoalProgress }[];
  sprint: Sprint | null;
}) {
  const { person, goalTone } = useLookups();
  const counted = goals.filter((g) => g.progress.counted > 0);
  const completed = counted.filter(
    (g) => g.progress.done === g.progress.counted,
  ).length;
  const tasksDone = goals.reduce((s, g) => s + g.progress.done, 0);
  const tasksTotal = goals.reduce((s, g) => s + g.progress.counted, 0);
  const share = counted.length ? completed / counted.length : 0;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <aside
      className="rounded-[18px] border border-border bg-surface p-5 shadow-card lg:sticky lg:top-20"
      aria-label="Sprint summary"
    >
      <h3 className="text-center text-base font-semibold">
        {sprint ? sprint.name : "All sprints"}
      </h3>
      {sprint && (
        <p className="text-center text-xs text-subtle">
          {formatRange(sprint.startDate, sprint.endDate)}
        </p>
      )}
      <div
        className="relative mx-auto my-4 size-36"
        role="img"
        aria-label={`${completed} of ${counted.length} goals completed`}
      >
        <svg viewBox="0 0 128 128" className="size-full -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth="10"
          />
          {share > 0 && (
            <circle
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${share * C} ${C}`}
              className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">
            {Math.round(share * 100)}%
          </span>
          <span className="text-[11px] text-subtle">goals done</span>
        </div>
      </div>
      <p className="text-center text-sm font-semibold">
        {completed} completed{" "}
        <span className="font-normal text-subtle">
          of {plural(counted.length, "goal")}
        </span>
      </p>
      <p className="text-center text-xs text-subtle">
        {tasksDone} of {plural(tasksTotal, "task")} done
      </p>

      <ul className="mt-5 flex flex-col divide-y divide-border border-t border-border">
        {goals.slice(0, 8).map(({ goal, progress }) => {
          const creator = person.get(goal.createdById);
          return (
            <li key={goal.id} className="flex items-center gap-3 py-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: `var(--${goalTone(goal.id)}-dot)` }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {goal.title}
                </span>
                <span className="block text-[11px] text-subtle">
                  {creator ? `by ${firstName(creator.name)}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {progress.done}/{progress.counted}
              </span>
            </li>
          );
        })}
      </ul>
      {goals.length > 8 && (
        <p className="pt-2 text-center text-xs text-subtle">
          +{goals.length - 8} more goals
        </p>
      )}
    </aside>
  );
}

export function ProgressLine({
  progress,
  className,
  detailed,
}: {
  progress: GoalProgress;
  className?: string;
  detailed?: boolean;
}) {
  const { done, counted, dropped, blocked, carriedOver } = progress;
  const extras = [
    blocked && `${blocked} blocked`,
    carriedOver && `${carriedOver} carried over`,
    dropped && `${dropped} dropped`,
  ].filter(Boolean);
  return (
    <div className={className}>
      <p className="text-[13px]">
        <span className="font-semibold tabular-nums">
          {done} of {counted}
        </span>{" "}
        <span className="text-muted">tasks complete</span>
        {extras.length > 0 && (
          <span className="text-subtle"> · {extras.join(" · ")}</span>
        )}
      </p>
      <div
        className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        aria-hidden
      >
        {counted === 0 ? (
          <span className="flex-1 bg-surface-3" />
        ) : (
          <>
            {done > 0 && (
              <span
                className="bg-[var(--success-dot)]"
                style={{ flex: done }}
              />
            )}
            {counted - done > 0 && (
              <span className="bg-surface-3" style={{ flex: counted - done }} />
            )}
          </>
        )}
      </div>
      {detailed && (
        <p className="mt-1.5 text-xs text-subtle">
          Counted by tasks, not effort. Dropped tasks aren&apos;t counted as
          complete or remaining.
        </p>
      )}
    </div>
  );
}
