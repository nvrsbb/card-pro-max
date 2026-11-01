import assert from "node:assert/strict";
import test from "node:test";
import { daysBetween, manilaToday, parsePeriod, shortDate } from "./dates.ts";

test("today is Manila's date, eight hours ahead of UTC", () => {
  assert.equal(manilaToday(new Date("2026-10-31T15:59:00Z")), "2026-10-31");
  assert.equal(manilaToday(new Date("2026-10-31T16:00:00Z")), "2026-11-01");
});

test("promo periods as RCBC writes them", () => {
  assert.deepEqual(parsePeriod("October 16 - November 18, 2026"), { starts: "2026-10-16", ends: "2026-11-18" });
  assert.deepEqual(parsePeriod("Oct 17 – 18, 2026"), { starts: "2026-10-17", ends: "2026-10-18" });
  assert.deepEqual(parsePeriod("October 1 - 31, 2026"), { starts: "2026-10-01", ends: "2026-10-31" });
  assert.deepEqual(parsePeriod("January 5, 2026 to March 31, 2027"), { starts: "2026-01-05", ends: "2027-03-31" });
  assert.deepEqual(parsePeriod("November 15, 2026 - February 28, 2027"), { starts: "2026-11-15", ends: "2027-02-28" });
  assert.deepEqual(parsePeriod("Until December 31, 2026"), { starts: "", ends: "2026-12-31" });
  assert.deepEqual(parsePeriod("Sept. 1st - Dec. 31st, 2026"), { starts: "2026-09-01", ends: "2026-12-31" });
});

test("promo periods as EastWest writes them", () => {
  assert.deepEqual(parsePeriod("November 1 to 12, 2026"), { starts: "2026-11-01", ends: "2026-11-12" });
  assert.deepEqual(parsePeriod("July 1 to December 29, 2026"), { starts: "2026-07-01", ends: "2026-12-29" });
  assert.deepEqual(parsePeriod("until July 31, 2026"), { starts: "", ends: "2026-07-31" });
});

test("a start with no year in a period that crosses New Year is the year before", () => {
  assert.deepEqual(parsePeriod("December 1 - January 31, 2027"), { starts: "2026-12-01", ends: "2027-01-31" });
});

test("nothing like a date gives no period, and impossible dates are refused", () => {
  assert.deepEqual(parsePeriod("While supplies last"), { starts: "", ends: "" });
  assert.deepEqual(parsePeriod("October 1 - 31"), { starts: "", ends: "" }); // no year anywhere
  assert.deepEqual(parsePeriod("February 30 - March 2, 2026"), { starts: "", ends: "" });
});

test("days between dates, and short labels", () => {
  assert.equal(daysBetween("2026-10-31", "2026-11-18"), 18);
  assert.equal(daysBetween("2026-11-18", "2026-10-31"), -18);
  assert.equal(shortDate("2026-11-18", "2026-10-31"), "Nov 18");
  assert.equal(shortDate("2027-01-05", "2026-10-31"), "Jan 5, 2027");
});
