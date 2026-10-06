import { STATUS_LABELS } from "../config";
import { addDays, formatShort, formatWeekdayShort } from "../dates";
import { currentSprint, goalProgress } from "../data/selectors";
import type { AppData } from "../types";

/**
 * Compact plain-text snapshot of the team's data, sent with chat questions so
 * Claude can answer from the same data the user sees. Covers the last five
 * days of check-ins plus the current state of every goal and task.
 */
export function buildSnapshot(data: AppData, today: string, currentUserId: string): string {
  const person = new Map(data.people.map((p) => [p.id, p]));
  const team = new Map(data.teams.map((t) => [t.id, t.name]));
  const goal = new Map(data.goals.map((g) => [g.id, g.title]));
  const name = (id: string) => person.get(id)?.name ?? "Unknown";
  const lines: string[] = [];

  lines.push(`Today: ${formatWeekdayShort(today)} (${today}). Signed-in user: ${name(currentUserId)}.`);
  const sprint = currentSprint(data, today);
  if (sprint) lines.push(`Current sprint: ${sprint.name} (${sprint.startDate} to ${sprint.endDate}). Sprints are fortnights.`);
  lines.push("", "People:");
  for (const p of data.people) lines.push(`- ${p.name}: ${team.get(p.teamId) ?? "no"} team`);

  lines.push("", "Goals:");
  for (const g of data.goals) {
    const pr = goalProgress(data, g);
    lines.push(`- ${g.title} (${pr.done} of ${pr.counted} tasks complete${pr.dropped ? `, ${pr.dropped} dropped` : ""}${g.targetDate ? `, target ${g.targetDate}` : ""})${g.notes ? `. Notes: ${g.notes.replace(/\n/g, " ")}` : ""}`);
  }

  lines.push("", "Tasks (current state):");
  for (const t of data.tasks) {
    const parts = [
      `${t.title}`,
      `owner ${name(t.ownerId)}`,
      `goal "${goal.get(t.goalId) ?? "?"}"`,
      STATUS_LABELS[t.status],
      `${t.estimate}d`,
      `target ${t.targetDate}${t.targetDate !== t.originalTargetDate ? ` (originally ${t.originalTargetDate})` : ""}`,
    ];
    if (t.completedDate) parts.push(`completed ${t.completedDate}`);
    if (t.dependency) parts.push(`depends on ${name(t.dependency.personId)}: ${t.dependency.description}`);
    if (t.dropReason) parts.push(`dropped because: ${t.dropReason}`);
    if (t.carryOver) parts.push(`carried over: ${t.carryOver.reason}`);
    lines.push(`- ${parts.join("; ")}`);
  }

  const since = addDays(today, -5);
  lines.push("", `Check-ins from ${formatShort(since)} to ${formatShort(today)} (as recorded that day):`);
  const recent = data.checkIns.filter((c) => c.date >= since && c.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  for (const c of recent) {
    lines.push(`- ${c.date} ${name(c.personId)}${c.note ? ` (note: ${c.note})` : ""}`);
    for (const u of c.updates) {
      const extra = [u.dependency ? `needs ${name(u.dependency.personId)}: ${u.dependency.description}` : "", u.supportNeeded ? `asking for: ${u.supportNeeded}` : ""].filter(Boolean);
      lines.push(`    - ${u.taskTitle}: ${STATUS_LABELS[u.status]}, target ${u.targetDate}. ${u.progress}${extra.length ? ` (${extra.join("; ")})` : ""}`);
    }
  }
  return lines.join("\n");
}
