import assert from "node:assert/strict";
import test from "node:test";
import { emptyLedger, type Ledger } from "./ledger.ts";
import { promo } from "./fixtures.ts";
import { byEnding, cardsFor, daysLeft, describeImport, guessTerms, isNew, isOn, kindOf, KEEP_DAYS, mergeImport, needsDetail, progress, rewardTotals } from "./promos.ts";
import type { Detail, Listed } from "./rcbc.ts";

const TODAY = "2026-10-31";
const url = (slug: string) => `https://rcbccredit.com/promos/${slug}`;


test("the kind of promo, from its title", () => {
  assert.equal(kindOf("Special Offers on iPhone Duo", "0% interest for up to 24 months or score up to ₱5,000 CASHBACK!"), "cashback");
  assert.equal(kindOf("10% Cashback in Taiwan with JCB"), "cashback");
  assert.equal(kindOf("0% Installment + Freebie at Asian Home Appliance"), "installment");
  assert.equal(kindOf("#JCBestofJapan Promo: Win a Luxury Trip to Japan"), "raffle");
  assert.equal(kindOf("RCBC Airmiles Visa Signature Accelerated Airmiles Promo"), "points");
  assert.equal(kindOf("Redeem Rewards Points for PAGSS Lounge Access"), "points");
  assert.equal(kindOf("20% OFF at Four Points by Sheraton Boracay"), "discount");
  assert.equal(kindOf("₱1,000 OFF at SM Appliance Center"), "discount");
  assert.equal(kindOf("Anantara Vacation Club Getaway for only ₱11,500"), "discount");
  assert.equal(kindOf("#JCBChooseday: FREE Japanese Matcha at Lawson"), "freebie");
  assert.equal(kindOf("Christmas in October at SM Appliance Center"), "other");
});

test("the minimum spend and reward, guessed from the mechanics", () => {
  assert.deepEqual(guessTerms("10% OFF (Up to ₱2,000)\nMin. spend of ₱10,000 on Klook hotels"), { goal: 10000, reward: 2000 });
  assert.deepEqual(guessTerms("for a minimum single-receipt purchase of ₱5,000 using their RCBC Credit Card"), { goal: 5000, reward: 0 });
  assert.deepEqual(guessTerms("Get ₱500 cashback when you spend at least PHP 20,000"), { goal: 20000, reward: 500 });
  assert.deepEqual(guessTerms("Earn a statement credit of up to P1,500.50 on minimum accumulated spend of Php 30,000"), { goal: 30000, reward: 1500.5 });
  assert.deepEqual(guessTerms("Enjoy the views."), { goal: 0, reward: 0 });
});

test("on, ending, and soonest-ending first", () => {
  assert.equal(isOn(promo("a"), TODAY), true);
  assert.equal(isOn(promo("a", { ends: "2026-10-30" }), TODAY), false);
  assert.equal(isOn(promo("a", { starts: "2026-11-01" }), TODAY), false);
  assert.equal(isOn(promo("a", { gone: "2026-10-20" }), TODAY), false);
  assert.equal(isOn(promo("a", { starts: "", ends: "" }), TODAY), true);
  assert.equal(daysLeft(promo("a", { ends: TODAY }), TODAY), 0);
  assert.equal(daysLeft(promo("a", { ends: "" }), TODAY), null);
  const sorted = [promo("none", { ends: "" }), promo("late", { ends: "2026-12-31" }), promo("soon", { ends: "2026-11-02" })].sort(byEnding);
  assert.deepEqual(sorted.map((p) => p.slug), ["soon", "late", "none"]);
});

test("a promo fits our cards of its bank on a network it lists, or any when it lists none", () => {
  const cards = [
    { id: "v", bank: "rcbc" as const, type: "Platinum", network: "visa" as const, owners: [] },
    { id: "j", bank: "rcbc" as const, type: "Gold", network: "jcb" as const, owners: [] },
  ];
  assert.deepEqual(cardsFor(promo("a", { networks: ["visa", "mastercard"] }), cards).map((c) => c.id), ["v"]);
  assert.deepEqual(cardsFor(promo("a", { networks: [] }), cards).map((c) => c.id), ["v", "j"]);
});

test("progress toward the minimum spend, and rewards by status", () => {
  const ledger: Ledger = { ...emptyLedger(), promos: [promo("a"), promo("b")],
    tracking: [
      { promo: "rcbc:a", status: "joined", card: "", goal: 10000, reward: 1000, note: "", updated: "2026-10-05" },
      { promo: "rcbc:b", status: "earned", card: "", goal: 0, reward: 500, note: "", updated: "2026-10-20" },
      { promo: "rcbc:c", status: "credited", card: "", goal: 0, reward: 300.1, note: "", updated: "2026-09-02" },
      { promo: "rcbc:d", status: "credited", card: "", goal: 0, reward: 999, note: "", updated: "2025-12-30" },
    ],
    spend: [
      { id: "1", date: "2026-10-10", promo: "rcbc:a", card: "", amount: 6000.1, note: "", created: "" },
      { id: "2", date: "2026-10-11", promo: "rcbc:a", card: "", amount: 0.2, note: "", created: "" },
      { id: "3", date: "2026-10-11", promo: "rcbc:b", card: "", amount: 50, note: "", created: "" },
    ] };
  const a = progress(ledger, "rcbc:a");
  assert.deepEqual({ ...a, share: Math.round(a.share! * 1e5) / 1e5 }, { spent: 6000.3, goal: 10000, left: 3999.7, share: 0.60003 });
  assert.deepEqual(progress(ledger, "rcbc:b"), { spent: 50, goal: 0, left: 0, share: null });
  assert.deepEqual(rewardTotals(ledger, "2026"), { credited: 300.1, waiting: 500 });
});

