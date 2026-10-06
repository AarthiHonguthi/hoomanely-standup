import { STATUS_LABELS } from "../config";
import { isValidAvatarUrl } from "../validation";
import { openTasksOnDay } from "./selectors";
import type {
  AppData,
  CheckIn,
  Dependency,
  Estimate,
  Goal,
  ISODate,
  ISODateTime,
  MeetingNotesEdit,
  RetroCard,
  PriorityLevel,
  ResultLink,
  Sprint,
  Task,
  TaskEvent,
  TaskStatus,
  TaskUpdateSnapshot,
} from "../types";

/**
 * Pure state transitions for the local demo. Each takes the current AppData
 * and returns a new AppData. A backend implementation would perform the same
 * operations server-side; the store is the only caller.
 */

export class OperationError extends Error {}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export interface Ctx {
  actorId: string;
  today: ISODate;
  at: ISODateTime;
}

function event(taskId: string, ctx: Ctx, type: TaskEvent["type"], from: string | null, to: string | null, note: string | null = null): TaskEvent {
  return { id: newId("e"), taskId, type, at: ctx.at, actorId: ctx.actorId, from, to, note };
}

function requireTask(data: AppData, taskId: string): Task {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) throw new OperationError("That task no longer exists.");
  return task;
}

function assertOwner(task: Task, ctx: Ctx) {
  if (task.ownerId !== ctx.actorId) throw new OperationError("Only the task owner can change this task.");
}

// ── Goals ──────────────────────────────────────────────────────────────────

export interface NewGoal {
  title: string;
  notes: string;
  links: Omit<ResultLink, "id">[];
  targetDate: ISODate | null;
}

/** Trims links and fills in a name from the web address when none was given. */
function cleanLinks(links: (Omit<ResultLink, "id"> & { id?: string })[]): ResultLink[] {
  return links
    .filter((l) => l.url.trim())
    .map((l) => {
      const url = l.url.trim();
      let label = l.label.trim();
      if (!label) {
        try {
          label = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          label = url;
        }
      }
      return { id: l.id ?? newId("l"), label, url };
    });
}

export function createGoal(data: AppData, input: NewGoal, ctx: Ctx): { data: AppData; goal: Goal } {
  const goal: Goal = {
    id: newId("g"),
    title: input.title.trim(),
    notes: input.notes.trim(),
    links: cleanLinks(input.links),
    targetDate: input.targetDate || null,
    createdById: ctx.actorId,
    createdAt: ctx.at,
  };
  return { data: { ...data, goals: [...data.goals, goal] }, goal };
}

export interface GoalPatch {
  title: string;
  notes: string;
  links: (Omit<ResultLink, "id"> & { id?: string })[];
  targetDate: ISODate | null;
}

/** Only the goal's creator can edit it (a frontend rule, not security). */
export function updateGoal(data: AppData, goalId: string, patch: GoalPatch, ctx: Ctx): AppData {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) throw new OperationError("That goal no longer exists.");
  if (goal.createdById !== ctx.actorId) throw new OperationError("Only the person who created this goal can edit it.");
  const next: Goal = { ...goal, title: patch.title.trim(), notes: patch.notes.trim(), links: cleanLinks(patch.links), targetDate: patch.targetDate || null };
  return { ...data, goals: data.goals.map((g) => (g.id === goalId ? next : g)) };
}

// ── People ─────────────────────────────────────────────────────────────────

/** Sets or clears the signed-in person's own profile photo. */
export function setAvatar(data: AppData, personId: string, avatarUrl: string | null, ctx: Ctx): AppData {
  if (personId !== ctx.actorId) throw new OperationError("You can only change your own profile photo.");
  if (avatarUrl !== null && !isValidAvatarUrl(avatarUrl)) throw new OperationError("That image couldn't be used. Try a PNG or JPG under 5 MB.");
  return { ...data, people: data.people.map((p) => (p.id === personId ? { ...p, avatarUrl } : p)) };
}

// ── Sprints ────────────────────────────────────────────────────────────────

/** Replaces the sprint timeline. Only people allowed to manage sprints can do this (frontend rule). */
export function saveSprints(data: AppData, sprints: Sprint[], ctx: Ctx): AppData {
  const actor = data.people.find((p) => p.id === ctx.actorId);
  if (!actor?.canManageSprints) throw new OperationError("Only the sprint owner can change the sprint timeline.");
  const ids = new Set(sprints.map((s) => s.id));
  const orphan = data.tasks.find((t) => !ids.has(t.sprintId) || (t.carryOver && (!ids.has(t.carryOver.fromSprintId) || !ids.has(t.carryOver.toSprintId))));
  if (orphan) throw new OperationError(`“${orphan.title}” belongs to a sprint you removed. Keep that sprint.`);
  return { ...data, sprints: sprints.map((s) => ({ ...s, name: s.name.trim() })) };
}

