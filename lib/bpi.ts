// Reads BPI's public promo pages (bpi.com.ph/personal/rewards-and-promotions/promos) into catalog entries, like
// lib/rcbc.ts. Pure: the text comes in as strings, so the tests run on samples and the server does the fetching
// (lib/import.ts).
//
// BPI's list page shows only its first twelve promos per tab; its Load more button asks the same list as JSON, twelve
// at a time, every tab at once. So the list is read from that JSON: each promo has its tags ("Credit cards", "Debit
// cards"…), its "Valid until" date, whether the list shows it as expired, its title, summary, picture and page.
import { parsePeriod } from "./dates.ts";
import { NETWORKS, type Network } from "./ledger.ts";
import { htmlText, type Detail, type Listed } from "./rcbc.ts";

export const BPI_BASE = "https://www.bpi.com.ph";
export const BPI_PROMOS = "/personal/rewards-and-promotions/promos";
export const BPI_LIST_URL = `${BPI_BASE}${BPI_PROMOS}`;
const LIST_JSON = `${BPI_BASE}/content/bpi/ph/en${BPI_PROMOS}/jcr:content/root/container/tabshorizontal.model.json`;

/** The list's page `page` (from 1), newest first, as the Load more button asks for it. */
export const listPageUrl = (page: number) => `${LIST_JSON}?sort=newest&page=${page}`;

/** A promo on the list, with the period its card shows ("until Jan 14, 2027", or ""): used when its page states none. */
export type BpiListed = Listed & { period: string };

/** The credit card tab's slice of one page of the list: its promos as BPI sends them, and how many the tab has in all. */
type Tab = { articleListSize?: number | string; listPage?: Article[] };
type Article = {
  heading?: string; description?: string; image?: string; viewArticleLink?: string; promoExpiryDate?: string;
  primaryTags?: string[]; expiredPage?: boolean;
};

const CREDIT_TAB = "Credit cards";

function creditTab(json: string): Tab | null {
  try {
    const tab = (JSON.parse(json) as { mapArticle?: Record<string, Tab[]> }).mapArticle?.[CREDIT_TAB]?.[0];
    return tab && Array.isArray(tab.listPage) ? tab : null;
  } catch { return null; }
}

/** How many credit card promos the list says it has (0 when the page isn't the list): the importer reads them all. */
export const listSize = (json: string) => Number(creditTab(json)?.articleListSize) || 0;

/** How many promos one page of the list has: a page with none, short of the end, didn't load properly. */
export const pageCount = (json: string) => creditTab(json)?.listPage?.length ?? 0;

/**
 * The networks a promo names: "your BPI Visa Credit Card", "Mastercard® Exclusive Offer", "Mastercard x BPI…". A
 * travel visa ("Applying for a Korean visa") isn't one. None named: any BPI card.
 */
export function namedNetworks(text: string): Network[] {
  const named = (word: string) => new RegExp(`(?:\\b(?:bpi|bank|your|credit|debit|or|and)\\s+|^|[:&/]\\s*)${word}\\b|\\b${word}®?\\s+(?:exclusive|credit|debit|card|x\\b|priceless|moments)`, "i").test(text);
  const words: Record<Network, string> = { visa: "visa", mastercard: "mastercard", jcb: "jcb", unionpay: "unionpay", amex: "(?:amex|american express)" };
  return NETWORKS.filter((n) => named(words[n]));
}

/** The credit card promos on one page of the list (the JSON), in the bank's order, without the ones it shows as expired. */
export function parseList(json: string): BpiListed[] {
  const seen = new Set<string>();
  const out: BpiListed[] = [];
  for (const a of creditTab(json)?.listPage ?? []) {
    if (a.expiredPage || !(a.primaryTags ?? []).includes(CREDIT_TAB)) continue;
    const link = (a.viewArticleLink ?? "").match(new RegExp(`^${BPI_PROMOS}/([^/?#]+)`));
    if (!link) continue;
    const slug = decodeURIComponent(link[1]).trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const title = htmlText(a.heading ?? "");
    const summary = htmlText(a.description ?? "");
    const ends = (a.promoExpiryDate ?? "").trim();
    out.push({ slug, title, summary, image: a.image ? new URL(a.image, BPI_BASE).href : "", networks: namedNetworks(`${title}\n${summary}`), period: ends && `until ${ends}` });
  }
  return out;
}

const MAX_DETAILS = 8000;

/** A sentence that gives the promo's dates: "The Promo Period is from …", "The promo runs from …". */
const SAID_PERIOD = /promo(?:tion)?\s+(?:period|runs|is valid)[^.\n]*?(?:from|until|till|is|:)\s+([^.\n]*\d{4})/i;

/**
 * The section headings on a promo's page, where they start: its mechanics run from "Promo Mechanics" to "Related
 * Information" (or the Back to top button, or the footer, whichever comes first).
 */
const HEADING = /<h2 class="section-header__heading[^"]*">([^<]*)<\/h2>/g;
const STOP = /^(related information|need more help\??)$/i;

/**
 * The promo's own page: its mechanics (through how to avail and the merchant's contacts) and DTI permit, and its
 * period: the one the page states, else the list's "Valid until" (`listed`).
 */
export function parseDetail(html: string, listed = ""): Detail {
  // AEM repeats each text block, escaped, in a data attribute: drop it, or its ">"s would read as the ends of tags.
  const page = html.replace(/\sdata-cmp-data-layer="[^"]*"/g, "");
  const headings = [...page.matchAll(HEADING)].map((m) => ({ name: htmlText(m[1]), at: m.index, after: m.index + m[0].length }));
  const first = headings.find((h) => /^promo mechanics$/i.test(h.name)) ?? headings.find((h) => !/^promo highlights?$/i.test(h.name) && !STOP.test(h.name));
  const stop = first && headings.find((h) => h.at > first.at && STOP.test(h.name));
  const from = first?.after ?? 0;
  const ends = [stop?.at ?? -1, page.indexOf('<div class="backToTop', from), page.indexOf("<footer", from)].filter((i) => i >= 0);
  const body = first ? page.slice(from, ends.length ? Math.min(...ends) : undefined) : "";
  let details = htmlText(body);
  if (details.length > MAX_DETAILS) details = `${details.slice(0, MAX_DETAILS).replace(/\s+\S*$/, "")} …`;
  const said = details.match(SAID_PERIOD)?.[1].trim() ?? "";
  const period = said && (parsePeriod(said).ends || !listed) ? said : listed;
  // "FTEB-123456, Series of 2026", also when written "FTEB- 123456" or "FTEB 123456".
  const permit = details.match(/(?:DTI|FTEB)[^\n]*?FTEB\s*-?\s*(\d+)([^\n]*?\d{4})/i);
  return { period, ...parsePeriod(period), details, permit: permit ? `FTEB-${permit[1]}${permit[2]}`.replace(/\s+/g, " ").trim() : "" };
}
