import { addDays, compareDates, datePart, diffDays } from "../dates";
import type { AppData, ISODate, Task, TaskStatus } from "../types";

/**
 * Turns a task's recorded history into dated segments for a timeline bar.
 * Segments use half-open day ranges [start, end): a task that was In Progress
 * on 21–22 Sep has start "…-21" and end "…-23".
 */

export interface StatusSegment {
  status: TaskStatus;
  start: ISODate;
  end: ISODate;
}

export interface TaskTimeline {
  task: Task;
  /** What actually happened, from the start (or first recorded change) up to today or the close date. */
  segments: StatusSegment[];
  /** Remaining planned days (tomorrow through the current target) for open tasks that aren't late. */
  planned: { start: ISODate; end: ISODate } | null;
  /** Days past the current target for an open task; 0 when not late. */
  lateBy: number;
}

const OPEN: TaskStatus[] = ["not_started", "in_progress", "blocked"];

export function buildTaskTimeline(data: AppData, task: Task, today: ISODate): TaskTimeline {
  const changes = data.events
    .filter((e) => e.taskId === task.id && e.type === "status_changed" && e.to)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id)))
    .map((e) => ({ date: datePart(e.at), status: e.to as TaskStatus }));

  const first = changes[0]?.date;
  const start = first && compareDates(first, task.startDate) < 0 ? first : task.startDate;

  const isOpen = OPEN.includes(task.status);
  let end: ISODate;
  if (task.status === "done") end = addDays(task.completedDate ?? changes.at(-1)?.date ?? today, 1);
  else if (!isOpen) end = addDays(changes.at(-1)?.date ?? today, 1);
  else end = addDays(today, 1);
  // A task that hasn't reached its start date yet has no history to draw.
  if (compareDates(end, start) <= 0) end = start;

  const segments: StatusSegment[] = [];
  let status: TaskStatus = "not_started";
  let cursor = start;
  for (const c of changes) {
    const at = compareDates(c.date, start) < 0 ? start : c.date;
    if (compareDates(at, cursor) > 0) {
      segments.push({ status, start: cursor, end: compareDates(at, end) < 0 ? at : end });
      cursor = at;
    }
    status = c.status;
  }
  if (compareDates(end, cursor) > 0) segments.push({ status, start: cursor, end });

  // Merge neighbours with the same status (e.g. two In Progress updates).
  const merged: StatusSegment[] = [];
  for (const s of segments) {
    const last = merged.at(-1);
    if (last && last.status === s.status && last.end === s.start) last.end = s.end;
    else merged.push({ ...s });
  }

  const lateBy = isOpen ? Math.max(0, diffDays(task.targetDate, today)) : 0;
  const plannedStart = compareDates(start, addDays(today, 1)) > 0 ? start : addDays(today, 1);
  const planned =
    isOpen && compareDates(task.targetDate, today) >= 0 && compareDates(addDays(task.targetDate, 1), plannedStart) > 0
      ? { start: plannedStart, end: addDays(task.targetDate, 1) }
      : null;

  return { task, segments: merged, planned, lateBy };
}

/** True when anything about the task (history, plan or targets) falls inside [from, to]. */
export function timelineTouches(t: TaskTimeline, from: ISODate, to: ISODate): boolean {
  const toEx = addDays(to, 1);
  const spans = [...t.segments, ...(t.planned ? [t.planned] : [])];
  if (spans.some((s) => compareDates(s.start, toEx) < 0 && compareDates(s.end, from) > 0)) return true;
  return [t.task.targetDate, t.task.originalTargetDate].some((d) => compareDates(d, from) >= 0 && compareDates(d, to) <= 0);
}
