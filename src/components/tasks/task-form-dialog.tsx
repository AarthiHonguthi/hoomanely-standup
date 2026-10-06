"use client";

import { useState } from "react";
import { toast } from "sonner";
import { emptyGoalInput, GoalFields } from "@/components/goals/goal-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Fieldset } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { STATUS_LABELS } from "@/lib/config";
import { formatLong, formatRange, formatWeekdayShort, isValidISODate } from "@/lib/dates";
import { comparePriority, openTasksOnDay, priorityChoices, sortPeople, sprintForStart } from "@/lib/data/selectors";
import { useData, useLookups } from "@/lib/data/store";
import type { Estimate, PriorityLevel, Task, TaskStatus } from "@/lib/types";
import { useUI, type TaskFormState } from "@/lib/ui-state";
import { cn } from "@/lib/utils";
import { validateGoalForm, validateLinks, validateTaskForm, type FieldErrors, type GoalFormInput, type LinkDraft, type TaskFormInput } from "@/lib/validation";
import { PlanHint } from "@/components/ai/plan-hint";
import { TidyButton } from "@/components/ai/tidy-button";
import { PRIORITY_HINT, PriorityBadge } from "@/components/shared/badges";
import { LinksField } from "@/components/shared/links-field";
import { EstimatePicker } from "./estimate-picker";
import { GoalCombobox } from "./goal-combobox";

const NEW_GOAL = "__new__";
const CREATE_STATUSES: TaskStatus[] = ["not_started", "in_progress", "blocked", "done"];

export function TaskFormDialog() {
  const { taskForm, closeTaskForm } = useUI();
  const { task } = useLookups();
  const editing = taskForm?.mode === "edit" ? task.get(taskForm.taskId) : undefined;
  const key = taskForm ? (taskForm.mode === "edit" ? taskForm.taskId : `new-${taskForm.goalId ?? ""}-${taskForm.startDate ?? ""}`) : "closed";
  return (
    <Dialog open={Boolean(taskForm)} onOpenChange={(open) => !open && closeTaskForm()}>
      <DialogContent size="lg">{taskForm && <TaskForm key={key} state={taskForm} editing={editing} />}</DialogContent>
    </Dialog>
  );
}

