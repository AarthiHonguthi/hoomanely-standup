"use client";

import { TidyButton } from "@/components/ai/tidy-button";
import { LinksField } from "@/components/shared/links-field";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { FieldErrors, GoalFormInput } from "@/lib/validation";

export const emptyGoalInput: GoalFormInput = { title: "", notes: "", links: [], targetDate: "" };

export function GoalFields({
  value,
  onChange,
  errors,
  prefix = "",
}: {
  value: GoalFormInput;
  onChange: (v: GoalFormInput) => void;
  errors: FieldErrors;
  prefix?: string;
}) {
  const set = (patch: Partial<GoalFormInput>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Goal title"
        error={errors[`${prefix}title`]}
        hint="The larger outcome, e.g. “New app release stabilisation and monitoring”."
        action={<TidyButton input={{ kind: "goal", title: value.title, notes: value.notes }} onApply={(r) => set({ title: r.title, notes: r.notes })} />}
      >
        <Input value={value.title} onChange={(e) => set({ title: e.target.value })} maxLength={140} />
      </Field>
      <Field label="Notes" optional error={errors[`${prefix}notes`]} hint="Context and what done looks like. Add links below.">
        <Textarea value={value.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="e.g. Done when crash-free sessions stay above 99.5%" />
      </Field>
      <LinksField links={value.links} onChange={(links) => set({ links })} errors={errors} prefix={prefix} />
      <Field label="Target date" optional error={errors[`${prefix}targetDate`]} hint="Goals can take any number of days.">
        <Input type="date" value={value.targetDate} onChange={(e) => set({ targetDate: e.target.value })} className="sm:max-w-52" />
      </Field>
    </div>
  );
}
