// Reads RCBC's public promo pages (rcbccredit.com/promos) into catalog entries. Pure: the HTML comes in as text,
// so the tests run on samples and the server does the fetching (lib/import.ts).
import { parsePeriod } from "./dates.ts";
import { NETWORKS, type Network } from "./ledger.ts";

export const RCBC_BASE = "https://rcbccredit.com";
export const RCBC_LIST_URL = `${RCBC_BASE}/promos`;

/** One promo as the list page shows it. `slug` is its address under /promos/, and its id in the catalog. */
export type Listed = { slug: string; title: string; summary: string; image: string; networks: Network[] };
/** What only the promo's own page says. */
export type Detail = { period: string; starts: string; ends: string; details: string; permit: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", peso: "₱" };

export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Plain text from a piece of HTML: blocks and list items on their own lines, styles, scripts and comments dropped. */
export function htmlText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<(br|\/p|\/div|\/h\d|\/tr|\/ul|\/ol|\/table)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decode(text).split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const NETWORK_LOGO: Record<string, Network> = { mastercard: "mastercard", visa: "visa", jcb: "jcb", unionpay: "unionpay", amex: "amex" };

/** Every promo on the list page, in the bank's order. */
export function parseList(html: string): Listed[] {
  const seen = new Set<string>();
  const out: Listed[] = [];
  for (const block of html.split(/class="promolistdv"/).slice(1)) {
    const link = block.match(/<div class="title">\s*<a href="\/promos\/([^"?#]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const slug = decodeURIComponent(link[1]).trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const summary = block.match(/<div class="desc">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const image = block.match(/<div class="promodvimage">[\s\S]*?<img src="([^"]+)"/)?.[1] ?? "";
    const tags = block.match(/<div class="tags">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const networks = NETWORKS.filter((n) => [...tags.matchAll(/thumbnails\/([a-z]+)\.png/gi)].some((m) => NETWORK_LOGO[m[1].toLowerCase()] === n));
    out.push({ slug, title: htmlText(link[2]), summary: htmlText(summary), image: image && new URL(image, RCBC_BASE).href, networks });
  }
  return out;
}

const MAX_DETAILS = 8000;

/** The promo's own page: its period (from the date line, or the mechanics' "promo period" sentence), text and DTI permit. */
export function parseDetail(html: string): Detail {
  const dateLine = htmlText(html.match(/class="datehldr">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const from = html.indexOf("insideimghldr");
  const to = html.indexOf("<footer", from);
  const body = from < 0 ? "" : html.slice(html.indexOf(">", from) + 1, to < 0 ? undefined : to);
  let details = htmlText(body);
  if (details.length > MAX_DETAILS) details = `${details.slice(0, MAX_DETAILS).replace(/\s+\S*$/, "")} …`;
  const said = details.match(/promo (?:period|runs)[^.\n]*?(?:from|until|is)\s+([^.\n]*\d{4})/i)?.[1] ?? "";
  const period = dateLine || said;
  const permit = details.match(/(?:DTI|FTEB)[^\n]*?(FTEB[- ]?\d+[^\n]*?\d{4})/i)?.[1] ?? "";
  return { period, ...parsePeriod(period), details, permit: permit.replace(/\s+/g, " ").trim() };
}
