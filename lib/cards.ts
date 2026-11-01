// The cards a bank offers, ours or not. The Cards page lists them all; tagging one with a person makes it ours.
import { cardId, cardName, type Bank, type Card, type Ledger, type Network, type Op, type Person } from "./ledger.ts";

/** Premium cards get the premium-only promos; gold and classic don't. Kept for matching a promo's eligible cards. */
export type Tier = "premium" | "gold" | "classic";
export type KnownCard = { id: string; bank: Bank; type: string; network: Network; tier: Tier };

// RCBC's cards, as its promo mechanics name them: type and network.
export const RCBC_CARDS: KnownCard[] = ([
  ["Infinite", "visa", "premium"], ["World", "mastercard", "premium"], ["Airmiles Signature", "visa", "premium"],
  ["Platinum", "mastercard", "premium"], ["Platinum", "jcb", "premium"], ["Diamond", "unionpay", "premium"],
  ["Flex Gold", "visa", "gold"], ["Gold", "visa", "gold"], ["Gold", "mastercard", "gold"], ["Gold", "jcb", "gold"],
  ["Flex", "visa", "classic"], ["Classic", "visa", "classic"], ["Classic", "mastercard", "classic"], ["Classic", "jcb", "classic"],
] as const).map(([type, network, tier]) => ({ id: cardId("rcbc", type, network), bank: "rcbc", type, network, tier }));

// EastWest's credit cards, as its promo mechanics name them ("EastWest Platinum Mastercard", "EastWest Priority Visa
// Infinite"): type and network.
export const EASTWEST_CARDS: KnownCard[] = ([
  ["Priority Infinite", "visa", "premium"], ["Platinum", "visa", "premium"], ["Platinum", "mastercard", "premium"], ["Platinum", "jcb", "premium"],
  ["Singapore Airlines KrisFlyer World", "mastercard", "premium"], ["Singapore Airlines KrisFlyer Platinum", "mastercard", "premium"],
  ["Dolce Vita Titanium", "mastercard", "gold"], ["EveryDay Titanium", "mastercard", "gold"],
  ["Gold", "visa", "gold"], ["Gold", "mastercard", "gold"], ["Gold", "jcb", "gold"],
  ["Privilege", "visa", "classic"], ["Privilege", "mastercard", "classic"], ["Puregold Always Panalo", "visa", "classic"], ["foodpanda", "visa", "classic"],
] as const).map(([type, network, tier]) => ({ id: cardId("eastwest", type, network), bank: "eastwest", type, network, tier }));

// BPI's credit cards, as its card pages and promo mechanics name them ("BPI Gold Rewards Card", "Petron BPI Card"), with
// the network their pages state or their addresses name (bpi-gold-mastercard, amore-visa-platinum).
export const BPI_CARDS: KnownCard[] = ([
  ["Signature Wealth", "visa", "premium"], ["Signature", "visa", "premium"], ["Platinum Rewards", "mastercard", "premium"],
  ["Amore Platinum Cashback", "visa", "premium"], ["Gold Rewards", "mastercard", "gold"],
  ["Rewards", "mastercard", "classic"], ["Amore Cashback", "visa", "classic"], ["Edge", "mastercard", "classic"],
  ["Petron", "mastercard", "classic"], ["Robinsons Cashback", "visa", "classic"],
] as const).map(([type, network, tier]) => ({ id: cardId("bpi", type, network), bank: "bpi", type, network, tier }));

// Metrobank's credit cards, as its promo list names the cards each promo is for ("Travel Signature Visa", "Hype Visa
// (formerly Vantage Visa)"): type and network. "Toyota Platinum" names no network there; its mechanics call it the
// Toyota Platinum Mastercard.
export const METROBANK_CARDS: KnownCard[] = ([
  ["World", "mastercard", "premium"], ["Travel Signature", "visa", "premium"], ["Femme Signature", "visa", "premium"],
  ["Platinum", "mastercard", "premium"], ["Travel Platinum", "visa", "premium"], ["Toyota Platinum", "mastercard", "premium"],
  ["Titanium", "mastercard", "gold"], ["Cashback", "visa", "gold"], ["Rewards Plus", "visa", "gold"],
  ["M Free", "mastercard", "classic"], ["Toyota", "mastercard", "classic"], ["Femme", "visa", "classic"], ["Hype", "visa", "classic"],
  ["Hype", "mastercard", "classic"], ["PSBank Credit", "mastercard", "classic"], ["Dollar", "mastercard", "classic"],
] as const).map(([type, network, tier]) => ({ id: cardId("metrobank", type, network), bank: "metrobank", type, network, tier }));

/** Every bank's cards. */
export const BANK_CARDS: KnownCard[] = [...RCBC_CARDS, ...EASTWEST_CARDS, ...BPI_CARDS, ...METROBANK_CARDS];

export const knownCard = (id: string) => BANK_CARDS.find((c) => c.id === id);

/** Every card: ours and others we added, then every bank's cards nobody has tagged yet (not ours), ours first, A to Z. */
export function allCards(ledger: Pick<Ledger, "cards">): Card[] {
  const stored = new Set(ledger.cards.map((c) => c.id));
  const untagged = BANK_CARDS.filter((k) => !stored.has(k.id)).map(({ id, bank, type, network }): Card => ({ id, bank, type, network, owners: [] }));
  return [...ledger.cards, ...untagged].sort((a, b) => Number(b.owners.length > 0) - Number(a.owners.length > 0) || cardName(a).localeCompare(cardName(b)));
}

/** Our cards, or one person's. */
export function ownedCards(cards: Card[], person?: string): Card[] {
  return cards.filter((c) => (person ? c.owners.includes(person) : c.owners.length > 0));
}

/** "Arvs", "Arvs & Ayette", or "Not ours". */
export function ownerNames(card: Card, people: Pick<Person, "id" | "name">[]): string {
  const names = people.filter((x) => card.owners.includes(x.id)).map((x) => x.name);
  return names.length ? names.join(" & ") : "Not ours";
}

/** The person a login belongs to, if settings.json says. */
export const personOf = (ledger: Pick<Ledger, "people">, login: string | null) => ledger.people.find((x) => x.login === login);

/** Whose a card can be: the household, or just "Ours" while settings.json names nobody (a new ledger). */
export const holders = (ledger: Pick<Ledger, "people">): Pick<Person, "id" | "name">[] =>
  ledger.people.length ? ledger.people : [{ id: "us", name: "Ours" }];

/** The edit that makes a card `owners`' (none: not ours): adds a bank card the first time it's tagged, updates it after. */
export function tagOp(ledger: Pick<Ledger, "cards">, card: Card, owners: string[]): Op {
  return ledger.cards.some((c) => c.id === card.id)
    ? { type: "updateCard", id: card.id, changes: { owners } }
    : { type: "addCard", id: card.id, fields: { bank: card.bank, type: card.type, network: card.network, owners } };
}

/** A card's name by its id ("" for none), whether stored or one of the bank's untagged cards. */
export function nameOf(ledger: Pick<Ledger, "cards">, id: string): string {
  if (!id) return "";
  const card = ledger.cards.find((c) => c.id === id) ?? BANK_CARDS.find((c) => c.id === id);
  return card ? cardName(card) : "A removed card";
}

/** "Arvs'" or "Ayette's". */
export const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);
