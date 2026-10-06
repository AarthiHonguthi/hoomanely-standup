"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GoalLabel, StatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { STATUS_LABELS } from "@/lib/config";
import { compareDates, formatShort, formatTime, formatWeekdayShort, isValidISODate } from "@/lib/dates";
import { checkInCandidates, laterSprints, sortPeople } from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import { TASK_STATUSES, type CheckIn, type Task, type TaskStatus } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, plural } from "@/lib/utils";
import { validateDependency, validateReason, type FieldErrors } from "@/lib/validation";

interface RowState {
  include: boolean;
  status: TaskStatus;
  progress: string;
  targetDate: string;
  depPersonId: string;
  depDescription: string;
  supportNeeded: string;
  reason: string;
  toSprintId: string;
}

export function CheckInDialog() {
  const { checkInOpen, setCheckInOpen } = useUI();
  const { currentUserId, today } = useData();
  return (
    <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
      <DialogContent size="lg">{checkInOpen && <CheckInForm key={`${currentUserId}:${today}`} />}</DialogContent>
    </Dialog>
  );
}

function initialRow(task: Task, existing: CheckIn | undefined, laterSprintId: string): RowState {
  const snap = existing?.updates.find((u) => u.taskId === task.id);
  if (snap) {
    return {
      include: true,
      status: snap.status,
      progress: snap.progress,
      targetDate: snap.targetDate,
      depPersonId: snap.dependency?.personId ?? "",
      depDescription: snap.dependency?.description ?? "",
      supportNeeded: snap.supportNeeded,
      reason: task.status === "dropped" ? (task.dropReason ?? "") : task.status === "carried_over" ? (task.carryOver?.reason ?? "") : "",
      toSprintId: task.carryOver?.toSprintId ?? laterSprintId,
    };
  }
  return {
    // Without an existing check-in, pre-select work that is actively moving.
    include: !existing && (task.status === "in_progress" || task.status === "blocked"),
    status: task.status,
    progress: "",
    targetDate: task.targetDate,
    depPersonId: task.dependency?.personId ?? "",
    depDescription: task.dependency?.description ?? "",
    supportNeeded: "",
    reason: "",
    toSprintId: laterSprintId,
  };
}