// ── Stand-up notes ─────────────────────────────────────────────────────────

export interface MeetingNotesInput {
  date: ISODate;
  summary: string;
  points: string[];
  actionItems: { text: string; done: boolean }[];
}

/** Saves hand edits to a day's stand-up notes. Anyone on the team can edit them. */
export function saveMeetingNotes(data: AppData, input: MeetingNotesInput, ctx: Ctx): AppData {
  const summary = input.summary.trim();
  const points = input.points.map((p) => p.trim()).filter(Boolean);
  const actionItems = input.actionItems.map((a) => ({ text: a.text.trim(), done: a.done })).filter((a) => a.text);
  if (!summary && !points.length && !actionItems.length) throw new OperationError("The notes are empty. Add a summary or a point, or reset to the generated notes.");
  if (summary.length > 4000 || points.some((p) => p.length > 2000) || actionItems.some((a) => a.text.length > 1000)) throw new OperationError("The notes are too long.");
  const edit: MeetingNotesEdit = { date: input.date, summary, points, actionItems, editedById: ctx.actorId, editedAt: ctx.at };
  return { ...data, meetingNotes: [...data.meetingNotes.filter((m) => m.date !== input.date), edit] };
}

/** Drops hand edits so the day's notes are generated again. */
export function resetMeetingNotes(data: AppData, date: ISODate): AppData {
  return { ...data, meetingNotes: data.meetingNotes.filter((m) => m.date !== date) };
}

// ── Retro board ────────────────────────────────────────────────────────────

export function addRetroCard(data: AppData, input: { sprintId: string; column: RetroCard["column"]; text: string }, ctx: Ctx): AppData {
  const text = input.text.trim();
  if (text.length < 3) throw new OperationError("Write a few words for the card.");
  if (text.length > 280) throw new OperationError("Keep cards under 280 characters.");
  if (!data.sprints.some((s) => s.id === input.sprintId)) throw new OperationError("That sprint no longer exists.");
  const card: RetroCard = { id: newId("r"), sprintId: input.sprintId, column: input.column, text, authorId: ctx.actorId, votes: [], createdAt: ctx.at };
  return { ...data, retroCards: [...data.retroCards, card] };
}

/** Only the card's author can remove it (a frontend rule). */
export function removeRetroCard(data: AppData, cardId: string, ctx: Ctx): AppData {
  const card = data.retroCards.find((c) => c.id === cardId);
  if (!card) throw new OperationError("That card no longer exists.");
  if (card.authorId !== ctx.actorId) throw new OperationError("Only the person who wrote a card can remove it.");
  return { ...data, retroCards: data.retroCards.filter((c) => c.id !== cardId) };
}

