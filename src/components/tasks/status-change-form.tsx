"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { STATUS_LABELS } from "@/lib/config";
import { formatLong } from "@/lib/dates";
import { laterSprints } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { statusNeedsReason, validateReason } from "@/lib/validation";

const REASON_LABEL: Partial<Record<TaskStatus, string>> = {
  blocked: "What is blocking it?",
  dropped: "Why is it being dropped?",
  carried_over: "Why is it carrying over?",
};

export function StatusChangeForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { data, changeTaskStatus, today } = useData();
  const [status, setStatus] = useState<TaskStatus>(task.status === "not_started" ? "in_progress" : task.status);
  const [reason, setReason] = useState("");
  const sprints = laterSprints(data, task.sprintId);
  const [toSprintId, setToSprintId] = useState(sprints[0]?.id ?? "");
  const [submitted, setSubmitted] = useState(false);

  const reasonError = submitted ? validateReason(status, reason) : null;
  const sprintError = submitted && status === "carried_over" && !toSprintId ? "Choose the destination sprint." : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (status === task.status) return onDone();
    if (validateReason(status, reason) || (status === "carried_over" && !toSprintId)) return;
    const res = changeTaskStatus(task.id, { status, reason, toSprintId });
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Status changed to ${STATUS_LABELS[status]}`, {
      description: status === "done" ? `Completion date recorded as ${formatLong(today)}.` : undefined,
    });
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <Field label="New status">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === "carried_over" && sprints.length === 0}>
              {STATUS_LABELS[s]}
              {s === task.status ? " (current)" : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {status === "carried_over" && (
        <Field label="Destination sprint" error={sprintError}>
          <NativeSelect value={toSprintId} onChange={(e) => setToSprintId(e.target.value)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {statusNeedsReason(status) && status !== task.status && (
        <Field label={REASON_LABEL[status]} error={reasonError}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
      )}
      {status === "done" && status !== task.status && <p className="text-xs text-subtle">The completion date will be recorded as today ({formatLong(today)}).</p>}
      {status === "dropped" && status !== task.status && <p className="text-xs text-subtle">Dropped tasks stay on the goal for the record but never count as complete.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          Save status
        </Button>
      </div>
    </form>
  );
}
