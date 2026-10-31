import assert from "node:assert/strict";
import test from "node:test";
import { applyOp, changedFiles, commitMessage, EditError, emptyLedger, fromFiles, isLedgerFile, isOp, toFiles, type Ledger, type Op } from "./ledger.ts";
import { promo } from "./fixtures.ts";

const TODAY = "2026-10-31";

function sample(): Ledger {
  return {
    promos: [promo("klook", { title: "10% OFF on Klook", details: 'Line one, "quoted"\nLine two' }), promo("mine", { manual: true, title: "Mine" })],
    cards: [{ id: "c1", bank: "rcbc", name: "Visa Platinum", network: "visa", note: "the everyday one, mostly" }],
    tracking: [{ promo: "rcbc:klook", status: "joined", card: "c1", goal: 10000, reward: 1500, note: "registered via SMS", updated: TODAY }],
    spend: [
      { id: "s1", date: "2026-10-20", promo: "rcbc:klook", card: "c1", amount: 4200.5, note: "Hotel, Osaka", created: "2026-10-20T10:00:00Z" },
      { id: "s0", date: "2025-12-31", promo: "rcbc:mine", card: "c1", amount: 100, note: "", created: "" },
    ],
  };
}

test("the files read back to the same ledger", () => {
  const files = toFiles(sample());
  assert.deepEqual(Object.keys(files).sort(), ["cards.csv", "promos/rcbc.json", "spend/2025.csv", "spend/2026.csv", "tracking.csv"]);
  const again = fromFiles(files);
  assert.deepEqual(toFiles(again), files);
  assert.equal(again.spend.find((s) => s.id === "s1")!.amount, 4200.5);
  assert.equal(again.promos.find((p) => p.slug === "klook")!.details, 'Line one, "quoted"\nLine two');
  assert.ok(Object.keys(files).every(isLedgerFile));
  assert.equal(isLedgerFile("tracker.json"), false);
  assert.equal(isLedgerFile("README.md"), false);
});

test("an empty ledger reads from no files", () => {
  assert.deepEqual(fromFiles({}), emptyLedger());
});

test("only changed files are written, and a year with no spending left is emptied", () => {
  const before = toFiles(sample());
  const after = toFiles(applyOp(fromFiles(before), { type: "deleteSpend", id: "s0" }));
  const changed = changedFiles(before, after);
  assert.deepEqual(Object.keys(changed), ["spend/2025.csv"]);
  assert.equal(changed["spend/2025.csv"], "id,date,promo,card,amount,note,created\n");
});

test("tracking a promo replaces what we said about it before", () => {
  let l = sample();
  l = applyOp(l, { type: "track", promo: "rcbc:klook", fields: { status: "earned", card: "c1", goal: 10000, reward: 1500, note: "", }, today: "2026-11-02" });
  assert.equal(l.tracking.length, 1);
  assert.deepEqual([l.tracking[0].status, l.tracking[0].updated], ["earned", "2026-11-02"]);
  l = applyOp(l, { type: "untrack", promo: "rcbc:klook" });
  assert.equal(l.tracking.length, 0);
});

test("cards and spending are added, edited and removed; a removed card's spending stays", () => {
  let l = sample();
  l = applyOp(l, { type: "addCard", id: "c2", fields: { bank: "rcbc", name: "JCB Gold", network: "jcb", note: "" } });
  l = applyOp(l, { type: "updateCard", id: "c2", changes: { name: "JCB Platinum" } });
  assert.equal(l.cards.find((c) => c.id === "c2")!.name, "JCB Platinum");
  l = applyOp(l, { type: "deleteCard", id: "c1" });
  assert.deepEqual(l.cards.map((c) => c.id), ["c2"]);
  assert.equal(l.spend.length, 2);
  l = applyOp(l, { type: "addSpend", id: "s2", fields: { date: TODAY, promo: "rcbc:klook", card: "c2", amount: 300, note: "" }, created: "x" });
  l = applyOp(l, { type: "updateSpend", id: "s2", changes: { amount: 350 } });
  assert.equal(l.spend.find((s) => s.id === "s2")!.amount, 350);
});

