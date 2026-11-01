// Dates as YYYY-MM-DD strings, in Manila time (UTC+8), where the cards and the promos are.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Today in Manila, whatever the server's or browser's time zone. */
export function manilaToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A real calendar date as YYYY-MM-DD (not February 30, which Date would roll into March). */
export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

type Part = { m?: number; d: number; y?: number };

/**
 * A promo period as written by the bank, as start and end dates (either "" when it isn't said):
 * "October 16 - November 18, 2026", "Oct 17 – 18, 2026", "January 5, 2026 to March 31, 2027",
 * "Until December 31, 2026", "November 1 to 12, 2026". A start with no year takes the end's (the year before when its month is later).
 */
export function parsePeriod(text: string): { starts: string; ends: string } {
  const none = { starts: "", ends: "" };
  const parts: Part[] = [];
  // A month name with its day, or a bare day right after a dash or "to" ("October 1 - 31, 2026"), each with an optional year.
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4}))?|(?:[-–—]|\bto\b)\s*(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4}))?/gi;
  for (const match of text.matchAll(re)) {
    if (match[1]) parts.push({ m: MONTHS.indexOf(match[1].toLowerCase()) + 1, d: Number(match[2]), y: match[3] ? Number(match[3]) : undefined });
    else if (parts.length > 0) parts.push({ d: Number(match[4]), y: match[5] ? Number(match[5]) : undefined });
  }
  if (parts.length === 0) return none;
  const end = parts.length > 1 ? parts[1] : parts[0];
  const start = parts.length > 1 ? parts[0] : null;
  end.m ??= start?.m;
  const year = end.y ?? start?.y;
  if (!year || !end.m) return none;
  const endDate = iso(year, end.m, end.d);
  const onlyEnd = !start || /\b(until|till|up to|on or before)\b/i.test(text.slice(0, text.search(re) + 1));
  if (onlyEnd && parts.length === 1) return { starts: "", ends: isDate(endDate) ? endDate : "" };
  const startYear = start!.y ?? (start!.m! > end.m ? year - 1 : year);
  const startDate = iso(startYear, start!.m!, start!.d);
  return isDate(startDate) && isDate(endDate) ? { starts: startDate, ends: endDate } : none;
}

/** "Oct 16" or "Oct 16, 2027" when it isn't this year. */
export function shortDate(date: string, today = manilaToday()): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const label = `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${d}`;
  return y === Number(today.slice(0, 4)) ? label : `${label}, ${y}`;
}

/** This month as YYYY-MM. */
export const monthKey = (date: Date) => manilaToday(date).slice(0, 7);

/** "October 2026" for 2026-10. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${y}`;
}
