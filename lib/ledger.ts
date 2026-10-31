// The ledger: the promo catalog and what we do with it. Pure, shared by the browser, the server and the tests.
//
// Files (in the private ledger repo, one commit per edit):
//   promos/<bank>.json   the catalog, one file per bank (imported from the bank's site, plus promos added by hand)
//   cards.csv            our cards: id,bank,name,network,note
//   tracking.csv         what we're doing about a promo: promo,status,card,goal,reward,note,updated
//   spend/YYYY.csv       spending toward a promo's minimum: id,date,promo,card,amount,note,created
import { readCsv, toCsv } from "./csv.ts";
import { isDate } from "./dates.ts";

export type Login = "admin" | "member";

export const NETWORKS = ["visa", "mastercard", "jcb", "unionpay", "amex"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_LABEL: Record<Network, string> = { visa: "Visa", mastercard: "Mastercard", jcb: "JCB", unionpay: "UnionPay", amex: "Amex" };

export const KINDS = ["cashback", "discount", "installment", "freebie", "points", "raffle", "other"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { cashback: "Cashback", discount: "Discount", installment: "0% installment", freebie: "Freebie", points: "Points & miles", raffle: "Raffle", other: "Other" };

export const BANKS = { rcbc: "RCBC" } as const;
export type Bank = keyof typeof BANKS;
export const isBank = (v: unknown): v is Bank => typeof v === "string" && v in BANKS;

/**
 * A promo. `id` is "<bank>:<slug>". `added` is the day it was first seen; `gone` the day it left the bank's list
 * (it stays, since we may be waiting on its reward); `checked` the day its own page was last read. Promos added by
 * hand are `manual` and never go.
 */
export type Promo = {
  id: string; bank: Bank; slug: string; title: string; summary: string; url: string; image: string;
  networks: Network[]; kind: Kind; period: string; starts: string; ends: string; permit: string; details: string;
  added: string; updated: string; checked?: string; gone?: string; manual?: boolean;
};

export type Card = { id: string; bank: Bank; name: string; network: Network; note: string };

/**
 * Where we are with a promo: watching it, joined (registered, or spending toward it), earned (met the terms),
 * credited (the reward arrived), or skipped. `goal` is the minimum spend to earn it; `reward` what we expect, in pesos.
 */
export const STATUSES = ["watching", "joined", "earned", "credited", "skipped"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { watching: "Watching", joined: "Joined", earned: "Earned", credited: "Credited", skipped: "Skipped" };
export type Tracking = { promo: string; status: Status; card: string; goal: number; reward: number; note: string; updated: string };

/** Money spent toward a promo, on one of our cards. `created` orders a day's rows. */
export type Spend = { id: string; date: string; promo: string; card: string; amount: number; note: string; created: string };

export type Ledger = { promos: Promo[]; cards: Card[]; tracking: Tracking[]; spend: Spend[] };

export const emptyLedger = (): Ledger => ({ promos: [], cards: [], tracking: [], spend: [] });

// ---------- files ----------

export const CARDS_FILE = "cards.csv";
export const TRACKING_FILE = "tracking.csv";
export const catalogFile = (bank: Bank) => `promos/${bank}.json`;

export const isLedgerFile = (p: string) => p === CARDS_FILE || p === TRACKING_FILE || /^promos\/[a-z0-9-]+\.json$/.test(p) || /^spend\/\d{4}\.csv$/.test(p);

const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pick = <T extends string>(v: string, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);

export function fromFiles(files: Record<string, string>): Ledger {
  const ledger = emptyLedger();
  for (const [name, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (name.startsWith("promos/") && text.trim()) ledger.promos.push(...(JSON.parse(text) as Promo[]));
    else if (name.startsWith("spend/")) ledger.spend.push(...readCsv(text).map((r) => ({ id: r.id, date: r.date, promo: r.promo, card: r.card, amount: num(r.amount), note: r.note, created: r.created })));
  }
  ledger.cards = readCsv(files[CARDS_FILE] ?? "").map((r) => ({ id: r.id, bank: isBank(r.bank) ? r.bank : "rcbc", name: r.name, network: pick(r.network, NETWORKS, "visa"), note: r.note }));
  ledger.tracking = readCsv(files[TRACKING_FILE] ?? "").map((r) => ({ promo: r.promo, status: pick(r.status, STATUSES, "watching"), card: r.card, goal: num(r.goal), reward: num(r.reward), note: r.note, updated: r.updated }));
  return ledger;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const spendOrder = (a: Spend, b: Spend) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id);

export function toFiles(ledger: Ledger): Record<string, string> {
  const files: Record<string, string> = {};
  for (const bank of new Set(ledger.promos.map((p) => p.bank))) {
    files[catalogFile(bank)] = JSON.stringify(ledger.promos.filter((p) => p.bank === bank).sort(byId), null, 2) + "\n";
  }
  files[CARDS_FILE] = toCsv(["id", "bank", "name", "network", "note"], [...ledger.cards].sort(byId).map((c) => [c.id, c.bank, c.name, c.network, c.note]));
  files[TRACKING_FILE] = toCsv(["promo", "status", "card", "goal", "reward", "note", "updated"],
    [...ledger.tracking].sort((a, b) => a.promo.localeCompare(b.promo)).map((t) => [t.promo, t.status, t.card, String(t.goal), String(t.reward), t.note, t.updated]));
  for (const year of new Set(ledger.spend.map((s) => s.date.slice(0, 4)))) {
    files[`spend/${year}.csv`] = toCsv(["id", "date", "promo", "card", "amount", "note", "created"],
      ledger.spend.filter((s) => s.date.startsWith(year)).sort(spendOrder).map((s) => [s.id, s.date, s.promo, s.card, String(s.amount), s.note, s.created]));
  }
  return files;
}

/**
 * The files to write: those that differ from what's stored. A year's spend file whose rows have all gone is written
 * empty (with its header), since a commit here can't delete a file.
 */
export function changedFiles(before: Record<string, string>, after: Record<string, string>): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const [name, text] of Object.entries(after)) if (before[name] !== text) changed[name] = text;
  for (const name of Object.keys(before)) {
    if (name in after || !isLedgerFile(name)) continue;
    if (name.startsWith("spend/")) changed[name] = toCsv(["id", "date", "promo", "card", "amount", "note", "created"], []);
    else if (name.startsWith("promos/")) changed[name] = "[]\n";
  }
  return changed;
}

// ---------- edits ----------

export type PromoFields = Pick<Promo, "title" | "summary" | "url" | "networks" | "kind" | "starts" | "ends" | "details">;
export type CardFields = Omit<Card, "id">;
export type TrackingFields = Omit<Tracking, "promo" | "updated">;
export type SpendFields = Omit<Spend, "id" | "created">;

export type Op =
  | { type: "addPromo"; bank: Bank; slug: string; fields: PromoFields; today: string }
  | { type: "updatePromo"; id: string; changes: Partial<PromoFields>; today: string }
  | { type: "deletePromo"; id: string }
  | { type: "addCard"; id: string; fields: CardFields }
  | { type: "updateCard"; id: string; changes: Partial<CardFields> }
  | { type: "deleteCard"; id: string }
  | { type: "track"; promo: string; fields: TrackingFields; today: string }
  | { type: "untrack"; promo: string }
  | { type: "addSpend"; id: string; fields: SpendFields; created: string }
  | { type: "updateSpend"; id: string; changes: Partial<SpendFields> }
  | { type: "deleteSpend"; id: string };

export class EditError extends Error {}

export function applyOp(ledger: Ledger, op: Op): Ledger {
  switch (op.type) {
    case "addPromo": {
      const id = `${op.bank}:${op.slug}`;
      if (ledger.promos.some((p) => p.id === id)) throw new EditError("There's already a promo with that name.");
      const promo: Promo = { id, bank: op.bank, slug: op.slug, image: "", period: "", permit: "", ...op.fields, added: op.today, updated: op.today, manual: true };
      return { ...ledger, promos: [...ledger.promos, promo] };
    }
    case "updatePromo":
      return { ...ledger, promos: ledger.promos.map((p) => (p.id === op.id ? { ...p, ...op.changes, updated: op.today } : p)) };
    case "deletePromo": {
      // Only promos added by hand (an imported one would come back with the next check), with what we did about it.
      if (!ledger.promos.find((p) => p.id === op.id)?.manual) throw new EditError("Only promos added by hand can be deleted.");
      return { ...ledger, promos: ledger.promos.filter((p) => p.id !== op.id), tracking: ledger.tracking.filter((t) => t.promo !== op.id),
        spend: ledger.spend.filter((s) => s.promo !== op.id) };
    }
    case "addCard":
      return { ...ledger, cards: [...ledger.cards.filter((c) => c.id !== op.id), { id: op.id, ...op.fields }] };
    case "updateCard":
      return { ...ledger, cards: ledger.cards.map((c) => (c.id === op.id ? { ...c, ...op.changes } : c)) };
    case "deleteCard":
      // Its spending and tracking keep the id, shown as "a removed card", so no history is lost.
      return { ...ledger, cards: ledger.cards.filter((c) => c.id !== op.id) };
    case "track": {
      const row: Tracking = { promo: op.promo, ...op.fields, updated: op.today };
      return { ...ledger, tracking: [...ledger.tracking.filter((t) => t.promo !== op.promo), row] };
    }
    case "untrack":
      return { ...ledger, tracking: ledger.tracking.filter((t) => t.promo !== op.promo) };
    case "addSpend":
      return { ...ledger, spend: [...ledger.spend.filter((s) => s.id !== op.id), { id: op.id, ...op.fields, created: op.created }] };
    case "updateSpend":
      return { ...ledger, spend: ledger.spend.map((s) => (s.id === op.id ? { ...s, ...op.changes } : s)) };
    case "deleteSpend":
      return { ...ledger, spend: ledger.spend.filter((s) => s.id !== op.id) };
  }
}

/** The git commit message for an edit, without amounts (the app repo is public; the ledger's history stays plain). */
export function describeOp(ledger: Ledger, op: Op): string {
  const promo = (id: string) => ledger.promos.find((p) => p.id === id)?.title ?? id;
  const card = (id: string) => ledger.cards.find((c) => c.id === id)?.name ?? "a card";
  const spend = (id: string) => ledger.spend.find((s) => s.id === id);
  switch (op.type) {
    case "addPromo": return `Add promo ${op.fields.title}`;
    case "updatePromo": return `Edit promo ${promo(op.id)}`;
    case "deletePromo": return `Delete promo ${promo(op.id)}`;
    case "addCard": return `Add card ${op.fields.name}`;
    case "updateCard": return `Edit card ${card(op.id)}`;
    case "deleteCard": return `Remove card ${card(op.id)}`;
    case "track": return `${STATUS_LABEL[op.fields.status]}: ${promo(op.promo)}`;
    case "untrack": return `Stop tracking ${promo(op.promo)}`;
    case "addSpend": return `Log spending for ${promo(op.fields.promo)}`;
    case "updateSpend": return `Edit spending for ${promo(spend(op.id)?.promo ?? "")}`;
    case "deleteSpend": return `Delete spending for ${promo(spend(op.id)?.promo ?? "")}`;
  }
}

export const commitMessage = (ledger: Ledger, op: Op, login?: Login | null) => describeOp(ledger, op) + (login ? ` (by ${login})` : "");

// ---------- checking what the browser sends ----------

const text = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;
const name = (v: unknown) => typeof v === "string" && v.trim() !== "" && v.length <= 160;
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9:_.~%-]{1,200}$/.test(v);
const amount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e9;
const dateOrEmpty = (v: unknown) => v === "" || isDate(v);
const oneOf = (all: readonly string[]) => (v: unknown) => all.includes(v as string);
const networks = (v: unknown) => Array.isArray(v) && v.every(oneOf(NETWORKS));

type Checks = Record<string, (v: unknown) => boolean>;
const PROMO: Checks = { title: name, summary: text(1000), url: text(500), networks, kind: oneOf(KINDS), starts: dateOrEmpty, ends: dateOrEmpty, details: text(20000) };
const CARD: Checks = { bank: isBank, name, network: oneOf(NETWORKS), note: text(500) };
const TRACKING: Checks = { status: oneOf(STATUSES), card: (v) => v === "" || id(v), goal: amount, reward: amount, note: text(1000) };
const SPEND: Checks = { date: isDate, promo: id, card: (v) => v === "" || id(v), amount, note: text(500) };

const all = (v: unknown, checks: Checks) => !!v && typeof v === "object" && Object.keys(checks).every((k) => checks[k]((v as Record<string, unknown>)[k]))
  && Object.keys(v).every((k) => k in checks);
const some = (v: unknown, checks: Checks) => !!v && typeof v === "object" && Object.keys(v).length > 0
  && Object.entries(v).every(([k, val]) => checks[k]?.(val) ?? false);

/** Checks an edit sent by the browser before it is applied. */
export function isOp(v: unknown): v is Op {
  const op = v as Op;
  if (!op || typeof op !== "object") return false;
  switch (op.type) {
    case "addPromo": return isBank(op.bank) && /^[a-z0-9-]{1,120}$/.test(op.slug) && all(op.fields, PROMO) && isDate(op.today);
    case "updatePromo": return id(op.id) && some(op.changes, PROMO) && isDate(op.today);
    case "deletePromo": return id(op.id);
    case "addCard": return id(op.id) && all(op.fields, CARD);
    case "updateCard": return id(op.id) && some(op.changes, CARD);
    case "deleteCard": return id(op.id);
    case "track": return id(op.promo) && all(op.fields, TRACKING) && isDate(op.today);
    case "untrack": return id(op.promo);
    case "addSpend": return id(op.id) && all(op.fields, SPEND) && typeof op.created === "string" && op.created.length <= 40;
    case "updateSpend": return id(op.id) && some(op.changes, SPEND);
    case "deleteSpend": return id(op.id);
    default: return false;
  }
}
