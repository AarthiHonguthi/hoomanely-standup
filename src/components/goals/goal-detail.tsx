"use client";

import { CalendarDays, Plus, StickyNote } from "lucide-react";
import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar, EstimateChip, GoalDot, StatusBadge } from "@/components/shared/badges";
import { NotesText } from "@/components/shared/notes-text";
import { LinkChips } from "@/components/shared/link-chips";
import { Button } from "@/components/ui/button";
import { formatLong, formatShort } from "@/lib/dates";
import { goalProgress, goalTasks } from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import type { Goal, Sprint, Task, TaskStatus } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, firstName, plural } from "@/lib/utils";
import { ProgressLine } from "./goals-view";

const GROUPS: { title: string; statuses: TaskStatus[] }[] = [
  { title: "In flight", statuses: ["blocked", "in_progress", "not_started"] },
  { title: "Carried over", statuses: ["carried_over"] },
  { title: "Done", statuses: ["done"] },
  { title: "Dropped", statuses: ["dropped"] },
];

/** A goal's notes, progress and tasks. Tasks can be limited to the chosen sprint and to one contributor. */
export function GoalDetail({ goal, sprint }: { goal: Goal; sprint: Sprint | null }) {
  const { data, currentUserId } = useData();
  const { person, goalTone } = useLookups();
  const { openTaskForm, setEditGoalId } = useUI();
  const [scope, setScope] = useState<"sprint" | "all">(sprint ? "sprint" : "all");
  const [who, setWho] = useState<string | null>(null);
  const sprintId = scope === "sprint" ? (sprint?.id ?? null) : null;
  const scoped = useMemo(() => goalTasks(data, goal.id, sprintId), [data, goal.id, sprintId]);
  const progress = useMemo(() => goalProgress(data, goal, sprintId), [data, goal, sprintId]);
  const tasks = who ? scoped.filter((t) => t.ownerId === who) : scoped;
  const creator = person.get(goal.createdById);

  return (
    <article className="rounded-card border border-border bg-surface shadow-card" aria-labelledby="goal-title">
      <header className="border-b border-border p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="goal-title" className="flex items-start gap-2 text-lg font-semibold leading-snug">
              <GoalDot tone={goalTone(goal.id)} className="mt-2.5" />
              {goal.title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-xs text-subtle">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden />
                {goal.targetDate ? `Target ${formatLong(goal.targetDate)}` : "No target date"}
              </span>
              {creator && <span>Created by {creator.name}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {goal.createdById === currentUserId && (
              <Button variant="secondary" onClick={() => setEditGoalId(goal.id)}>
                <EditPencilIcon />
                Edit goal
              </Button>
            )}
            <Button variant="primary" onClick={() => openTaskForm({ mode: "create", goalId: goal.id })}>
              <Plus />
              Add task
            </Button>
          </div>
        </div>
        {goal.notes && (
          <div className="mt-4 rounded-lg bg-surface-2 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <StickyNote className="size-3.5" aria-hidden />
              Notes
            </p>
            <NotesText text={goal.notes} className="mt-1 text-text" />
          </div>
        )}
        <LinkChips links={goal.links} className="mt-3" />
        {sprint && (
          <div className="mt-4 inline-flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="group" aria-label="Which tasks">
            {(["sprint", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setScope(s);
                  setWho(null);
                }}
                aria-pressed={scope === s}
                className={cn("rounded-md px-3 py-1.5 transition-colors", scope === s ? "bg-surface text-text shadow-card" : "text-muted hover:text-text")}
              >
                {s === "sprint" ? `${sprint.name} only` : "All sprints"}
              </button>
            ))}
          </div>
        )}
        <ProgressLine progress={progress} detailed className="mt-4" />
        {progress.contributors.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-subtle">
              {plural(progress.contributors.length, "person", "people")} contributed · pick one to see their tasks
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Filter tasks by contributor">
              <li>
                <ContributorChip label="Everyone" count={scoped.length} active={who === null} onClick={() => setWho(null)} />
              </li>
              {progress.contributors.map((p) => {
                const mine = scoped.filter((t) => t.ownerId === p.id);
                return (
                  <li key={p.id}>
                    <ContributorChip
                      label={firstName(p.name)}
                      avatar={<Avatar person={p} size="xs" />}
                      count={mine.length}
                      done={mine.filter((t) => t.status === "done").length}
                      active={who === p.id}
                      onClick={() => setWho(who === p.id ? null : p.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </header>

      <div className="p-5">
        {tasks.length === 0 && scoped.length > 0 ? (
          <p className="text-sm text-muted">No tasks for this person here.</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
            <p className="font-medium">No tasks yet</p>
            <p className="mt-1 text-sm text-muted">Break this goal into tasks of 2 days or less.</p>
            <Button variant="soft" className="mt-4" onClick={() => openTaskForm({ mode: "create", goalId: goal.id })}>
              <Plus />
              Add the first task
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {GROUPS.map((group) => {
              const list = tasks
                .filter((t) => group.statuses.includes(t.status))
                .sort((a, b) => group.statuses.indexOf(a.status) - group.statuses.indexOf(b.status) || a.targetDate.localeCompare(b.targetDate));
              if (list.length === 0) return null;
              return (
                <section key={group.title} aria-label={group.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    {group.title} · {list.length}
                  </h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function ContributorChip({ label, avatar, count, done, active, onClick }: { label: string; avatar?: ReactNode; count: number; done?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border py-0.5 pr-3 text-xs transition-colors",
        avatar ? "pl-1" : "pl-3",
        active ? "border-primary bg-primary-soft font-medium text-primary-soft-fg ring-1 ring-primary" : "border-border text-muted hover:bg-surface-2",
      )}
    >
      {avatar}
      {label}
      <span className="tabular-nums text-subtle">
        {done !== undefined ? `${done}/${count}` : count}
      </span>
    </button>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { person } = useLookups();
  const { openTask } = useUI();
  const owner = person.get(task.ownerId);
  const moved = task.targetDate !== task.originalTargetDate;
  return (
    <li>
      <button onClick={() => openTask(task.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-left hover:bg-surface-2 sm:flex-nowrap">
        {owner && <Avatar person={owner} size="sm" />}
        <span className="min-w-0 flex-1 basis-48">
          <span className={cn("block text-sm font-medium leading-snug", task.status === "dropped" && "text-muted line-through decoration-1")}>{task.title}</span>
          <span className="block text-xs text-subtle">
            {owner?.name}
            {task.status === "done" && task.completedDate
              ? ` · completed ${formatShort(task.completedDate)}`
              : ` · target ${formatShort(task.targetDate)}${moved ? ` (was ${formatShort(task.originalTargetDate)})` : ""}`}
          </span>
        </span>
        <EstimateChip estimate={task.estimate} />
        <StatusBadge status={task.status} />
      </button>
    </li>
  );
}
