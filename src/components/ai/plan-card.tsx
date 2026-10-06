"use client";

import { Check, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, NativeSelect } from "@/components/ui/input";
import { ESTIMATE_LABELS } from "@/lib/config";
import { addWorkdays } from "@/lib/dates";
import { sprintForStart } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { PlanResult } from "@/lib/ai/types";
import { ESTIMATES, type Estimate } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, plural } from "@/lib/utils";
import { validateTitle } from "@/lib/validation";

interface Row {
  include: boolean;
  title: string;
  estimate: Estimate;
  notes: string;
}

/** An editable plan suggestion. Creates the goal (if new) and the selected tasks for the current user. */
export function PlanCard({ plan }: { plan: PlanResult }) {
  const { data, today, createGoal, createTask } = useData();
  const { closeAssistant } = useUI();
  const existing = plan.goal.existingGoalId ? data.goals.find((g) => g.id === plan.goal.existingGoalId) : undefined;
  const [goalTitle, setGoalTitle] = useState(plan.goal.title);
  const [rows, setRows] = useState<Row[]>(plan.tasks.map((t) => ({ include: true, title: t.title, estimate: t.estimate, notes: t.notes })));
  const [createdGoalId, setCreatedGoalId] = useState<string | null>(null);

  const chosen = rows.filter((r) => r.include);
  const goalError = !existing ? validateTitle(goalTitle, "goal") : null;
  const rowErrors = rows.map((r) => (r.include ? validateTitle(r.title, "task") : null));
  const canCreate = chosen.length > 0 && !goalError && rowErrors.every((e) => !e) && !createdGoalId;
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const create = () => {
    // Tasks take their sprint from their start date; check before creating anything.
    const startDate = addWorkdays(today, 0);
    const sprintId = sprintForStart(data, startDate)?.id;
    if (!sprintId) return void toast.error("No sprint covers these dates yet. Ask your sprint owner to add one.");
    let goalId = existing?.id;
    if (!goalId) {
      const g = createGoal({ title: goalTitle, notes: plan.goal.notes, links: [], targetDate: null });
      if (!g.ok) return void toast.error(g.error);
      goalId = g.value.id;
    }
    let made = 0;
    for (const r of chosen) {
      const res = createTask({
        goalId,
        title: r.title,
        notes: r.notes,
        estimate: r.estimate,
        startDate,
        targetDate: addWorkdays(today, Math.ceil(r.estimate) - 1),
        status: "not_started",
        dependency: null,
        sprintId,
      });
      if (res.ok) made++;
      else toast.error(res.error);
    }
    setCreatedGoalId(goalId);
    toast.success(`${plural(made, "task")} created`, { description: existing ? `Under “${existing.title}”` : `New goal “${goalTitle}”` });
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Target className="size-3.5" aria-hidden />
          {existing ? "Existing goal" : "New goal"}
        </p>
        {existing ? (
          <p className="text-sm font-medium">{existing.title}</p>
        ) : (
          <>
            <Input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} aria-label="Goal title" disabled={Boolean(createdGoalId)} aria-invalid={goalError ? true : undefined} />
            {goalError && <p className="mt-1 text-xs text-[var(--error-fg)]">{goalError}</p>}
          </>
        )}
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={i} className={cn("flex gap-2 p-3", !r.include && "opacity-60")}>
            <Checkbox className="mt-2" checked={r.include} onCheckedChange={(v) => update(i, { include: v === true })} aria-label={`Include task ${i + 1}`} disabled={Boolean(createdGoalId)} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Input value={r.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={`Task ${i + 1} title`} disabled={Boolean(createdGoalId)} aria-invalid={rowErrors[i] ? true : undefined} />
              {rowErrors[i] && <p className="text-xs text-[var(--error-fg)]">{rowErrors[i]}</p>}
              <NativeSelect value={String(r.estimate)} onChange={(e) => update(i, { estimate: Number(e.target.value) as Estimate })} aria-label={`Task ${i + 1} estimate`} className="w-32" disabled={Boolean(createdGoalId)}>
                {ESTIMATES.map((est) => (
                  <option key={est} value={est}>
                    {ESTIMATE_LABELS[est]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3">
        {createdGoalId ? (
          <>
            <span className="mr-auto flex items-center gap-1 text-xs font-medium text-[var(--success-fg)]">
              <Check className="size-3.5" aria-hidden />
              Created
            </span>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/goals?goal=${createdGoalId}`} onClick={closeAssistant}>
                View goal
              </Link>
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto text-xs text-subtle">Tasks are created for you, starting today.</span>
            <Button variant="primary" size="sm" disabled={!canCreate} onClick={create}>
              {existing ? `Create ${plural(chosen.length, "task")}` : `Create goal and ${plural(chosen.length, "task")}`}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
