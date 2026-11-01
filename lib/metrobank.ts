// Reads Metrobank's public promo pages (metrobank.com.ph/promos) into catalog entries, like lib/rcbc.ts. Pure: the
// text comes in as strings, so the tests run on samples and the server does the fetching (lib/import.ts).
//
// Metrobank's site is Next.js: its list page carries every promo it has ever run (about 2,700, most long over) as JSON
// in its __NEXT_DATA__ script, each with its title, one-line description, ISO start and end dates and the cards it's
// for ("Travel Signature Visa", "Prime Debit Card"), each with its type ("Credit Card", "Debit Card"). A promo's own
// page carries its mechanics and DTI permit the same way.
import { manilaToday } from "./dates.ts";
import { NETWORKS, type Network } from "./ledger.ts";
import { htmlText, type Detail, type Listed } from "./rcbc.ts";

export const METROBANK_BASE = "https://www.metrobank.com.ph";
export const METROBANK_LIST_URL = `${METROBANK_BASE}/promos`;

/** A promo on the list, with its period and the dates it gives: its own page doesn't repeat them. */
export type MetrobankListed = Listed & { period: string; starts: string; ends: string };

type Card = { title?: string; cardTypes?: { name?: string }[] };
type Raw = {
  slug?: string; title?: string; pageName?: string; description?: string; startDate?: string; expirationDate?: string;
  cards?: Card[]; cardBannerImage?: { url?: string } | null;
};

/** The JSON in a Next.js page's __NEXT_DATA__ script, or null when it has none or it's cut short. */
function nextData(html: string): { props?: { pageProps?: { data?: unknown } } } | null {
  const tag = html.indexOf('id="__NEXT_DATA__"');
  const from = tag < 0 ? -1 : html.indexOf(">", tag) + 1;
  const to = from > 0 ? html.indexOf("</script>", from) : -1;
  if (to < 0) return null;
  try { return JSON.parse(html.slice(from, to)); } catch { return null; }
}

/** The network a card's name gives ("Travel Signature Visa", "Hype Mastercard (formerly Vantage Mastercard)"), if any. */
export function cardNetwork(name: string): Network | undefined {
  const words: { [N in Network]: RegExp } = { visa: /\bvisa\b/i, mastercard: /\bmastercard\b/i, jcb: /\bjcb\b/i, unionpay: /\bunionpay\b/i, amex: /\b(?:amex|american express)\b/i };
  const own = name.replace(/\(.*?\)/g, "");
  return NETWORKS.find((n) => words[n].test(own));
}

/** A credit card: typed "Credit Card", or untyped and not named a debit or prepaid card ("Femme Visa", "Toyota Platinum"). */
const isCredit = (c: Card) => {
  const types = (c.cardTypes ?? []).map((t) => t.name ?? "");
  return types.includes("Credit Card") || (types.length === 0 && !!c.title && !/debit|prepaid/i.test(c.title));
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The Manila date of an ISO time ("2027-02-28T23:59:59+08:00" is 2027-02-28), or "" for none. */
function manilaDate(iso: string | undefined): string {
  const when = iso ? new Date(iso) : null;
  return when && !Number.isNaN(when.getTime()) ? manilaToday(when) : "";
}

const longDate = (date: string) => `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}, ${date.slice(0, 4)}`;

/** "September 1, 2026 to February 28, 2027", "until …", or "". */
function periodOf(starts: string, ends: string): string {
  if (starts && ends) return `${longDate(starts)} to ${longDate(ends)}`;
  return ends ? `until ${longDate(ends)}` : starts ? `from ${longDate(starts)}` : "";
}

/**
 * Every credit card promo on the list page, in the bank's order, ended ones included (the importer drops those), and
 * how many promos of any kind the page had: none means it didn't load whole. A promo is for credit cards when one of
 * its cards is; one naming no cards counts when its text says credit card. Its networks are those its credit cards'
 * names give (none named: any Metrobank card).
 */
export function parseList(html: string): { records: number; promos: MetrobankListed[] } {
  const data = nextData(html)?.props?.pageProps?.data as { promoDetails?: Raw[] } | undefined;
  const records = Array.isArray(data?.promoDetails) ? data.promoDetails : [];
  const seen = new Set<string>();
  const promos: MetrobankListed[] = [];
  for (const r of records) {
    const slug = (r.slug ?? "").replace(/^\/(?:promos\/)?/, "").trim();
    if (!slug || seen.has(slug)) continue;
    const title = htmlText(r.title || r.pageName || "");
    const summary = htmlText(r.description ?? "");
    const cards = r.cards ?? [];
    const credit = cards.filter(isCredit);
    if (cards.length ? credit.length === 0 : !/credit card/i.test(`${title}\n${summary}`)) continue;
    seen.add(slug);
    const named = new Set(credit.map((c) => cardNetwork(c.title ?? "")));
    const starts = manilaDate(r.startDate);
    const ends = manilaDate(r.expirationDate);
    promos.push({ slug, title, summary, image: r.cardBannerImage?.url ?? "", networks: NETWORKS.filter((n) => named.has(n)), period: periodOf(starts, ends), starts, ends });
  }
  return { records: records.length, promos };
}

const MAX_DETAILS = 8000;

/** Markdown's bold and bullets as plain text: "**Offer:**" is "Offer:", "* item" is "• item". */
const markdown = (text: string) => text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^[ \t]*[*-][ \t]+/gm, "• ");

type Section = { __typename?: string; title?: string; details?: string; fairTrade?: string };

/**
 * A promo's own page: its mechanics (each section of them, with its heading, then the terms when they say more than
 * "Standard Terms and Conditions apply."), its DTI permit, and the period the list gave (`listed`). Null when the page
 * has no promo on it.
 */
export function parseDetail(html: string, listed: Pick<MetrobankListed, "period" | "starts" | "ends">): Detail | null {
  const page = (nextData(html)?.props?.pageProps?.data as { promosDetailsPageV2?: { pageContent?: Section[] } } | undefined)?.promosDetailsPageV2;
  if (!page || !Array.isArray(page.pageContent)) return null;
  const parts: string[] = [];
  let permit = "";
  for (const s of page.pageContent) {
    const heading = htmlText(s.title ?? "");
    const body = htmlText(markdown(s.details ?? ""));
    // Mechanics come as HTML (PromoDetailSectionRecord) or Markdown with bits of HTML (PromoDetailSectionMarkdownRecord).
    if (s.__typename?.startsWith("PromoDetailSection") && body) parts.push(heading ? `${heading}\n${body}` : body);
    if (s.__typename?.startsWith("PromoTermsAndCondition") && body && !/^standard terms and conditions apply\.?$/i.test(body)) parts.push(heading ? `${heading}\n${body}` : body);
    // "Per DTI Fair Trade Permit No. FTEB-265311 Series of 2026.", also "FTEB--253656, …" or "Permit No. 256062, …".
    const said = htmlText(s.fairTrade ?? "").match(/(?:FTEB\s*-*\s*|permit no\.?\s*)(\d{4,})([^\n.]*?\d{4})?/i);
    if (said) permit = `FTEB-${said[1]}${said[2] ?? ""}`.replace(/\s+/g, " ").trim();
  }
  let details = parts.join("\n\n");
  if (details.length > MAX_DETAILS) details = `${details.slice(0, MAX_DETAILS).replace(/\s+\S*$/, "")} …`;
  return { period: listed.period, starts: listed.starts, ends: listed.ends, details, permit };
}
