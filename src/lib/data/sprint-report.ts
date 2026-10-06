import { compareDates, eachDate, formatRange, formatShort, isWeekend } from "../dates";
import type { AppData, Goal, ISODate, Person, Sprint, Task, Team } from "../types";
import { firstName, plural } from "../utils";

/**
 * Sprint report: what was planned in a sprint, what got done, and how the
 * estimates held up. Everything is derived from tasks, check-ins and the
 * change log; nothing is stored.
 *
 * Definitions
 * - Planned: tasks that belong to the sprint, including ones later carried out of it.
 * - Done: completed on or before the sprint's last day (or today, for a running sprint).
 * - Unfinished: planned, not dropped, and not done by the end of the sprint.
 * - Actual days: working days from start to completion, counting both ends.
 * - Within estimate: actual days <= the estimate rounded up to whole days.
 */

export type GoalHealth = "done" | "on_track" | "at_risk" | "unfinished" | "not_started";

export interface GoalLine {
  goal: Goal;
  tasks: Task[];
  done: number;
  health: GoalHealth;
  reason: string | null;
}

export interface EstimateStats {
  /** Done tasks with a measurable start and finish. */
  measured: number;
  within: number;
  /** Average actual / estimate. 1 means spot on; 1.5 means 50% longer. */
  ratio: number | null;
  bySize: { estimate: number; count: number; avgActual: number }[];
}

export interface BurndownPoint {
  date: ISODate;
  /** Estimated days of work left; null for days that haven't happened yet. */
  remaining: number | null;
  ideal: number;
}

export interface SprintReport {
  sprint: Sprint;
  running: boolean;
  /** Last day counted: the sprint end, or today while it runs. */
  asOf: ISODate;
  workdays: ISODate[];
  elapsed: number;
  planned: Task[];
  done: Task[];
  unfinished: Task[];
  carried: Task[];
  dropped: Task[];
  blocked: Task[];
  plannedDays: number;
  doneDays: number;
  estimate: EstimateStats;
  onTime: { measured: number; onTime: number };
  checkIns: { expected: number; actual: number };
  burndown: BurndownPoint[];
  goals: GoalLine[];
  teams: { team: Team; planned: number; done: number }[];
  /** Longest blocks in this sprint, in working days. */
  longBlocks: { task: Task; days: number; waitingOn: Person | null }[];
}

export function workdaysBetween(start: ISODate, end: ISODate): number {
  if (compareDates(end, start) < 0) return 0;
  return eachDate(start, end).filter((d) => !isWeekend(d)).length;
}

/** Working days a task took (at least 1). */
export function actualDays(t: Task): number | null {
  if (!t.completedDate) return null;
  return Math.max(1, workdaysBetween(t.startDate, t.completedDate));
}

export function estimateStats(tasks: Task[]): EstimateStats {
  const rows = tasks.map((t) => ({ t, actual: actualDays(t) })).filter((r): r is { t: Task; actual: number } => r.actual !== null);
  const within = rows.filter((r) => r.actual <= Math.ceil(r.t.estimate)).length;
  // Time is counted in whole working days, so compare with the estimate rounded up.
  const ratio = rows.length ? rows.reduce((s, r) => s + r.actual / Math.ceil(r.t.estimate), 0) / rows.length : null;
  const sizes = [...new Set(rows.map((r) => r.t.estimate))].sort((a, b) => a - b);
  return {
    measured: rows.length,
    within,
    ratio,
    bySize: sizes.map((estimate) => {
      const group = rows.filter((r) => r.t.estimate === estimate);
      return { estimate, count: group.length, avgActual: group.reduce((s, r) => s + r.actual, 0) / group.length };
    }),
  };
}

const sum = (tasks: Task[]) => tasks.reduce((s, t) => s + t.estimate, 0);
const doneBy = (t: Task, d: ISODate) => t.status === "done" && t.completedDate !== null && compareDates(t.completedDate, d) <= 0;

/** Sprints that have started, newest first. */
export function reportableSprints(data: AppData, today: ISODate): Sprint[] {
  return [...data.sprints].filter((s) => compareDates(s.startDate, today) <= 0).sort((a, b) => compareDates(b.startDate, a.startDate));
}

/** The sprint a report opens on: the running one once it is a few days in, otherwise the last finished one. */
export function defaultReportSprint(data: AppData, today: ISODate): Sprint | null {
  const list = reportableSprints(data, today);
  const running = list.find((s) => compareDates(today, s.endDate) <= 0);
  if (running && workdaysBetween(running.startDate, today) >= 3) return running;
  return list.find((s) => compareDates(s.endDate, today) < 0) ?? running ?? null;
}

