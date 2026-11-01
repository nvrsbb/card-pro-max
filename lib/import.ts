// Checks each bank's promo list and saves what changed. Server only: the fetching half of lib/rcbc.ts, lib/eastwest.ts,
// lib/bpi.ts and lib/metrobank.ts.
import * as bpi from "./bpi.ts";
import { manilaToday, parsePeriod } from "./dates.ts";
import * as eastwest from "./eastwest.ts";
import { BANKS, type Bank } from "./ledger.ts";
import * as metrobank from "./metrobank.ts";
import { looksIncomplete, needsDetail, withoutEnded } from "./promos.ts";
import * as rcbc from "./rcbc.ts";
import type { Detail, Listed } from "./rcbc.ts";
import { LedgerError, readLedger, saveImport, type ImportSummary } from "./store.ts";

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; card-pro-max; +https://github.com/nvrsbb/card-pro-max)", accept: "text/html" };
const PARALLEL = 6; // pages read at a time: quick, and gentle on the bank's site

async function page(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(20_000) })
    .catch(() => { throw new LedgerError(`${url} didn't load.`); });
  if (!res.ok) throw new LedgerError(`${url} answered ${res.status}.`);
  return res.text();
}

/**
 * A big page, read as it streams in and never past `max` bytes: one that runs over, or stops part way, fails the
 * check, so its promos aren't wrongly marked gone.
 */
async function bigPage(url: string, max: number): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(60_000) })
    .catch(() => { throw new LedgerError(`${url} didn't load.`); });
  if (!res.ok || !res.body) throw new LedgerError(`${url} answered ${res.status}.`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let size = 0;
  try {
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      size += next.value.byteLength;
      if (size > max) throw new LedgerError(`${url} was bigger than expected (over ${Math.round(max / 1e6)} MB). The site may have changed; nothing was saved.`);
      parts.push(decoder.decode(next.value, { stream: true }));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof LedgerError ? error : new LedgerError(`${url} stopped loading part way.`);
  }
  parts.push(decoder.decode());
  return parts.join("");
}

/** Runs `work` on every item, PARALLEL at a time. */
async function inTurn<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

/** How to read one bank's site: its list of promos, one promo's own page, and a promo's address. */
type Importer<L extends Listed> = { list(today: string): Promise<L[]>; detail(listed: L): Promise<Detail>; url(slug: string): string };

const rcbcUrl = (slug: string) => `${rcbc.RCBC_BASE}/promos/${encodeURIComponent(slug)}`;
const eastwestUrl = (slug: string) => `${eastwest.EASTWEST_BASE}/promos/${encodeURIComponent(slug)}`;
const bpiUrl = (slug: string) => `${bpi.BPI_LIST_URL}/${encodeURIComponent(slug)}`;
const metrobankUrl = (slug: string) => `${metrobank.METROBANK_LIST_URL}/${encodeURIComponent(slug)}`;
/** Metrobank's list page is about 12.5 MB (every promo it has run, as JSON): room to grow, but not without limit. */
const METROBANK_MAX = 40e6;

/** The list without repeats and without promos whose listed period has ended (`period` as the list shows it). */
function stillOn<L extends Listed & { period: string }>(listed: L[], today: string): L[] {
  const seen = new Set<string>();
  return listed.filter((l) => {
    const ends = parsePeriod(l.period).ends;
    if (seen.has(l.slug) || (ends && ends < today)) return false;
    seen.add(l.slug);
    return true;
  });
}

const IMPORTERS: { [B in Bank]: Importer<Listed> } = {
  rcbc: {
    list: async () => rcbc.parseList(await page(rcbc.RCBC_LIST_URL)),
    detail: async (l) => rcbc.parseDetail(await page(rcbcUrl(l.slug))),
    url: rcbcUrl,
  },
  eastwest: {
    // Every page of the list (any one failing fails the check, so nothing is wrongly marked gone). Promos the list
    // itself shows as ended are left out: EastWest keeps years of them listed.
    async list(today) {
      const first = await page(eastwest.listPageUrl(0));
      const rest: string[] = [];
      await inTurn(Array.from({ length: eastwest.lastPage(first) }, (_, i) => i + 1), async (n) => { rest[n] = await page(eastwest.listPageUrl(n)); });
      const pages = [first, ...rest.filter(Boolean)];
      // Every page of the list has promos on it; one with none didn't render, and its promos would look taken down.
      const blank = pages.findIndex((html) => eastwest.cardCount(html) === 0);
      if (blank >= 0) throw new LedgerError(`EastWest's promo list page ${blank + 1} had no promos on it. The site may be down or changed; nothing was saved.`);
      return stillOn(pages.flatMap(eastwest.parseList), today);
    },
    detail: async (l) => eastwest.parseDetail(await page(eastwestUrl(l.slug)), (l as eastwest.EastWestListed).period),
    url: eastwestUrl,
  },
  bpi: {
    // BPI's list page shows twelve promos; the rest come twelve at a time from the JSON its Load more button reads.
    // Every page of it is read (any one failing fails the check), and promos it shows as expired or past their
    // "Valid until" are left out: BPI keeps old ones listed.
    async list(today) {
      const first = await page(bpi.listPageUrl(1));
      const size = bpi.listSize(first);
      const per = bpi.pageCount(first);
      if (!size || !per) throw new LedgerError("BPI's promo list had no promos on it. The site may be down or changed; nothing was saved.");
      const rest: string[] = [];
      await inTurn(Array.from({ length: Math.ceil(size / per) - 1 }, (_, i) => i + 2), async (n) => { rest[n] = await page(bpi.listPageUrl(n)); });
      const pages = [first, ...rest.filter((json) => json !== undefined)];
      // Every page short of the end has promos on it; one with none didn't load, and its promos would look taken down.
      const blank = pages.findIndex((json) => bpi.pageCount(json) === 0);
      if (blank >= 0) throw new LedgerError(`BPI's promo list page ${blank + 1} had no promos on it. The site may be down or changed; nothing was saved.`);
      return stillOn(pages.flatMap(bpi.parseList), today);
    },
    detail: async (l) => bpi.parseDetail(await page(bpiUrl(l.slug)), (l as bpi.BpiListed).period),
    url: bpiUrl,
  },
  metrobank: {
    // One page with every promo Metrobank has run in its JSON: read whole (cut short, it fails the check), keeping
    // credit card promos that haven't ended. A promo's own page gives its mechanics.
    async list(today) {
      const { records, promos } = metrobank.parseList(await bigPage(metrobank.METROBANK_LIST_URL, METROBANK_MAX));
      if (!records) throw new LedgerError("Metrobank's promo list had no promos on it. The site may be down or changed; nothing was saved.");
      return stillOn(promos, today);
    },
    async detail(l) {
      const detail = metrobank.parseDetail(await page(metrobankUrl(l.slug)), l as metrobank.MetrobankListed);
      if (!detail) throw new LedgerError(`Metrobank's page for ${l.slug} had no promo on it.`);
      return detail;
    },
    url: metrobankUrl,
  },
};

