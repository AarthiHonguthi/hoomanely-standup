"use client";

import { ChevronLeft, ChevronRight, Copy, NotebookText, Plus, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { EditPencilIcon } from "@/components/shared/edit-pencil-icon";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { addDays, compareDates, datePart, formatMonth, formatTime, formatWeekdayShort, isWeekend, monthDates, monthKey, shiftMonth, weekdayIndex } from "@/lib/dates";
import { buildMeetingNotes, dayTitle, fromEditableText, meetingNotesText, parseMentions, standupCounts, taskIdsOn, toEditableText, type MeetingNotes } from "@/lib/data/standup-notes";
import { useData, useLookups } from "@/lib/data/store";
import type { ISODate } from "@/lib/types";
import { useUI } from "@/lib/ui-state";
import { cn, firstName, plural } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Calendar of stand-up days, with the selected day's generated meeting notes beside it. */
export function StandupSummary() {
  const { data, today } = useData();
  const [month, setMonth] = useState(() => shiftMonth(today, 0));
  const [selected, setSelected] = useState(today);
  const counts = useMemo(() => standupCounts(data), [data]);
  const notes = useMemo(() => buildMeetingNotes(data, selected), [data, selected]);

  const select = (d: ISODate) => {
    setSelected(d);
    if (monthKey(d) !== monthKey(month)) setMonth(shiftMonth(d, 0));
  };

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <MiniCalendar month={month} setMonth={setMonth} selected={selected} onSelect={select} counts={counts} today={today} />
      </div>
      <Notes notes={notes} isFuture={compareDates(selected, today) > 0} />
    </div>
  );
}

