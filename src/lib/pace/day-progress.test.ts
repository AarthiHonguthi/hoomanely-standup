import { describe, expect, it } from "vitest";
import type { Estimate, PriorityLevel, Task } from "../types";
import { dayProgress, formatPercent, taskWeight, weekAverage } from "./day-progress";

// Test fixtures (fake tasks).
function t(id: string, estimate: Estimate, priority: PriorityLevel | null): Task {
  return {
    id,
    goalId: "g",
    ownerId: "p",
    sprintId: "s",
    title: id,
    notes: "",
    estimate,
    startDate: "2026-09-25",
    originalTargetDate: "2026-09-25",
    targetDate: "2026-09-25",
    completedDate: null,
    status: "in_progress",
    priority,
    dependency: null,
    links: [],
    carryOver: null,
    dropReason: null,
    createdAt: "2026-09-25T09:00",
  };
}
const A = t("A", 1, 0); // 4
const B = t("B", 0.5, 0); // 2
const C = t("C", 0.5, 1); // 1.5
const D = t("D", 0.5, 3); // 0.5
const day = (done: string[]) => dayProgress([A, B, C, D].map((task) => ({ task, done: done.includes(task.id) })));

describe("weights", () => {
  it("is estimate × priority weight; no priority counts as P0", () => {
    expect([A, B, C, D].map(taskWeight)).toEqual([4, 2, 1.5, 0.5]);
    expect(taskWeight(t("X", 1, null))).toBe(4);
  });
});

describe("day progress (total weight 8)", () => {
  it("A and B done → 75%", () => expect(day(["A", "B"]).percent).toBe(75));
  it("all done → 100%", () => expect(day(["A", "B", "C", "D"]).percent).toBe(100));
  it("all but D → 93.75%, shown as 94%", () => {
    expect(day(["A", "B", "C"]).percent).toBe(93.75);
    expect(formatPercent(93.75)).toBe("94%");
  });
  it("nothing done → 0%", () => expect(day([]).percent).toBe(0));
  it("no tasks → null, not 0 or 100", () => expect(dayProgress([]).percent).toBeNull());
  it("orders P0 first, then shorter estimate", () => {
    expect(day([]).items.map((i) => i.task.id)).toEqual(["B", "A", "C", "D"]);
  });
  it("counts done tasks", () => expect(day(["C"]).doneCount).toBe(1));
});

describe("display and week", () => {
  it("never shows 100% unless it truly is", () => {
    expect(formatPercent(99.6)).toBe("<100%");
    expect(formatPercent(null)).toBe("–");
  });
  it("averages days with tasks only", () => {
    expect(weekAverage([75, null, 93.75])).toEqual({ average: 84.375, days: 2 });
    expect(weekAverage([null])).toEqual({ average: null, days: 0 });
  });
});