/** Tasks that belong to the sprint, including ones carried out of it. */
export function sprintTasks(data: AppData, sprintId: string): Task[] {
  const carriedOut = new Set(data.events.filter((e) => e.type === "carried_over" && e.from === sprintId).map((e) => e.taskId));
  return data.tasks.filter((t) => t.sprintId === sprintId || carriedOut.has(t.id) || t.carryOver?.fromSprintId === sprintId);
}

export function buildSprintReport(data: AppData, sprint: Sprint, today: ISODate): SprintReport {
  const running = compareDates(today, sprint.endDate) <= 0;
  const asOf = running ? today : sprint.endDate;
  const workdays = eachDate(sprint.startDate, sprint.endDate).filter((d) => !isWeekend(d));
  const elapsed = workdays.filter((d) => compareDates(d, asOf) <= 0).length;
  const people = new Map(data.people.map((p) => [p.id, p]));

  const planned = sprintTasks(data, sprint.id);
  const dropped = planned.filter((t) => t.status === "dropped");
  const live = planned.filter((t) => t.status !== "dropped");
  const done = live.filter((t) => doneBy(t, asOf));
  const unfinished = live.filter((t) => !doneBy(t, asOf));
  const carried = planned.filter((t) => t.sprintId !== sprint.id || t.carryOver?.fromSprintId === sprint.id);
  const blocked = unfinished.filter((t) => t.status === "blocked");

  // Burndown over estimated days, for tasks that were live in the sprint.
  const total = sum(live);
  const burndown: BurndownPoint[] = workdays.map((d, i) => ({
    date: d,
    remaining: compareDates(d, asOf) <= 0 ? total - sum(live.filter((t) => doneBy(t, d))) : null,
    ideal: workdays.length > 1 ? total * (1 - i / (workdays.length - 1)) : 0,
  }));

  // Check-in rate: people with an active task on each elapsed working day.
  let expected = 0;
  let actual = 0;
  const checkedIn = new Set(data.checkIns.map((c) => `${c.personId}:${c.date}`));
  for (const d of workdays.filter((w) => compareDates(w, asOf) <= 0)) {
    const owners = new Set(
      planned.filter((t) => compareDates(t.startDate, d) <= 0 && (!t.completedDate || compareDates(d, t.completedDate) <= 0) && t.status !== "not_started").map((t) => t.ownerId),
    );
    expected += owners.size;
    actual += [...owners].filter((o) => checkedIn.has(`${o}:${d}`)).length;
  }

  // Blocked days per task, from that sprint's check-in snapshots.
  const blockedDays = new Map<string, number>();
  for (const c of data.checkIns) {
    if (compareDates(c.date, sprint.startDate) < 0 || compareDates(c.date, asOf) > 0) continue;
    for (const u of c.updates) if (u.status === "blocked") blockedDays.set(u.taskId, (blockedDays.get(u.taskId) ?? 0) + 1);
  }
  const longBlocks = planned
    .filter((t) => (blockedDays.get(t.id) ?? 0) >= 2)
    .map((t) => ({ task: t, days: blockedDays.get(t.id)!, waitingOn: t.dependency ? (people.get(t.dependency.personId) ?? null) : null }))
    .sort((a, b) => b.days - a.days);

  const goals: GoalLine[] = data.goals
    .map((goal) => {
      const tasks = planned.filter((t) => t.goalId === goal.id);
      const g = tasks.filter((t) => t.status !== "dropped");
      const nDone = g.filter((t) => doneBy(t, asOf)).length;
      let health: GoalHealth;
      let reason: string | null = null;
      const late = g.filter((t) => !doneBy(t, asOf) && compareDates(t.targetDate, asOf) < 0);
      const isBlocked = g.some((t) => !doneBy(t, asOf) && t.status === "blocked");
      if (g.length && nDone === g.length) health = "done";
      else if (isBlocked) {
        health = "at_risk";
        reason = "Blocked";
      } else if (!running) {
        health = nDone === 0 && g.every((t) => t.status === "not_started") ? "not_started" : "unfinished";
      } else if (late.length) {
        health = "at_risk";
        reason = `${plural(late.length, "task")} past target`;
      } else if (nDone === 0 && g.every((t) => t.status === "not_started")) health = "not_started";
      else health = "on_track";
      return { goal, tasks, done: nDone, health, reason };
    })
    .filter((l) => l.tasks.length > 0)
    .sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || b.tasks.length - a.tasks.length);

  const teams = data.teams
    .map((team) => {
      const mine = live.filter((t) => people.get(t.ownerId)?.teamId === team.id);
      return { team, planned: mine.length, done: mine.filter((t) => doneBy(t, asOf)).length };
    })
    .filter((t) => t.planned > 0);

  return {
    sprint,
    running,
    asOf,
    workdays,
    elapsed,
    planned,
    done,
    unfinished,
    carried,
    dropped,
    blocked,
    plannedDays: total,
    doneDays: sum(done),
    estimate: estimateStats(done),
    onTime: {
      measured: done.length,
      onTime: done.filter((t) => t.completedDate && compareDates(t.completedDate, t.originalTargetDate) <= 0).length,
    },
    checkIns: { expected, actual },
    burndown,
    goals,
    teams,
    longBlocks,
  };
}

