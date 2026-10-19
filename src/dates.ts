import { Item } from "./model";

/*
 * Dates are written as ISO text, 2026-10-14 or 2026-10-14 9:00, in an
 * item's text, note or properties (doc/adr/0036). A day is that ISO string,
 * so days compare and sort as strings; arithmetic goes through UTC, which
 * has no daylight saving to skip a day.
 */

export type Day = string;

export const DATE_PROPERTIES = ["scheduled", "due"] as const;

/** A date as written: a day, then an optional time. Not part of a longer word or number. */
export const DATE_WRITTEN = String.raw`(?<![\p{L}\p{N}_-])\d{4}-\d{2}-\d{2}(?: \d{1,2}:\d{2})?(?![\p{L}\p{N}_-])`;

const WRITTEN = /^(\d{4}-\d{2}-\d{2})(?: (\d{1,2}):(\d{2}))?$/;

export interface WrittenDate {
  day: Day;
  time: string | null;
}

export function readWrittenDate(text: string): WrittenDate | null {
  const match = WRITTEN.exec(text.trim());
  if (!match || !isRealDay(match[1])) return null;
  if (match[2] === undefined) return { day: match[1], time: null };
  return isTime(Number(match[2]), Number(match[3])) ? { day: match[1], time: `${Number(match[2])}:${match[3]}` } : null;
}

