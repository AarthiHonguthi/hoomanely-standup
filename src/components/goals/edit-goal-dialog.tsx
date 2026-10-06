"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { useData, useLookups } from "@/lib/data/store";
import type { Goal } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { validateGoalForm, type FieldErrors, type GoalFormInput } from "@/lib/validation";
import { GoalFields } from "./goal-fields";

export function EditGoalDialog() {
  const { editGoalId, setEditGoalId } = useUI();
  const { goal } = useLookups();
  const g = editGoalId ? goal.get(editGoalId) : undefined;
  return (
    <Dialog open={Boolean(g)} onOpenChange={(open) => !open && setEditGoalId(null)}>
      <DialogContent>{g && <EditGoalForm key={g.id} goal={g} />}</DialogContent>
    </Dialog>
  );
}

function EditGoalForm({ goal }: { goal: Goal }) {
  const { updateGoal, today, currentUserId } = useData();
  const { setEditGoalId } = useUI();
  const [value, setValue] = useState<GoalFormInput>({ title: goal.title, notes: goal.notes, links: goal.links.map((l) => ({ ...l })), targetDate: goal.targetDate ?? "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const close = () => setEditGoalId(null);

  if (goal.createdById !== currentUserId) {
    return (
      <>
        <DialogHeader title="You can't edit this goal" description="Only the person who created a goal can edit it." />
        <DialogFooter>
          <Button onClick={close}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validateGoalForm(value, today, "", goal.targetDate);
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const res = updateGoal(goal.id, { title: value.title, notes: value.notes, links: value.links, targetDate: value.targetDate || null });
        if (!res.ok) return void toast.error(res.error);
        toast.success("Goal updated");
        close();
      }}
    >
      <DialogHeader title="Edit goal" description="Changes apply to everyone's view of this goal." />
      <DialogBody>
        <GoalFields value={value} onChange={setValue} errors={errors} />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}
