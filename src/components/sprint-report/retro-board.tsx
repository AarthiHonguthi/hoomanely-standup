"use client";

import { Lightbulb, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { retroInsights, type RetroColumn, type SprintReport } from "@/lib/data/sprint-report";
import { useData, useLookups } from "@/lib/data/store";
import { cn, firstName } from "@/lib/utils";

const COLUMNS: { key: RetroColumn; title: string; icon: typeof ThumbsUp; tone: string; placeholder: string }[] = [
  { key: "well", title: "Went well", icon: ThumbsUp, tone: "text-[var(--success-fg)]", placeholder: "Something that worked…" },
  { key: "not_well", title: "Didn't go well", icon: ThumbsDown, tone: "text-[var(--error-fg)]", placeholder: "Something that slowed us down…" },
  { key: "try", title: "Try next", icon: Lightbulb, tone: "text-[var(--warning-fg)]", placeholder: "An idea for next sprint…" },
];

/** Retro board for a sprint: starts with cards written from the sprint's numbers; anyone can add cards and +1 them. */
export function RetroBoard({ report }: { report: SprintReport }) {
  const { data, currentUserId, addRetroCard, removeRetroCard, toggleRetroVote } = useData();
  const { person } = useLookups();
  const insights = retroInsights(report);
  const cards = data.retroCards.filter((c) => c.sprintId === report.sprint.id);

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5" aria-labelledby="retro-heading">
      <h3 id="retro-heading" className="text-sm font-semibold">
        Retro · {report.sprint.name}
      </h3>
      <p className="mb-4 text-xs text-subtle">
        Cards marked <Sparkles className="inline size-3" aria-hidden /> are written from the sprint&apos;s numbers. Add your own and +1 the ones you agree with.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const Icon = col.icon;
          const mine = cards.filter((c) => c.column === col.key).sort((a, b) => b.votes.length - a.votes.length || a.createdAt.localeCompare(b.createdAt));
          return (
            <div key={col.key} className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3" role="group" aria-label={col.title}>
              <h4 className={cn("flex items-center gap-1.5 text-[13px] font-semibold", col.tone)}>
                <Icon className="size-4" aria-hidden />
                {col.title}
              </h4>
              <ul className="flex flex-col gap-2">
                {insights
                  .filter((i) => i.column === col.key)
                  .map((i) => (
                    <li key={i.key} className="rounded-lg border border-dashed border-border-strong bg-surface px-3 py-2 text-[13px] leading-snug">
                      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-subtle">
                        <Sparkles className="size-3" aria-hidden />
                        From sprint data
                      </span>
                      {i.text}
                    </li>
                  ))}
                {mine.map((c) => {
                  const author = person.get(c.authorId);
                  const voted = c.votes.includes(currentUserId);
                  return (
                    <li key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] leading-snug shadow-card">
                      <p className="whitespace-pre-line [overflow-wrap:anywhere]">{c.text}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {author && <Avatar person={author} size="xs" />}
                        <span className="flex-1 text-[11px] text-subtle">{author ? firstName(author.name) : "Someone"}</span>
                        {c.authorId === currentUserId && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            onClick={() => {
                              const res = removeRetroCard(c.id);
                              if (!res.ok) toast.error(res.error);
                            }}
                            aria-label={`Remove card: ${c.text}`}
                          >
                            <Trash2 />
                          </Button>
                        )}
                        <button
                          onClick={() => {
                            const res = toggleRetroVote(c.id);
                            if (!res.ok) toast.error(res.error);
                          }}
                          aria-pressed={voted}
                          aria-label={`${voted ? "Remove your +1 from" : "+1"} card: ${c.text}. ${c.votes.length} votes`}
                          className={cn(
                            "flex h-7 items-center rounded-md border px-2 text-xs font-medium tabular-nums transition-colors",
                            voted ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border text-muted hover:bg-surface-2",
                          )}
                        >
                          +1{c.votes.length > 0 && ` · ${c.votes.length}`}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <AddCard
                placeholder={col.placeholder}
                label={`Add a card to ${col.title}`}
                onAdd={(text) => {
                  const res = addRetroCard({ sprintId: report.sprint.id, column: col.key, text });
                  if (!res.ok) toast.error(res.error);
                  return res.ok;
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddCard({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (text: string) => boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (onAdd(text)) setText("");
  };
  return (
    <form
      className="mt-auto flex flex-col gap-1.5 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={280}
        placeholder={placeholder}
        aria-label={label}
        className="min-h-14 bg-surface text-[13px]"
      />
      {text.trim() && (
        <Button type="submit" size="sm" variant="secondary" className="self-end">
          Add card
        </Button>
      )}
    </form>
  );
}