const HEALTH_ORDER: Record<GoalHealth, number> = { at_risk: 0, unfinished: 1, on_track: 2, not_started: 3, done: 4 };

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

// ── Retro insights ─────────────────────────────────────────────────────────

export type RetroColumn = "well" | "not_well" | "try";

export interface RetroInsight {
  key: string;
  column: RetroColumn;
  text: string;
}

/** Cards the retro board starts with, written from the sprint's numbers. */
export function retroInsights(r: SprintReport): RetroInsight[] {
  const out: RetroInsight[] = [];
  const add = (column: RetroColumn, key: string, text: string) => out.push({ key, column, text });
  const live = r.planned.length - r.dropped.length;
  const completion = pct(r.done.length, live);

  if (completion >= 70) add("well", "completion", `Finished ${r.done.length} of ${live} tasks (${completion}%).`);
  for (const g of r.goals.filter((g) => g.health === "done" && g.tasks.length >= 2).slice(0, 3)) add("well", `goal-${g.goal.id}`, `“${g.goal.title}”: all ${g.tasks.length} tasks done.`);
  if (r.estimate.measured >= 3 && pct(r.estimate.within, r.estimate.measured) >= 70) {
    add("well", "estimates", `${pct(r.estimate.within, r.estimate.measured)}% of finished tasks landed within their estimate.`);
  }
  if (r.checkIns.expected && pct(r.checkIns.actual, r.checkIns.expected) >= 90) add("well", "checkins", `Check-ins were steady: ${pct(r.checkIns.actual, r.checkIns.expected)}% of working days.`);

  if (!r.running && r.unfinished.length) add("not_well", "unfinished", `${plural(r.unfinished.length, "task")} weren't finished by the end of the sprint (${pct(r.unfinished.length, live)}%).`);
  if (completion < 70 && r.running === false) add("not_well", "completion", `Only ${completion}% of planned tasks got done.`);
  for (const b of r.longBlocks.slice(0, 2)) {
    add("not_well", `block-${b.task.id}`, `“${b.task.title}” was blocked for ${plural(b.days, "day")}${b.waitingOn ? `, waiting on ${firstName(b.waitingOn.name)}` : ""}.`);
  }
  const over = r.done.filter((t) => (actualDays(t) ?? 0) >= 2 * Math.ceil(t.estimate));
  if (over.length >= 2) add("not_well", "overruns", `${plural(over.length, "task")} took at least twice their estimate.`);

  if (r.estimate.ratio !== null && r.estimate.ratio >= 1.3) {
    const small = r.estimate.bySize.find((s) => s.estimate === 0.5 && s.count >= 2 && s.avgActual >= 1);
    add("try", "estimate", small ? "Half-day tasks usually took a full day. Estimate them as 1 day, or split them smaller." : `Tasks took about ${r.estimate.ratio.toFixed(1)}× their estimate. Add a buffer or split big tasks.`);
  }
  if (r.longBlocks.length) add("try", "deps", "Agree a reply time for dependencies, and raise a block at the next stand-up instead of waiting.");
  if (!r.running && r.unfinished.length && live) {
    add("try", "capacity", `About ${formatDays(r.doneDays)} of estimated work got done. Plan the next sprint around that number.`);
  }
  if (out.filter((o) => o.column === "try").length === 0) add("try", "keep", "Keep the same planning size. It worked.");
  return out;
}

export function formatDays(n: number): string {
  const v = Math.round(n * 2) / 2;
  return `${v % 1 === 0 ? v : v.toFixed(1)} ${v === 1 ? "day" : "days"}`;
}

// ── Sprint email ───────────────────────────────────────────────────────────

const HEALTH_LABEL: Record<GoalHealth, string> = {
  done: "Done",
  on_track: "On track",
  at_risk: "At risk",
  unfinished: "Partly done",
  not_started: "Not started",
};
export { HEALTH_LABEL };

/** Label for a goal's line: "Partly done" only when something was finished. */
export function goalLabel(g: GoalLine): string {
  if (g.health === "unfinished") return g.done ? "Partly done" : "Not finished";
  if (g.health === "at_risk" && g.reason) return g.reason;
  return HEALTH_LABEL[g.health];
}

/**
 * A sprint update email in the manager's usual format. Facts from the app are
 * filled in; things the app can't know (release dates, PostHog numbers) are
 * left as [CONFIRM] placeholders.
 */