export type CheckResult = ImportSummary & { read: number; failed: number; later: number };

/**
 * How long a check may spend starting to read promo pages, all banks together: Vercel stops a check at 300 s. A first
 * check reads about a thousand pages (most of them Metrobank's), usually in about a minute; a slow site could take far
 * longer. Past this, new promos still unread wait for the next check, and known ones keep what they had.
 */
export const READ_BUDGET_MS = 200_000;

/**
 * Reads a bank's list, then the pages of promos that are new, changed or due a re-read, and merges them into the
 * catalog. A page that fails to load is skipped (its promo is still listed, and tried again on the weekly round).
 */
export async function importBank(bank: Bank, by: string, deadline = Date.now() + READ_BUDGET_MS): Promise<CheckResult> {
  const source = IMPORTERS[bank];
  const today = manilaToday();
  const listed = await source.list(today);
  // An empty list is the site down or redesigned, not every promo ending at once: don't mark them all gone.
  if (listed.length === 0) throw new LedgerError(`${BANKS[bank]}'s promo page had no promos on it. The site may be down or changed; nothing was saved.`);
  const { ledger } = await readLedger();
  if (looksIncomplete(ledger, bank, listed.length)) {
    throw new LedgerError(`${BANKS[bank]}'s promo list looked incomplete (${listed.length} promos, fewer than half of what it had). Nothing was saved; try again later.`);
  }
  const wanted = new Set(needsDetail(ledger, bank, listed, today));
  const details: Record<string, Detail> = {};
  const tried: string[] = [];
  const later = new Set<string>();
  await inTurn(listed.filter((l) => wanted.has(l.slug)), async (l) => {
    if (Date.now() > deadline) { later.add(l.slug); return; }
    try { details[l.slug] = await source.detail(l); }
    catch { tried.push(l.slug); }
  });
  // Out of time: new promos not yet read are left for the next check (leaving out one we don't have marks nothing gone).
  const known = new Set(ledger.promos.filter((p) => p.bank === bank).map((p) => p.slug));
  const kept = listed.filter((l) => !later.has(l.slug) || known.has(l.slug));
  const { summary } = await saveImport(bank, withoutEnded(ledger, bank, kept, details, today), details, today, source.url, by, tried);
  return { ...summary, read: Object.keys(details).length, failed: tried.length, later: kept.length < listed.length ? listed.length - kept.length : 0 };
}

/** What a check found at one bank: what changed, or why it couldn't be checked. */
export type BankCheck = { bank: Bank; result?: CheckResult; error?: string };

/**
 * Checks every bank, one after another, sharing one time budget for reading pages. Each bank saves on its own, so one
 * failing doesn't stop or undo the others.
 */
export async function importAll(by: string, banks = Object.keys(BANKS) as Bank[], budget = READ_BUDGET_MS): Promise<BankCheck[]> {
  const out: BankCheck[] = [];
  const deadline = Date.now() + budget;
  for (const bank of banks) {
    // Out of time before a bank's turn: it's checked next time rather than cut off by Vercel part way.
    if (Date.now() > deadline) { out.push({ bank, error: `There wasn't time to check ${BANKS[bank]} this round; it will be checked next time.` }); continue; }
    try { out.push({ bank, result: await importBank(bank, by, deadline) }); }
    catch (error) {
      if (!(error instanceof LedgerError)) console.error(error);
      out.push({ bank, error: error instanceof LedgerError ? error.message : `Something went wrong checking ${BANKS[bank]}.` });
    }
  }
  return out;
}
