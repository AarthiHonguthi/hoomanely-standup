import { addDays, compareDates, diffDays, eachDate, isValidISODate, isWeekend } from "../dates";
import { PRIORITY_LEVELS, type AppData, type CheckIn, type Goal, type ISODate, type Person, type PriorityLevel, type Sprint, type Task, type TaskEvent, type TaskUpdateSnapshot } from "../types";

// ── Date range filter ──────────────────────────────────────────────────────

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export const MAX_RANGE_DAYS = 62;

export const DATE_PRESETS = [
  { id: "today", daysBack: 0, label: "Today" },
  { id: "1", daysBack: 1, label: "Yesterday → today" },
] as const;

export function presetRange(daysBack: number, today: ISODate): DateRange {
  return { start: addDays(today, -daysBack), end: today };
}

export function matchPreset(range: DateRange, today: ISODate): (typeof DATE_PRESETS)[number] | null {
  if (range.end !== today) return null;
  return DATE_PRESETS.find((p) => addDays(today, -p.daysBack) === range.start) ?? null;
}

export function validateRange(start: string, end: string): string | null {
  if (!start || !end) return "Choose both a start and an end date.";
  if (!isValidISODate(start) || !isValidISODate(end)) return "One of the dates isn't a valid calendar date.";
  if (compareDates(start, end) > 0) return "The start date is after the end date. Swap them or pick a new range.";
  if (diffDays(start, end) + 1 > MAX_RANGE_DAYS) return `Choose a range of ${MAX_RANGE_DAYS} days or fewer.`;
  return null;
}

// ── Lookups ────────────────────────────────────────────────────────────────

export function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

export function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}

export function sprintFor(data: AppData, date: ISODate): Sprint | null {
  return data.sprints.find((s) => s.startDate <= date && date <= s.endDate) ?? null;
}

export function sortedSprints(data: AppData): Sprint[] {
  return [...data.sprints].sort((a, b) => compareDates(a.startDate, b.startDate));
}

/** Sprint a task starting on `date` belongs to: the one covering it, else the next one. */
export function sprintForStart(data: AppData, date: ISODate): Sprint | null {
  return sprintFor(data, date) ?? sortedSprints(data).find((s) => s.startDate > date) ?? null;
}

/** The sprint containing `today`, or the next one if today falls between sprints. */
export function currentSprint(data: AppData, today: ISODate): Sprint | null {
  return sprintFor(data, today) ?? [...data.sprints].sort((a, b) => compareDates(a.startDate, b.startDate)).find((s) => s.startDate > today) ?? null;
}

export function laterSprints(data: AppData, sprintId: string): Sprint[] {
  const from = data.sprints.find((s) => s.id === sprintId);
  return data.sprints.filter((s) => !from || s.startDate > from.startDate).sort((a, b) => compareDates(a.startDate, b.startDate));
}

// ── Team Today feed ────────────────────────────────────────────────────────

export interface FeedDay {
  date: ISODate;
  checkIns: CheckIn[];
  /** People in the filter who have no check-in that day (weekdays only). */
  missing: Person[];
  weekend: boolean;
}

export function buildFeed(data: AppData, range: DateRange, personIds: string[]): FeedDay[] {
  const selected = personIds.length ? data.people.filter((p) => personIds.includes(p.id)) : data.people;
  const selectedIds = new Set(selected.map((p) => p.id));
  const people = indexById(data.people);
  const byDate = new Map<ISODate, CheckIn[]>();
  for (const c of data.checkIns) {
    if (!selectedIds.has(c.personId) || c.date < range.start || c.date > range.end) continue;
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }
  return eachDate(range.start, range.end)
    .reverse()
    .map((date) => {
      const checkIns = (byDate.get(date) ?? []).sort((a, b) =>
        (people.get(a.personId)?.name ?? "").localeCompare(people.get(b.personId)?.name ?? ""),
      );
      const present = new Set(checkIns.map((c) => c.personId));
      const weekend = isWeekend(date);
      return {
        date,
        checkIns,
        weekend,
        missing: weekend ? [] : sortPeople(selected.filter((p) => !present.has(p.id))),
      };
    });
}

// ── Needs attention (current state, not history) ───────────────────────────

export interface AttentionItem {
  task: Task;
  kind: "blocked" | "support";
}

export function attentionItems(data: AppData, personIds: string[]): AttentionItem[] {
  const ids = new Set(personIds.length ? personIds : data.people.map((p) => p.id));
  const items: AttentionItem[] = [];
  for (const t of data.tasks) {
    if (!ids.has(t.ownerId)) continue;
    if (t.status === "blocked") items.push({ task: t, kind: "blocked" });
    else if (t.dependency && (t.status === "in_progress" || t.status === "not_started")) items.push({ task: t, kind: "support" });
  }
  return items.sort((a, b) => (a.kind === b.kind ? compareDates(a.task.targetDate, b.task.targetDate) : a.kind === "blocked" ? -1 : 1));
}

