"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays, compareDates, diffDays, isValidISODate } from "@/lib/dates";
import { newId } from "@/lib/data/operations";
import { sortedSprints } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import type { Sprint } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { plural } from "@/lib/utils";
import { validateSprints, type FieldErrors } from "@/lib/validation";

export function ManageSprintsDialog() {
  const { sprintManagerOpen, setSprintManagerOpen } = useUI();
  return (
    <Dialog open={sprintManagerOpen} onOpenChange={setSprintManagerOpen}>
      <DialogContent size="lg">{sprintManagerOpen && <ManageSprints />}</DialogContent>
    </Dialog>
  );
}

function nextName(list: Sprint[]): string {
  const nums = list.map((s) => Number(s.name.match(/(\d+)\s*$/)?.[1])).filter((n) => Number.isFinite(n));
  return `Sprint ${nums.length ? Math.max(...nums) + 1 : list.length + 1}`;
}

function ManageSprints() {
  const { data, today, currentUserId, saveSprints } = useData();
  const { setSprintManagerOpen } = useUI();
  const [rows, setRows] = useState<Sprint[]>(() => sortedSprints(data));
  const [errors, setErrors] = useState<FieldErrors>({});
  const me = data.people.find((p) => p.id === currentUserId);
  const close = () => setSprintManagerOpen(false);

  if (!me?.canManageSprints) {
    return (
      <>
        <DialogHeader title="You can't change sprints" description="Only the sprint owner can change the sprint timeline." />
        <DialogFooter>
          <Button onClick={close}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  const taskCount = (id: string) => data.tasks.filter((t) => t.sprintId === id || t.carryOver?.fromSprintId === id || t.carryOver?.toSprintId === id).length;
  const update = (i: number, patch: Partial<Sprint>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addNext = () => {
    const last = rows.at(-1);
    const start = last && isValidISODate(last.endDate) ? addDays(last.endDate, 1) : today;
    setRows((rs) => [...rs, { id: newId("s"), name: nextName(rs), startDate: start, endDate: addDays(start, 13) }]);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSprints(rows);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const sorted = [...rows].sort((a, b) => compareDates(a.startDate, b.startDate));
    const res = saveSprints(sorted);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Sprint timeline saved");
    close();
  };

  return (
    <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title="Manage sprints" description="Sprints are fortnights. Tasks and check-ins pick up their sprint from their dates automatically." />
      <DialogBody className="flex flex-col gap-3">
        <div className="hidden grid-cols-[1fr_9.5rem_9.5rem_2.25rem] gap-2 px-1 text-xs font-medium text-subtle sm:grid">
          <span>Name</span>
          <span>Start</span>
          <span>End (both included)</span>
          <span />
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((s, i) => {
            const used = taskCount(s.id);
            const past = compareDates(s.startDate, today) <= 0;
            const removable = used === 0 && !past;
            const len = isValidISODate(s.startDate) && isValidISODate(s.endDate) ? diffDays(s.startDate, s.endDate) + 1 : null;
            const err = [errors[`${i}.name`], errors[`${i}.startDate`], errors[`${i}.endDate`]].filter(Boolean);
            return (
              <li key={s.id} className="rounded-lg border border-border p-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_9.5rem_9.5rem_2.25rem] sm:items-center">
                  <Input value={s.name} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Sprint ${i + 1} name`} aria-invalid={errors[`${i}.name`] ? true : undefined} className="col-span-2 sm:col-span-1" />
                  <Input
                    type="date"
                    value={s.startDate}
                    onChange={(e) => {
                      const start = e.target.value;
                      // Keep it a fortnight when the start moves.
                      update(i, isValidISODate(start) ? { startDate: start, endDate: addDays(start, 13) } : { startDate: start });
                    }}
                    aria-label={`${s.name} start date`}
                    aria-invalid={errors[`${i}.startDate`] ? true : undefined}
                  />
                  <Input type="date" value={s.endDate} onChange={(e) => update(i, { endDate: e.target.value })} aria-label={`${s.name} end date`} aria-invalid={errors[`${i}.endDate`] ? true : undefined} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!removable}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    aria-label={`Remove ${s.name}`}
                    title={removable ? "Remove sprint" : used ? `Has ${plural(used, "task")}, so it can't be removed` : "Past and current sprints can't be removed"}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <p className="mt-1 px-1 text-xs text-subtle">
                  {len ? `${len} days` : "Dates incomplete"}
                  {used > 0 && ` · ${plural(used, "task")}`}
                </p>
                {err.length > 0 && <p className="mt-1 px-1 text-xs font-medium text-[var(--error-fg)]">{err.join(" ")}</p>}
              </li>
            );
          })}
        </ul>
        <Button variant="secondary" size="sm" className="self-start" onClick={addNext}>
          <Plus />
          Add next sprint
        </Button>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save timeline
        </Button>
      </DialogFooter>
    </form>
  );
}
