"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shortcut from a create form into the assistant's "Plan tasks" mode. */
export function PlanHint({ onPlan }: { onPlan: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-primary-soft px-3 py-2.5 text-[13px] text-primary-soft-fg">
      <Sparkles className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">Not sure how to phrase or split it? Describe your work and AI will suggest a goal and tasks.</p>
      <Button variant="secondary" size="sm" onClick={onPlan}>
        Plan with AI
      </Button>
    </div>
  );
}
