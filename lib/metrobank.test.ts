import assert from "node:assert/strict";
import test from "node:test";
import { cardNetwork, parseDetail, parseList } from "./metrobank.ts";

// Shaped like metrobank.com.ph/promos: a Next.js page whose __NEXT_DATA__ script holds every promo the bank has run,
// each with its dates and the cards it's for, each card with its type. Made-up promos throughout.
const card = (title: string, ...types: string[]) => ({ __typename: "PromoCreditCardRecord", title, image: { url: "https://example.com/card.png" }, cardTypes: types.map((name) => ({ __typename: "CardTypeRecord", name })) });
const record = (slug: string, title: string, starts: string, ends: string, cards: object[], description = "") => ({
  __typename: "PromosDetailsPageV2Record", id: slug, slug: `/${slug}`, pageName: `${title} `, categories: [{ category: "Dining" }],
  startDate: starts, expirationDate: ends, cardBannerImage: { url: `https://web-assets.example.com/${slug}.jpg` }, title, description, cards,
  participatingBranches: [], points: null, ctaButton: null,
});
const nextPage = (data: object) => `<!DOCTYPE html><html><body><div id="__next"><a href="/promos">Promos</a></div>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data } }, page: "/promos/[slug]" })}</script></body></html>`;

const CREDIT = [card("Travel Signature Visa", "Credit Card"), card("World Mastercard", "Credit Card")];
const LIST = nextPage({
  promosData: {}, merchants: [],
  promoDetails: [
    record("sample-cafe-discount", "15% OFF at Sample Cafe", "2026-10-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00",
      [...CREDIT, card("Prime Debit Card", "Debit Card"), card("Prepaid Card", "Prepaid Card", "Debit Card")], "Enjoy this with Metrobank credit cards &amp; more."),
    record("sample-visa-only", "Sample Hotel deal", "2026-11-01T00:00:00+08:00", "2027-02-28T00:00:00+08:00", [card("Travel Signature Visa", "Credit Card"), card("Hype Visa (formerly Vantage Visa)")]),
    record("sample-untyped", "Sample Store treat", "2026-11-01T00:00:00+08:00", "2026-11-30T23:59:00+08:00", [card("Toyota Platinum"), card("Hype Mastercard (formerly Vantage Mastercard)")]),
    record("sample-debit-only", "Debit card deal", "2026-11-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00", [card("Prime Debit Card", "Debit Card")]),
    record("sample-app-cashback", "Cashback on app payments", "2026-11-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00", [], "Complete 3 credit card transactions on the app."),
    record("sample-deposit", "Open an account", "2026-11-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00", [], "Keep a balance for 3 months."),
    record("sample-old-promo", "An old promo", "2020-01-01T00:00:00+08:00", "2020-03-31T23:59:59+08:00", CREDIT),
    { ...record("sample-cafe-discount", "15% OFF at Sample Cafe", "2026-10-01T00:00:00+08:00", "2026-12-31T23:59:59+08:00", CREDIT), description: "listed twice" },
    { ...record("sample-travel-fair", "Travel fair offer", "2026-11-01T00:00:00+08:00", "2026-11-15T23:59:59+08:00", CREDIT), slug: "/promos/sample-travel-fair" },
  ],
});

test("the list gives each credit card promo once, with its title, summary, picture, networks and dates", () => {
  const { records, promos } = parseList(LIST);
  assert.equal(records, 9);
  assert.deepEqual(promos.map((l) => l.slug), ["sample-cafe-discount", "sample-visa-only", "sample-untyped", "sample-app-cashback", "sample-old-promo", "sample-travel-fair"]);
  assert.deepEqual(promos[0], {
    slug: "sample-cafe-discount", title: "15% OFF at Sample Cafe", summary: "Enjoy this with Metrobank credit cards & more.",
    image: "https://web-assets.example.com/sample-cafe-discount.jpg", networks: ["visa", "mastercard"],
    period: "October 1, 2026 to December 31, 2026", starts: "2026-10-01", ends: "2026-12-31",
  });
  assert.deepEqual(promos[1].networks, ["visa"]);
  assert.equal(promos[1].ends, "2027-02-28");
  assert.deepEqual(promos[2].networks, ["mastercard"], "Toyota Platinum names no network; Hype Mastercard does");
  assert.deepEqual(promos[3].networks, [], "names no cards: any Metrobank card");
  assert.equal(promos[4].ends, "2020-03-31", "ended ones stay in; the importer drops them");
});

