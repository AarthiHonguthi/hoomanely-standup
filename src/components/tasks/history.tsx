"use client";

import { ArrowRightFromLine, CalendarClock, Handshake, History, Link2, Plus, RefreshCw, Timer, Unlink } from "lucide-react";
import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import type { ComponentType } from "react";
import { EstimateChip, StatusBadge } from "@/components/shared/badges";
import { STATUS_LABELS } from "@/lib/config";
import { formatShort, formatTime, formatWeekdayShort, datePart } from "@/lib/dates";
import type { DailyUpdateEntry } from "@/lib/data/selectors";
import { useLookups } from "@/lib/data/store";
import type { TaskEvent, TaskStatus } from "@/lib/types";
import { cn, firstName } from "@/lib/utils";

export function DailyUpdateList({ entries }: { entries: DailyUpdateEntry[] }) {
  const { person } = useLookups();
  if (entries.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-subtle">No daily updates recorded for this task yet.</p>;
  }
  return (
    <ol className="relative flex flex-col gap-3">
      {entries.map(({ checkIn, update }) => {
        const dep = update.dependency ? person.get(update.dependency.personId) : undefined;
        return (
          <li key={checkIn.id} className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold">{formatWeekdayShort(checkIn.date)}</span>
              <span className="text-xs text-subtle">
                {formatTime(checkIn.submittedAt)}
                {checkIn.editedAt && ` · edited ${formatTime(checkIn.editedAt)}`}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <EstimateChip estimate={update.estimate} className="bg-surface" />
                <StatusBadge status={update.status} />
              </span>
            </div>
            <p className="mt-1 text-xs text-subtle">Target that day: {formatShort(update.targetDate)}</p>
            {update.progress && <p className="mt-2 text-[13px] leading-relaxed text-text">{update.progress}</p>}
            {(dep || update.supportNeeded) && (
              <p className={cn("mt-2 text-xs", update.status === "blocked" ? "text-[var(--error-fg)]" : "text-[var(--warning-fg)]")}>
                {update.status === "blocked" ? "Blocked" : "Needs support"}
                {dep && ` · ${firstName(dep.name)}: ${update.dependency?.description}`}
                {update.supportNeeded && ` · Asking for: ${update.supportNeeded}`}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const EVENT_ICONS: Record<TaskEvent["type"], ComponentType<{ className?: string }>> = {
  created: Plus,
  status_changed: RefreshCw,
  target_date_changed: CalendarClock,
  dependency_changed: Handshake,
  estimate_changed: Timer,
  details_edited: EditPencilIcon,
  carried_over: ArrowRightFromLine,
  link_added: Link2,
  link_removed: Unlink,
};

export function ChangeLog({ events }: { events: TaskEvent[] }) {
  const { person } = useLookups();
  const name = (id: string | null) => (id ? (person.get(id)?.name ?? "someone") : "nobody");

  const describe = (e: TaskEvent): React.ReactNode => {
    switch (e.type) {
      case "created":
        return <>Created the task{e.note && <span className="text-subtle"> · {e.note.replace(/target (\d{4}-\d{2}-\d{2})/, (_, dt) => `target ${formatShort(dt)}`)}</span>}</>;
      case "status_changed":
        return (
          <>
            Status {e.from ? STATUS_LABELS[e.from as TaskStatus] : "—"} → <strong className="font-medium">{e.to ? STATUS_LABELS[e.to as TaskStatus] : "—"}</strong>
          </>
        );
      case "target_date_changed":
        return (
          <>
            Target moved {e.from ? formatShort(e.from) : "—"} → <strong className="font-medium">{e.to ? formatShort(e.to) : "—"}</strong>
          </>
        );
      case "dependency_changed":
        return e.to ? (
          <>
            Dependency on <strong className="font-medium">{name(e.to)}</strong>
          </>
        ) : (
          <>Dependency on {name(e.from)} cleared</>
        );
      case "estimate_changed":
        return (
          <>
            Estimate {e.from}d → <strong className="font-medium">{e.to}d</strong>
          </>
        );
      case "details_edited":
        return <>{e.note ?? "Edited details"}</>;
      case "carried_over":
        return (
          <>
            Carried over {e.from} → <strong className="font-medium">{e.to}</strong>
          </>
        );
      case "link_added":
        return <>Added link “{e.note}”</>;
      case "link_removed":
        return <>Removed link “{e.note}”</>;
    }
  };

  const showNote = (e: TaskEvent) => e.note && (e.type === "status_changed" || e.type === "carried_over" || (e.type === "dependency_changed" && e.to));

  if (events.length === 0) return <p className="text-sm text-subtle">No changes recorded.</p>;

  return (
    <ol className="flex flex-col">
      {events.map((e, i) => {
        const Icon = EVENT_ICONS[e.type] ?? History;
        return (
          <li key={e.id} className="relative flex gap-3 pb-3">
            {i < events.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-px bg-border" aria-hidden />}
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
              <Icon className="size-3 text-subtle" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5 text-[13px] leading-snug">
              <p className="text-text">{describe(e)}</p>
              {showNote(e) && <p className="mt-0.5 text-xs text-muted">“{e.note}”</p>}
              <p className="mt-0.5 text-xs text-subtle">
                {firstName(name(e.actorId))} · {formatShort(datePart(e.at))}, {formatTime(e.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
