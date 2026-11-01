import assert from "node:assert/strict";
import test from "node:test";
import { cardCount, lastPage, listPageUrl, parseDetail, parseList } from "./eastwest.ts";

// Shaped like eastwestbanker.com/promos: one .promo-card per promo, an optional period line under the title, an
// excerpt, and pills for the category, card type, network and region.
const card = (slug: string, title: string, period: string | null, excerpt: string, pills: string[]) => `
  <div class="card promo-card">
    <div class="card-img"><a href="/promos/${slug}"><img src="/sites/default/files/2026-10/${slug}.jpg" alt="" loading="lazy"></a></div>
    <div class="card-content">
      <a href="/promos/${slug}">
        <h3>${title}</h3>
      </a>
      ${period === null ? "" : `<p>${period}</p>`}
      <div class="excerpt"><p>${excerpt}</p></div>
    </div>
    <div class="card-footer">
      <div class="pills-categories">
        ${pills.map((p) => `<span class="pill-category pill-${p.toLowerCase().replace(/ /g, "-")}">${p}</span>`).join("\n")}
      </div>
      <a href="/promos/${slug}" class="btn-default">Check it out</a>
    </div>
  </div>`;

const LIST = `<html><body><div class="view-content">
  ${card("10-savings-sample-resort", "10% savings with Sample Resort ", "November 1, 2026 to May 30, 2027", "Enjoy 10% savings on rooms using your EastWest credit card.", ["Travel", "Credit Cards", "Nationwide"])}
  ${card("php-200-off-sample-shop", "Get up to Php 200 OFF on Sample Shop!", null, "Promo runs from November 1 to 12, 2026", ["Shopping", "Debit Cards", "Visa exclusive", "Nationwide"])}
  ${card("0-installment-sample-airline", "0% installment on Sample Airline flights", "until December 31, 2026", "Fly now &amp; pay later.", ["Installment", "Mastercard exclusive", "Visa exclusive"])}
  ${card("sample-time-deposit", "Higher rates on time deposits", null, "For new placements.", ["Deposits"])}
  ${card("10-savings-sample-resort", "10% savings with Sample Resort", null, "listed twice", ["Credit Cards"])}
</div>
<ul class="pagination pager__items">
  <li class="page-item pager__item pager__item--next"><a href="?page=1" title="Go to next page" class="page-link">Next</a></li>
  <li class="page-item pager__item pager__item--last"><a href="?page=26" title="Go to last page" class="page-link">Last</a></li>
</ul></body></html>`;

test("the list gives each credit card promo once, with its title, summary, picture, networks and period", () => {
  const list = parseList(LIST);
  assert.deepEqual(list.map((l) => l.slug), ["10-savings-sample-resort", "0-installment-sample-airline"]);
  assert.deepEqual(list[0], {
    slug: "10-savings-sample-resort", title: "10% savings with Sample Resort", summary: "Enjoy 10% savings on rooms using your EastWest credit card.",
    image: "https://www.eastwestbanker.com/sites/default/files/2026-10/10-savings-sample-resort.jpg", networks: [], period: "November 1, 2026 to May 30, 2027",
  });
  assert.deepEqual(list[1].networks, ["visa", "mastercard"]);
  assert.equal(list[1].summary, "Fly now & pay later.");
  assert.equal(list[1].period, "until December 31, 2026");
});

test("debit-only and deposit promos are left out; a page with none gives none", () => {
  assert.ok(!parseList(LIST).some((l) => l.slug === "php-200-off-sample-shop" || l.slug === "sample-time-deposit"));
  assert.deepEqual(parseList("<html><body>Maintenance</body></html>"), []);
});

test("the pager says how many pages the list has", () => {
  assert.equal(cardCount(LIST), 5);
  assert.equal(cardCount("<html><body>Maintenance</body></html>"), 0);
  assert.equal(lastPage(LIST), 26);
  assert.equal(lastPage(LIST.replace("?page=26", "?field_card_type_target_id=155&amp;page=21")), 21);
  assert.equal(lastPage("<html><body>one page</body></html>"), 0);
  assert.equal(listPageUrl(0), "https://www.eastwestbanker.com/promos");
  assert.equal(listPageUrl(3), "https://www.eastwestbanker.com/promos?page=3");
});