function TaskForm({ state, editing }: { state: TaskFormState; editing?: Task }) {
  const { data, today, currentUserId, createTask, createGoalAndTask, updateTaskDetails } = useData();
  const { closeTaskForm, openTask, openAssistant } = useUI();
  const isNew = state.mode === "create";

  const [goalId, setGoalId] = useState(isNew ? (state.goalId ?? data.goals[0]?.id ?? NEW_GOAL) : (editing?.goalId ?? ""));
  const [goalInput, setGoalInput] = useState<GoalFormInput>(emptyGoalInput);
  const [form, setForm] = useState<TaskFormInput>(() => ({
    title: editing?.title ?? "",
    notes: editing?.notes ?? "",
    estimate: editing?.estimate ?? null,
    startDate: editing?.startDate ?? (state.mode === "create" ? state.startDate : undefined) ?? today,
    targetDate: editing?.targetDate ?? (state.mode === "create" ? state.startDate : undefined) ?? today,
    status: editing?.status ?? "not_started",
    dependencyPersonId: editing?.dependency?.personId ?? "",
    dependencyDescription: editing?.dependency?.description ?? "",
    ownerId: editing?.ownerId ?? currentUserId,
  }));
  const [links, setLinks] = useState<LinkDraft[]>(() => (editing?.links ?? []).map((l) => ({ ...l })));
  const [priority, setPriority] = useState<PriorityLevel | null>(editing?.priority ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<TaskFormInput>) => setForm((f) => ({ ...f, ...patch }));

  if (!isNew && !editing) {
    return (
      <>
        <DialogHeader title="Task not found" />
        <DialogBody>This task no longer exists.</DialogBody>
      </>
    );
  }
  if (editing && editing.ownerId !== currentUserId) {
    return (
      <>
        <DialogHeader title="You can't edit this task" description="Only the task owner can edit it." />
        <DialogFooter>
          <Button onClick={closeTaskForm}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  const others = sortPeople(data.people.filter((p) => p.id !== currentUserId));
  // New tasks take their sprint from the start date; existing tasks keep theirs (carry-over moves it explicitly).
  const autoSprint = isValidISODate(form.startDate) ? sprintForStart(data, form.startDate) : null;
  // Priority depends on the person's other unfinished tasks on the start date.
  const sameDay = isValidISODate(form.startDate) ? openTasksOnDay(data, currentUserId, form.startDate, today, editing?.id).sort(comparePriority) : [];
  const choices = priorityChoices(sameDay);
  const chosen = priority !== null && choices.includes(priority) ? priority : null;
  const sprintOwners = data.people.filter((p) => p.canManageSprints).map((p) => p.name).join(", ") || "your sprint owner";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: FieldErrors = { ...validateTaskForm(form, { isNew }), ...validateLinks(links) };
    if (isNew && goalId === NEW_GOAL) Object.assign(errs, validateGoalForm(goalInput, today, "goal."));
    if (isNew && !goalId) errs.goalId = "Choose a goal.";
    if (choices.length && chosen === null) errs.priority = "Choose a priority. You have other tasks that day.";
    if (isNew && !errs.startDate && !autoSprint) errs.startDate = `No sprint covers this date yet. Ask ${sprintOwners} to add one.`;
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Check the highlighted fields");
      return;
    }
    const dependency = form.dependencyPersonId ? { personId: form.dependencyPersonId, description: form.dependencyDescription.trim() } : null;
    const base = {
      title: form.title,
      notes: form.notes,
      estimate: form.estimate as Estimate,
      startDate: form.startDate,
      targetDate: form.targetDate,
      dependency,
      links,
      priority: chosen,
    };

    if (isNew) {
      const input = { ...base, status: form.status, sprintId: autoSprint!.id };
      const res =
        goalId === NEW_GOAL
          ? createGoalAndTask({ ...goalInput, targetDate: goalInput.targetDate || null }, input)
          : createTask({ ...input, goalId });
      if (!res.ok) return void toast.error(res.error);
      toast.success(goalId === NEW_GOAL ? "Goal and task created" : "Task created");
      closeTaskForm();
      openTask(res.value.id);
    } else if (editing) {
      const res = updateTaskDetails(editing.id, base);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Task updated");
      closeTaskForm();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader
        title={isNew ? "Add task" : "Edit task"}
        description={isNew ? "A task is a concrete outcome of 2 days or less that contributes to a goal." : "Changes to dates, estimate and dependency are kept in the task history."}
      />
      <DialogBody className="flex flex-col gap-5">
        {isNew && (
          <PlanHint
            onPlan={() => {
              closeTaskForm();
              openAssistant({ plan: true, draft: [form.title, form.notes].filter((s) => s.trim()).join("\n") });
            }}
          />
        )}
        {isNew ? (
          <Field label="Goal" error={errors.goalId}>
            <GoalCombobox
              goals={data.goals}
              value={goalId}
              newValue={NEW_GOAL}
              onChange={(id, typed) => {
                setGoalId(id);
                if (id === NEW_GOAL && typed) setGoalInput((g) => ({ ...g, title: g.title || typed }));
              }}
            />
          </Field>
        ) : (
          <div>
            <p className="text-[13px] font-medium">Goal</p>
            <p className="mt-1 text-sm text-muted">{data.goals.find((g) => g.id === goalId)?.title}</p>
          </div>
        )}

        {isNew && goalId === NEW_GOAL && (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="mb-3 text-[13px] font-semibold">New goal</p>
            <GoalFields value={goalInput} onChange={setGoalInput} errors={errors} prefix="goal." />
          </div>
        )}

        <Field
          label="Task outcome"
          error={errors.title}
          hint="Describe the result, e.g. “Fix crash on pet profile photo upload”. Rough is fine: use Tidy with AI."
          action={
            <TidyButton
              input={{ kind: "task", title: form.title, notes: form.notes, goalTitle: goalId === NEW_GOAL ? goalInput.title : data.goals.find((g) => g.id === goalId)?.title }}
              onApply={(r) => set({ title: r.title, notes: r.notes })}
            />
          }
        >
          <Input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} autoFocus={!isNew || goalId !== NEW_GOAL} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <EstimatePicker value={form.estimate as Estimate | null} onChange={(estimate) => set({ estimate })} error={errors.estimate} />
          {isNew && (
            <Field label="Status">
              <NativeSelect value={form.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
                {CREATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" error={errors.startDate}>
              <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field
              label="Target finish date"
              error={errors.targetDate}
              hint={editing && editing.targetDate !== editing.originalTargetDate ? `Originally ${formatLong(editing.originalTargetDate)}` : undefined}
            >
              <Input type="date" value={form.targetDate} min={form.startDate} onChange={(e) => set({ targetDate: e.target.value })} />
            </Field>
          </div>
          {isNew && (
            <p className="mt-2 text-xs text-subtle">
              Sprint:{" "}
              <span className="font-medium text-muted">{autoSprint ? `${autoSprint.name} · ${formatRange(autoSprint.startDate, autoSprint.endDate)}` : "none for this start date"}</span>{" "}
              · set automatically from the start date.
            </p>
          )}
        </div>

        {choices.length > 0 && (
          <Fieldset
            legend={`Priority on ${formatWeekdayShort(form.startDate)}`}
            error={errors.priority}
            hint="P0 is done first. Tasks with the same priority are ordered shortest first."
          >
            <div className="flex flex-wrap gap-2">
              {choices.map((l) => {
                const on = chosen === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPriority(l)}
                    aria-pressed={on}
                    aria-label={`P${l}, ${PRIORITY_HINT[l]}`}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors",
                      on ? "border-primary bg-primary-soft text-primary-soft-fg ring-1 ring-primary" : "border-border-strong text-muted hover:bg-surface-2",
                    )}
                  >
                    P{l}
                    <span className="text-xs font-normal">{PRIORITY_HINT[l]}</span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              <p className="mb-1 font-medium text-text">Your other tasks that day</p>
              <ul className="flex flex-col gap-1">
                {sameDay.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <PriorityBadge level={t.priority ?? 0} className="h-5 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {t.priority === null && <span className="shrink-0 text-subtle">set to P0</span>}
                  </li>
                ))}
              </ul>
            </div>
          </Fieldset>
        )}

        <section aria-labelledby="task-optional-heading" className="flex flex-col gap-5 border-t border-border pt-5">
          <h3 id="task-optional-heading" className="text-[13px] font-semibold text-muted">
            Optional
          </h3>
          <Field label="Notes" optional error={errors.notes} hint="Context a teammate would need.">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="e.g. Repro only on Android 14" />
          </Field>
          <LinksField links={links} onChange={setLinks} errors={errors} />
          <div className="grid gap-4 sm:grid-cols-[1fr_1.5fr]">
            <Field label="Depends on" optional error={errors.dependencyPersonId} hint="Doesn't mark the task as blocked.">
              <NativeSelect value={form.dependencyPersonId} onChange={(e) => set({ dependencyPersonId: e.target.value, ...(e.target.value ? {} : { dependencyDescription: "" }) })}>
                <option value="">No one</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="What you need from them" error={errors.dependencyDescription}>
              <Input
                value={form.dependencyDescription}
                onChange={(e) => set({ dependencyDescription: e.target.value })}
                disabled={!form.dependencyPersonId}
                placeholder={form.dependencyPersonId ? "e.g. Review the API contract" : "Choose a person first"}
                maxLength={200}
              />
            </Field>
          </div>
        </section>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={closeTaskForm}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {isNew ? (goalId === NEW_GOAL ? "Create goal and task" : "Create task") : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
