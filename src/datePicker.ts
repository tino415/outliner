import { PaletteOption, openPalette } from "./palette";
import { WrittenDate, addDays, daysBetween, distanceLabel, fullDayLabel, readTypedDate, readWrittenDate, today, weekdayOf, writeDate } from "./dates";

/*
 * Picks a date from what is typed (doc/adr/0036): "tomorrow", "fri", "+3d",
 * "14.10.", "2026-10-14 9:00". Every choice is written as ISO text.
 */

interface DateChoice extends PaletteOption {
  written: string;
}

export interface DateRequest {
  current?: string;
  placeholder: string;
  write: (written: string) => void;
  remove?: { label: string; run: () => void };
}

export function pickDate(request: DateRequest): void {
  openPalette<DateChoice>({
    placeholder: request.placeholder,
    hint: "today, tomorrow, fri, +3d, 2w, 14.10., 14 oct, 2026-10-14, with a time as 9:00",
    candidates: (query) => [...dateChoices(query, request.current), ...removal(request)],
    choose: (choice) => (choice.written === "" ? request.remove?.run() : request.write(choice.written)),
  });
}

function dateChoices(query: string, current: string | undefined): DateChoice[] {
  if (query.trim()) {
    const typed = readTypedDate(query);
    return typed ? [choice(typed)] : [];
  }
  const now = today();
  const suggested = [now, addDays(now, 1), nextMonday(now), addDays(now, 7)];
  const written = current ? readWrittenDate(current) : null;
  const days = [...new Set(suggested)].filter((day) => day !== written?.day);
  return [...(written ? [choice(written)] : []), ...days.map((day) => choice({ day, time: null }))];
}

function nextMonday(day: string): string {
  return addDays(day, 7 - weekdayOf(day));
}

function choice(date: WrittenDate): DateChoice {
  const written = writeDate(date);
  const far = Math.abs(daysBetween(today(), date.day)) > 1;
  return { text: written, path: [far ? `${fullDayLabel(date.day)}, ${distanceLabel(date.day)}` : fullDayLabel(date.day)], written };
}

function removal(request: DateRequest): DateChoice[] {
  return request.remove ? [{ text: request.remove.label, path: [], written: "" }] : [];
}
