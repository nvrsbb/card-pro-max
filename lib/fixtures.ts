// Made-up data shared by the tests.
import type { Promo } from "./ledger.ts";

const url = (slug: string) => `https://rcbccredit.com/promos/${slug}`;

/** A Visa discount running through October and November 2026, with `extra` on top. */
export function promo(slug: string, extra: Partial<Promo> = {}): Promo {
  return { id: `rcbc:${slug}`, bank: "rcbc", slug, title: slug, summary: "", url: url(slug), image: "", networks: ["visa"], kind: "discount",
    period: "", starts: "2026-10-01", ends: "2026-11-30", permit: "", details: "", added: "2026-10-01", updated: "2026-10-01", ...extra };
}
