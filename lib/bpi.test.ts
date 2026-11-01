import assert from "node:assert/strict";
import test from "node:test";
import { listPageUrl, listSize, namedNetworks, pageCount, parseDetail, parseList } from "./bpi.ts";

// Shaped like the JSON behind bpi.com.ph's promo list (its Load more button): every tab at once, each with how many
// promos it has and one page of them, with their tags, "Valid until" date and whether the list shows them as expired.
const article = (slug: string, heading: string, ends: string, tags: string[], description = "", expired = false, path = "/personal/rewards-and-promotions/promos") => ({
  heading, description, image: `/content/dam/bau/promos/2026-promos/${slug}/card-${slug}.jpg`, viewArticleLink: `${path}/${slug}`,
  date: "Oct 13, 2026", promoExpiryDate: ends, promotionEndDate: "", primaryTags: tags, expiredPage: expired,
});

const LIST = JSON.stringify({
  view: "cardView",
  limit: 12,
  mapArticle: {
    All: [{ listSize: 12, articleListSize: 300, listPage: [article("sample-time-deposit", "Higher rates", "Dec 31, 2026", ["Deposits"])] }],
    "Credit cards": [{
      chips: ["Travel and leisure"], listSize: 12, articleListSize: 26, listPage: [
        article("sample-resort-promo", "Sample Resort Promo ", "Jan 14, 2027", ["Credit cards", "Debit cards"], "Enjoy 50% off with your BPI Credit or Debit Card."),
        article("visa-exclusive-offer-sample-shop", "Visa Exclusive Offer: Sample Shop", "Dec 31, 2026", ["Credit cards"], "Enjoy 10% off with your BPI Visa Credit Card."),
        article("sample-flexipayzero", "3 months FlexipayZero at Sample Store", "", ["Credit cards"], "Shop now &amp; pay later."),
        article("sample-old-promo", "An old promo", "Mar 08, 2026", ["Credit cards"], "", true),
        article("sample-debit-promo", "Debit only", "Dec 31, 2026", ["Debit cards"]),
        article("sample-wealth-offer", "Elsewhere on the site", "Dec 31, 2026", ["Credit cards"], "", false, "/wealth/preferred"),
        article("sample-resort-promo", "Sample Resort Promo", "Jan 14, 2027", ["Credit cards"], "listed twice"),
      ],
    }],
  },
});

test("the list gives each credit card promo once, with its title, summary, picture, networks and Valid until", () => {
  const list = parseList(LIST);
  assert.deepEqual(list.map((l) => l.slug), ["sample-resort-promo", "visa-exclusive-offer-sample-shop", "sample-flexipayzero"]);
  assert.deepEqual(list[0], {
    slug: "sample-resort-promo", title: "Sample Resort Promo", summary: "Enjoy 50% off with your BPI Credit or Debit Card.",
    image: "https://www.bpi.com.ph/content/dam/bau/promos/2026-promos/sample-resort-promo/card-sample-resort-promo.jpg", networks: [], period: "until Jan 14, 2027",
  });
  assert.deepEqual(list[1].networks, ["visa"]);
  assert.equal(list[2].summary, "Shop now & pay later.");
  assert.equal(list[2].period, "");
});

test("debit-only, expired and off-list promos are left out; anything that isn't the list gives none", () => {
  const slugs = parseList(LIST).map((l) => l.slug);
  for (const gone of ["sample-old-promo", "sample-debit-promo", "sample-wealth-offer", "sample-time-deposit"]) assert.ok(!slugs.includes(gone), gone);
  assert.deepEqual(parseList("<html><body>Maintenance</body></html>"), []);
  assert.deepEqual(parseList(JSON.stringify({ mapArticle: {} })), []);
});

test("the list says how many credit card promos it has, and how many a page holds", () => {
  assert.equal(listSize(LIST), 26);
  assert.equal(pageCount(LIST), 7);
  assert.equal(listSize("<html>down</html>"), 0);
  assert.equal(pageCount("<html>down</html>"), 0);
  assert.equal(listPageUrl(3), "https://www.bpi.com.ph/content/bpi/ph/en/personal/rewards-and-promotions/promos/jcr:content/root/container/tabshorizontal.model.json?sort=newest&page=3");
});

test("a promo names a network as BPI writes it, but a travel visa isn't one", () => {
  assert.deepEqual(namedNetworks("Mastercard x BPI Sample Open Exclusive"), ["mastercard"]);
  assert.deepEqual(namedNetworks("Enjoy up to 20% off with your BPI Credit or Debit Mastercard."), ["mastercard"]);
  assert.deepEqual(namedNetworks("Mastercard® Exclusive Offers: Sample City"), ["mastercard"]);
  assert.deepEqual(namedNetworks("Get special offers with your BPI or Robinsons Bank VISA Card."), ["visa"]);
  assert.deepEqual(namedNetworks("Simplified Sample Visa Application\nApplying for a sample visa is now easier with your BPI Gold Rewards Card."), []);
  assert.deepEqual(namedNetworks("Enjoy 15% off with your BPI Card."), []);
});