export function sprintEmailText(r: SprintReport, data: AppData, senderName: string, nextSprint: Sprint | null): string {
  const people = new Map(data.people.map((p) => [p.id, p]));
  const live = r.planned.length - r.dropped.length;
  const contributors = new Set(r.planned.map((t) => t.ownerId)).size;
  const rule = "─────────────────────";
  const section = (title: string) => ["", rule, title, rule];
  const dots = (label: string, value: string) => `${label} ${".".repeat(Math.max(3, 48 - label.length))} ${value}`;

  const lines = ["Hi team,", "", "SUMMARY"];
  lines.push(
    `${r.sprint.name} (${formatRange(r.sprint.startDate, r.sprint.endDate)}) ${r.running ? `is ${r.elapsed} of ${r.workdays.length} working days in` : "has ended"}: ` +
      `${r.done.length} of ${live} planned tasks are done (${pct(r.done.length, live)}%) across ${plural(r.goals.length, "goal")} and ${plural(contributors, "person", "people")}. ` +
      (r.unfinished.length ? `${plural(r.unfinished.length, "task")} ${r.running ? "are still open" : "carry into the next sprint"}` : "Nothing carries over") +
      (r.blocked.length ? `, and ${plural(r.blocked.length, "task")} ${r.blocked.length === 1 ? "is" : "are"} blocked.` : "."),
    "[CONFIRM: release / build status and one-line highlight]",
  );

  lines.push(...section("SPRINT SCORECARD"));
  for (const g of r.goals) lines.push(dots(g.goal.title, `${g.health === "at_risk" ? "At risk" : goalLabel(g)} (${g.done}/${g.tasks.length})${g.reason ? ` · ${g.reason}` : ""}`));

  lines.push(...section("ENGINEERING NUMBERS THAT MATTER"));
  lines.push(
    `- Planned: ${live} tasks, ${formatDays(r.plannedDays)} of estimated work; done: ${r.done.length} tasks, ${formatDays(r.doneDays)}`,
    `- Completion: ${pct(r.done.length, live)}%; carry-over: ${pct(r.unfinished.length, live)}%${r.dropped.length ? `; dropped: ${r.dropped.length}` : ""}`,
  );
  if (r.estimate.measured) {
    lines.push(
      `- Estimates: ${pct(r.estimate.within, r.estimate.measured)}% of finished tasks landed within estimate; on average tasks took ${r.estimate.ratio!.toFixed(1)}× their estimate`,
    );
  }
  lines.push(`- On time: ${pct(r.onTime.onTime, r.onTime.measured)}% of finished tasks met their original target date`);
  if (r.checkIns.expected) lines.push(`- Daily check-ins: ${pct(r.checkIns.actual, r.checkIns.expected)}% of expected working days`);
  for (const b of r.longBlocks.slice(0, 3)) {
    lines.push(`- Blocked ${plural(b.days, "day")}: ${b.task.title}${b.waitingOn ? ` (waiting on ${firstName(b.waitingOn.name)})` : ""}`);
  }
  lines.push("- [CONFIRM: commits, contributors and production release date]");

  lines.push(...section("APP GROWTH & ENGAGEMENT"));
  lines.push("[CONFIRM: installs, active users and feature usage from PostHog]");

  lines.push(...section("GOAL DETAIL"));
  r.goals.forEach((g, i) => {
    const owners = [...new Set(g.tasks.map((t) => t.ownerId))].map((id) => firstName(people.get(id)?.name ?? "")).filter(Boolean);
    lines.push(`${i + 1}. ${g.goal.title} (${owners.join(", ")}) - ${g.health === "at_risk" ? "At risk" : goalLabel(g)}${g.reason ? `: ${g.reason}` : ""}`);
    const doneT = g.tasks.filter((t) => doneBy(t, r.asOf));
    const openT = g.tasks.filter((t) => !doneBy(t, r.asOf) && t.status !== "dropped");
    if (doneT.length) lines.push(`   Done: ${doneT.map((t) => t.title).join("; ")}.`);
    if (openT.length) lines.push(`   Still open: ${openT.map((t) => `${t.title}${t.status === "blocked" ? " (blocked)" : ""}`).join("; ")}.`);
    const why = g.goal.notes.split(/\n|\. /)[0]?.trim();
    if (why) lines.push(`   Why it matters: ${why}`);
  });

  lines.push("", rule);
  const next = r.unfinished.slice(0, 6).map((t) => t.title);
  lines.push(
    `Next sprint${nextSprint ? ` (${nextSprint.name}, ${formatShort(nextSprint.startDate)} – ${formatShort(nextSprint.endDate)})` : ""}: ` +
      (next.length ? `finish ${next.join("; ")}${r.unfinished.length > next.length ? `; and ${r.unfinished.length - next.length} more` : ""}. ` : "") +
      "[CONFIRM: new priorities]",
  );
  lines.push("", "Best regards,", senderName);
  return lines.join("\n");
}
