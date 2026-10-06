"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { NotesText } from "@/components/shared/notes-text";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tidy, AssistError } from "@/lib/ai/client";
import type { AiMode, TidyInput, TidyResult } from "@/lib/ai/types";
import { AiModeBadge } from "./mode-badge";

/**
 * "Tidy with AI": rewrites the rough title and notes into a short, clear
 * entry. Shows the suggestion first; nothing changes until "Use this".
 */
export function TidyButton({ input, onApply }: { input: TidyInput; onApply: (r: TidyResult) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TidyResult | null>(null);
  const [mode, setMode] = useState<AiMode>("offline");
  const [error, setError] = useState<string | null>(null);
  const empty = !input.title.trim() && !input.notes.trim();

  const run = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const out = await tidy(input);
      setResult(out.value);
      setMode(out.mode);
    } catch (e) {
      setError(e instanceof AssistError ? e.message : "The assistant hit an error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-primary-soft-fg"
          disabled={empty}
          title={empty ? "Type a rough title or notes first" : "Rewrite in a short, clear format"}
          onClick={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Sparkles className="!size-3.5" />
          Tidy with AI
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-4" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Suggested {input.kind}</p>
          {!loading && result && <AiModeBadge mode={mode} />}
        </div>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Rewriting…
          </p>
        )}
        {error && <p className="text-sm text-[var(--error-fg)]">{error}</p>}
        {result && (
          <>
            <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-sm font-medium">{result.title}</p>
              {result.notes ? <NotesText text={result.notes} className="text-[13px] text-muted" /> : <p className="text-xs text-subtle">No extra notes.</p>}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onApply(result);
                  setOpen(false);
                }}
              >
                Use this
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
