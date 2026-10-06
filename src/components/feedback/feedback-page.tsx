"use client";

import { Check, Copy, EyeOff, Lightbulb, MessageSquareHeart, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FEEDBACK_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const KINDS = [
  { id: "idea", label: "An idea" },
  { id: "pain", label: "Something painful today" },
  { id: "workflow", label: "How we work (PRs, stories, bugs)" },
  { id: "prototype", label: "About this prototype" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

const USEFUL = ["Not for me", "Meh", "Could help", "Useful", "Need this!"];

/** Prompts people can tap to add to their note. */
const SPARKS: { topic: string; questions: string[] }[] = [
  {
    topic: "PR lifecycle",
    questions: [
      "Should PRs be linked to tasks here, with review requests and reminders?",
      "What slows down code review for you today?",
      "When a PR merges, should its task close on its own?",
    ],
  },
  {
    topic: "Stories → features → release",
    questions: [
      "How should a PRD or story turn into tasks, then into a release?",
      "Who should own a feature from start to finish?",
      "Would a feature timeline (hardware → firmware → app → release) help?",
    ],
  },
  {
    topic: "Bugs vs features",
    questions: [
      "Should bugs live separately, with severity and a target fix time?",
      "Where do bugs reach us today: Slack, users, QA? Which is messy?",
    ],
  },
  {
    topic: "Stand-ups & check-ins",
    questions: [
      "Is the daily check-in quick enough? What would make it faster?",
      "Would auto-written stand-up notes save you time?",
    ],
  },
  {
    topic: "Planning & priorities",
    questions: ["Are two-week sprints and P0–P3 priorities working for you?", "What would make sprint planning less painful?"],
  },
  {
    topic: "This app",
    questions: ["Which page would you actually open every day?", "What's confusing, missing or just not useful here?"],
  },
];

/**
 * Feedback on the prototype. Anonymous unless the person adds a name. Sends to a
 * Google Sheet through a Google Apps Script web app (docs/feedback-sheet.md).
 */
export function FeedbackPage() {
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [useful, setUseful] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSpark = (q: string) => setText((t) => `${t}${t && !t.endsWith("\n") ? "\n" : ""}• ${q}\n  `);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 5) return setError("Write a few words first.");
    setError(null);
    const payload = {
      kind: KINDS.find((k) => k.id === kind)?.label ?? kind,
      feedback: text.trim(),
      usefulness: useful === null ? "" : `${useful + 1}/5 · ${USEFUL[useful]}`,
      name: name.trim(),
    };
    if (!FEEDBACK_URL) {
      setError("Feedback isn't connected to the sheet yet. Copy your note and send it over chat instead.");
      return;
    }
    setSending(true);
    try {
      // Apps Script doesn't send CORS headers, so this is a simple "no-cors" request; the row is added either way.
      await fetch(FEEDBACK_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      setSent(true);
      setText("");
      setUseful(null);
      toast.success("Thank you! Feedback sent");
    } catch {
      setError("Couldn't send just now. Check your connection, or copy your note and send it over chat.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-5">
        <section className="rounded-card border border-border bg-surface p-6 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
              <MessageSquareHeart className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Help shape how we work</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                This is an early prototype with sample data. Before we build it for real, we want to hear from you: what would make stand-ups, planning,
                reviews and releases easier? Let&apos;s make our lives easier and make teamwork actually happen.
              </p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            <EyeOff className="size-3.5 shrink-0" aria-hidden />
            Don&apos;t worry: your feedback is anonymous unless you add your name.
          </p>
        </section>

        {sent ? (
          <section className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-12 text-center shadow-card">
            <span className="flex size-12 items-center justify-center rounded-full bg-[var(--success-bg)] text-[var(--success-fg)]">
              <Check className="size-6" aria-hidden />
            </span>
            <h3 className="text-lg font-semibold">Thank you, that really helps.</h3>
            <p className="max-w-md text-sm text-muted">Got more thoughts? Send as many as you like. Small things count too.</p>
            <Button variant="secondary" onClick={() => setSent(false)}>
              Share another thought
            </Button>
          </section>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6 shadow-card" aria-label="Feedback">
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">What&apos;s it about?</legend>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    aria-pressed={kind === k.id}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      kind === k.id ? "border-primary bg-primary-soft font-medium text-primary-soft-fg ring-1 ring-primary" : "border-border text-muted hover:bg-surface-2",
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="feedback-text" className="text-[13px] font-medium">
                Your thoughts
              </label>
              <Textarea
                id="feedback-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={9}
                maxLength={5000}
                placeholder="What's working, what's annoying, what you wish existed… Bullet points are perfect. Tap an idea on the right if you need a spark."
                aria-invalid={error ? true : undefined}
              />
              <p className="text-right text-[11px] text-subtle">{text.length} / 5000</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">
                How useful would a tool like this be for you? <span className="font-normal text-subtle">(optional)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {USEFUL.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setUseful(useful === i ? null : i)}
                    aria-pressed={useful === i}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      useful === i ? "border-primary bg-primary-soft font-medium text-primary-soft-fg ring-1 ring-primary" : "border-border text-muted hover:bg-surface-2",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <label htmlFor="feedback-name" className="text-[13px] font-medium">
                Your name <span className="font-normal text-subtle">(optional, leave blank to stay anonymous)</span>
              </label>
              <Input id="feedback-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
            </div>

            {error && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-fg)]" role="alert">
                <span className="flex-1">{error}</span>
                {text.trim() && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(text);
                        toast.success("Copied");
                      } catch {
                        toast.error("Couldn't copy");
                      }
                    }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-black/5"
                  >
                    <Copy className="size-3.5" /> Copy note
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={sending}>
                <Send />
                {sending ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </form>
        )}
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start" aria-labelledby="sparks-heading">
        <div className="rounded-card border border-border bg-surface p-5 shadow-card">
          <h3 id="sparks-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-[var(--warning-fg)]" aria-hidden />
            Need a spark?
          </h3>
          <p className="mb-3 text-xs text-subtle">Things we&apos;re thinking about. Tap one to add it to your note, then answer it your way.</p>
          <div className="flex flex-col gap-4">
            {SPARKS.map((s) => (
              <div key={s.topic}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <Sparkles className="size-3" aria-hidden />
                  {s.topic}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {s.questions.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => {
                          setSent(false);
                          addSpark(q);
                        }}
                        className="w-full rounded-lg border border-border px-3 py-2 text-left text-[13px] leading-snug text-text transition-colors hover:border-border-strong hover:bg-surface-2"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-subtle">Open to any suggestion, big or small.</p>
        </div>
      </aside>
    </div>
  );
}
