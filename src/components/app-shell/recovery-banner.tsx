"use client";

import { Info, X } from "lucide-react";
import { useData } from "@/lib/data/store";

/** Explains when saved demo data was discarded, and when edits can't be saved. */
export function RecoveryBanner() {
  const { recoveryNotice, dismissRecoveryNotice, persistenceAvailable, hydrated } = useData();
  if (!hydrated) return null;
  if (!recoveryNotice && persistenceAvailable) return null;
  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8">
      <div role="status" className="flex items-start gap-2.5 rounded-lg border border-border bg-[var(--gold-bg)] px-3 py-2.5 text-sm text-[var(--gold-fg)]">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="flex-1">
          {recoveryNotice ?? "This browser is blocking local storage, so changes will be lost when you refresh."}
        </p>
        {recoveryNotice && (
          <button onClick={dismissRecoveryNotice} className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Dismiss notice">
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
