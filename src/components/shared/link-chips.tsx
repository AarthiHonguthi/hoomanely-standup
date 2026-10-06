import { Link2 } from "lucide-react";
import type { ResultLink } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Named links as small clickable chips that open in a new tab. */
export function LinkChips({ links, className, max }: { links: ResultLink[]; className?: string; max?: number }) {
  if (links.length === 0) return null;
  const shown = max ? links.slice(0, max) : links;
  const hidden = links.length - shown.length;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Links">
      {shown.map((l) => (
        <li key={l.id} className="min-w-0 max-w-full">
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer noopener"
            title={l.url}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-primary-soft-fg transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            <Link2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{l.label}</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
      {hidden > 0 && <li className="self-center text-xs text-subtle">+{hidden} more</li>}
    </ul>
  );
}
