import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Extra control shown at the end of the label row (e.g. an AI button). */
  action?: ReactNode;
  /** A single form control; receives id, aria-invalid and aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
}

export function Field({ label, hint, error, optional, className, action, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })
    : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex min-h-5 items-end justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-text">
          {label}
          {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
        </label>
        {action}
      </div>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-[var(--error-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Group label for radio groups. */
export function Fieldset({
  legend,
  error,
  hint,
  children,
  className,
}: {
  legend: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <legend className="mb-1.5 text-[13px] font-medium text-text">{legend}</legend>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
      {error && <p className="text-xs font-medium text-[var(--error-fg)]">{error}</p>}
    </fieldset>
  );
}