const listed = (slug: string, extra: Partial<Listed> = {}): Listed => ({ slug, title: slug, summary: "", image: "", networks: ["visa"], ...extra });
const detail = (starts: string, ends: string): Detail => ({ period: `${starts} - ${ends}`, starts, ends, details: "Mechanics", permit: "FTEB-1 Series of 2026" });

test("a check adds new promos, refreshes listed ones, marks unlisted ones gone, and leaves hand-added ones alone", () => {
  const ledger: Ledger = { ...emptyLedger(), promos: [
    promo("kept", { kind: "other", checked: TODAY }),
    promo("renamed"),
    promo("dropped"),
    promo("mine", { manual: true }),
  ] };
  const r = mergeImport(ledger, "rcbc", [listed("kept"), listed("renamed", { title: "10% Cashback" }), listed("new", { title: "₱500 OFF" })],
    { new: detail("2026-10-30", "2026-12-31") }, TODAY, url);
  assert.deepEqual(r.added, ["rcbc:new"]);
  assert.deepEqual(r.updated, ["rcbc:renamed"]);
  assert.deepEqual(r.gone, ["rcbc:dropped"]);
  const get = (id: string) => r.promos.find((p) => p.id === id)!;
  assert.equal(get("rcbc:renamed").kind, "cashback");
  assert.equal(get("rcbc:renamed").updated, TODAY);
  assert.equal(get("rcbc:kept").updated, "2026-10-01"); // nothing changed
  assert.equal(get("rcbc:dropped").gone, TODAY);
  assert.equal(get("rcbc:mine").gone, undefined);
  assert.deepEqual([get("rcbc:new").starts, get("rcbc:new").ends, get("rcbc:new").added, get("rcbc:new").url], ["2026-10-30", "2026-12-31", TODAY, url("new")]);
  assert.equal(describeImport("RCBC", r), "RCBC promos: 1 new, 1 updated, 1 gone");
});

test("a promo that comes back is no longer gone; old untracked ones are cleared, tracked ones kept", () => {
  const long = "2026-01-01";
  const ledger: Ledger = { ...emptyLedger(), promos: [promo("back", { gone: "2026-10-20" }), promo("old", { gone: long, ends: long }), promo("oldmine", { gone: long, ends: long })],
    tracking: [{ promo: "rcbc:oldmine", status: "earned", card: "", goal: 0, reward: 100, note: "", updated: long }] };
  const r = mergeImport(ledger, "rcbc", [listed("back")], {}, TODAY, url);
  assert.equal(r.promos.find((p) => p.id === "rcbc:back")!.gone, undefined);
  assert.deepEqual(r.removed, ["rcbc:old"]);
  assert.ok(r.promos.some((p) => p.id === "rcbc:oldmine"));
  assert.ok(KEEP_DAYS < 303);
});

test("a promo's page is read when it's new, changed, never read, past its end date, or not read for a week", () => {
  const ledger: Ledger = { ...emptyLedger(), promos: [
    promo("same", { details: "x", checked: "2026-10-30" }),
    promo("renamed", { details: "x", checked: "2026-10-30" }),
    promo("unread", { checked: "2026-10-30" }),
    promo("ended", { details: "x", ends: "2026-10-30", checked: "2026-10-30" }),
    promo("stale", { details: "x", checked: "2026-10-24" }),
  ] };
  const list = [listed("same"), listed("renamed", { title: "New" }), listed("unread"), listed("ended"), listed("stale"), listed("new")];
  assert.deepEqual(needsDetail(ledger, "rcbc", list, TODAY), ["renamed", "unread", "ended", "stale", "new"]);
});

test("new: seen in the last week, but not in the very first check", () => {
  const all = [promo("first", { added: "2026-10-28" }), promo("later", { added: "2026-10-30" }), promo("old", { added: "2026-10-28" }),
    promo("mine", { added: "2026-10-31", manual: true })];
  assert.equal(isNew(all[0], all, TODAY), false);
  assert.equal(isNew(all[1], all, TODAY), true);
  assert.equal(isNew(all[1], all, "2026-11-05"), true);
  assert.equal(isNew(all[1], all, "2026-11-06"), false);
  assert.equal(isNew(all[3], all, TODAY), false);
});