function CheckInForm() {
  const { data, today, currentUserId, publishCheckIn } = useData();
  const { setCheckInOpen, openTaskForm } = useUI();
  const { goal, person, goalTone } = useLookups();
  const me = person.get(currentUserId);
  const existing = data.checkIns.find((c) => c.personId === currentUserId && c.date === today);
  const tasks = useMemo(
    () => checkInCandidates(data, currentUserId, today, existing?.updates.map((u) => u.taskId) ?? []),
    // Freeze the list while the dialog is open so rows don't jump as statuses change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(tasks.map((t) => [t.id, initialRow(t, existing, laterSprints(data, t.sprintId)[0]?.id ?? "")])),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const included = tasks.filter((t) => rows[t.id]?.include);

  const update = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (included.length === 0 && note.trim().length < 5) errs.form = "Include at least one task update, or write a short note for the team.";
    for (const t of included) {
      const r = rows[t.id];
      const k = (f: string) => `${t.id}.${f}`;
      if (r.progress.trim().length < 5) errs[k("progress")] = "Write a short progress update.";
      if (!isValidISODate(r.targetDate)) errs[k("targetDate")] = "Choose a valid target date.";
      else if (compareDates(r.targetDate, t.startDate) < 0) errs[k("targetDate")] = `Can't be before the start date (${formatShort(t.startDate)}).`;
      const dep = validateDependency(r.depPersonId, r.depDescription, t.ownerId);
      if (dep) errs[k(dep.field === "dependencyPersonId" ? "depPersonId" : "depDescription")] = dep.message;
      if (r.status === "blocked" && r.supportNeeded.trim().length < 5) errs[k("supportNeeded")] = "Say what is blocking you and what would unblock it.";
      if (r.status === "dropped" || r.status === "carried_over") {
        const reasonErr = validateReason(r.status, r.reason);
        if (reasonErr) errs[k("reason")] = reasonErr;
        if (r.status === "carried_over" && !r.toSprintId) errs[k("toSprintId")] = "Choose the destination sprint.";
      }
    }
    return errs;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(errs.form ?? "Check the highlighted fields");
      return;
    }
    const res = publishCheckIn({
      personId: currentUserId,
      date: today,
      note,
      updates: included.map((t) => {
        const r = rows[t.id];
        return {
          taskId: t.id,
          status: r.status,
          progress: r.progress,
          targetDate: r.targetDate,
          dependency: r.depPersonId ? { personId: r.depPersonId, description: r.depDescription.trim() } : null,
          supportNeeded: r.status === "blocked" ? r.supportNeeded : "",
          reason: r.status === "blocked" ? r.supportNeeded : r.reason,
          toSprintId: r.toSprintId,
        };
      }),
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.value.wasEdit ? "Check-in updated" : "Check-in published", { description: `${plural(included.length, "task update")} for ${formatWeekdayShort(today)}` });
    setCheckInOpen(false);
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader
        title={existing ? "Edit my check-in" : "My check-in"}
        description={
          existing
            ? `${formatWeekdayShort(today)} · published ${formatTime(existing.submittedAt)}. Saving updates this check-in instead of creating a new one.`
            : `${formatWeekdayShort(today)} · ${me?.name}. Pick the tasks you worked on and share where each one stands.`
        }
      />
      <DialogBody className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center">
            <p className="font-medium">You have no open tasks</p>
            <p className="mt-1 text-sm text-muted">Add a task first, or publish a note-only check-in below.</p>
            <Button
              variant="soft"
              size="sm"
              className="mt-3"
              onClick={() => {
                setCheckInOpen(false);
                openTaskForm({ mode: "create" });
              }}
            >
              Add a task
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-subtle">
              Your open tasks and anything you completed today. {plural(included.length, "task")} selected.
            </p>
            <ul className="flex flex-col gap-2">
              {tasks.map((t) => {
                const g = goal.get(t.goalId);
                const r = rows[t.id];
                return (
                  <li key={t.id} className={cn("rounded-lg border transition-colors", r.include ? "border-primary/40 bg-surface" : "border-border bg-surface-2")}>
                    <label className="flex cursor-pointer items-start gap-3 p-3">
                      <Checkbox className="mt-0.5" checked={r.include} onCheckedChange={(v) => update(t.id, { include: v === true })} aria-label={`Include ${t.title}`} />
                      <span className="min-w-0 flex-1">
                        {g && <GoalLabel tone={goalTone(g.id)} title={g.title} className="mb-0.5 max-w-full" />}
                        <span className="block text-sm font-medium leading-snug">{t.title}</span>
                      </span>
                      <StatusBadge status={t.status} />
                    </label>
                    {r.include && <RowFields task={t} row={r} onChange={(p) => update(t.id, p)} errors={errors} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Field label="Note for the team" optional error={errors.form && included.length === 0 ? errors.form : undefined} className="mt-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Out from 3pm, or reviews and 1:1s most of today" maxLength={500} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setCheckInOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {existing ? "Update check-in" : "Publish check-in"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RowFields({ task, row, onChange, errors }: { task: Task; row: RowState; onChange: (p: Partial<RowState>) => void; errors: FieldErrors }) {
  const { data } = useData();
  const sprints = laterSprints(data, task.carryOver && task.status === "carried_over" ? task.carryOver.fromSprintId : task.sprintId);
  const others = sortPeople(data.people.filter((p) => p.id !== task.ownerId));
  const e = (f: string) => errors[`${task.id}.${f}`];

  return (
    <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2 sm:pl-10">
      <Field label="Status today" hint={row.status !== task.status ? `Currently ${STATUS_LABELS[task.status]}` : undefined}>
        <NativeSelect value={row.status} onChange={(ev) => onChange({ status: ev.target.value as TaskStatus })}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === "carried_over" && sprints.length === 0}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        label="Target finish"
        error={e("targetDate")}
        hint={row.targetDate !== task.originalTargetDate && !e("targetDate") ? `Originally ${formatShort(task.originalTargetDate)}` : undefined}
      >
        <Input type="date" value={row.targetDate} min={task.startDate} onChange={(ev) => onChange({ targetDate: ev.target.value })} />
      </Field>
      <Field label="Progress update" error={e("progress")} className="sm:col-span-2">
        <Textarea value={row.progress} onChange={(ev) => onChange({ progress: ev.target.value })} rows={2} placeholder="What moved since your last update?" maxLength={600} />
      </Field>

      {(row.status === "dropped" || row.status === "carried_over") && (
        <>
          {row.status === "carried_over" && (
            <Field label="Carry over to" error={e("toSprintId")}>
              <NativeSelect value={row.toSprintId} onChange={(ev) => onChange({ toSprintId: ev.target.value })}>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label={row.status === "dropped" ? "Why drop it?" : "Why is it carrying over?"} error={e("reason")} className={row.status === "dropped" ? "sm:col-span-2" : undefined}>
            <Input value={row.reason} onChange={(ev) => onChange({ reason: ev.target.value })} maxLength={300} />
          </Field>
        </>
      )}

      <Field label="Depends on" optional error={e("depPersonId")}>
        <NativeSelect value={row.depPersonId} onChange={(ev) => onChange({ depPersonId: ev.target.value, ...(ev.target.value ? {} : { depDescription: "" }) })}>
          <option value="">No one</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="What you need from them" error={e("depDescription")}>
        <Input
          value={row.depDescription}
          onChange={(ev) => onChange({ depDescription: ev.target.value })}
          disabled={!row.depPersonId}
          placeholder={row.depPersonId ? "e.g. Review the copy" : "Choose a person first"}
          maxLength={200}
        />
      </Field>
      {row.status === "blocked" && (
        <Field label="What's blocking you?" error={e("supportNeeded")} className="sm:col-span-2">
          <Input value={row.supportNeeded} onChange={(ev) => onChange({ supportNeeded: ev.target.value })} maxLength={200} />
        </Field>
      )}
    </div>
  );
}