export function toggleRetroVote(data: AppData, cardId: string, ctx: Ctx): AppData {
  const card = data.retroCards.find((c) => c.id === cardId);
  if (!card) throw new OperationError("That card no longer exists.");
  const votes = card.votes.includes(ctx.actorId) ? card.votes.filter((v) => v !== ctx.actorId) : [...card.votes, ctx.actorId];
  return { ...data, retroCards: data.retroCards.map((c) => (c.id === cardId ? { ...c, votes } : c)) };
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export interface NewTask {
  goalId: string;
  title: string;
  notes: string;
  estimate: Estimate;
  startDate: ISODate;
  targetDate: ISODate;
  status: TaskStatus;
  dependency: Dependency | null;
  sprintId: string;
  links?: Omit<ResultLink, "id">[];
  /** Required when the person has other unfinished tasks that day; see priorityChoices. */
  priority?: PriorityLevel | null;
}

/** Once a task has a priority, the owner's other tasks that day without one become P0. */
function settleDayPriorities(data: AppData, task: Task, ctx: Ctx): AppData {
  if (task.priority === null) return data;
  const others = new Set(openTasksOnDay(data, task.ownerId, task.startDate, ctx.today, task.id).filter((t) => t.priority === null).map((t) => t.id));
  if (!others.size) return data;
  return { ...data, tasks: data.tasks.map((t) => (others.has(t.id) ? { ...t, priority: 0 as const } : t)) };
}

export function createTask(data: AppData, input: NewTask, ctx: Ctx): { data: AppData; task: Task } {
  if (!data.goals.some((g) => g.id === input.goalId)) throw new OperationError("Choose an existing goal.");
  const task: Task = {
    id: newId("t"),
    goalId: input.goalId,
    ownerId: ctx.actorId,
    sprintId: input.sprintId,
    title: input.title.trim(),
    notes: input.notes.trim(),
    estimate: input.estimate,
    startDate: input.startDate,
    originalTargetDate: input.targetDate,
    targetDate: input.targetDate,
    completedDate: input.status === "done" ? ctx.today : null,
    status: input.status,
    priority: input.priority ?? null,
    dependency: input.dependency,
    links: cleanLinks(input.links ?? []),
    carryOver: null,
    dropReason: null,
    createdAt: ctx.at,
  };
  const events: TaskEvent[] = [
    event(task.id, ctx, "created", null, null, `Estimated ${input.estimate} ${input.estimate === 1 ? "day" : "days"}, target ${input.targetDate}`),
  ];
  if (input.status !== "not_started") events.push(event(task.id, ctx, "status_changed", "not_started", input.status));
  if (input.dependency) events.push(event(task.id, ctx, "dependency_changed", null, input.dependency.personId, input.dependency.description));
  for (const l of task.links) events.push(event(task.id, ctx, "link_added", null, l.url, l.label));
  return { data: settleDayPriorities({ ...data, tasks: [...data.tasks, task], events: [...data.events, ...events] }, task, ctx), task };
}

export interface TaskDetailsPatch {
  title: string;
  notes: string;
  estimate: Estimate;
  startDate: ISODate;
  targetDate: ISODate;
  dependency: Dependency | null;
  links: (Omit<ResultLink, "id"> & { id?: string })[];
  priority: PriorityLevel | null;
}

function sameDependency(a: Dependency | null, b: Dependency | null) {
  return (a?.personId ?? null) === (b?.personId ?? null) && (a?.description ?? "") === (b?.description ?? "");
}

function applyDetails(task: Task, patch: Partial<TaskDetailsPatch>, ctx: Ctx): { task: Task; events: TaskEvent[] } {
  const events: TaskEvent[] = [];
  const next = { ...task };
  const edited: string[] = [];
  if (patch.title !== undefined && patch.title.trim() !== task.title) {
    next.title = patch.title.trim();
    edited.push("title");
  }
  if (patch.notes !== undefined && patch.notes.trim() !== task.notes) {
    next.notes = patch.notes.trim();
    edited.push("notes");
  }
  if (patch.startDate !== undefined && patch.startDate !== task.startDate) {
    next.startDate = patch.startDate;
    edited.push("start date");
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    next.priority = patch.priority;
    edited.push(patch.priority === null ? "priority (cleared)" : `priority (P${patch.priority})`);
  }
  if (edited.length) events.push(event(task.id, ctx, "details_edited", null, null, `Edited ${edited.join(", ")}`));
  if (patch.estimate !== undefined && patch.estimate !== task.estimate) {
    events.push(event(task.id, ctx, "estimate_changed", String(task.estimate), String(patch.estimate)));
    next.estimate = patch.estimate;
  }
  if (patch.targetDate !== undefined && patch.targetDate !== task.targetDate) {
    events.push(event(task.id, ctx, "target_date_changed", task.targetDate, patch.targetDate));
    next.targetDate = patch.targetDate;
  }
  if (patch.dependency !== undefined && !sameDependency(patch.dependency, task.dependency)) {
    events.push(
      event(task.id, ctx, "dependency_changed", task.dependency?.personId ?? null, patch.dependency?.personId ?? null, patch.dependency?.description ?? "Dependency resolved"),
    );
    next.dependency = patch.dependency;
  }
  if (patch.links !== undefined) {
    const nextLinks = cleanLinks(patch.links);
    const key = (l: ResultLink) => `${l.label} | ${l.url}`;
    const before = new Set(task.links.map(key));
    const after = new Set(nextLinks.map(key));
    for (const l of task.links) if (!after.has(key(l))) events.push(event(task.id, ctx, "link_removed", l.url, null, l.label));
    for (const l of nextLinks) if (!before.has(key(l))) events.push(event(task.id, ctx, "link_added", null, l.url, l.label));
    next.links = nextLinks;
  }
  return { task: next, events };
}

export interface StatusChange {
  status: TaskStatus;
  reason?: string;
  toSprintId?: string;
}

function applyStatus(data: AppData, task: Task, change: StatusChange, ctx: Ctx): { task: Task; events: TaskEvent[] } {
  if (change.status === task.status) return { task, events: [] };
  const reason = change.reason?.trim() || null;
  if ((change.status === "dropped" || change.status === "carried_over") && !reason) {
    throw new OperationError(`A reason is required to mark a task ${STATUS_LABELS[change.status]}.`);
  }
  const next: Task = { ...task, status: change.status };
  const events: TaskEvent[] = [event(task.id, ctx, "status_changed", task.status, change.status, reason)];

  // Done records the completion date; leaving Done clears it (history keeps it).
  next.completedDate = change.status === "done" ? ctx.today : null;
  next.dropReason = change.status === "dropped" ? reason : null;

  if (change.status === "carried_over") {
    const to = data.sprints.find((s) => s.id === change.toSprintId);
    const from = data.sprints.find((s) => s.id === task.sprintId);
    if (!to) throw new OperationError("Choose the sprint this task carries over to.");
    if (from && to.startDate <= from.startDate) throw new OperationError("Carry the task over to a later sprint.");
    next.carryOver = { fromSprintId: task.sprintId, toSprintId: to.id, reason: reason ?? "", date: ctx.today };
    next.sprintId = to.id;
    events.push(event(task.id, ctx, "carried_over", from?.name ?? task.sprintId, to.name, reason));
  }
  return { task: next, events };
}

function replaceTask(data: AppData, task: Task, events: TaskEvent[]): AppData {
  return { ...data, tasks: data.tasks.map((t) => (t.id === task.id ? task : t)), events: [...data.events, ...events] };
}

export function updateTaskDetails(data: AppData, taskId: string, patch: Partial<TaskDetailsPatch>, ctx: Ctx): AppData {
  const task = requireTask(data, taskId);
  assertOwner(task, ctx);
  const res = applyDetails(task, patch, ctx);
  return settleDayPriorities(replaceTask(data, res.task, res.events), res.task, ctx);
}

export function changeTaskStatus(data: AppData, taskId: string, change: StatusChange, ctx: Ctx): AppData {
  const task = requireTask(data, taskId);
  assertOwner(task, ctx);
  const res = applyStatus(data, task, change, ctx);
  return replaceTask(data, res.task, res.events);
}

export function addTaskLink(data: AppData, taskId: string, link: Omit<ResultLink, "id">, ctx: Ctx): AppData {
  const task = requireTask(data, taskId);
  assertOwner(task, ctx);
  const created: ResultLink = { id: newId("l"), label: link.label.trim() || link.url.trim(), url: link.url.trim() };
  return replaceTask(data, { ...task, links: [...task.links, created] }, [event(taskId, ctx, "link_added", null, created.url, created.label)]);
}

export function removeTaskLink(data: AppData, taskId: string, linkId: string, ctx: Ctx): AppData {
  const task = requireTask(data, taskId);
  assertOwner(task, ctx);
  const link = task.links.find((l) => l.id === linkId);
  if (!link) return data;
  return replaceTask(data, { ...task, links: task.links.filter((l) => l.id !== linkId) }, [event(taskId, ctx, "link_removed", link.url, null, link.label)]);
}

// ── Check-ins ──────────────────────────────────────────────────────────────

export interface CheckInTaskInput {
  taskId: string;
  status: TaskStatus;
  progress: string;
  targetDate: ISODate;
  dependency: Dependency | null;
  supportNeeded: string;
  /** Reason for Blocked / Dropped / Carried Over. */
  reason: string;
  toSprintId: string;
}

export interface CheckInInput {
  personId: string;
  date: ISODate;
  note: string;
  updates: CheckInTaskInput[];
}

/**
 * Publish (or re-publish) a person's check-in for a date. There is at most one
 * check-in per person per day: re-publishing replaces its updates in place.
 * Each update is applied to the task (status, target, dependency) and stored
 * as a snapshot so the day's record never changes when the task does later.
 */
export function publishCheckIn(data: AppData, input: CheckInInput, ctx: Ctx): { data: AppData; checkIn: CheckIn; wasEdit: boolean } {
  if (input.personId !== ctx.actorId) throw new OperationError("You can only publish your own check-in.");
  let next = data;
  const snapshots: TaskUpdateSnapshot[] = [];

  for (const u of input.updates) {
    const task = requireTask(next, u.taskId);
    assertOwner(task, ctx);
    const details = applyDetails(task, { targetDate: u.targetDate, dependency: u.dependency }, ctx);
    const status = applyStatus(next, details.task, { status: u.status, reason: u.reason || u.supportNeeded, toSprintId: u.toSprintId }, ctx);
    next = replaceTask(next, status.task, [...details.events, ...status.events]);
    snapshots.push({
      taskId: task.id,
      taskTitle: status.task.title,
      goalId: status.task.goalId,
      status: status.task.status,
      estimate: status.task.estimate,
      targetDate: status.task.targetDate,
      progress: u.progress.trim(),
      dependency: status.task.dependency,
      supportNeeded: u.supportNeeded.trim(),
    });
  }

  const existing = next.checkIns.find((c) => c.personId === input.personId && c.date === input.date);
  const checkIn: CheckIn = existing
    ? { ...existing, note: input.note.trim(), updates: snapshots, editedAt: ctx.at }
    : { id: newId("c"), personId: input.personId, date: input.date, submittedAt: ctx.at, editedAt: null, note: input.note.trim(), updates: snapshots };

  const checkIns = existing ? next.checkIns.map((c) => (c.id === existing.id ? checkIn : c)) : [...next.checkIns, checkIn];
  return { data: { ...next, checkIns }, checkIn, wasEdit: Boolean(existing) };
}
