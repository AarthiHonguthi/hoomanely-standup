import { compareDates, datePart, formatLong, formatShort, formatWeekday, isWeekend } from "../dates";
import type { AppData, CheckIn, ISODate, Person, Task, TaskUpdateSnapshot, Team } from "../types";
import { firstName, plural } from "../utils";
import { sortPeople } from "./selectors";

/**
 * Stand-up meeting notes, generated from one day's check-ins.
 *
 * Nothing here is written by hand: the notes are rebuilt from the check-in
 * snapshots and the task change log, so they always match what people
 * recorded. Past notes never change when tasks are edited later.
 */

export interface NoteItem {
  person: Person;
  update: TaskUpdateSnapshot;
}

export interface MovedItem {
  person: Person;
  task: Task;
  kind: "target" | "carried";
  from: string | null;
  to: string | null;
  note: string | null;
}

export interface PersonNotes {
  person: Person;
  checkIn: CheckIn;
}

export interface StandupNotes {
  date: ISODate;
  /** People expected at stand-up: anyone with a task active that day. */
  expected: Person[];
  checkedIn: Person[];
  missing: Person[];
  done: NoteItem[];
  inProgress: NoteItem[];
  blocked: NoteItem[];
  /** Updates that depend on someone else (not blocked). */
  support: NoteItem[];
  moved: MovedItem[];
  teams: { team: Team; people: PersonNotes[] }[];
}

/** "Friday, 25 Sep 2026" */
export function dayTitle(date: ISODate): string {
  return `${formatWeekday(date)}, ${formatLong(date)}`;
}

/** Number of check-ins per date, for marking stand-up days on the calendar. */
export function standupCounts(data: AppData): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  for (const c of data.checkIns) out.set(c.date, (out.get(c.date) ?? 0) + 1);
  return out;
}

function activeOn(t: Task, d: ISODate): boolean {
  if (compareDates(t.startDate, d) > 0) return false;
  if (t.completedDate && compareDates(t.completedDate, d) < 0) return false;
  if (t.status === "dropped") return false;
  return true;
}

