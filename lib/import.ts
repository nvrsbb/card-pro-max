// Checks each bank's promo list and saves what changed. Server only: the fetching half of lib/rcbc.ts, lib/eastwest.ts
// and lib/bpi.ts.
import * as bpi from "./bpi.ts";
import { manilaToday, parsePeriod } from "./dates.ts";
import * as eastwest from "./eastwest.ts";
import { BANKS, type Bank } from "./ledger.ts";
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
};

export type CheckResult = ImportSummary & { read: number; failed: number };

/**
 * Reads a bank's list, then the pages of promos that are new, changed or due a re-read, and merges them into the
 * catalog. A page that fails to load is skipped (its promo is still listed, and read next time).
 */
export async function importBank(bank: Bank, by: string): Promise<CheckResult> {
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
  let failed = 0;
  await inTurn(listed.filter((l) => wanted.has(l.slug)), async (l) => {
    try { details[l.slug] = await source.detail(l); }
    catch { failed += 1; }
  });
  const { summary } = await saveImport(bank, withoutEnded(ledger, bank, listed, details, today), details, today, source.url, by);
  return { ...summary, read: Object.keys(details).length, failed };
}

/** What a check found at one bank: what changed, or why it couldn't be checked. */
export type BankCheck = { bank: Bank; result?: CheckResult; error?: string };

/**
 * Checks every bank, one after another. Each bank saves on its own, so one failing doesn't stop or undo the others.
 */
export async function importAll(by: string, banks = Object.keys(BANKS) as Bank[]): Promise<BankCheck[]> {
  const out: BankCheck[] = [];
  for (const bank of banks) {
    try { out.push({ bank, result: await importBank(bank, by) }); }
    catch (error) {
      if (!(error instanceof LedgerError)) console.error(error);
      out.push({ bank, error: error instanceof LedgerError ? error.message : `Something went wrong checking ${BANKS[bank]}.` });
    }
  }
  return out;
}
