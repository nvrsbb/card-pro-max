// Reads EastWest Bank's public promo pages (eastwestbanker.com/promos) into catalog entries, like lib/rcbc.ts. Pure:
// the HTML comes in as text, so the tests run on samples and the server does the fetching (lib/import.ts).
//
// EastWest's list is one feed for every product (credit, debit, deposits, loans), nine to a page, ended promos
// included. Each card on it carries pills: "Credit Cards", "Debit Cards", "Visa exclusive"… and often the period.
import { parsePeriod } from "./dates.ts";
import { NETWORKS, type Network } from "./ledger.ts";
import { htmlText, type Detail, type Listed } from "./rcbc.ts";

export const EASTWEST_BASE = "https://www.eastwestbanker.com";
export const EASTWEST_LIST_URL = `${EASTWEST_BASE}/promos`;

/** A promo on the list, with the period its card shows ("" when it shows none): EastWest's own pages don't repeat it. */
export type EastWestListed = Listed & { period: string };

const EXCLUSIVE: Record<string, Network> = { "visa exclusive": "visa", "mastercard exclusive": "mastercard", "jcb exclusive": "jcb" };

/**
 * A promo for credit cards: tagged Credit Cards, or tagged for a network only (Visa exclusive) and not for
 * debit or prepaid cards.
 */
function forCredit(pills: string[]): boolean {
  if (pills.includes("credit cards")) return true;
  return pills.some((p) => p in EXCLUSIVE) && !pills.includes("debit cards") && !pills.includes("prepaid cards");
}

/** The credit card promos on one page of the list, in the bank's order. */
export function parseList(html: string): EastWestListed[] {
  const seen = new Set<string>();
  const out: EastWestListed[] = [];
  for (const block of html.split(/class="card promo-card"/).slice(1)) {
    const link = block.match(/<a href="\/promos\/([^"?#]+)"[^>]*>\s*<h3>([\s\S]*?)<\/h3>/);
    if (!link) continue;
    const slug = decodeURIComponent(link[1]).trim();
    if (!slug || seen.has(slug)) continue;
    const pills = [...block.matchAll(/class="pill-category[^"]*">([^<]*)</g)].map((m) => htmlText(m[1]).toLowerCase());
    if (!forCredit(pills)) continue;
    seen.add(slug);
    const period = block.match(/<\/h3>\s*<\/a>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "";
    const summary = block.match(/<div class="excerpt">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const image = block.match(/<div class="card-img">[\s\S]*?<img src="([^"]+)"/)?.[1] ?? "";
    const networks = NETWORKS.filter((n) => pills.some((p) => EXCLUSIVE[p] === n));
    out.push({ slug, title: htmlText(link[2]), summary: htmlText(summary), image: image && new URL(image, EASTWEST_BASE).href, networks, period: htmlText(period) });
  }
  return out;
}

/** The list's last page number (the first is 0), from its pager; 0 when there's only one. */
export function lastPage(html: string): number {
  const last = html.match(/href="\?(?:[^"]*&amp;)?page=(\d+)"[^>]*title="Go to last page"/)?.[1];
  return last ? Number(last) : 0;
}

export const listPageUrl = (page: number) => (page > 0 ? `${EASTWEST_LIST_URL}?page=${page}` : EASTWEST_LIST_URL);

const MAX_DETAILS = 8000;

/** A sentence that gives the promo's dates: "Promo period is from …", "Promo runs until …", "Booking period: …". */
const SAID_PERIOD = /(?:promo(?:tion)?|offer|booking|transaction|purchase)\s+(?:period|runs|is valid|is available)[^.\n]*?(?:from|until|till|is|:)\s+([^.\n]*\d{4})/i;

/**
 * The promo's own page: its mechanics and DTI permit, and its period: the one the list showed (`listed`), else the
 * one its summary or mechanics state.
 */
export function parseDetail(html: string, listed = ""): Detail {
  const mechanics = html.match(/class="promo-mechanics-wrap">[\s\S]*?class="field field--name-body[^"]*">([\s\S]*?)<\/div>\s*(?:<\/div>\s*)*<\/section>/)?.[1] ?? "";
  let details = htmlText(mechanics);
  if (details.length > MAX_DETAILS) details = `${details.slice(0, MAX_DETAILS).replace(/\s+\S*$/, "")} …`;
  const excerpt = htmlText(html.match(/class="field field--name-field-excerpt[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const said = (text: string) => text.match(SAID_PERIOD)?.[1].trim() ?? "";
  const period = listed || said(excerpt) || said(details);
  const permit = details.match(/(?:DTI|FTEB)[^\n]*?(FTEB[- ]?\d+[^\n]*?\d{4})/i)?.[1] ?? "";
  return { period, ...parsePeriod(period), details, permit: permit.replace(/\s+/g, " ").trim() };
}
