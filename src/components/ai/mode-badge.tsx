import type { AiMode } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/** Says whether a result came from Claude or the offline assistant. */
export function AiModeBadge({ mode, className }: { mode: AiMode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium",
        mode === "claude" ? "bg-[var(--reef-bg)] text-[var(--reef-fg)]" : "bg-[var(--neutral-bg)] text-[var(--neutral-fg)]",
        className,
      )}
      title={mode === "claude" ? "Written by Claude" : "Offline suggestion: add an API key on the server for Claude"}
    >
      {mode === "claude" ? "Claude" : "Offline"}
    </span>
  );
}
