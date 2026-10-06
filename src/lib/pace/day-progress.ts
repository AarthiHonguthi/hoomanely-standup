import type { PriorityLevel, Task } from "../types";

/**
 * My pace: how much of a day's work is done, weighted by size and priority.
 * Calculated automatically from the tasks on that day (the same ones the
 * My workspace calendar shows); nothing is entered by hand.
 *
 *   weight  = estimate (days) × priority weight (P0 4, P1 3, P2 2, P3 1)
 *   percent = 100 × done weight / total weight
 *
 * A task without a priority (the only task that day) counts as P0.
 */

export const PRIORITY_WEIGHT: Record<PriorityLevel, number> = { 0: 4, 1: 3, 2: 2, 3: 1 };

export interface ProgressItem {
  task: Task;
  priority: PriorityLevel;
  weight: number;
  done: boolean;
}

export interface DayProgress {
  /** P0 first, then the shorter estimate. */
  items: ProgressItem[];
  totalWeight: number;
  doneWeight: number;
  doneCount: number;
  /** Unrounded 0–100, or null when there are no tasks that day. */
  percent: number | null;
}

export function taskWeight(t: Pick<Task, "estimate" | "priority">): number {
  return t.estimate * PRIORITY_WEIGHT[t.priority ?? 0];
}

/** `entries` are the day's tasks and whether each was done that day. */
export function dayProgress(entries: { task: Task; done: boolean }[]): DayProgress {
  const items = entries
    .map(({ task, done }) => ({ task, done, priority: task.priority ?? 0, weight: taskWeight(task) }))
    .sort((a, b) => a.priority - b.priority || a.task.estimate - b.task.estimate || a.task.title.localeCompare(b.task.title));
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const doneWeight = items.filter((i) => i.done).reduce((s, i) => s + i.weight, 0);
  return {
    items,
    totalWeight,
    doneWeight,
    doneCount: items.filter((i) => i.done).length,
    percent: totalWeight ? (100 * doneWeight) / totalWeight : null,
  };
}

/** Rounded for display only; never shows 100% unless everything is done. */
export function formatPercent(p: number | null): string {
  if (p === null) return "–";
  const r = Math.round(p);
  return p < 100 && r >= 100 ? "<100%" : `${r}%`;
}

/** Average of the days that had tasks (unrounded). */
export function weekAverage(days: (number | null)[]): { average: number | null; days: number } {
  const counted = days.filter((d): d is number => d !== null);
  return { average: counted.length ? counted.reduce((s, d) => s + d, 0) / counted.length : null, days: counted.length };
}
