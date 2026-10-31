import assert from "node:assert/strict";
import test from "node:test";
import { applyTrackerOp, archive, describeTrackerOp, isTrackerOp, readTracker, seedTracker, writeTracker } from "./tracker.ts";

test("the board starts from the seed until the first save, then reads back what was written", () => {
  const seeded = readTracker(undefined);
  assert.deepEqual(seeded, seedTracker());
  assert.deepEqual(readTracker(writeTracker(seeded)), seeded);
});

test("adding takes the next id; editing stamps the date; deleting removes", () => {
  let t = applyTrackerOp(seedTracker(), { type: "add", fields: { title: "Dark mode toggle", description: "", status: "backlog", priority: "low" } }, "2026-10-14");
  const id = t.nextId - 1;
  assert.equal(t.items.at(-1)?.id, id);
  t = applyTrackerOp(t, { type: "update", id, changes: { status: "doing" } }, "2026-10-15");
  assert.deepEqual([t.items.at(-1)?.status, t.items.at(-1)?.created, t.items.at(-1)?.updated], ["doing", "2026-10-14", "2026-10-15"]);
  assert.equal(applyTrackerOp(t, { type: "delete", id }, "2026-10-15").items.some((f) => f.id === id), false);
});

test("commit messages name the feature", () => {
  const t = seedTracker();
  assert.equal(describeTrackerOp(t, { type: "update", id: 5, changes: { status: "doing" } }), "Tracker: move to doing F-5 More banks");
  assert.match(describeTrackerOp(t, { type: "add", fields: { title: "X", description: "", status: "next", priority: "high" } }), /^Tracker: add F-9 X$/);
});

test("rejects malformed tracker edits", () => {
  assert.ok(isTrackerOp({ type: "update", id: 1, changes: { priority: "low" } }));
  assert.ok(!isTrackerOp({ type: "update", id: 1, changes: {} }));
  assert.ok(!isTrackerOp({ type: "update", id: 1, changes: { created: "2020-01-01" } }));
  assert.ok(!isTrackerOp({ type: "update", id: 1, changes: { status: "shipped" } }));
  assert.ok(!isTrackerOp({ type: "add", fields: { title: "  ", description: "", status: "next", priority: "high" } }));
  assert.ok(!isTrackerOp({ type: "delete", id: "1" }));
});

test("moving to done records the day it closed; reopening clears it; old done items count their last update", () => {
  let t = applyTrackerOp(seedTracker(), { type: "add", fields: { title: "X", description: "", status: "next", priority: "low" } }, "2026-10-14");
  const id = t.nextId - 1;
  t = applyTrackerOp(t, { type: "update", id, changes: { status: "done" } }, "2026-10-20");
  assert.equal(t.items.at(-1)?.closed, "2026-10-20");
  t = applyTrackerOp(t, { type: "update", id, changes: { description: "Notes" } }, "2026-11-02");
  assert.equal(t.items.at(-1)?.closed, "2026-10-20"); // editing a done item keeps when it closed
  t = applyTrackerOp(t, { type: "update", id, changes: { status: "doing" } }, "2026-11-03");
  assert.equal(t.items.at(-1)?.closed, undefined);
  const old = readTracker(JSON.stringify({ nextId: 2, items: [{ id: 1, title: "Y", description: "", status: "done", priority: "low", created: "2026-09-01", updated: "2026-09-05" }] }));
  assert.equal(old.items[0].closed, "2026-09-05");
});

test("done items from earlier months go to the archive, by month, newest first", () => {
  const f = (id: number, status: "done" | "next", closed: string) => ({ id, title: `F${id}`, description: "", status, priority: "low" as const, created: closed, updated: closed, ...(status === "done" ? { closed } : {}) });
  const { current, months } = archive([f(1, "done", "2026-09-03"), f(2, "done", "2026-08-30"), f(3, "done", "2026-09-28"), f(4, "done", "2026-10-02"), f(5, "next", "2026-08-01")], "2026-10");
  assert.deepEqual(current.map((x) => x.id), [4]);
  assert.deepEqual(months.map(([m, items]) => [m, items.map((x) => x.id)]), [["2026-09", [3, 1]], ["2026-08", [2]]]);
});
