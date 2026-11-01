import assert from "node:assert/strict";
import test from "node:test";
import { allCards, BANK_CARDS, BPI_CARDS, EASTWEST_CARDS, holders, nameOf, ownedCards, ownerNames, possessive, RCBC_CARDS, tagOp } from "./cards.ts";
import { cardId, cardName, isOp, type Card, type Person } from "./ledger.ts";

const people: Person[] = [{ id: "a", name: "Arvs", login: "admin" }, { id: "b", name: "Ayette", login: "member" }];
const flex: Card = { id: "rcbc-flex-visa", bank: "rcbc", type: "Flex", network: "visa", owners: ["a"] };
const both: Card = { id: "rcbc-gold-jcb", bank: "rcbc", type: "Gold", network: "jcb", owners: ["a", "b"] };

test("every bank's card is listed once: tagged ones as stored, the rest as not ours; ours first", () => {
  const all = allCards({ cards: [flex, both] });
  assert.equal(all.length, RCBC_CARDS.length + EASTWEST_CARDS.length + BPI_CARDS.length);
  assert.equal(new Set(BANK_CARDS.map((c) => c.id)).size, BANK_CARDS.length);
  assert.ok(all.some((c) => c.bank === "eastwest") && all.some((c) => c.bank === "rcbc") && all.some((c) => c.bank === "bpi"));
  assert.deepEqual(all.slice(0, 2).map((c) => c.id), ["rcbc-flex-visa", "rcbc-gold-jcb"]);
  assert.deepEqual(all.filter((c) => c.id === "rcbc-flex-visa"), [flex]);
  assert.ok(all.slice(2).every((c) => c.owners.length === 0));
  assert.equal(new Set(RCBC_CARDS.map((c) => c.id)).size, RCBC_CARDS.length);
});

test("ours, or one person's; and whose, by name", () => {
  const all = allCards({ cards: [flex, both] });
  assert.deepEqual(ownedCards(all).map((c) => c.id), ["rcbc-flex-visa", "rcbc-gold-jcb"]);
  assert.deepEqual(ownedCards(all, "b").map((c) => c.id), ["rcbc-gold-jcb"]);
  assert.equal(ownerNames(both, people), "Arvs & Ayette");
  assert.equal(ownerNames(all[2], people), "Not ours");
});

test("a card's name and id come from its bank, type and network", () => {
  assert.equal(cardName(flex), "RCBC Flex Visa");
  assert.equal(cardId("rcbc", "Flex Gold", "visa"), "rcbc-flex-gold-visa");
  assert.ok(RCBC_CARDS.some((c) => c.id === cardId("rcbc", "Gold", "jcb")));
  assert.equal(nameOf({ cards: [] }, "eastwest-platinum-mastercard"), "EastWest Platinum Mastercard");
  assert.equal(nameOf({ cards: [] }, "eastwest-priority-infinite-visa"), "EastWest Priority Infinite Visa");
  assert.equal(nameOf({ cards: [] }, "bpi-gold-rewards-mastercard"), "BPI Gold Rewards Mastercard");
  assert.equal(nameOf({ cards: [] }, "bpi-signature-wealth-visa"), "BPI Signature Wealth Visa");
});

test("tagging a bank card adds it the first time and updates it after; the edit is a valid one", () => {
  const gold = allCards({ cards: [] }).find((c) => c.id === "rcbc-gold-jcb")!;
  const first = tagOp({ cards: [] }, gold, ["b"]);
  assert.deepEqual(first, { type: "addCard", id: "rcbc-gold-jcb", fields: { bank: "rcbc", type: "Gold", network: "jcb", owners: ["b"] } });
  assert.ok(isOp(first));
  assert.deepEqual(tagOp({ cards: [both] }, both, []), { type: "updateCard", id: "rcbc-gold-jcb", changes: { owners: [] } });
  assert.deepEqual(holders({ people: [] }), [{ id: "us", name: "Ours" }]);
  assert.deepEqual(holders({ people }), people);
});

test("possessives", () => {
  assert.equal(possessive("Arvs"), "Arvs'");
  assert.equal(possessive("Ayette"), "Ayette's");
});
