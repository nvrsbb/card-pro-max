// What the catalog and our records say together: which promos are on, which fit our cards, how far we are.
import { daysBetween } from "./dates.ts";
import type { Detail, Listed } from "./rcbc.ts";
import type { Bank, Card, Kind, Ledger, Network, Promo, Spend, Status, Tracking } from "./ledger.ts";

/** The kind of promo, from how the bank names it. The first that fits wins: "0% installment + freebie" is installment. */
export function kindOf(title: string, summary = ""): Kind {
  const t = title.toLowerCase();
  const all = `${t} ${summary.toLowerCase()}`;
  if (/cash ?back|rebate|statement credit|cash credit/.test(t)) return "cashback";
  if (/0% (installment|interest)|installment/.test(t)) return "installment";
  if (/\bwin\b|raffle|draw|sweepstakes/.test(t)) return "raffle";
  if (/rewards? points|bonus points|airmiles|\bmiles\b/.test(t)) return "points";
  if (/% ?off|₱[\d,]+ ?off|\boff\b|discount|savings?\b|\bsave\b|as low as|for only|buy \d+,? get|privileges/.test(t)) return "discount";
  if (/free|freebie|gift|complimentary/.test(t)) return "freebie";
  if (/cash ?back|rebate/.test(all)) return "cashback";
  if (/% ?off|discount/.test(all)) return "discount";
  return "other";
}

const peso = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : 0);
const PESOS = String.raw`(?:₱|PHP|Php|P)\s?([\d,]+(?:\.\d+)?)`;

/**
 * The minimum spend and the most the reward is worth, as the promo's text says them (0 when it doesn't), to start
 * the Track form with. A guess: the bank's wording varies, so it's always shown for checking.
 */
export function guessTerms(text: string): { goal: number; reward: number } {
  const goal = text.match(new RegExp(String.raw`min(?:imum|\.)?\s*(?:single[- ]receipt\s+|accumulated\s+|cumulative\s+|total\s+)?(?:spend|purchase|transaction|amount)s?(?:\s+amount)?(?:\s+of)?\s*` + PESOS, "i"))
    ?? text.match(new RegExp(String.raw`(?:spend|purchase)s?\s+(?:at least|a minimum of|min\.? of)\s*` + PESOS, "i"));
  const reward = text.match(new RegExp(String.raw`(?:off|cash ?back|rebate)\s*\(?\s*(?:of\s+)?up to\s*` + PESOS, "i"))
    ?? text.match(new RegExp(String.raw`(?:up to\s*)?` + PESOS + String.raw`\s*(?:cash ?back|rebate|statement credit|off|gift|e-?voucher|voucher)`, "i"))
    ?? text.match(new RegExp(String.raw`(?:cash ?back|rebate|statement credit)\s+(?:of\s+)?(?:up to\s+)?` + PESOS, "i"));
  return { goal: peso(goal?.[1]), reward: peso(reward?.[1]) };
}

/** Days until the promo ends (0 on its last day), or null when it has no end date. */
export function daysLeft(promo: Pick<Promo, "ends">, today: string): number | null {
  return promo.ends ? daysBetween(today, promo.ends) : null;
}

/** On today: started (or no start given), not ended, and still on the bank's list. */
export function isOn(promo: Promo, today: string): boolean {
  return !promo.gone && (!promo.starts || promo.starts <= today) && (!promo.ends || promo.ends >= today);
}

export const isUpcoming = (promo: Promo, today: string) => !promo.gone && !!promo.starts && promo.starts > today;
export const hasEnded = (promo: Promo, today: string) => !!promo.ends && promo.ends < today;

/** Our cards a promo can be used with: same bank, and a network it lists (a promo listing none takes any). */
export function cardsFor(promo: Promo, cards: Card[]): Card[] {
  return cards.filter((c) => c.bank === promo.bank && (promo.networks.length === 0 || promo.networks.includes(c.network)));
}

export const trackingOf = (ledger: Ledger, promo: string): Tracking | undefined => ledger.tracking.find((t) => t.promo === promo);
export const spendOn = (ledger: Ledger, promo: string): Spend[] => ledger.spend.filter((s) => s.promo === promo);

