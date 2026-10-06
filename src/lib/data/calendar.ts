import { compareDates, isWeekend } from "../dates";
import { comparePriority } from "./selectors";
import type { AppData, ISODate, Task, TaskStatus } from "../types";

/**
 * What a person's tasks looked like on each day, for the My workspace calendar.
 *
 * Past days use what was recorded in that day's check-in (the snapshot), so
 * the calendar shows history honestly. Days without a check-in fall back to
 * the task's dates: completion day, active working days up to today, planned
 * days after today, and the target date ("due").
 */

export type DayKind = "done" | "blocked" | "working" | "planned" | "waiting";

export interface DayEntry {
  task: Task;
  kind: DayKind;
  /** The task's current target is this day and it isn't done. */
  due: boolean;
  /** Progress text recorded in that day's check-in, if any. */
  recorded: string | null;
  /** Status recorded that day, if there was a check-in. */
  recordedStatus: TaskStatus | null;
}

const OPEN: TaskStatus[] = ["not_started", "in_progress", "blocked"];

function kindFromStatus(s: TaskStatus): DayKind {
  if (s === "done") return "done";
  if (s === "blocked") return "blocked";
  if (s === "not_started") return "waiting";
  return "working";
}

const ORDER: Record<DayKind, number> = { blocked: 0, working: 1, done: 2, waiting: 3, planned: 4 };

/** Entries for every day in `dates`, keyed by date. */
export function buildPersonCalendar(data: AppData, personId: string, dates: ISODate[], today: ISODate): Map<ISODate, DayEntry[]> {
  const tasks = data.tasks.filter((t) => t.ownerId === personId);
  const snapshots = new Map<string, { status: TaskStatus; progress: string }>();
  for (const c of data.checkIns) {
    if (c.personId !== personId) continue;
    for (const u of c.updates) snapshots.set(`${u.taskId}:${c.date}`, { status: u.status, progress: u.progress });
  }

  const out = new Map<ISODate, DayEntry[]>();
  for (const d of dates) {
    const entries: DayEntry[] = [];
    for (const t of tasks) {
      const open = OPEN.includes(t.status);
      const due = open && t.targetDate === d;
      const snap = snapshots.get(`${t.id}:${d}`);
      if (snap) {
        entries.push({ task: t, kind: kindFromStatus(snap.status), due, recorded: snap.progress, recordedStatus: snap.status });
        continue;
      }
      let kind: DayKind | null = null;
      if (t.completedDate === d) kind = "done";
      else if (t.status !== "not_started" && open && compareDates(t.startDate, d) <= 0 && compareDates(d, today) <= 0 && !isWeekend(d)) {
        kind = t.status === "blocked" ? "blocked" : "working";
      } else if (open && compareDates(d, today) > 0 && compareDates(t.startDate, d) <= 0 && compareDates(d, t.targetDate) <= 0 && !isWeekend(d)) {
        kind = "planned";
      } else if (due) {
        kind = t.status === "not_started" ? "waiting" : t.status === "blocked" ? "blocked" : "working";
      }
      if (kind) entries.push({ task: t, kind, due, recorded: null, recordedStatus: null });
    }
    // Priority first (P0, shorter estimate first), then blocked / working / done.
    entries.sort((a, b) => comparePriority(a.task, b.task) || ORDER[a.kind] - ORDER[b.kind] || a.task.title.localeCompare(b.task.title));
    out.set(d, entries);
  }
  return out;
}
