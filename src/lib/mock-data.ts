import { DEMO_TODAY } from "./config";
import { addWorkdays, compareDates, eachDate, isWeekend } from "./dates";
import { SHEET_GOALS, SHEET_ROWS, type GoalKey, type SheetRow, type SheetSprint } from "./seed/sprint-sheet";
import type { AppData, CheckIn, Dependency, Goal, ISODate, Person, Sprint, Task, TaskEvent, TaskStatus, Team, TaskUpdateSnapshot } from "./types";

/**
 * Sample data built from the team's sprint sheet (./seed/sprint-sheet.ts).
 *
 * The sheet records owner, goal, estimate, status, start and done dates, but
 * not daily updates or target dates, so the builder derives them:
 * - Target date: the start date plus the estimate in working days.
 * - Check-ins: one per person per working day they had an active task, with
 *   neutral progress text ("Started.", "In progress.", "Done."). Open tasks
 *   keep appearing daily up to DEMO_TODAY.
 * - History events: created, started (or blocked) and done, on those dates.
 * - Sprint: the fortnight containing the start date.
 */

export const seedTeams: Team[] = [
  { id: "team-hardware", name: "Hardware" },
  { id: "team-firmware", name: "Firmware" },
  { id: "team-mechanical", name: "Mechanical" },
  { id: "team-ai", name: "AI" },
  { id: "team-software", name: "Software" },
  { id: "team-product", name: "Product" },
  { id: "team-design", name: "Design" },
];

export const seedPeople: Person[] = [
  { id: "p-vinayak", name: "Vinayak", teamId: "team-hardware", accent: "carbon" },
  { id: "p-vaishak", name: "Vaishak", teamId: "team-firmware", accent: "plasma" },
  { id: "p-vasanth", name: "Vasanth", teamId: "team-mechanical", accent: "reef" },
  { id: "p-surya", name: "Surya", teamId: "team-ai", accent: "moss" },
  { id: "p-rupam", name: "Rupam", teamId: "team-software", accent: "reef", canManageSprints: true },
  { id: "p-kunal", name: "Kunal", teamId: "team-software", accent: "plasma" },
  { id: "p-abhinav", name: "Abhinav", teamId: "team-software", accent: "moss" },
  { id: "p-aarthi", name: "Aarthi", teamId: "team-software", accent: "gold", avatarUrl: "/avatars/aarthi.jpg" },
  { id: "p-shreya", name: "Shreya", teamId: "team-software", accent: "carbon" },
  { id: "p-pritam", name: "Pritam", teamId: "team-software", accent: "gold" },
  { id: "p-tanya", name: "Tanya", teamId: "team-product", accent: "reef" },
  { id: "p-pranjal", name: "Pranjal", teamId: "team-product", accent: "plasma" },
  { id: "p-sanyukta", name: "Sanyukta", teamId: "team-design", accent: "gold" },
];

/**
 * Fortnights as the manager set them in the sheet's sprint list. The sheet's
 * "Sep 21 – Oct 2" overlapped Sep 11 – 24, so the next fortnights continue
 * from Sep 25 instead.
 */
export const seedSprints: Sprint[] = [
  { id: "s-1", name: "Sprint 1", startDate: "2026-07-17", endDate: "2026-07-30" },
  { id: "s-2", name: "Sprint 2", startDate: "2026-07-31", endDate: "2026-08-13" },
  { id: "s-3", name: "Sprint 3", startDate: "2026-08-14", endDate: "2026-08-27" },
  { id: "s-4", name: "Sprint 4", startDate: "2026-08-28", endDate: "2026-09-10" },
  { id: "s-5", name: "Sprint 5", startDate: "2026-09-11", endDate: "2026-09-24" },
  { id: "s-6", name: "Sprint 6", startDate: "2026-09-25", endDate: "2026-10-08" },
  { id: "s-7", name: "Sprint 7", startDate: "2026-10-09", endDate: "2026-10-22" },
];

const SHEET_SPRINT_START: Record<SheetSprint, ISODate> = { aug28: "2026-08-28", sep11: "2026-09-11", sep21: "2026-09-25" };