test("a page that isn't the list, or is cut short, has no promos", () => {
  assert.deepEqual(parseList("<html><body>Something went wrong</body></html>"), { records: 0, promos: [] });
  assert.deepEqual(parseList(LIST.slice(0, LIST.length / 2)), { records: 0, promos: [] });
});

test("a card's network comes from its own name, not the one it used to have", () => {
  assert.equal(cardNetwork("Travel Signature Visa"), "visa");
  assert.equal(cardNetwork("PSBank Credit Mastercard"), "mastercard");
  assert.equal(cardNetwork("Toyota Platinum"), undefined);
  assert.equal(cardNetwork("Hype Mastercard (formerly Vantage Visa)"), "mastercard");
});

const DETAIL = nextPage({
  layoutV2Data: {},
  promosDetailsPageV2: {
    slug: "/sample-cafe-discount", startDate: "2026-10-01T00:00:00+08:00", expirationDate: "2026-12-31T23:59:59+08:00",
    pageContent: [
      { __typename: "PromoDetailBannerSectionRecord", title: "<h1>15% OFF at Sample Cafe&nbsp;</h1>", subTitle: "<p>Enjoy this.</p>" },
      { __typename: "PromoDetailSectionRecord", title: "<h2>Promo Mechanics</h2>", details: "<ol>\n<li>What is the promo offer?<ul><li>15% OFF with a minimum spend of PHP 1,500.</li></ul></li>\n<li>Who is qualified?<br>All Metrobank credit cards.</li></ol>" },
      { __typename: "EligibleCardRecord", title: "<h2>METROBANK CREDIT CARDS</h2>", eligibleCards: [] },
      { __typename: "PromoTermsAndConditionSectionMarkdownRecord", title: "<h2>Terms & Conditions</h2>", details: "Standard Terms and Conditions apply.",
        fairTrade: "<p>Per <span class=\"x\">DTI Fair Trade Permit No. FTEB-123456 Series of 2026.</span><br>Promo Reference No. SAMPLE-1</p>" },
    ],
  },
});

test("a promo's page gives its mechanics and DTI permit; the period is the list's", () => {
  const listed = { period: "October 1, 2026 to December 31, 2026", starts: "2026-10-01", ends: "2026-12-31" };
  assert.deepEqual(parseDetail(DETAIL, listed), {
    ...listed,
    details: "Promo Mechanics\n• What is the promo offer?\n• 15% OFF with a minimum spend of PHP 1,500.\n\n• Who is qualified?\nAll Metrobank credit cards.",
    permit: "FTEB-123456 Series of 2026",
  });
  assert.equal(parseDetail("<html>Not found</html>", listed), null);
});

test("mechanics written in Markdown come out as plain text", () => {
  const page = DETAIL.replace('"PromoDetailSectionRecord"', '"PromoDetailSectionMarkdownRecord"')
    .replace(JSON.stringify("<ol>\n<li>What is the promo offer?<ul><li>15% OFF with a minimum spend of PHP 1,500.</li></ul></li>\n<li>Who is qualified?<br>All Metrobank credit cards.</li></ol>").slice(1, -1),
      JSON.stringify("1. Get **15% OFF**.<br><br>\n\t* PHP 300 off a minimum order of PHP 1,500;\n\t* PHP 500 off PHP 2,500.").slice(1, -1));
  assert.equal(parseDetail(page, { period: "", starts: "", ends: "" })!.details,
    "Promo Mechanics\n1. Get 15% OFF.\n\n• PHP 300 off a minimum order of PHP 1,500;\n• PHP 500 off PHP 2,500.");
});

test("the DTI permit, however it's written", () => {
  const permit = (said: string) => parseDetail(DETAIL.replace("DTI Fair Trade Permit No. FTEB-123456 Series of 2026.", said), { period: "", starts: "", ends: "" })!.permit;
  assert.equal(permit("DTI Fair Trade Permit No. FTEB--123456, Series of 2026."), "FTEB-123456, Series of 2026");
  assert.equal(permit("DTI Fair Trade Permit No. 123456, Series of 2026."), "FTEB-123456, Series of 2026");
  assert.equal(permit(""), "");
});

test("terms that say more than the standard line are kept with the mechanics", () => {
  const page = DETAIL.replace("Standard Terms and Conditions apply.", "Only for new bookings.");
  assert.match(parseDetail(page, { period: "", starts: "", ends: "" })!.details, /Promo Mechanics[\s\S]*\n\nTerms & Conditions\nOnly for new bookings\.$/);
});