/** How far we are toward a promo's minimum spend. `share` is 1 or more once it's met; null with no minimum. */
export function progress(ledger: Ledger, promo: string): { spent: number; goal: number; left: number; share: number | null } {
  const spent = round(spendOn(ledger, promo).reduce((sum, s) => sum + s.amount, 0));
  const goal = trackingOf(ledger, promo)?.goal ?? 0;
  return { spent, goal, left: Math.max(round(goal - spent), 0), share: goal > 0 ? spent / goal : null };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Live statuses: still something to do or wait for. */
export const OPEN: Status[] = ["watching", "joined", "earned"];

/** Rewards earned or credited in a year (by when they were last updated), and what's still to be credited. */
export function rewardTotals(ledger: Ledger, year: string): { credited: number; waiting: number } {
  const sum = (status: Status, inYear: boolean) => round(ledger.tracking
    .filter((t) => t.status === status && (!inYear || t.updated.startsWith(year))).reduce((n, t) => n + t.reward, 0));
  return { credited: sum("credited", true), waiting: sum("earned", false) };
}

/** Promos as seen from today: soonest-ending first, those with no end date last, then by title. */
export function byEnding(a: Promo, b: Promo): number {
  return (a.ends || "9999").localeCompare(b.ends || "9999") || a.title.localeCompare(b.title);
}

// ---------- importing ----------

/** How long an untracked promo stays in the catalog after it ended or left the bank's list. */
export const KEEP_DAYS = 180;

export type ImportResult = { promos: Promo[]; added: string[]; updated: string[]; gone: string[]; removed: string[] };

/**
 * The catalog after a check of the bank's list: new promos are added (dated today), listed ones refreshed (with their
 * page when it was read), and ones no longer listed marked gone. Promos we never tracked are dropped KEEP_DAYS after
 * they ended or went. Promos added by hand are left alone.
 */
export function mergeImport(ledger: Ledger, bank: Bank, listed: Listed[], details: Record<string, Detail>, today: string, url: (slug: string) => string): ImportResult {
  const result: ImportResult = { promos: [], added: [], updated: [], gone: [], removed: [] };
  const here = new Map(listed.map((l) => [l.slug, l]));
  const known = new Set<string>();
  const tracked = new Set(ledger.tracking.map((t) => t.promo));
  for (const p of ledger.promos) {
    if (p.bank !== bank || p.manual) { result.promos.push(p); continue; }
    known.add(p.slug);
    const l = here.get(p.slug);
    if (!l) {
      const since = p.gone ?? today;
      const stale = daysBetween(p.ends && p.ends < since ? p.ends : since, today) > KEEP_DAYS;
      if (stale && !tracked.has(p.id)) { result.removed.push(p.id); continue; }
      if (!p.gone) result.gone.push(p.id);
      result.promos.push({ ...p, gone: since });
      continue;
    }
    const d = details[p.slug];
    const next: Promo = { ...p, title: l.title, summary: l.summary, image: l.image || p.image, networks: l.networks, kind: kindOf(l.title, l.summary),
      ...(d ? { period: d.period, starts: d.starts, ends: d.ends, details: d.details, permit: d.permit } : {}) };
    delete next.gone;
    if (JSON.stringify(next) !== JSON.stringify(p)) { next.updated = today; result.updated.push(p.id); }
    if (d) next.checked = today;
    result.promos.push(next);
  }
  for (const l of listed) {
    if (known.has(l.slug)) continue;
    const d = details[l.slug] ?? { period: "", starts: "", ends: "", details: "", permit: "" };
    const id = `${bank}:${l.slug}`;
    result.added.push(id);
    result.promos.push({ id, bank, slug: l.slug, title: l.title, summary: l.summary, url: url(l.slug), image: l.image, networks: l.networks,
      kind: kindOf(l.title, l.summary), period: d.period, starts: d.starts, ends: d.ends, permit: d.permit, details: d.details, added: today, updated: today,
      ...(details[l.slug] ? { checked: today } : {}) });
  }
  return result;
}

/** The commit message for a check of the bank's list. */
export function describeImport(bankName: string, r: ImportResult): string {
  const parts = [[r.added.length, "new"], [r.updated.length, "updated"], [r.gone.length, "gone"], [r.removed.length, "cleared"]]
    .filter(([n]) => n).map(([n, what]) => `${n} ${what}`);
  return `${bankName} promos: ${parts.length ? parts.join(", ") : "no changes"}`;
}

/** What a check of one bank found, in words: "2 new, 1 taken down", and any pages that didn't load. */
export function checkWords(r: { added: number; updated: number; gone: number; failed: number }): string {
  const parts = [[r.added, "new"], [r.updated, "updated"], [r.gone, "taken down"]].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  const failed = r.failed ? ` ${r.failed} page${r.failed === 1 ? "" : "s"} didn't load; they'll be read next time.` : "";
  return `${parts.length ? parts.join(", ") : "nothing changed"}.${failed}`;
}

/** How often a listed promo's own page is read again, to catch changed terms and extended dates. */
export const REREAD_DAYS = 7;

/**
 * Which listed promos need their own page read: new ones, ones whose title or summary changed, ones never read, ones
 * still listed after their end date (likely extended), and ones not read for REREAD_DAYS.
 */
export function needsDetail(ledger: Ledger, bank: Bank, listed: Listed[], today: string): string[] {
  const have = new Map(ledger.promos.filter((p) => p.bank === bank).map((p) => [p.slug, p]));
  return listed.filter((l) => {
    const p = have.get(l.slug);
    return !p || p.title !== l.title || p.summary !== l.summary || (!p.details && !p.period)
      || (!!p.ends && p.ends < today) || daysBetween(p.checked ?? p.updated, today) >= REREAD_DAYS;
  }).map((l) => l.slug);
}

export const networksOf = (cards: Card[]): Network[] => [...new Set(cards.map((c) => c.network))];

/** How long a promo counts as new after it first shows up. */
export const NEW_DAYS = 7;

/**
 * New: first seen in the last week, by a check after the first one (which found everything already running, so
 * none of those are news).
 */
export function isNew(promo: Promo, promos: Promo[], today: string): boolean {
  const first = promos.filter((p) => p.bank === promo.bank && !p.manual).reduce((min, p) => (p.added < min ? p.added : min), "9999");
  return !promo.manual && promo.added > first && daysBetween(promo.added, today) < NEW_DAYS;
}
