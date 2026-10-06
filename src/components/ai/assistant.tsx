"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { ListChecks, Loader2, SendHorizontal, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AssistError, chat, getAiMode, plan } from "@/lib/ai/client";
import { buildSnapshot } from "@/lib/ai/snapshot";
import { AI_LIMITS, type AiMode, type ChatTurn, type PlanResult } from "@/lib/ai/types";
import { useData } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";
import { asset } from "@/lib/site";
import { cn } from "@/lib/utils";
import { AiModeBadge } from "./mode-badge";
import { PlanCard } from "./plan-card";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  plan?: PlanResult;
  error?: boolean;
  pending?: boolean;
}

const SUGGESTIONS = ["What's blocked right now?", "Summarise today's standup", "Who hasn't checked in?", "How are the goals going?"];

/** Floating "Ask Raana" launcher (Raana is the team's dog) plus a non-modal chat panel. The launcher is hidden on My workspace. */
export function Assistant() {
  const { data, today, currentUserId } = useData();
  const { assistant, openAssistant, closeAssistant } = useUI();
  const showLauncher = usePathname() !== "/me";
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AiMode>("offline");
  const idRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    void getAiMode().then(setMode);
  }, []);

  // A new open request (e.g. "Plan with AI" from a form) may carry a draft.
  useEffect(() => {
    if (!assistant.open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- apply the draft handed over by openAssistant */
    if (assistant.draft) setInput(assistant.draft);
    if (assistant.plan) setPlanMode(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [assistant.open, assistant.nonce, assistant.draft, assistant.plan]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const push = (m: Omit<Message, "id">) => {
    const id = ++idRef.current;
    setMessages((ms) => [...ms, { ...m, id }]);
    return id;
  };
  const patch = (id: number, p: Partial<Message>) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const close = () => {
    restoreFocusRef.current = true;
    closeAssistant();
  };

  // Escape closes the panel wherever focus is, unless a dialog or popover is open on top.
  useEffect(() => {
    if (!assistant.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      restoreFocusRef.current = true;
      closeAssistant();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [assistant.open, closeAssistant]);

  // Return focus to the launcher once it has re-rendered after closing.
  useEffect(() => {
    if (!assistant.open && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      launcherRef.current?.focus();
    }
  }, [assistant.open]);

  const send = async (text: string, asPlan = planMode) => {
    const question = text.trim().slice(0, AI_LIMITS.chatMessage);
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    push({ role: "user", content: asPlan ? `Plan tasks: ${question}` : question });
    const replyId = push({ role: "assistant", content: "", pending: true });
    try {
      if (asPlan) {
        const out = await plan({ text: question, goals: data.goals.map((g) => ({ id: g.id, title: g.title })) });
        setMode(out.mode);
        patch(replyId, { content: out.value.summary, plan: out.value, pending: false });
        setPlanMode(false);
      } else {
        // Plan cards are sent back as their summary text only.
        const history: ChatTurn[] = [...messages, { id: 0, role: "user" as const, content: question }]
          .filter((m) => !m.error && m.content)
          .map((m) => ({ role: m.role, content: m.content }));
        const used = await chat(history, buildSnapshot(data, today, currentUserId), { data, today, currentUserId }, (t) => patch(replyId, { content: t }));
        setMode(used);
        patch(replyId, { pending: false });
      }
    } catch (e) {
      patch(replyId, { content: e instanceof AssistError ? e.message : "The assistant hit an error. Try again.", error: true, pending: false });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <>
      {!assistant.open && showLauncher && (
        <button
          ref={launcherRef}
          onClick={() => openAssistant()}
          className="group fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6"
          aria-label="Ask Raana, the AI assistant"
        >
          {/* Raana peeks over the button. On hover she ducks down behind it and pops back up happy. */}
          <span aria-hidden className="pointer-events-none absolute bottom-full left-1/2 z-0 -mb-[3px] h-16 w-24 -translate-x-1/2 overflow-hidden animate-raana-rise">
            <Image
              src={asset("/raana-peek.png")}
              alt=""
              width={273}
              height={220}
              loading="eager"
              className="absolute bottom-0 left-1/2 h-11 w-auto -translate-x-1/2 transition-transform delay-150 duration-200 ease-out group-hover:translate-y-full group-hover:delay-0 group-hover:ease-in group-focus-visible:translate-y-full group-focus-visible:delay-0 group-focus-visible:ease-in"
            />
            {/* Drawn with a narrower frame, so it is rendered taller to keep Raana's head the same size. */}
            <Image
              src={asset("/raana-happy.png")}
              alt=""
              width={203}
              height={220}
              loading="eager"
              className="absolute bottom-0 left-1/2 h-[58px] w-auto -translate-x-1/2 translate-y-full transition-transform duration-200 ease-in group-hover:translate-y-0 group-hover:delay-150 group-hover:ease-out group-focus-visible:translate-y-0 group-focus-visible:delay-150 group-focus-visible:ease-out"
            />
          </span>
          <span className="relative z-10 flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg shadow-pop transition-colors group-hover:bg-primary-hover">
            Ask Raana
          </span>
        </button>
      )}

      {assistant.open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Ask Raana, AI assistant"
          className="fixed inset-0 z-40 flex flex-col bg-surface shadow-pop animate-pop-in sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(520px,calc(100dvh-6rem))] sm:w-[360px] sm:rounded-card sm:border sm:border-border"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <span className="flex size-8 items-end justify-center overflow-hidden rounded-lg bg-primary-soft">
              <Image src={asset("/raana-peek.png")} alt="" width={273} height={220} className="h-6 w-auto" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Raana</h2>
              <p className="truncate text-xs text-subtle">AI assistant · team questions and planning</p>
            </div>
            <AiModeBadge mode={mode} />
            <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close assistant">
              <X />
            </Button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-muted">Woof! I&apos;m Raana. Ask me about goals, tasks and check-ins, or describe your work and I&apos;ll help plan tasks.</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void send(s, false)} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text">
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setPlanMode(true);
                    inputRef.current?.focus();
                  }}
                  className="flex items-start gap-2 rounded-lg bg-primary-soft p-2.5 text-left text-xs text-primary-soft-fg hover:brightness-95"
                >
                  <ListChecks className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">Plan tasks.</span> Describe your work in your own words and get a goal with tasks.
                  </span>
                </button>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[92%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                        m.role === "user" ? "bg-primary text-primary-fg" : m.error ? "bg-[var(--error-bg)] text-[var(--error-fg)]" : "bg-surface-2 text-text",
                        m.plan && "w-full max-w-full",
                      )}
                    >
                      {m.pending && !m.content ? (
                        <span className="flex items-center gap-2 text-muted" role="status">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          Thinking…
                        </span>
                      ) : (
                        <RichText text={m.content} />
                      )}
                      {m.plan && <PlanCard plan={m.plan} />}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <form
            className="border-t border-border p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            {planMode && (
              <p className="mb-2 flex items-center justify-between gap-2 text-xs text-primary-soft-fg">
                <span className="flex items-center gap-1.5 font-medium">
                  <ListChecks className="size-3.5" aria-hidden />
                  Plan mode: I&apos;ll suggest a goal and tasks
                </span>
                <button type="button" className="rounded underline underline-offset-2" onClick={() => setPlanMode(false)}>
                  Back to chat
                </button>
              </p>
            )}
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-input" className="sr-only">
                {planMode ? "Describe what you're working on" : "Ask the assistant"}
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={planMode ? 3 : 1}
                maxLength={AI_LIMITS.chatMessage}
                placeholder={planMode ? "Describe what you're working on…" : "Ask about the team…"}
                className="max-h-40 min-h-9 flex-1 resize-none rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm placeholder:text-subtle"
              />
              <Button
                type="button"
                variant={planMode ? "soft" : "ghost"}
                size="icon"
                aria-pressed={planMode}
                aria-label="Plan tasks mode"
                title="Plan tasks: turn a description into a goal and tasks"
                onClick={() => setPlanMode((v) => !v)}
              >
                <ListChecks />
              </Button>
              <Button type="submit" variant="primary" size="icon" disabled={busy || !input.trim()} aria-label={planMode ? "Plan tasks" : "Send"}>
                {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">
              {mode === "claude" ? "Answers come from Claude using the team data in this app. Check before relying on them." : "Offline mode: simple built-in answers. Add an API key on the server to use Claude."}
            </p>
          </form>
        </section>
      )}
    </>
  );
}

/** Minimal formatting for replies: "- " bullets, **bold**, and line breaks. */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="my-1 list-disc space-y-0.5 pl-4">
          {bullets.map((b, i) => (
            <li key={i}>{bold(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      if (line.trim()) out.push(<p key={`p-${i}`} className="my-0.5">{bold(line)}</p>);
    }
  });
  flush();
  return <>{out}</>;
}

function bold(s: string): ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>));
}
