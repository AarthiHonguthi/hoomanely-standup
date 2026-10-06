import type { Estimate, TaskStatus } from "./types";

/**
 * The single "today" used by the whole demo: presets, "today" labels and
 * completion dates. The sample data comes from the team's sprint sheet
 * (dated Aug 28 – Sep 23, 2026), so this sits just after it. Open tasks from
 * the sheet show daily check-ins up to this date.
 */
export const DEMO_TODAY = "2026-09-25";

/** Simulated signed-in user (can be switched from the sidebar for testing). */
export const DEFAULT_CURRENT_USER_ID = "p-kunal";

export const WORKSPACE_NAME = "Hoomanely";

export const STORAGE_KEY = "hoomanely.demo-data";
/** Bump when the stored shape changes; older saved data is replaced by fresh sample data. */
export const SCHEMA_VERSION = 19;
export const THEME_STORAGE_KEY = "hoomanely.theme";
export const USER_STORAGE_KEY = "hoomanely.current-user";

export const ESTIMATE_LABELS: Record<Estimate, string> = {
  0.5: "0.5 days",
  1: "1 day",
  1.5: "1.5 days",
  2: "2 days",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  carried_over: "Carried Over",
  dropped: "Dropped",
};

/** Statuses that mean the task is no longer being worked on in its sprint. */
export const CLOSED_STATUSES: TaskStatus[] = ["done", "dropped", "carried_over"];
