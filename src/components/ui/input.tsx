import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-lg border border-border-strong bg-surface text-sm text-text placeholder:text-subtle transition-colors hover:border-subtle focus-visible:border-transparent focus-visible:outline-offset-0 disabled:opacity-60 aria-[invalid=true]:border-[var(--error-dot)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-9 px-3", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[72px] resize-y px-3 py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

/** Native select (best keyboard and screen-reader support), styled to match. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className={cn("relative", className)}>
    <select ref={ref} className={cn(fieldBase, "h-9 appearance-none pl-3 pr-8")} {...props}>
      {children}
    </select>
    <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
  </div>
));
NativeSelect.displayName = "NativeSelect";
