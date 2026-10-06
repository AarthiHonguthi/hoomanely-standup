/**
 * Domain entities for Hoomanely. These are intentionally plain, serialisable
 * records so the local implementation can later be swapped for API responses.
 *
 * Dates without a time component use ISO calendar strings ("YYYY-MM-DD").
 * Timestamps use local ISO date-time strings ("YYYY-MM-DDTHH:mm").
 */

export type ISODate = string;
export type ISODateTime = string;

export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
  "carried_over",
  "dropped",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ESTIMATES = [0.5, 1, 1.5, 2] as const;
export type Estimate = (typeof ESTIMATES)[number];

/** Brand colour families: Plasma Haze, Sensor Reef, Baseline Gold, Carbon Matrix, and a green from the success state. */
export type AccentColor = "plasma" | "reef" | "gold" | "carbon" | "moss";

export interface Team {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  name: string;
  teamId: string;
  accent: AccentColor;
  /** Can set the sprint timeline (a permission, never shown as a title). */
  canManageSprints?: boolean;
  /** Profile photo: a bundled path ("/avatars/…") or an uploaded, resized data URL. */
  avatarUrl?: string | null;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
}

export interface Goal {
  id: string;
  title: string;
  /** Free-form notes: context, links, what done looks like. Optional. */
  notes: string;
  /** Named links (spec, Figma, dashboards…), shown as clickable chips. */
  links: ResultLink[];
  targetDate: ISODate | null;
  createdById: string;
  createdAt: ISODateTime;
}

export interface Dependency {
  personId: string;
  description: string;
}

export interface ResultLink {
  id: string;
  label: string;
  url: string;
}

export interface CarryOver {
  fromSprintId: string;
  toSprintId: string;
  reason: string;
  date: ISODate;
}

export interface Task {
  id: string;
  goalId: string;
  ownerId: string;
  sprintId: string;
  title: string;
  /** Free-form notes and links. Optional. */
  notes: string;
  estimate: Estimate;
  startDate: ISODate;
  /** Target finish date set when the task was created. Never changes. */
  originalTargetDate: ISODate;
  /** Current target finish date. May move; every move is recorded as a history event. */
  targetDate: ISODate;
  completedDate: ISODate | null;
  status: TaskStatus;
  /**
   * Order among the owner's tasks on the same day (P0 first). Null when it was
   * the only task that day; it then counts as P0.
   */
  priority: PriorityLevel | null;
  dependency: Dependency | null;
  links: ResultLink[];
  /** Most recent carry-over. Kept after the task is picked up again; full trail lives in events. */
  carryOver: CarryOver | null;
  /** Present while the task is Dropped. */
  dropReason: string | null;
  createdAt: ISODateTime;
}

/**
 * What a person recorded about one task on one day. It is a snapshot: later
 * edits to the task never rewrite it, so historical check-ins stay truthful.
 */
export interface TaskUpdateSnapshot {
  taskId: string;
  taskTitle: string;
  goalId: string;
  status: TaskStatus;
  estimate: Estimate;
  targetDate: ISODate;
  progress: string;
  dependency: Dependency | null;
  supportNeeded: string;
}

export interface CheckIn {
  id: string;
  personId: string;
  date: ISODate;
  submittedAt: ISODateTime;
  editedAt: ISODateTime | null;
  note: string;
  updates: TaskUpdateSnapshot[];
}

export type TaskEventType =
  | "created"
  | "status_changed"
  | "target_date_changed"
  | "dependency_changed"
  | "estimate_changed"
  | "details_edited"
  | "carried_over"
  | "link_added"
  | "link_removed";

export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  at: ISODateTime;
  actorId: string;
  from: string | null;
  to: string | null;
  note: string | null;
}

/**
 * Hand edits to a day's stand-up notes. When present they replace the
 * generated notes for that date. Text uses "@{personId}" and "#{taskId}" mentions.
 */
export interface MeetingNotesEdit {
  date: ISODate;
  summary: string;
  points: string[];
  actionItems: { text: string; done: boolean }[];
  editedById: string;
  editedAt: ISODateTime;
}

/** P0 (most important) to P3. Several tasks can share a level. */
export type PriorityLevel = 0 | 1 | 2 | 3;
export const PRIORITY_LEVELS: PriorityLevel[] = [0, 1, 2, 3];

/** A card someone added to a sprint's retro board. */
export interface RetroCard {
  id: string;
  sprintId: string;
  column: "well" | "not_well" | "try";
  text: string;
  authorId: string;
  /** People who +1'd the card. */
  votes: string[];
  createdAt: ISODateTime;
}

export interface AppData {
  teams: Team[];
  people: Person[];
  sprints: Sprint[];
  goals: Goal[];
  tasks: Task[];
  checkIns: CheckIn[];
  events: TaskEvent[];
  meetingNotes: MeetingNotesEdit[];
  retroCards: RetroCard[];
}