test("promos added by hand can be edited and deleted (with their records); imported ones can't be deleted", () => {
  let l = applyOp(sample(), { type: "addPromo", bank: "rcbc", slug: "gcash-bonus", today: TODAY,
    fields: { title: "GCash bonus", summary: "", url: "", networks: [], kind: "cashback", starts: "", ends: "2026-12-31", details: "" } });
  const added = l.promos.find((p) => p.id === "rcbc:gcash-bonus")!;
  assert.equal(added.manual, true);
  assert.equal(added.added, TODAY);
  assert.throws(() => applyOp(l, { type: "addPromo", bank: "rcbc", slug: "gcash-bonus", today: TODAY, fields: { ...added } as never }), EditError);
  l = applyOp(l, { type: "updatePromo", id: "rcbc:klook", changes: { ends: "2026-12-15" }, today: TODAY });
  assert.equal(l.promos.find((p) => p.id === "rcbc:klook")!.ends, "2026-12-15");
  assert.throws(() => applyOp(l, { type: "deletePromo", id: "rcbc:klook" }), EditError);
  l = applyOp(l, { type: "deletePromo", id: "rcbc:mine" });
  assert.equal(l.promos.some((p) => p.id === "rcbc:mine"), false);
  assert.equal(l.spend.some((s) => s.promo === "rcbc:mine"), false);
});

test("commit messages name the promo and who made the edit, never an amount", () => {
  const op: Op = { type: "addSpend", id: "s9", fields: { date: TODAY, promo: "rcbc:klook", card: "c1", amount: 1234, note: "" }, created: "x" };
  assert.equal(commitMessage(sample(), op, "admin"), "Log spending for 10% OFF on Klook (by admin)");
  assert.equal(commitMessage(sample(), { type: "track", promo: "rcbc:klook", fields: { status: "earned", card: "", goal: 1, reward: 2, note: "" }, today: TODAY }), "Earned: 10% OFF on Klook");
});

test("edits from the browser are checked: right shapes pass, anything else is refused", () => {
  const good: Op[] = [
    { type: "addCard", id: "c2", fields: { bank: "rcbc", name: "JCB Gold", network: "jcb", note: "" } },
    { type: "track", promo: "rcbc:klook", fields: { status: "joined", card: "", goal: 0, reward: 0, note: "" }, today: TODAY },
    { type: "addSpend", id: "s2", fields: { date: TODAY, promo: "rcbc:klook", card: "c1", amount: 300, note: "" }, created: "2026-10-31T01:00:00Z" },
    { type: "updatePromo", id: "rcbc:klook", changes: { ends: "" }, today: TODAY },
  ];
  for (const op of good) assert.equal(isOp(op), true, op.type);
  const bad: unknown[] = [
    null, {}, { type: "nope" },
    { type: "addCard", id: "c2", fields: { bank: "bpi", name: "x", network: "visa", note: "" } },
    { type: "addCard", id: "c2", fields: { bank: "rcbc", name: "x", network: "visa", note: "", extra: 1 } },
    { type: "addSpend", id: "s2", fields: { date: "2026-02-30", promo: "rcbc:klook", card: "", amount: 1, note: "" }, created: "" },
    { type: "addSpend", id: "s2", fields: { date: TODAY, promo: "rcbc:klook", card: "", amount: Infinity, note: "" }, created: "" },
    { type: "track", promo: "rcbc:klook", fields: { status: "won", card: "", goal: 0, reward: 0, note: "" }, today: TODAY },
    { type: "updateSpend", id: "s1", changes: {} },
    { type: "deleteCard", id: "../../etc" },
  ];
  for (const op of bad) assert.equal(isOp(op), false, JSON.stringify(op));
});