export function buildStandupNotes(data: AppData, date: ISODate): StandupNotes {
  const people = new Map(data.people.map((p) => [p.id, p]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const checkIns = data.checkIns.filter((c) => c.date === date);
  const byPerson = new Map(checkIns.map((c) => [c.personId, c]));

  const checkedIn = sortPeople(checkIns.map((c) => people.get(c.personId)).filter((p): p is Person => Boolean(p)));
  const expectedIds = new Set(isWeekend(date) ? [] : data.tasks.filter((t) => activeOn(t, date)).map((t) => t.ownerId));
  for (const p of checkedIn) expectedIds.add(p.id);
  const expected = sortPeople(data.people.filter((p) => expectedIds.has(p.id)));
  const missing = expected.filter((p) => !byPerson.has(p.id));

  const items: NoteItem[] = checkedIn.flatMap((person) => byPerson.get(person.id)!.updates.map((update) => ({ person, update })));

  const moved: MovedItem[] = [];
  for (const e of data.events) {
    if (datePart(e.at) !== date || (e.type !== "target_date_changed" && e.type !== "carried_over")) continue;
    const task = tasks.get(e.taskId);
    const person = task && people.get(task.ownerId);
    if (!task || !person) continue;
    moved.push({ person, task, kind: e.type === "carried_over" ? "carried" : "target", from: e.from, to: e.to, note: e.note });
  }

  const teams = data.teams
    .map((team) => ({ team, people: checkedIn.filter((p) => p.teamId === team.id).map((person) => ({ person, checkIn: byPerson.get(person.id)! })) }))
    .filter((t) => t.people.length > 0);

  return {
    date,
    expected,
    checkedIn,
    missing,
    done: items.filter((i) => i.update.status === "done"),
    inProgress: items.filter((i) => i.update.status === "in_progress"),
    blocked: items.filter((i) => i.update.status === "blocked"),
    support: items.filter((i) => i.update.status !== "blocked" && i.update.dependency),
    moved,
    teams,
  };
}

/**
 * Meeting notes as text, the shape a recording pipeline would also produce.
 *
 * Text may contain mentions: "@{personId}" for a person and "#{taskId}" for a
 * task. The page highlights them; the plain-text copy swaps in the names.
 */
export interface MeetingNotes {
  date: ISODate;
  source: "check-ins" | "recording";
  attendees: string[];
  absent: string[];
  summary: string;
  points: string[];
  actionItems: { text: string; done: boolean }[];
  /** Set when someone edited the generated notes by hand. */
  edited: { byId: string; at: string } | null;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const tasksRef = (items: TaskUpdateSnapshot[]) => list(items.map((u) => `#{${u.taskId}}`));

/** Writes the day's meeting notes from its check-ins (stand-in until recordings are connected). */
export function buildMeetingNotes(data: AppData, date: ISODate): MeetingNotes {
  const n = buildStandupNotes(data, date);
  const sprintName = (id: string | null) => data.sprints.find((s) => s.id === id)?.name ?? "a later sprint";

  const summary: string[] = [`${n.checkedIn.length} of ${n.expected.length} people checked in`];
  if (n.missing.length) summary[0] += `; no update from ${list(n.missing.map((p) => `@{${p.id}}`))}`;
  summary[0] += ".";
  summary.push(`${plural(n.done.length, "task")} finished and ${n.inProgress.length} in progress.`);
  if (n.blocked.length) summary.push(`${n.blocked.length === 1 ? "One blocker" : `${n.blocked.length} blockers`}: ${list(n.blocked.map((i) => `#{${i.update.taskId}} (@{${i.person.id}})`))}.`);
  else summary.push("No blockers.");

  const points = n.teams.flatMap(({ people }) =>
    people.map(({ person, checkIn }) => {
      const by = (st: TaskUpdateSnapshot["status"]) => checkIn.updates.filter((u) => u.status === st);
      const clauses: string[] = [];
      if (by("done").length) clauses.push(`finished ${tasksRef(by("done"))}`);
      if (by("in_progress").length) clauses.push(`is working on ${tasksRef(by("in_progress"))}`);
      if (by("not_started").length) clauses.push(`will pick up ${tasksRef(by("not_started"))}`);
      for (const u of by("blocked")) clauses.push(`is blocked on #{${u.taskId}}${u.supportNeeded ? ` (${u.supportNeeded.replace(/\.$/, "")})` : ""}`);
      if (by("dropped").length) clauses.push(`dropped ${tasksRef(by("dropped"))}`);
      for (const m of n.moved.filter((m) => m.person.id === person.id)) {
        clauses.push(
          m.kind === "carried"
            ? `carried #{${m.task.id}} over to ${sprintName(m.to)}`
            : `moved the target of #{${m.task.id}} from ${m.from ? formatShort(m.from) : "?"} to ${m.to ? formatShort(m.to) : "?"}`,
        );
      }
      let text = `@{${person.id}} ${list(clauses)}.`;
      if (checkIn.note) text += ` ${checkIn.note}`;
      return text;
    }),
  );

  const actionItems = [...n.blocked, ...n.support].map((i): { text: string; done: boolean } => {
    const dep = i.update.dependency;
    const text = dep
      ? `@{${dep.personId}} to help @{${i.person.id}} with #{${i.update.taskId}}: ${dep.description.replace(/\.$/, "")}.`
      : `@{${i.person.id}} to get #{${i.update.taskId}} unblocked${i.update.supportNeeded ? `: ${i.update.supportNeeded.replace(/\.$/, "")}` : ""}.`;
    return { text, done: false };
  });
  const saved = data.meetingNotes.find((m) => m.date === date);

  return {
    date,
    source: "check-ins",
    attendees: n.checkedIn.map((p) => p.id),
    absent: n.missing.map((p) => p.id),
    summary: saved ? saved.summary : summary.join(" "),
    points: saved ? saved.points : points,
    actionItems: saved ? saved.actionItems : actionItems,
    edited: saved ? { byId: saved.editedById, at: saved.editedAt } : null,
  };
}

/** Splits text into plain parts and @person / #task mentions. */
export function parseMentions(text: string): ({ kind: "text"; value: string } | { kind: "person" | "task"; id: string })[] {
  const out: ({ kind: "text"; value: string } | { kind: "person" | "task"; id: string })[] = [];
  const re = /([@#])\{([^}]+)\}/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: m[1] === "@" ? "person" : "task", id: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** Plain-text version of the notes, for pasting into Slack or a doc. */
export function meetingNotesText(notes: MeetingNotes, data: AppData): string {
  const plain = (text: string) =>
    parseMentions(text)
      .map((p) =>
        p.kind === "text"
          ? p.value
          : p.kind === "person"
            ? firstName(data.people.find((x) => x.id === p.id)?.name ?? "Someone")
            : `“${data.tasks.find((t) => t.id === p.id)?.title ?? "a task"}”`,
      )
      .join("");
  const names = (ids: string[]) => ids.map((id) => plain(`@{${id}}`)).join(", ");
  const lines = [`Stand-up · ${dayTitle(notes.date)}`, "", `Attendees: ${names(notes.attendees)}`];
  if (notes.absent.length) lines.push(`Absent: ${names(notes.absent)}`);
  lines.push("", "Summary", plain(notes.summary), "", "Discussion", ...notes.points.map((p) => `- ${plain(p)}`));
  if (notes.actionItems.length) lines.push("", "Action items", ...notes.actionItems.map((a) => `- [${a.done ? "x" : " "}] ${plain(a.text)}`));
  return lines.join("\n");
}

// ── Editing ────────────────────────────────────────────────────────────────
// The editor shows readable text ("@Aarthi", task titles). Saving turns
// "@Name" back into person mentions and the day's task titles back into links.

/** Mention text → what the editor shows. */
export function toEditableText(text: string, data: AppData): string {
  return parseMentions(text)
    .map((p) =>
      p.kind === "text"
        ? p.value
        : p.kind === "person"
          ? `@${firstName(data.people.find((x) => x.id === p.id)?.name ?? "Someone")}`
          : (data.tasks.find((t) => t.id === p.id)?.title ?? "a task"),
    )
    .join("");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Editor text → mention text. `taskIds` are the tasks whose titles become links again. */
export function fromEditableText(text: string, data: AppData, taskIds: string[]): string {
  let out = text;
  const titles = taskIds
    .map((id) => data.tasks.find((t) => t.id === id))
    .filter((t): t is Task => Boolean(t))
    .sort((a, b) => b.title.length - a.title.length);
  // Longest titles first, and never inside an existing mention.
  for (const t of titles) out = out.replace(new RegExp(`(?<![@#]\\{[^}]*)${escapeRe(t.title)}`, "g"), `#{${t.id}}`);
  for (const p of data.people) {
    out = out.replace(new RegExp(`@${escapeRe(firstName(p.name))}\\b`, "gi"), `@{${p.id}}`);
  }
  return out;
}

/** Tasks that appear in a day's check-ins, for turning titles back into links. */
export function taskIdsOn(data: AppData, date: ISODate): string[] {
  return [...new Set(data.checkIns.filter((c) => c.date === date).flatMap((c) => c.updates.map((u) => u.taskId)))];
}
