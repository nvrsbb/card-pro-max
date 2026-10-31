// Checks a bank's promo list and saves what changed. Server only: the fetching half of lib/rcbc.ts.
import { manilaToday } from "./dates.ts";
import type { Bank } from "./ledger.ts";
import { needsDetail } from "./promos.ts";
import { parseDetail, parseList, RCBC_BASE, RCBC_LIST_URL, type Detail } from "./rcbc.ts";
import { LedgerError, readLedger, saveImport, type ImportSummary } from "./store.ts";

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; card-pro-max; +https://github.com/nvrsbb/card-pro-max)", accept: "text/html" };
const PARALLEL = 6; // pages read at a time: quick, and gentle on the bank's site

async function page(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new LedgerError(`${url} answered ${res.status}.`);
  return res.text();
}

const rcbcUrl = (slug: string) => `${RCBC_BASE}/promos/${encodeURIComponent(slug)}`;

/**
 * Reads RCBC's list, then the pages of promos that are new, changed or due a re-read, and merges them into the
 * catalog. A page that fails to load is skipped (its promo is still listed, and read next time).
 */
export async function importRcbc(by: string): Promise<ImportSummary & { read: number; failed: number }> {
  const bank: Bank = "rcbc";
  const today = manilaToday();
  const listed = parseList(await page(RCBC_LIST_URL));
  // An empty list is the site down or redesigned, not every promo ending at once: don't mark them all gone.
  if (listed.length === 0) throw new LedgerError("RCBC's promo page had no promos on it. The site may be down or changed; nothing was saved.");
  const { ledger } = await readLedger();
  const queue = needsDetail(ledger, bank, listed, today);
  const details: Record<string, Detail> = {};
  let failed = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let slug = queue.shift(); slug !== undefined; slug = queue.shift()) {
      try { details[slug] = parseDetail(await page(rcbcUrl(slug))); }
      catch { failed += 1; }
    }
  }));
  const { summary } = await saveImport(bank, listed, details, today, rcbcUrl, by);
  return { ...summary, read: Object.keys(details).length, failed };
}