// Shaped like a BPI promo page: a hero, section headers (Promo Highlight, Promo Mechanics, How to Avail, Customer
// Support, Related Information), AEM text blocks that repeat themselves escaped in a data attribute, and a footer.
const section = (name: string) => `<div class="sectionheader"><div role="sectionheader" class="section-header-wrapper small"><div class="section-header">
  <div class="section-header__heading-wrapper--left"><div class="section-header__divider"></div>
    <h2 class="section-header__heading ga-section-text">${name}</h2>
  </div></div></div></div>`;
const text = (html: string) => `<div class="text aem-GridColumn">
  <div data-cmp-data-layer="{&#34;text-1&#34;:{&#34;xdm:text&#34;:&#34;${html.replace(/</g, "&lt;").replace(/"/g, "&#34;")}&#34;}}" id="text-1" class="cmp-text">
    ${html}
  </div></div>`;

const DETAIL = (mechanics: string) => `<html><body>
<nav><a href="/personal/cards">Cards</a> Promo runs on every page, from January 1, 2020 to nowhere</nav>
<h1 class="content__heading"><p>Sample Resort Promo</p></h1>
<div class="content__description"><p>Enjoy 50% off with your BPI Credit or Debit Card.</p></div>
${section("Promo Highlight")}
<div class="card-facts"><span class="hightlightText">Treat yourself</span><p>Enjoy 50% off.</p></div>
${section("Promo Mechanics")}
${text(mechanics)}
${section("How to Avail")}
${text("<p>1. Present your BPI Card upon payment.</p>")}
${section("Customer Support")}
${text("<p><b>Sample Resort</b></p><p>Call (02) 0000-0000.</p><p><i>Per DTI Fair Trade Permit No. FTEB-123456, Series of 2026.</i></p>")}
<div class="backToTop aem-GridColumn"><div class="back-to-top"><span class="back-to-top--text"> BACK TO TOP </span></div></div>
${section("Related Information")}
<div><h2 class="heading">Credit Card Promos</h2><p>Other promos</p></div>
${section("Need more help?")}
<footer>Contact us</footer></body></html>`;

const MECHANICS = `<h3>Promo Offer</h3>
<ul><li>Enjoy 50% off on Best Available Rates with your BPI Card.</li><li>Promo runs from November 1, 2026 to January 14, 2027.</li></ul>
<h3>Mechanics</h3>
<p>1. The Promo is open to Cardholders of participating BPI Credit Cards:</p>
<p><b>BPI Credit Cards</b></p>
<ul><li>BPI Gold Rewards Card</li><li>Petron BPI Card</li></ul>
<p>2. The Promo Period is from November 1, 2026 to January 14, 2027.</p>`;

test("a promo's page gives its mechanics as text, its DTI permit, and the period it states", () => {
  const d = parseDetail(DETAIL(MECHANICS), "until Jan 14, 2027");
  assert.equal(d.period, "November 1, 2026 to January 14, 2027");
  assert.deepEqual([d.starts, d.ends], ["2026-11-01", "2027-01-14"]);
  assert.equal(d.permit, "FTEB-123456, Series of 2026");
  assert.equal(d.details, [
    "Promo Offer",
    "",
    "• Enjoy 50% off on Best Available Rates with your BPI Card.",
    "• Promo runs from November 1, 2026 to January 14, 2027.",
    "",
    "Mechanics",
    "",
    "1. The Promo is open to Cardholders of participating BPI Credit Cards:",
    "",
    "BPI Credit Cards",
    "",
    "• BPI Gold Rewards Card",
    "• Petron BPI Card",
    "",
    "2. The Promo Period is from November 1, 2026 to January 14, 2027.",
    "",
    "How to Avail",
    "",
    "1. Present your BPI Card upon payment.",
    "",
    "Customer Support",
    "",
    "Sample Resort",
    "Call (02) 0000-0000.",
    "Per DTI Fair Trade Permit No. FTEB-123456, Series of 2026.",
  ].join("\n"));
  assert.doesNotMatch(d.details, /Treat yourself|BACK TO TOP|Other promos|Contact us|xdm:text|&lt;/);
});

test("with no period on its page, it takes the list's Valid until; with neither, none", () => {
  const listed = parseDetail(DETAIL("<p>Enjoy 3 months FlexipayZero.</p>"), "until Dec 31, 2026");
  assert.deepEqual([listed.period, listed.starts, listed.ends], ["until Dec 31, 2026", "", "2026-12-31"]);
  const none = parseDetail(DETAIL("<p>Enjoy 3 months FlexipayZero.</p>"));
  assert.deepEqual([none.period, none.starts, none.ends], ["", "", ""]);
  assert.deepEqual(parseDetail("<html><body>Page not found</body></html>"), { period: "", starts: "", ends: "", details: "", permit: "" });
});
