"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { useData } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";
import { validateGoalForm, type FieldErrors, type GoalFormInput } from "@/lib/validation";
import { PlanHint } from "@/components/ai/plan-hint";
import { emptyGoalInput, GoalFields } from "./goal-fields";

export function GoalFormDialog() {
  const { goalFormOpen, setGoalFormOpen } = useUI();
  return (
    <Dialog open={goalFormOpen} onOpenChange={setGoalFormOpen}>
      <DialogContent>{goalFormOpen && <GoalForm />}</DialogContent>
    </Dialog>
  );
}

function GoalForm() {
  const { createGoal, today } = useData();
  const { setGoalFormOpen, openTaskForm, openAssistant } = useUI();
  const router = useRouter();
  const [value, setValue] = useState<GoalFormInput>(emptyGoalInput);
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = (addTask: boolean) => {
    const errs = validateGoalForm(value, today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = createGoal({ ...value, targetDate: value.targetDate || null });
    if (!res.ok) return void toast.error(res.error);
    toast.success("Goal created");
    setGoalFormOpen(false);
    router.push(`/goals?goal=${res.value.id}`);
    if (addTask) openTaskForm({ mode: "create", goalId: res.value.id });
  };

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <DialogHeader title="New goal" description="A goal is a larger outcome. Everyone adds their own tasks under it." />
      <DialogBody className="flex flex-col gap-5">
        <PlanHint
          onPlan={() => {
            setGoalFormOpen(false);
            openAssistant({ plan: true, draft: [value.title, value.notes].filter((s) => s.trim()).join("\n") });
          }}
        />
        <GoalFields value={value} onChange={setValue} errors={errors} />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setGoalFormOpen(false)}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => save(true)}>
          Create and add a task
        </Button>
        <Button type="submit" variant="primary">
          Create goal
        </Button>
      </DialogFooter>
    </form>
  );
}