const DETAIL = (mechanics: string, excerpt = "Enjoy 10% savings on rooms using your EastWest credit card.") => `<html><body>
<div class="field field--name-body field--type-text-with-summary field--label-hidden field--items"><div class="field__item"><p>Chat with us</p></div></div>
<article><div><section class="container single-promo py-5">
  <div class="single-promo-banner"><h1><div class="field field--name-title field--type-string field--label-hidden field--item">10% savings with Sample Resort</div></h1>
    <p><div class="field field--name-field-excerpt field--type-text-with-summary field--label-hidden field--item"><p>${excerpt}</p></div></p>
  </div>
  <div class="promo-mechanics-wrap">
    <h2 class="sub-heading-2">Promo Mechanics</h2>
    <div class="field field--name-body field--type-text-with-summary field--label-hidden field--item">${mechanics}</div>
  </div>
</section>
<section class="promos-cta-section my-5"><h3>Apply for EastWest Credit Card?</h3></section></div></article>
<footer>Contact us</footer></body></html>`;

const MECHANICS = `<p>1. The promo is open to all active EastWest Credit Cardholders.</p>
<p>2. Booking period is from&nbsp;November 1, 2026 to May 30, 2027.</p>
<div class="table-responsive"><table><tr><td>Promo Offer</td><td>10% OFF with a minimum spend of Php 500</td></tr></table></div>
<ul><li>Enter the code <strong>EASTWEST</strong>.</li></ul>
<p>Per&nbsp;DTI Fair Trade Permit No. FTEB-123456, Series of 2026.</p>`;

test("a promo's page gives its mechanics as text and its DTI permit, and takes the list's period", () => {
  const d = parseDetail(DETAIL(MECHANICS), "November 1, 2026 to May 30, 2027");
  assert.equal(d.period, "November 1, 2026 to May 30, 2027");
  assert.equal(d.starts, "2026-11-01");
  assert.equal(d.ends, "2027-05-30");
  assert.equal(d.permit, "FTEB-123456, Series of 2026");
  assert.equal(d.details, [
    "1. The promo is open to all active EastWest Credit Cardholders.",
    "",
    "2. Booking period is from November 1, 2026 to May 30, 2027.",
    "",
    "Promo Offer 10% OFF with a minimum spend of Php 500",
    "",
    "• Enter the code EASTWEST.",
    "",
    "Per DTI Fair Trade Permit No. FTEB-123456, Series of 2026.",
  ].join("\n"));
  assert.doesNotMatch(d.details, /Chat with us|Apply for EastWest|Contact us/);
});

test("with no period on the list, it comes from the summary, then the mechanics", () => {
  const fromSummary = parseDetail(DETAIL(MECHANICS, "Promo runs from November 1 to 12, 2026"));
  assert.deepEqual([fromSummary.starts, fromSummary.ends], ["2026-11-01", "2026-11-12"]);
  const fromMechanics = parseDetail(DETAIL(MECHANICS));
  assert.deepEqual([fromMechanics.starts, fromMechanics.ends], ["2026-11-01", "2027-05-30"]);
  const none = parseDetail(DETAIL("<p>Ask the merchant for details.</p>"));
  assert.deepEqual([none.period, none.starts, none.ends], ["", "", ""]);
});

test("a permit written with a space after the hyphen still reads as one", () => {
  assert.equal(parseDetail(DETAIL("<p>Per DTI Fair Trade Permit No. FTEB- 255368, Series of 2026.</p>")).permit, "FTEB-255368, Series of 2026");
  assert.equal(parseDetail(DETAIL("<p>Per DTI Fair Trade Permit No. FTEB 255368 Series of 2026.</p>")).permit, "FTEB-255368 Series of 2026");
});
