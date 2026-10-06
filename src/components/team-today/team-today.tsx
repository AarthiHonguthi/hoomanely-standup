"use client";

import { CalendarX2, ClipboardCheck, Coffee, RotateCcw, UserRoundX } from "lucide-react";
import { useMemo } from "react";
import { Avatar } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatLong, formatShort, formatWeekday, relativeDayLabel } from "@/lib/dates";
import { buildFeed, sortPeople, type FeedDay } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { DEFAULT_RANGE, useUI } from "@/lib/ui-state";
import { cn, firstName } from "@/lib/utils";
import { AttentionPanel } from "./attention-panel";
import { CheckInCard } from "./checkin-card";
import { DateFilter } from "./date-filter";
import { PeopleFilter } from "./people-filter";
import { SprintFilter } from "./sprint-filter";

export function TeamToday() {
  const { data, today } = useData();
  const { range, personIds, resetFilters, setPersonIds } = useUI();
  const feed = useMemo(() => buildFeed(data, range, personIds), [data, range, personIds]);

  const filtersActive = personIds.length > 0 || range.start !== DEFAULT_RANGE.start || range.end !== DEFAULT_RANGE.end;
  const total = feed.reduce((n, d) => n + d.checkIns.length, 0);
  const selectedPeople = sortPeople(data.people.filter((p) => personIds.includes(p.id)));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 xl:flex-row xl:items-start">
      <section className="min-w-0 flex-1" aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="sr-only">
          Check-ins
        </h2>
        <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          <DateFilter />
          <PeopleFilter />
          <SprintFilter />
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw />
              Reset filters
            </Button>
          )}
          <p className="ml-auto text-xs text-subtle" aria-live="polite">
            {total} {total === 1 ? "check-in" : "check-ins"}
          </p>
        </div>

        {total === 0 && feed.every((d) => d.missing.length === 0) ? (
          <EmptyRange
            futureOnly={range.start > today}
            peopleNames={selectedPeople.map((p) => p.name)}
            onShowEveryone={personIds.length ? () => setPersonIds([]) : undefined}
            onReset={resetFilters}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {feed.map((day) => (
              <DaySection key={day.date} day={day} today={today} />
            ))}
          </div>
        )}
      </section>

      <AttentionPanel />
    </div>
  );
}

function DaySection({ day, today }: { day: FeedDay; today: string }) {
  const { currentUserId } = useData();
  const { setCheckInOpen } = useUI();
  const rel = relativeDayLabel(day.date, today);
  const future = day.date > today;
  const expected = day.checkIns.length + day.missing.length;
  const headingId = `day-${day.date}`;

  if (day.weekend && day.checkIns.length === 0) {
    return (
      <section aria-labelledby={headingId} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-subtle">
        <Coffee className="size-4" aria-hidden />
        <h3 id={headingId} className="font-medium text-muted">
          {formatWeekday(day.date)} {formatShort(day.date)}
        </h3>
        <span>· Weekend, no check-ins expected</span>
      </section>
    );
  }

  const meMissing = day.date === today && day.missing.some((p) => p.id === currentUserId);

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-base font-semibold">
          {formatWeekday(day.date)} <span className="font-normal text-muted">{formatShort(day.date)}</span>
        </h3>
        {rel && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              rel === "Today" ? "bg-primary-soft text-primary-soft-fg" : "bg-surface-3 text-muted",
            )}
          >
            {rel}
          </span>
        )}
        {!future && expected > 0 && (
          <span className="text-xs text-subtle">
            {day.checkIns.length} of {expected} checked in
          </span>
        )}
      </div>

      {day.checkIns.length > 0 && (
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {day.checkIns.map((c) => (
            <CheckInCard key={c.id} checkIn={c} />
          ))}
        </div>
      )}

      {future ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-subtle">This date is after today, so there are no check-ins yet.</p>
      ) : (
        day.missing.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm",
              day.checkIns.length > 0 && "mt-3",
            )}
          >
            <span className="flex items-center gap-1.5 text-subtle">
              <UserRoundX className="size-4" aria-hidden />
              {day.date === today ? "Not checked in yet" : "No check-in"}
            </span>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
              {day.missing.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5 text-muted">
                  <Avatar person={p} size="xs" className="opacity-80" />
                  {p.id === currentUserId ? "You" : firstName(p.name)}
                </li>
              ))}
            </ul>
            {meMissing && (
              <Button variant="soft" size="sm" className="ml-auto" onClick={() => setCheckInOpen(true)}>
                <ClipboardCheck />
                Publish my check-in
              </Button>
            )}
          </div>
        )
      )}
    </section>
  );
}

function EmptyRange({
  futureOnly,
  peopleNames,
  onShowEveryone,
  onReset,
}: {
  futureOnly: boolean;
  peopleNames: string[];
  onShowEveryone?: () => void;
  onReset: () => void;
}) {
  const { range } = useUI();
  const who = peopleNames.length === 0 ? "anyone" : peopleNames.length <= 2 ? peopleNames.join(" or ") : `the ${peopleNames.length} selected people`;
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2">
        <CalendarX2 className="size-5 text-subtle" aria-hidden />
      </span>
      <p className="font-medium">No check-ins to show</p>
      <p className="mt-1 max-w-md text-sm text-muted">
        {futureOnly
          ? "These dates are after today, so nobody has checked in yet."
          : `There are no check-ins from ${who} between ${formatLong(range.start)} and ${formatLong(range.end)} (both included). Weekends usually have none.`}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onShowEveryone && (
          <Button variant="secondary" onClick={onShowEveryone}>
            Show everyone
          </Button>
        )}
        <Button variant="primary" onClick={onReset}>
          Back to today
        </Button>
      </div>
    </div>
  );
}
