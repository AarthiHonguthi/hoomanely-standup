import type { ISODate, ISODateTime } from "./types";

/**
 * Calendar-date helpers that work on "YYYY-MM-DD" strings using UTC maths,
 * so results never shift with the viewer's timezone.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive list of dates from start to end. */
export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWeekend(date: ISODate): boolean {
  const day = toUTC(date).getUTCDay();
  return day === 0 || day === 6;
}

/** "2026-09" for a date. */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** First day of the month that is `offset` months from `date`'s month. */
export function shiftMonth(date: ISODate, offset: number): ISODate {
  const d = toUTC(`${date.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
}

/** All dates in the month containing `date`. */
export function monthDates(date: ISODate): ISODate[] {
  const first = `${date.slice(0, 7)}-01`;
  return eachDate(first, addDays(shiftMonth(first, 1), -1));
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: ISODate): number {
  return (toUTC(date).getUTCDay() + 6) % 7;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "September 2026" */
export function formatMonth(date: ISODate): string {
  const d = toUTC(date);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Moves forward `n` working days (Mon–Fri); a weekend start rolls to Monday first. */
export function addWorkdays(date: ISODate, n: number): ISODate {
  let d = date;
  while (isWeekend(d)) d = addDays(d, 1);
  for (let i = 0; i < n; ) {
    d = addDays(d, 1);
    if (!isWeekend(d)) i++;
  }
  return d;
}

// Fixed English names (not Intl) so output is identical on server and client
// and never varies by locale ("Sep" vs "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "25 Sep" */
export function formatShort(date: ISODate): string {
  const d = toUTC(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "25 Sep 2026" */
export function formatLong(date: ISODate): string {
  return `${formatShort(date)} ${toUTC(date).getUTCFullYear()}`;
}

/** "Friday" */
export function formatWeekday(date: ISODate): string {
  return WEEKDAYS[toUTC(date).getUTCDay()];
}

/** "Fri 25 Sep" */
export function formatWeekdayShort(date: ISODate): string {
  return `${formatWeekday(date).slice(0, 3)} ${formatShort(date)}`;
}

/** "25 Sep – 27 Sep" or "25 Sep" when a single day. */
export function formatRange(start: ISODate, end: ISODate): string {
  return start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;
}

/** "Today", "Yesterday", "3 days ago" relative to a reference date. */
export function relativeDayLabel(date: ISODate, today: ISODate): string | null {
  const d = diffDays(date, today);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d > 1 && d < 7) return `${d} days ago`;
  return null;
}

/** "09:42" from "2026-09-25T09:42". */
export function formatTime(at: ISODateTime): string {
  const [, time = ""] = at.split("T");
  const [h = "00", m = "00"] = time.split(":");
  return `${h}:${m}`;
}

export function datePart(at: ISODateTime): ISODate {
  return at.slice(0, 10);
}

/** Timestamp on the demo date using the viewer's current clock time. */
export function nowOn(date: ISODate): ISODateTime {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${date}T${hh}:${mm}`;
}
