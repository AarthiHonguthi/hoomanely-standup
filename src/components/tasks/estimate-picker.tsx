"use client";

import { Field } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/input";
import { ESTIMATE_LABELS } from "@/lib/config";
import { ESTIMATES, type Estimate } from "@/lib/types";

/** Dropdown limited to the four allowed estimates. */
export function EstimatePicker({ value, onChange, error }: { value: Estimate | null; onChange: (e: Estimate) => void; error?: string | null }) {
  return (
    <Field label="Estimated effort" error={error} hint="2 days or less. Split bigger work into more tasks.">
      <NativeSelect value={value === null ? "" : String(value)} onChange={(e) => e.target.value && onChange(Number(e.target.value) as Estimate)}>
        <option value="" disabled>
          Choose…
        </option>
        {ESTIMATES.map((est) => (
          <option key={est} value={est}>
            {ESTIMATE_LABELS[est]}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
