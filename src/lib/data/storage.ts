import { SCHEMA_VERSION, STORAGE_KEY } from "../config";
import { isValidISODate } from "../dates";
import { buildSeedData } from "../mock-data";
import { TASK_STATUSES, type AppData } from "../types";
import { isEstimate, isValidAvatarUrl, validateUrl } from "../validation";

/**
 * localStorage persistence for demo edits. Stored as
 *   { schemaVersion: number, savedAt: string, data: AppData }
 * Anything missing, unparsable, from another schema version or structurally
 * inconsistent falls back to fresh seed data and reports why.
 */

export type LoadResult =
  | { status: "fresh"; data: AppData }
  | { status: "restored"; data: AppData }
  | { status: "recovered"; data: AppData; reason: string };

interface StoredEnvelope {
  schemaVersion: number;
  savedAt: string;
  data: AppData;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Links must be objects with an http(s) URL; anything else (e.g. javascript:) is rejected. */
function validLinks(links: unknown): boolean {
  return Array.isArray(links) && links.every((l) => isObj(l) && isStr(l.id) && isStr(l.label) && isStr(l.url) && validateUrl(l.url) === null);
}

/** Returns a description of the first problem found, or null when valid. */
export function findDataProblem(data: unknown): string | null {
  if (!isObj(data)) return "data is not an object";
  const keys = ["teams", "people", "sprints", "goals", "tasks", "checkIns", "events", "meetingNotes", "retroCards"] as const;
  for (const k of keys) if (!Array.isArray(data[k])) return `missing ${k}`;
  const d = data as unknown as AppData;

  const teams = new Set<string>();
  for (const t of d.teams) {
    if (!isObj(t) || !isStr(t.id) || !isStr(t.name)) return "invalid team";
    teams.add(t.id);
  }
  if (d.people.length === 0) return "no people";
  const people = new Set<string>();
  for (const p of d.people) {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.name) || !teams.has(p.teamId)) return "invalid person";
    if (p.avatarUrl != null && !isValidAvatarUrl(p.avatarUrl)) return "invalid profile photo";
    people.add(p.id);
  }
  const sprints = new Set<string>();
  for (const s of d.sprints) {
    if (!isObj(s) || !isStr(s.id) || !isValidISODate(s.startDate) || !isValidISODate(s.endDate)) return "invalid sprint";
    sprints.add(s.id);
  }
  const goals = new Set<string>();
  for (const g of d.goals) {
    if (!isObj(g) || !isStr(g.id) || !isStr(g.title) || !isStr(g.notes)) return "invalid goal";
    if (g.targetDate !== null && !isValidISODate(g.targetDate)) return "invalid goal date";
    if (!validLinks(g.links)) return "invalid goal links";
    goals.add(g.id);
  }
  const tasks = new Set<string>();
  for (const t of d.tasks) {
    if (!isObj(t) || !isStr(t.id) || !isStr(t.title) || !isStr(t.notes)) return "invalid task";
    if (!goals.has(t.goalId) || !people.has(t.ownerId) || !sprints.has(t.sprintId)) return `task ${t.id} has broken references`;
    if (!isEstimate(t.estimate)) return `task ${t.id} has an invalid estimate`;
    if (!(TASK_STATUSES as readonly string[]).includes(t.status)) return `task ${t.id} has an invalid status`;
    if (![t.startDate, t.originalTargetDate, t.targetDate].every(isValidISODate)) return `task ${t.id} has invalid dates`;
    if (t.completedDate !== null && !isValidISODate(t.completedDate)) return `task ${t.id} has an invalid completion date`;
    if (!validLinks(t.links)) return `task ${t.id} has invalid links`;
    if (t.priority !== null && ![0, 1, 2, 3].includes(t.priority)) return `task ${t.id} has an invalid priority`;
    if (t.dependency !== null && (!isObj(t.dependency) || !people.has(t.dependency.personId))) return `task ${t.id} has an invalid dependency`;
    tasks.add(t.id);
  }
  const checkInKeys = new Set<string>();
  for (const c of d.checkIns) {
    if (!isObj(c) || !isStr(c.id) || !people.has(c.personId) || !isValidISODate(c.date) || !isStr(c.submittedAt)) return "invalid check-in";
    if (!Array.isArray(c.updates)) return "invalid check-in updates";
    const key = `${c.personId}:${c.date}`;
    if (checkInKeys.has(key)) return "duplicate check-in";
    checkInKeys.add(key);
    for (const u of c.updates) {
      if (!isObj(u) || !tasks.has(u.taskId) || !isStr(u.progress) || !(TASK_STATUSES as readonly string[]).includes(u.status)) return "invalid task update";
    }
  }
  for (const e of d.events) {
    if (!isObj(e) || !isStr(e.id) || !tasks.has(e.taskId) || !isStr(e.type) || !isStr(e.at)) return "invalid history event";
  }
  const noteDates = new Set<string>();
  for (const m of d.meetingNotes) {
    if (!isObj(m) || !isValidISODate(m.date) || noteDates.has(m.date) || !isStr(m.summary) || !people.has(m.editedById) || !isStr(m.editedAt)) return "invalid meeting notes";
    if (!Array.isArray(m.points) || !m.points.every(isStr)) return "invalid meeting notes";
    if (!Array.isArray(m.actionItems) || !m.actionItems.every((a) => isObj(a) && isStr(a.text) && typeof a.done === "boolean")) return "invalid meeting notes";
    noteDates.add(m.date);
  }
  for (const r of d.retroCards) {
    if (!isObj(r) || !isStr(r.id) || !sprints.has(r.sprintId) || !people.has(r.authorId) || !isStr(r.text) || !isStr(r.createdAt)) return "invalid retro card";
    if (!["well", "not_well", "try"].includes(r.column) || !Array.isArray(r.votes) || !r.votes.every((v) => people.has(v))) return "invalid retro card";
  }
  return null;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadData(): LoadResult {
  const store = storage();
  let raw: string | null = null;
  try {
    raw = store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (!raw) return { status: "fresh", data: buildSeedData() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "recovered", data: buildSeedData(), reason: "Saved demo data was unreadable." };
  }
  if (!isObj(parsed) || typeof parsed.schemaVersion !== "number") {
    return { status: "recovered", data: buildSeedData(), reason: "Saved demo data had an unknown format." };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return {
      status: "recovered",
      data: buildSeedData(),
      reason: `Saved demo data was from an incompatible version (v${parsed.schemaVersion}).`,
    };
  }
  const problem = findDataProblem(parsed.data);
  if (problem) return { status: "recovered", data: buildSeedData(), reason: `Saved demo data was inconsistent (${problem}).` };
  return { status: "restored", data: parsed.data as AppData };
}

export function saveData(data: AppData): boolean {
  const store = storage();
  if (!store) return false;
  const envelope: StoredEnvelope = { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), data };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** Removes saved demo data only. Theme and current-user preferences are untouched. */
export function clearData() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: storage may be unavailable (private mode, blocked site data).
  }
}