export function today(): Day {
  const now = new Date();
  return dayOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(day: Day, count: number): Day {
  const date = utc(day);
  date.setUTCDate(date.getUTCDate() + count);
  return dayOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysBetween(from: Day, to: Day): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayOf(day: Day): number {
  return (utc(day).getUTCDay() + 6) % 7;
}

function utc(day: Day): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function dayOf(year: number, month: number, date: number): Day {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

function isRealDay(day: string): boolean {
  const [year, month, date] = day.split("-").map(Number);
  const real = new Date(Date.UTC(year, month - 1, date));
  return real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === date;
}

function isTime(hours: number, minutes: number): boolean {
  return hours < 24 && minutes < 60;
}

// ---- showing dates ----------------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today", "tomorrow", "yesterday", or "Tue 14 Oct", with the year when it is not this one; then the time. */
export function dateLabel(written: WrittenDate, now: Day = today()): string {
  return written.time ? `${dayLabel(written.day, now)} ${written.time}` : dayLabel(written.day, now);
}

export function dayLabel(day: Day, now: Day = today()): string {
  const near = { [-1]: "yesterday", 0: "today", 1: "tomorrow" }[daysBetween(now, day)];
  if (near) return near;
  return fullDayLabel(day, now);
}

export function fullDayLabel(day: Day, now: Day = today()): string {
  const [year, month, date] = day.split("-").map(Number);
  const label = `${WEEKDAYS[weekdayOf(day)]} ${date} ${MONTHS[month - 1]}`;
  return year === Number(now.slice(0, 4)) ? label : `${label} ${year}`;
}

export function distanceLabel(day: Day, now: Day = today()): string {
  const days = daysBetween(now, day);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

// ---- reading what is typed into the picker ---------------------------------------------------

const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * What the date picker understands: "today", "tomorrow", "fri", "+3d",
 * "-1w", "2026-10-14", "14.10.", "14 oct", "oct 14", each optionally
 * followed by a time, "9:00". A date without a year that has passed means
 * the next one, as a weekday means the next one from today on.
 */
export function readTypedDate(typed: string, now: Day = today()): WrittenDate | null {
  const text = typed.trim().toLowerCase().replace(/\s+/g, " ");
  const timed = /^(.*?)(?:^| )(\d{1,2}):(\d{2})$/.exec(text);
  const dayPart = timed ? timed[1].trim() : text;
  if (timed && !isTime(Number(timed[2]), Number(timed[3]))) return null;
  const day = dayPart === "" && timed ? now : readTypedDay(dayPart, now);
  if (!day) return null;
  return { day, time: timed ? `${Number(timed[2])}:${timed[3]}` : null };
}

export function readTypedDay(text: string, now: Day = today()): Day | null {
  const named = { today: 0, tod: 0, tomorrow: 1, tom: 1, tmr: 1, yesterday: -1 }[text];
  if (named !== undefined) return addDays(now, named);
  const relative = /^(?:([+-])(\d+) ?([dwmy]?)|(\d+) ?([dwmy]))$/.exec(text);
  if (relative) {
    const [, sign, signed, signedUnit, unsigned, unit] = relative;
    return shifted(now, (sign === "-" ? -1 : 1) * Number(signed ?? unsigned), signedUnit || unit || "d");
  }
  const dateOfMonth = /^(\d{1,2})\.?$/.exec(text);
  if (dateOfMonth) return dateInMonth(Number(dateOfMonth[1]), now);
  const weekday = WEEKDAY_NAMES.findIndex((name) => text.length >= 2 && name.startsWith(text));
  if (weekday !== -1) return addDays(now, (weekday - weekdayOf(now) + 7) % 7);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return checkedDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dotted = /^(\d{1,2})\.(\d{1,2})\.?(?: ?(\d{2}|\d{4}))?$/.exec(text);
  if (dotted) return dayInYear(Number(dotted[1]), Number(dotted[2]), dotted[3], now);
  const dayMonth = /^(\d{1,2})\.? ([a-z]{3,})(?: (\d{4}))?$/.exec(text);
  if (dayMonth) return dayInYear(Number(dayMonth[1]), monthNamed(dayMonth[2]), dayMonth[3], now);
  const monthDay = /^([a-z]{3,}) (\d{1,2})(?:,? (\d{4}))?$/.exec(text);
  if (monthDay) return dayInYear(Number(monthDay[2]), monthNamed(monthDay[1]), monthDay[3], now);
  return null;
}

function shifted(day: Day, count: number, unit: string): Day {
  if (unit === "d") return addDays(day, count);
  if (unit === "w") return addDays(day, count * 7);
  const [year, month, date] = day.split("-").map(Number);
  const months = unit === "m" ? count : count * 12;
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDate = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return dayOf(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(date, lastDate));
}

function monthNamed(name: string): number {
  return MONTH_NAMES.findIndex((month) => month.startsWith(name)) + 1;
}

function dayInYear(date: number, month: number, year: string | undefined, now: Day): Day | null {
  if (year !== undefined) return checkedDay(year.length === 2 ? 2000 + Number(year) : Number(year), month, date);
  const thisYear = Number(now.slice(0, 4));
  const day = checkedDay(thisYear, month, date);
  return day !== null && day < now ? checkedDay(thisYear + 1, month, date) : day;
}

function dateInMonth(date: number, now: Day): Day | null {
  const [year, month] = now.split("-").map(Number);
  const thisMonth = checkedDay(year, month, date);
  if (thisMonth !== null && thisMonth >= now) return thisMonth;
  const next = shifted(dayOf(year, month, 1), 1, "m");
  return checkedDay(Number(next.slice(0, 4)), Number(next.slice(5, 7)), date);
}

function checkedDay(year: number, month: number, date: number): Day | null {
  const day = dayOf(year, month, date);
  return isRealDay(day) ? day : null;
}

export function writeDate(date: WrittenDate): string {
  return date.time ? `${date.day} ${date.time}` : date.day;
}

// ---- the dates of an item ---------------------------------------------------------------------

export type DateRole = (typeof DATE_PROPERTIES)[number] | "text";

export interface ItemDate {
  day: Day;
  role: DateRole;
}

/** Its `scheduled` and `due` properties, and the dates in its text outside code; a note's dates are not the item's. */
export function datesOf(item: Item): ItemDate[] {
  const fromProperties = DATE_PROPERTIES.flatMap((role) => {
    const written = item.properties[role] === undefined ? null : readWrittenDate(item.properties[role]);
    return written ? [{ day: written.day, role }] : [];
  });
  return [...fromProperties, ...datesInText(item.text).map((day) => ({ day, role: "text" as const }))];
}

export function datesInText(text: string): Day[] {
  const outsideCode = text.replace(/`[^`\n]+`/g, "");
  return [...outsideCode.matchAll(new RegExp(DATE_WRITTEN, "gu"))].flatMap((match) => readWrittenDate(match[0])?.day ?? []);
}

/** An open item whose every date has passed. */
export function isOverdue(item: Item, now: Day = today()): boolean {
  const days = datesOf(item).map((date) => date.day);
  return !item.completed && days.length > 0 && days.every((day) => day < now);
}

// ---- dates in a search ------------------------------------------------------------------------

/**
 * A search word about dates: `due:today`, `scheduled:this-week`,
 * `date:<+7d` (any of the item's dates), `due:>=2026-10-01`, or
 * `is:overdue`. Anything else is not one, and is searched as text.
 */
export function dateFilter(word: string, now: Day = today()): ((item: Item) => boolean) | null {
  if (word.toLowerCase() === "is:overdue") return (item) => isOverdue(item, now);
  const match = /^(due|scheduled|date):(.+)$/i.exec(word);
  const accepts = match && daysMatching(match[2].toLowerCase(), now);
  if (!match || !accepts) return null;
  const role = match[1].toLowerCase();
  return (item) => datesOf(item).some((date) => (role === "date" || date.role === role) && accepts(date.day));
}

function daysMatching(spec: string, now: Day): ((day: Day) => boolean) | null {
  const monday = addDays(now, -weekdayOf(now));
  if (spec === "this-week") return (day) => day >= monday && day < addDays(monday, 7);
  if (spec === "next-week") return (day) => day >= addDays(monday, 7) && day < addDays(monday, 14);
  const compared = /^(<=|>=|<|>)?(.+)$/.exec(spec)!;
  const bound = readTypedDay(compared[2], now);
  if (!bound) return null;
  const operator = compared[1] ?? "=";
  return (day) => ({ "<": day < bound, "<=": day <= bound, ">": day > bound, ">=": day >= bound, "=": day === bound })[operator]!;
}
