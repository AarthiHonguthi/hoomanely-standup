"use client";

import { ChevronDown, CornerDownRight, MessageSquareText, OctagonAlert } from "lucide-react";
import { useState } from "react";
import { Avatar, EstimateChip, GoalLabel, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { LinkChips } from "@/components/shared/link-chips";
import { formatShort, formatTime } from "@/lib/dates";
import { comparePriority, sprintFor } from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import type { CheckIn, TaskUpdateSnapshot } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, firstName, plural } from "@/lib/utils";

const VISIBLE_UPDATES = 3;

export function CheckInCard({ checkIn }: { checkIn: CheckIn }) {
  const { currentUserId, today, data } = useData();
  const { person, team, task } = useLookups();
  const { setCheckInOpen } = useUI();
  const [expanded, setExpanded] = useState(false);
  const owner = person.get(checkIn.personId);
  if (!owner) return null;

  const isMine = checkIn.personId === currentUserId;
  const hidden = checkIn.updates.length - VISIBLE_UPDATES;
  // P0 first, then shorter estimates (the task's current priority).
  const ordered = [...checkIn.updates].sort((a, b) =>
    comparePriority({ priority: task.get(a.taskId)?.priority ?? null, estimate: a.estimate }, { priority: task.get(b.taskId)?.priority ?? null, estimate: b.estimate }),
  );
  const updates = expanded ? ordered : ordered.slice(0, VISIBLE_UPDATES);

  return (
    <article
      className={cn("min-w-0 rounded-card border border-border bg-surface shadow-card", isMine && "border-primary/35")}
      aria-label={`${owner.name}'s check-in for ${formatShort(checkIn.date)}`}
    >
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Avatar person={owner} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {owner.name}
            {isMine && <span className="ml-1.5 font-normal text-subtle">(you)</span>}
          </p>
          <p className="flex flex-wrap gap-x-1 text-xs text-subtle">
            <span>
              {team.get(owner.teamId)?.name} ·
            </span>
            <span>
              {sprintFor(data, checkIn.date)?.name ? `${sprintFor(data, checkIn.date)?.name} · ` : ""}Checked in {formatShort(checkIn.date)}, {formatTime(checkIn.submittedAt)}
              {checkIn.editedAt && <> · edited {formatTime(checkIn.editedAt)}</>}
            </span>
          </p>
        </div>
        {isMine && checkIn.date === today ? (
          <button onClick={() => setCheckInOpen(true)} className="rounded-md px-2 py-1 text-xs font-medium text-primary-soft-fg hover:bg-primary-soft">
            Edit
          </button>
        ) : (
          <span className="shrink-0 text-xs text-subtle">{plural(checkIn.updates.length, "update")}</span>
        )}
      </header>

      {checkIn.note && (
        <p className="mx-4 mb-3 flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-muted">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
          <span>{checkIn.note}</span>
        </p>
      )}

      {checkIn.updates.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {updates.map((u) => (
            <li key={u.taskId}>
              <TaskUpdateRow update={u} />
            </li>
          ))}
        </ul>
      ) : (
        !checkIn.note && <p className="border-t border-border px-4 py-3 text-sm text-subtle">No task updates in this check-in.</p>
      )}

      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text"
        >
          {expanded ? "Show fewer updates" : `Show ${plural(hidden, "more update")}`}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
    </article>
  );
}

const PROGRESS_CLAMP = 150;

function TaskUpdateRow({ update }: { update: TaskUpdateSnapshot }) {
  const { goal, person, task, goalTone } = useLookups();
  const { openTask } = useUI();
  const [more, setMore] = useState(false);
  const g = goal.get(update.goalId);
  const current = task.get(update.taskId);
  const depPerson = update.dependency ? person.get(update.dependency.personId) : undefined;
  const blocked = update.status === "blocked";
  const long = update.progress.length > PROGRESS_CLAMP;
  const originalTarget = current?.originalTargetDate;
  const moved = originalTarget && update.targetDate !== originalTarget;

  return (
    <div className="px-4 py-3">
      {g && <GoalLabel tone={goalTone(g.id)} title={g.title} className="mb-1 max-w-full" />}
      <div className="flex items-start gap-3">
        <button
          onClick={() => openTask(update.taskId)}
          className="min-w-0 flex-1 text-left text-sm font-medium leading-snug text-text hover:text-primary-soft-fg hover:underline hover:underline-offset-2"
        >
          {update.taskTitle}
        </button>
        <StatusBadge status={update.status} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
        {current?.priority != null && <PriorityBadge level={current.priority} />}
        <EstimateChip estimate={update.estimate} />
        <span>
          Target <span className="font-medium text-muted">{formatShort(update.targetDate)}</span>
          {moved && <span> · originally {formatShort(originalTarget)}</span>}
        </span>
      </div>

      {update.progress && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {long && !more ? `${update.progress.slice(0, PROGRESS_CLAMP).trimEnd()}… ` : `${update.progress} `}
          {long && (
            <button onClick={() => setMore((v) => !v)} className="font-medium text-primary-soft-fg hover:underline" aria-expanded={more}>
              {more ? "Less" : "More"}
            </button>
          )}
        </p>
      )}

      {current && <LinkChips links={current.links} className="mt-2" max={4} />}

      {(depPerson || update.supportNeeded) && (
        <div
          className={cn(
            "mt-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
            blocked ? "bg-[var(--error-bg)] text-[var(--error-fg)]" : "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
          )}
        >
          <p className="flex gap-1.5">
            {blocked ? <OctagonAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <CornerDownRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
            <span>
              <span className="font-semibold">{blocked ? "Blocked" : "Needs support"}</span>
              {depPerson && (
                <>
                  {" "}
                  {blocked ? "· waiting on" : "from"} <span className="font-medium">{firstName(depPerson.name)}</span>
                  {update.dependency?.description && <>: {update.dependency.description}</>}
                </>
              )}
            </span>
          </p>
          {update.supportNeeded && update.supportNeeded !== update.dependency?.description && (
            <p className="pl-5">Asking for: {update.supportNeeded}</p>
          )}
        </div>
      )}
    </div>
  );
}