// ── Goals ──────────────────────────────────────────────────────────────────

export interface GoalProgress {
  total: number;
  done: number;
  dropped: number;
  carriedOver: number;
  blocked: number;
  /** Tasks that count toward the goal (everything except Dropped). */
  counted: number;
  contributors: Person[];
}

/** Tasks of a goal, optionally limited to one sprint (including tasks carried out of it). */
export function goalTasks(data: AppData, goalId: string, sprintId?: string | null): Task[] {
  return data.tasks.filter((t) => t.goalId === goalId && (!sprintId || t.sprintId === sprintId || t.carryOver?.fromSprintId === sprintId));
}

export function goalProgress(data: AppData, goal: Goal, sprintId?: string | null): GoalProgress {
  const tasks = goalTasks(data, goal.id, sprintId);
  const people = indexById(data.people);
  const contributorIds = [...new Set(tasks.map((t) => t.ownerId))];
  const count = (s: Task["status"]) => tasks.filter((t) => t.status === s).length;
  const dropped = count("dropped");
  return {
    total: tasks.length,
    done: count("done"),
    dropped,
    carriedOver: count("carried_over"),
    blocked: count("blocked"),
    counted: tasks.length - dropped,
    contributors: sortPeople(contributorIds.map((id) => people.get(id)).filter((p): p is Person => Boolean(p))),
  };
}

/**
 * Goals in a sprint: those with tasks in it, plus goals created during it that
 * have no tasks yet (so a new goal shows up right away). No sprint = every goal.
 */
export function goalsForSprint(data: AppData, sprint: Sprint | null): Goal[] {
  if (!sprint) return data.goals;
  return data.goals.filter((g) => {
    if (goalTasks(data, g.id, sprint.id).length) return true;
    const created = g.createdAt.slice(0, 10);
    return !data.tasks.some((t) => t.goalId === g.id) && compareDates(sprint.startDate, created) <= 0 && compareDates(created, sprint.endDate) <= 0;
  });
}

// ── Task history ───────────────────────────────────────────────────────────

export interface DailyUpdateEntry {
  checkIn: CheckIn;
  update: TaskUpdateSnapshot;
}

export function dailyUpdatesForTask(data: AppData, taskId: string): DailyUpdateEntry[] {
  const out: DailyUpdateEntry[] = [];
  for (const c of data.checkIns) {
    for (const u of c.updates) if (u.taskId === taskId) out.push({ checkIn: c, update: u });
  }
  return out.sort((a, b) => compareDates(b.checkIn.date, a.checkIn.date));
}

export function eventsForTask(data: AppData, taskId: string): TaskEvent[] {
  return data.events.filter((e) => e.taskId === taskId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id.localeCompare(a.id)));
}

/** Tasks the person can report on in a check-in on `date`. */
export function checkInCandidates(data: AppData, personId: string, date: ISODate, alreadyIncluded: string[]): Task[] {
  const included = new Set(alreadyIncluded);
  return data.tasks
    .filter((t) => t.ownerId === personId)
    .filter(
      (t) =>
        included.has(t.id) ||
        t.status === "in_progress" ||
        t.status === "blocked" ||
        t.status === "not_started" ||
        (t.status === "done" && t.completedDate === date),
    )
    .sort((a, b) => {
      const order = { blocked: 0, in_progress: 1, not_started: 2, carried_over: 3, done: 4, dropped: 5 } as const;
      return order[a.status] - order[b.status] || compareDates(a.targetDate, b.targetDate);
    });
}

// ── Task priority ──────────────────────────────────────────────────────────

/**
 * A person's unfinished tasks on a day: started on or before it and not yet
 * past target. Overdue tasks still count on today and earlier days.
 */
export function openTasksOnDay(data: AppData, ownerId: string, date: ISODate, today: ISODate, excludeTaskId?: string): Task[] {
  return data.tasks.filter(
    (t) =>
      t.ownerId === ownerId &&
      t.id !== excludeTaskId &&
      t.status !== "done" &&
      t.status !== "dropped" &&
      compareDates(t.startDate, date) <= 0 &&
      (compareDates(date, t.targetDate) <= 0 || compareDates(date, today) <= 0),
  );
}

/**
 * Levels offered for a task, given the person's other tasks that day.
 * None for the first task; then P0 up to one past the highest level in use
 * (tasks without a level count as P0), capped at P3.
 */
export function priorityChoices(others: Task[]): PriorityLevel[] {
  if (others.length === 0) return [];
  const max = Math.max(...others.map((t) => t.priority ?? 0));
  return PRIORITY_LEVELS.filter((l) => l <= Math.min(max + 1, 3));
}

/** P0 first; equal priority puts the shorter estimate first. */
export function comparePriority(a: { priority: PriorityLevel | null; estimate: number }, b: { priority: PriorityLevel | null; estimate: number }): number {
  return (a.priority ?? 0) - (b.priority ?? 0) || a.estimate - b.estimate;
}