function MiniCalendar({
  month,
  setMonth,
  selected,
  onSelect,
  counts,
  today,
}: {
  month: ISODate;
  setMonth: (m: ISODate) => void;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  counts: Map<ISODate, number>;
  today: ISODate;
}) {
  const dates = useMemo(() => monthDates(month), [month]);
  const leading = weekdayIndex(dates[0]);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected, month]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    focusNext.current = true;
    onSelect(addDays(selected, step));
  };

  return (
    <section className="rounded-card border border-border bg-surface p-3 shadow-card" aria-labelledby="standup-cal-heading">
      <div className="mb-2 flex items-center gap-1">
        <h3 id="standup-cal-heading" className="flex-1 px-1 text-sm font-semibold" aria-live="polite">
          {formatMonth(month)}
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-medium text-subtle" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7 gap-1" role="group" aria-label={`${formatMonth(month)} stand-ups`}>
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {dates.map((d) => {
          const n = counts.get(d) ?? 0;
          const isSel = d === selected;
          return (
            <button
              key={d}
              data-date={d}
              onClick={() => onSelect(d)}
              onKeyDown={onKey}
              tabIndex={isSel ? 0 : -1}
              aria-pressed={isSel}
              aria-label={`${dayTitle(d)}: ${n ? plural(n, "check-in") : "no stand-up"}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs tabular-nums transition-colors",
                isSel ? "bg-primary font-semibold text-primary-fg" : n ? "font-medium text-text hover:bg-surface-2" : "text-subtle hover:bg-surface-2",
                !isSel && d === today && "ring-1 ring-primary",
                !isSel && isWeekend(d) && "text-subtle/70",
              )}
            >
              {Number(d.slice(-2))}
              <span className={cn("size-1 rounded-full", n ? (isSel ? "bg-primary-fg" : "bg-[var(--reef-dot)]") : "bg-transparent")} aria-hidden />
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-subtle">
        <span className="size-1.5 rounded-full bg-[var(--reef-dot)]" aria-hidden />
        Stand-up notes available
      </p>
    </section>
  );
}

function Notes({ notes, isFuture }: { notes: MeetingNotes; isFuture: boolean }) {
  const { data, saveMeetingNotes, resetMeetingNotes } = useData();
  const { person } = useLookups();
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const empty = notes.attendees.length === 0 && !notes.edited;

  // Leave edit mode when another day is picked.
  const [shownDate, setShownDate] = useState(notes.date);
  if (shownDate !== notes.date) {
    setShownDate(notes.date);
    setEditing(false);
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meetingNotesText(notes, data));
      toast.success("Notes copied", { description: "Paste them into Slack or a doc." });
    } catch {
      toast.error("Couldn't copy. Your browser blocked clipboard access.");
    }
  };

  const toggleAction = (index: number, done: boolean) => {
    const res = saveMeetingNotes({
      date: notes.date,
      summary: notes.summary,
      points: notes.points,
      actionItems: notes.actionItems.map((x, j) => (j === index ? { ...x, done } : x)),
    });
    if (!res.ok) toast.error(res.error);
  };

  const editor = notes.edited ? person.get(notes.edited.byId) : undefined;

  return (
    <article className="min-w-0 rounded-card border border-border bg-surface shadow-card" aria-labelledby="notes-heading">
      <div className="flex flex-wrap items-start gap-3 px-6 pt-6 sm:px-10 sm:pt-8">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-subtle">
            <NotebookText className="size-3.5" aria-hidden />
            Meeting notes
          </p>
          <h3 id="notes-heading" className="mt-1 text-xl font-semibold tracking-tight">
            Stand-up · {dayTitle(notes.date)}
          </h3>
        </div>
        {!empty && !editing && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <EditPencilIcon />
              Edit notes
            </Button>
            <Button variant="secondary" size="sm" onClick={copy}>
              <Copy />
              Copy notes
            </Button>
          </div>
        )}
      </div>

      {empty ? (
        <p className="px-6 pb-12 pt-8 text-sm text-muted sm:px-10">
          {isFuture ? "No stand-up yet. Notes appear here after the meeting." : isWeekend(notes.date) ? "Weekend. No stand-up on this day." : "No stand-up notes for this day."}
        </p>
      ) : editing ? (
        <NotesEditor notes={notes} onDone={() => setEditing(false)} />
      ) : (
        <div className="max-w-3xl px-6 pb-8 pt-4 text-[15px] leading-7 text-text sm:px-10 sm:pb-10">
          {notes.attendees.length > 0 && (
            <p className="text-sm text-muted">
              <span className="font-medium text-text">Attendees:</span> <Names ids={notes.attendees} />
              {notes.absent.length > 0 && (
                <>
                  <br />
                  <span className="font-medium text-text">Absent:</span> <Names ids={notes.absent} />
                </>
              )}
            </p>
          )}

          {notes.summary && (
            <>
              <DocHeading>Summary</DocHeading>
              <p className="whitespace-pre-line">
                <Rich text={notes.summary} />
              </p>
            </>
          )}

          {notes.points.length > 0 && (
            <>
              <DocHeading>Discussion</DocHeading>
              <ul className="list-disc space-y-2 pl-5 marker:text-subtle">
                {notes.points.map((pt, i) => (
                  <li key={i} className="whitespace-pre-line">
                    <Rich text={pt} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {notes.actionItems.length > 0 && (
            <>
              <DocHeading>Action items</DocHeading>
              <ul className="space-y-2">
                {notes.actionItems.map((a, i) => (
                  <li key={i} className="flex gap-2.5">
                    <Checkbox className="mt-[5px]" checked={a.done} onCheckedChange={(v) => toggleAction(i, v === true)} aria-label={`Action item ${i + 1} done`} />
                    <span className={cn(a.done && "text-subtle line-through")}>
                      <Rich text={a.text} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-subtle">
            {notes.edited ? (
              <>
                <span>
                  Edited by {editor ? firstName(editor.name) : "someone"} · {formatWeekdayShort(datePart(notes.edited.at))}, {formatTime(notes.edited.at)}
                </span>
                <button onClick={() => setConfirmReset(true)} className="font-medium text-muted underline underline-offset-2 hover:text-text">
                  Reset to generated notes
                </button>
              </>
            ) : (
              <span>{notes.source === "check-ins" ? "Written automatically from this day's check-ins." : "Summarised from the meeting recording."}</span>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to generated notes?"
        description="The edits to these notes are removed for everyone, and the notes are written again from the day's check-ins."
        confirmLabel="Reset notes"
        destructive
        onConfirm={() => {
          const res = resetMeetingNotes(notes.date);
          if (res.ok) toast.success("Notes reset");
          else toast.error(res.error);
        }}
      />
    </article>
  );
}

let draftKey = 0;
const nextKey = () => ++draftKey;

/** Edits the notes as readable text: "@Name" highlights a teammate, and the day's task titles stay linked. */
function NotesEditor({ notes, onDone }: { notes: MeetingNotes; onDone: () => void }) {
  const { data, saveMeetingNotes } = useData();
  const [summary, setSummary] = useState(() => toEditableText(notes.summary, data));
  const [points, setPoints] = useState(() => notes.points.map((p) => ({ key: nextKey(), text: toEditableText(p, data) })));
  const [actions, setActions] = useState(() => notes.actionItems.map((a) => ({ key: nextKey(), text: toEditableText(a.text, data), done: a.done })));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = taskIdsOn(data, notes.date);
    const back = (t: string) => fromEditableText(t, data, ids);
    const res = saveMeetingNotes({
      date: notes.date,
      summary: back(summary),
      points: points.map((p) => back(p.text)),
      actionItems: actions.map((a) => ({ text: back(a.text), done: a.done })),
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success("Notes saved", { description: "Everyone sees the edited notes." });
    onDone();
  };

  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-6 px-6 pb-8 pt-4 sm:px-10 sm:pb-10" aria-label="Edit meeting notes">
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
        Type <span className="font-semibold text-text">@Name</span> to highlight a teammate. Task names from the day&apos;s check-ins stay clickable.
      </p>

      <Field label="Summary">
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={4000} className="field-sizing-content" />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium">Discussion</legend>
        {points.map((p, i) => (
          <div key={p.key} className="flex items-start gap-2">
            <Textarea
              value={p.text}
              onChange={(e) => setPoints((ps) => ps.map((x) => (x.key === p.key ? { ...x, text: e.target.value } : x)))}
              rows={2}
              maxLength={2000}
              className="field-sizing-content"
              aria-label={`Discussion point ${i + 1}`}
            />
            <Button variant="ghost" size="icon-sm" className="size-9 shrink-0" onClick={() => setPoints((ps) => ps.filter((x) => x.key !== p.key))} aria-label={`Remove discussion point ${i + 1}`}>
              <X />
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setPoints((ps) => [...ps, { key: nextKey(), text: "" }])}>
          <Plus />
          Add point
        </Button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium">Action items</legend>
        {actions.map((a, i) => (
          <div key={a.key} className="flex items-start gap-2">
            <Checkbox
              className="mt-2.5"
              checked={a.done}
              onCheckedChange={(v) => setActions((as) => as.map((x) => (x.key === a.key ? { ...x, done: v === true } : x)))}
              aria-label={`Action item ${i + 1} done`}
            />
            <Textarea
              value={a.text}
              onChange={(e) => setActions((as) => as.map((x) => (x.key === a.key ? { ...x, text: e.target.value } : x)))}
              rows={1}
              className="min-h-9 field-sizing-content py-1.5"
              maxLength={1000}
              placeholder="e.g. @Pranjal to share the Figma design with @Aarthi"
              aria-label={`Action item ${i + 1}`}
            />
            <Button variant="ghost" size="icon-sm" className="size-9 shrink-0" onClick={() => setActions((as) => as.filter((x) => x.key !== a.key))} aria-label={`Remove action item ${i + 1}`}>
              <X />
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setActions((as) => [...as, { key: nextKey(), text: "", done: false }])}>
          <Plus />
          Add action item
        </Button>
      </fieldset>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save notes
        </Button>
      </div>
    </form>
  );
}

function DocHeading({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 mt-7 text-base font-semibold">{children}</h4>;
}

function Names({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && ", "}
          <PersonMention id={id} />
        </Fragment>
      ))}
    </>
  );
}

function PersonMention({ id }: { id: string }) {
  const { person } = useLookups();
  const p = person.get(id);
  return <span className="rounded bg-primary-soft px-1 py-px font-semibold text-primary-soft-fg">{p ? firstName(p.name) : "Someone"}</span>;
}

/** Text with @person mentions highlighted and #task mentions clickable. */
function Rich({ text }: { text: string }) {
  const { task } = useLookups();
  const { openTask } = useUI();
  return (
    <>
      {parseMentions(text).map((part, i) => {
        if (part.kind === "text") return <Fragment key={i}>{part.value}</Fragment>;
        if (part.kind === "person") return <PersonMention key={i} id={part.id} />;
        const t = task.get(part.id);
        return t ? (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => openTask(t.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openTask(t.id);
              }
            }}
            className="cursor-pointer rounded-sm font-medium underline decoration-border-strong underline-offset-4 hover:decoration-text focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t.title}
          </span>
        ) : (
          <Fragment key={i}>a task</Fragment>
        );
      })}
    </>
  );
}