const CHECK_IN_TIMES: Record<string, [number, number]> = {
  "p-pritam": [8, 52],
  "p-rupam": [9, 4],
  "p-tanya": [9, 12],
  "p-vaishak": [9, 15],
  "p-pranjal": [9, 18],
  "p-abhinav": [9, 21],
  "p-vinayak": [9, 27],
  "p-surya": [9, 33],
  "p-vasanth": [9, 38],
  "p-kunal": [9, 41],
  "p-shreya": [9, 44],
  "p-aarthi": [9, 48],
  "p-sanyukta": [10, 2],
};

function checkInTime(personId: string, date: ISODate): string {
  const [h, m] = CHECK_IN_TIMES[personId] ?? [9, 30];
  const minutes = Math.min(59, m + (Number(date.slice(-2)) % 5));
  return `${date}T${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function sprintIdFor(date: ISODate): string {
  const s = seedSprints.find((sp) => sp.startDate <= date && date <= sp.endDate) ?? seedSprints.find((sp) => sp.startDate > date);
  return (s ?? seedSprints[seedSprints.length - 1]).id;
}

const goalId = (key: GoalKey) => `g-${key}`;

export function buildSeedData(): AppData {
  const tasks: Task[] = [];
  const events: TaskEvent[] = [];
  const checkIns = new Map<string, CheckIn>();
  const goalStarts = new Map<GoalKey, ISODate>();
  let seq = 0;
  const event = (e: Omit<TaskEvent, "id">) => events.push({ ...e, id: `e-${String(++seq).padStart(4, "0")}` });

  const dayEntry = (personId: string, date: ISODate): CheckIn => {
    const key = `${personId}:${date}`;
    let ci = checkIns.get(key);
    if (!ci) {
      ci = { id: `c-${personId.slice(2)}-${date}`, personId, date, submittedAt: checkInTime(personId, date), editedAt: null, note: "", updates: [] };
      checkIns.set(key, ci);
    }
    return ci;
  };

  SHEET_ROWS.forEach((row: SheetRow, i) => {
    const id = `t-${String(i + 1).padStart(3, "0")}`;
    // A done date after the demo's today hasn't happened yet: show the task as still in progress.
    const status: TaskStatus = row.status === "done" && row.done && compareDates(row.done, DEMO_TODAY) > 0 ? "in_progress" : row.status;
    const notStarted = status === "not_started";
    // Not-started rows are planned for the next working day; other rows without a date use their sprint's start.
    const start = row.start ?? (notStarted ? addWorkdays(DEMO_TODAY, 1) : SHEET_SPRINT_START[row.sprint]);
    const done = status === "done" ? (row.done ?? start) : null;
    const target = addWorkdays(start, Math.ceil(row.est) - 1);
    const createdOn = notStarted ? SHEET_SPRINT_START[row.sprint] : start;
    const dependency: Dependency | null =
      row.dep ?? (row.support && row.support !== row.owner ? { personId: row.support, description: "Supporting this task" } : null);
    const links = (row.links ?? []).map((l, k) => ({ ...l, id: `${id}-link-${k + 1}` }));

    const g = row.goal;
    if (!goalStarts.has(g) || compareDates(createdOn, goalStarts.get(g)!) < 0) goalStarts.set(g, createdOn);

    event({ taskId: id, type: "created", at: `${createdOn}T09:00`, actorId: row.owner, from: null, to: null, note: `Estimated ${row.est} ${row.est === 1 ? "day" : "days"}, target ${target}` });

    const workingStatus: TaskStatus = status === "blocked" ? "blocked" : "in_progress";
    if (!notStarted) {
      event({ taskId: id, type: "status_changed", at: checkInTime(row.owner, start), actorId: row.owner, from: "not_started", to: workingStatus, note: status === "blocked" ? (row.notes ?? null) : null });
      if (dependency) event({ taskId: id, type: "dependency_changed", at: checkInTime(row.owner, start), actorId: row.owner, from: null, to: dependency.personId, note: dependency.description });
    }
    if (done) {
      const at = checkInTime(row.owner, done);
      if (dependency) event({ taskId: id, type: "dependency_changed", at, actorId: row.owner, from: dependency.personId, to: null, note: "Dependency resolved" });
      event({ taskId: id, type: "status_changed", at, actorId: row.owner, from: workingStatus, to: "done", note: null });
      for (const l of links) event({ taskId: id, type: "link_added", at, actorId: row.owner, from: null, to: l.url, note: l.label });
    }

    // Daily check-in snapshots while the task was active (weekdays, plus its start and done days).
    if (!notStarted) {
      const last = done ?? DEMO_TODAY;
      for (const date of eachDate(start, compareDates(last, DEMO_TODAY) > 0 ? DEMO_TODAY : last)) {
        if (isWeekend(date) && date !== start && date !== done) continue;
        const isDone = date === done;
        const dayStatus: TaskStatus = isDone ? "done" : workingStatus;
        let progress: string;
        if (isDone) progress = row.result ? `Done. ${row.result}` : "Done.";
        else if (dayStatus === "blocked") progress = date === start ? `Blocked. ${row.notes ?? ""}`.trim() : "Still blocked.";
        else progress = date === start ? "Started." : "In progress.";
        const snapshot: TaskUpdateSnapshot = {
          taskId: id,
          taskTitle: row.title,
          goalId: goalId(g),
          status: dayStatus,
          estimate: row.est,
          targetDate: target,
          progress,
          dependency: isDone ? null : dependency,
          supportNeeded: dayStatus === "blocked" ? (row.notes ?? "") : "",
        };
        dayEntry(row.owner, date).updates.push(snapshot);
      }
    }

    tasks.push({
      id,
      goalId: goalId(g),
      ownerId: row.owner,
      sprintId: sprintIdFor(start),
      title: row.title,
      notes: row.notes ?? "",
      estimate: row.est,
      startDate: start,
      originalTargetDate: target,
      targetDate: target,
      completedDate: done,
      status,
      priority: null,
      dependency: done ? null : dependency,
      links,
      carryOver: null,
      dropReason: null,
      createdAt: `${createdOn}T09:00`,
    });
  });

  assignDemoPriorities(tasks);

  const goals: Goal[] = (Object.keys(SHEET_GOALS) as GoalKey[])
    .filter((k) => goalStarts.has(k))
    .map((k) => ({
      id: goalId(k),
      title: SHEET_GOALS[k].title,
      notes: SHEET_GOALS[k].notes ?? "",
      links: [],
      targetDate: null,
      createdById: SHEET_GOALS[k].createdBy,
      createdAt: `${goalStarts.get(k)}T08:30`,
    }));

  return {
    teams: seedTeams,
    people: seedPeople,
    sprints: seedSprints,
    goals,
    tasks,
    checkIns: [...checkIns.values()],
    events,
    meetingNotes: [],
    retroCards: [
      { id: "r-1", sprintId: "s-5", column: "well", text: "Pairing on the SOS screens made the poster flow land fast.", authorId: "p-aarthi", votes: ["p-shreya", "p-rupam"], createdAt: "2026-09-24T17:10" },
      { id: "r-2", sprintId: "s-5", column: "not_well", text: "Pet tag pricing waited on business inputs for weeks.", authorId: "p-kunal", votes: ["p-rupam", "p-abhinav", "p-tanya"], createdAt: "2026-09-24T17:12" },
      { id: "r-3", sprintId: "s-5", column: "try", text: "Share Figma links in the task before it starts.", authorId: "p-pritam", votes: ["p-aarthi"], createdAt: "2026-09-24T17:15" },
    ],
  };
}

/**
 * Demo priorities (the sprint sheet has none). Each person's tasks that start on
 * the same day get a stable, pseudo-random mix of P0–P3, always with one P0 and
 * never a level above the number of tasks that day. A lone task is P0.
 */
function assignDemoPriorities(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = `${t.ownerId}:${t.startDate}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (const group of groups.values()) {
    group.sort((a, b) => a.estimate - b.estimate || a.id.localeCompare(b.id));
    const top = Math.min(group.length - 1, 3);
    group.forEach((t, i) => {
      t.priority = (i === 0 ? 0 : hash(t.id) % (top + 1)) as Task["priority"];
    });
  }
}
