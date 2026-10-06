"use client";

import { Lock, RefreshCw } from "lucide-react";
import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar, EstimateChip, GoalLabel, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { NotesText } from "@/components/shared/notes-text";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ESTIMATE_LABELS } from "@/lib/config";
import { diffDays, formatLong, formatWeekdayShort } from "@/lib/dates";
import { dailyUpdatesForTask, eventsForTask } from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import type { Task } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, plural } from "@/lib/utils";
import { ChangeLog, DailyUpdateList } from "./history";
import { LinksEditor } from "./links-editor";
import { StatusChangeForm } from "./status-change-form";

export function TaskDrawer() {
  const { openTaskId, closeTask } = useUI();
  const { task } = useLookups();
  const t = openTaskId ? task.get(openTaskId) : undefined;
  return (
    <Sheet open={Boolean(t)} onOpenChange={(open) => !open && closeTask()}>
      <SheetContent>{t && <TaskDetails key={t.id} task={t} />}</SheetContent>
    </Sheet>
  );
}

function TaskDetails({ task }: { task: Task }) {
  const { data, currentUserId } = useData();
  const { person, goal, sprint, goalTone } = useLookups();
  const { openTaskForm, closeTask } = useUI();
  const [changingStatus, setChangingStatus] = useState(false);
  const [tab, setTab] = useState<"updates" | "changes">("updates");

  const owner = person.get(task.ownerId);
  const g = goal.get(task.goalId);
  const canEdit = task.ownerId === currentUserId;
  const dep = task.dependency ? person.get(task.dependency.personId) : undefined;
  const updates = dailyUpdatesForTask(data, task.id);
  const events = eventsForTask(data, task.id);
  const targetMoves = events.filter((e) => e.type === "target_date_changed").length;
  const lateBy = task.completedDate ? diffDays(task.originalTargetDate, task.completedDate) : 0;

  return (
    <>
      <div className="border-b border-border px-5 pb-4 pr-12 pt-5">
        {g && (
          <Link href={`/goals?goal=${g.id}`} onClick={closeTask} className="inline-flex max-w-full rounded hover:underline">
            <GoalLabel tone={goalTone(g.id)} title={g.title} />
          </Link>
        )}
        <SheetTitle className="mt-1.5 text-lg font-semibold leading-snug">{task.title}</SheetTitle>
        <SheetDescription className="sr-only">Task details, current status and update history</SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          {task.priority !== null && <PriorityBadge level={task.priority} />}
          <EstimateChip estimate={task.estimate} />
          {owner && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Avatar person={owner} size="xs" />
              {owner.name}
            </span>
          )}
        </div>
        {canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setChangingStatus((v) => !v)} aria-expanded={changingStatus}>
              <RefreshCw />
              Change status
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openTaskForm({ mode: "edit", taskId: task.id })}>
              <EditPencilIcon />
              Edit task
            </Button>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
            <Lock className="size-3.5" aria-hidden />
            Only {owner?.name ?? "the owner"} can edit this task.
          </p>
        )}
        {changingStatus && (
          <div className="mt-3">
            <StatusChangeForm task={task} onDone={() => setChangingStatus(false)} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="px-5 py-5" aria-labelledby="current-heading">
          <SectionHeading id="current-heading" label="Current" hint="As of now" />
          {task.notes ? (
            <div className="mb-4">
              <p className="mb-1 text-xs text-subtle">Notes</p>
              <NotesText text={task.notes} className="text-text" />
            </div>
          ) : (
            <p className="mb-4 text-sm text-subtle">No notes.</p>
          )}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border p-4 sm:grid-cols-2">
            <Item label="Owner">{owner?.name ?? "Unknown"}</Item>
            <Item label="Estimated effort">{ESTIMATE_LABELS[task.estimate]}</Item>
            <Item label="Sprint">{sprint.get(task.sprintId)?.name ?? "—"}</Item>
            <Item label="Start date">{formatLong(task.startDate)}</Item>
            <Item label="Original target">{formatLong(task.originalTargetDate)}</Item>
            <Item label="Current target">
              {formatLong(task.targetDate)}
              {targetMoves > 0 && <span className="block text-xs text-subtle">Moved {plural(targetMoves, "time")}</span>}
            </Item>
            {task.completedDate && (
              <Item label="Completed">
                {formatLong(task.completedDate)}
                <span className="block text-xs text-subtle">
                  {lateBy > 0 ? `${plural(lateBy, "day")} after the original target` : lateBy < 0 ? `${plural(-lateBy, "day")} early` : "On the original target"}
                </span>
              </Item>
            )}
            <Item label="Dependency" wide>
              {dep && task.dependency ? (
                <span className="flex items-start gap-2">
                  <Avatar person={dep} size="xs" className="mt-0.5" />
                  <span>
                    <span className="font-medium">{dep.name}</span>
                    <span className="block text-muted">{task.dependency.description}</span>
                    <span className="block text-xs text-subtle">
                      {task.status === "blocked" ? "Task is blocked." : "A dependency doesn't mean the task is blocked."}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="text-subtle">None</span>
              )}
            </Item>
            {task.status === "dropped" && task.dropReason && (
              <Item label="Why it was dropped" wide>
                {task.dropReason}
              </Item>
            )}
            {task.carryOver && (
              <Item label="Carried over" wide>
                {sprint.get(task.carryOver.fromSprintId)?.name} → {sprint.get(task.carryOver.toSprintId)?.name} on {formatWeekdayShort(task.carryOver.date)}
                <span className="block text-muted">{task.carryOver.reason}</span>
              </Item>
            )}
          </dl>

          <h4 className="mb-2 mt-5 text-[13px] font-semibold">Result and document links</h4>
          <LinksEditor task={task} canEdit={canEdit} />
        </section>

        <section className="border-t border-border bg-surface-2/50 px-5 py-5" aria-labelledby="history-heading">
          <SectionHeading id="history-heading" label="History" hint="What was recorded at the time" />
          <div role="tablist" aria-label="History" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-0.5">
            <TabButton active={tab === "updates"} onClick={() => setTab("updates")} controls="history-updates">
              Daily updates · {updates.length}
            </TabButton>
            <TabButton active={tab === "changes"} onClick={() => setTab("changes")} controls="history-changes">
              Change log · {events.length}
            </TabButton>
          </div>
          <div id="history-updates" role="tabpanel" hidden={tab !== "updates"}>
            <DailyUpdateList entries={updates} />
          </div>
          <div id="history-changes" role="tabpanel" hidden={tab !== "changes"}>
            <ChangeLog events={events} />
          </div>
        </section>
      </div>
    </>
  );
}

function SectionHeading({ id, label, hint }: { id: string; label: string; hint: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h3 id={id} className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </h3>
      <span className="text-xs text-subtle">{hint}</span>
    </div>
  );
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function TabButton({ active, onClick, controls, children }: { active: boolean; onClick: () => void; controls: string; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:text-text")}
    >
      {children}
    </button>
  );
}
