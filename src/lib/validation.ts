import { ESTIMATES, type Estimate, type ISODate, type TaskStatus } from "./types";
import { compareDates, diffDays, isValidISODate } from "./dates";

export type FieldErrors = Record<string, string>;

const VAGUE_TITLES = new Set([
  "task",
  "tasks",
  "todo",
  "to do",
  "test",
  "testing",
  "stuff",
  "work",
  "misc",
  "fix",
  "fix bug",
  "bug",
  "update",
  "wip",
  "tbd",
  "goal",
  "new task",
  "new goal",
  "asdf",
  "things",
]);

/** Titles must describe an outcome: at least two words and not a placeholder. */
export function validateTitle(raw: string, kind: "task" | "goal"): string | null {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) return `Give the ${kind} a title.`;
  if (title.length < 8) return "Use at least 8 characters so teammates know what this is.";
  if (title.length > 140) return "Keep the title under 140 characters. Put detail in the notes.";
  if (!/[a-zA-Z]{2,}/.test(title)) return "The title needs real words.";
  if (title.split(" ").length < 2) return `Describe the ${kind === "task" ? "outcome" : "larger outcome"} in a few words.`;
  if (VAGUE_TITLES.has(title.toLowerCase())) return "This is too vague. Describe the outcome, e.g. “Fix crash on photo upload”.";
  return null;
}

export function isEstimate(value: unknown): value is Estimate {
  return typeof value === "number" && (ESTIMATES as readonly number[]).includes(value);
}

export function validateUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Add a link.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full link starting with https://";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Only http:// and https:// links are supported.";
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return "That doesn't look like a complete web address.";
  return null;
}

export interface TaskFormInput {
  title: string;
  notes: string;
  estimate: number | null;
  startDate: string;
  targetDate: string;
  status: TaskStatus;
  dependencyPersonId: string;
  dependencyDescription: string;
  ownerId: string;
}

export function validateTaskForm(input: TaskFormInput, opts: { isNew: boolean }): FieldErrors {
  const errors: FieldErrors = {};
  const titleError = validateTitle(input.title, "task");
  if (titleError) errors.title = titleError;
  if (input.notes.length > 4000) errors.notes = "Keep notes under 4,000 characters.";
  if (!isEstimate(input.estimate)) errors.estimate = "Choose 0.5, 1, 1.5 or 2 days. Split bigger work into more tasks.";
  if (!isValidISODate(input.startDate)) errors.startDate = "Choose a start date.";
  if (!isValidISODate(input.targetDate)) errors.targetDate = "Choose a target finish date.";
  if (!errors.startDate && !errors.targetDate && compareDates(input.targetDate, input.startDate) < 0) {
    errors.targetDate = "The target finish can't be before the start date.";
  }
  if (opts.isNew && !errors.startDate && !errors.targetDate && diffDays(input.startDate, input.targetDate) > 14) {
    errors.targetDate = "For a task of 2 days or less, a target more than two weeks after the start is unusual. Split the task or bring the date closer.";
  }
  const depError = validateDependency(input.dependencyPersonId, input.dependencyDescription, input.ownerId);
  if (depError) errors[depError.field] = depError.message;
  return errors;
}

export function validateDependency(
  personId: string,
  description: string,
  ownerId: string,
): { field: "dependencyPersonId" | "dependencyDescription"; message: string } | null {
  if (!personId && description.trim()) return { field: "dependencyPersonId", message: "Choose who you depend on, or clear the description." };
  if (personId && personId === ownerId) return { field: "dependencyPersonId", message: "A task can't depend on its own owner." };
  if (personId && description.trim().length < 4) return { field: "dependencyDescription", message: "Say what you need from them." };
  return null;
}

export interface LinkDraft {
  id: string;
  label: string;
  url: string;
}

export interface GoalFormInput {
  title: string;
  notes: string;
  links: LinkDraft[];
  targetDate: string;
}

/** Each link needs a valid http(s) URL; the name is optional. Errors keyed "<prefix>links.<index>". */
export function validateLinks(links: LinkDraft[], prefix = ""): FieldErrors {
  const errors: FieldErrors = {};
  links.forEach((l, i) => {
    const err = validateUrl(l.url);
    if (err) errors[`${prefix}links.${i}`] = err;
    else if (l.label.length > 80) errors[`${prefix}links.${i}`] = "Keep the link name under 80 characters.";
  });
  return errors;
}

/** `existingTarget` (when editing) allows keeping a target date that is already in the past. */
export function validateGoalForm(input: GoalFormInput, today: ISODate, prefix = "", existingTarget?: string | null): FieldErrors {
  const errors: FieldErrors = {};
  const titleError = validateTitle(input.title, "goal");
  if (titleError) errors[`${prefix}title`] = titleError;
  if (input.notes.length > 4000) errors[`${prefix}notes`] = "Keep notes under 4,000 characters.";
  Object.assign(errors, validateLinks(input.links, prefix));
  if (input.targetDate) {
    if (!isValidISODate(input.targetDate)) errors[`${prefix}targetDate`] = "Enter a valid date or leave it empty.";
    else if (compareDates(input.targetDate, today) < 0 && input.targetDate !== existingTarget) errors[`${prefix}targetDate`] = "The target date can't be in the past.";
  }
  return errors;
}

export interface SprintInput {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

/** Sprints must have valid dates, last 7 to 28 days, and not overlap. Returns errors keyed "<index>.<field>". */
export function validateSprints(list: SprintInput[]): FieldErrors {
  const errors: FieldErrors = {};
  list.forEach((s, i) => {
    if (s.name.trim().length < 2) errors[`${i}.name`] = "Give the sprint a name.";
    if (!isValidISODate(s.startDate)) errors[`${i}.startDate`] = "Choose a start date.";
    if (!isValidISODate(s.endDate)) errors[`${i}.endDate`] = "Choose an end date.";
    if (errors[`${i}.startDate`] || errors[`${i}.endDate`]) return;
    const len = diffDays(s.startDate, s.endDate) + 1;
    if (len < 7 || len > 28) errors[`${i}.endDate`] = `A sprint should be 7 to 28 days (this one is ${len}).`;
  });
  const sorted = list.map((s, i) => ({ ...s, i })).filter((s) => isValidISODate(s.startDate) && isValidISODate(s.endDate)).sort((a, b) => compareDates(a.startDate, b.startDate));
  for (let k = 1; k < sorted.length; k++) {
    if (compareDates(sorted[k].startDate, sorted[k - 1].endDate) <= 0) {
      errors[`${sorted[k].i}.startDate`] = `Overlaps ${sorted[k - 1].name || "another sprint"}.`;
    }
  }
  return errors;
}

/** Profile photos may only be a bundled avatar path or a base64 image data URL. */
const AVATAR_RE = /^(?:\/avatars\/[\w.-]+|data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)$/;
export const MAX_AVATAR_CHARS = 400_000;
export function isValidAvatarUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_AVATAR_CHARS && AVATAR_RE.test(value);
}

/** Reason is required when a task becomes Blocked, Dropped or Carried Over. */
export function statusNeedsReason(status: TaskStatus): boolean {
  return status === "blocked" || status === "dropped" || status === "carried_over";
}

export function validateReason(status: TaskStatus, reason: string): string | null {
  if (!statusNeedsReason(status)) return null;
  if (reason.trim().length < 5) {
    if (status === "dropped") return "Say why this task is being dropped.";
    if (status === "carried_over") return "Say why this task is carrying over.";
    return "Say what is blocking this task.";
  }
  return null;
}
