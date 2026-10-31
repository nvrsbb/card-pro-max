import assert from "node:assert/strict";
import test from "node:test";
import { decode, htmlText, parseDetail, parseList } from "./rcbc.ts";

// Shaped like rcbccredit.com/promos: one .promolistdv per promo, network logos as thumbnails under .tags.
const entry = (slug: string, title: string, desc: string, logos: string[]) => `
  <div class="promolistdv"><div class="promolistmain">
    <div class="promodvimage"><a href="/promos/${slug}"><img src="/img/thumbnails/promos/${slug}.jpg"></a></div>
    <div class="promodetailsdiv">
      <div class="title"><a href="/promos/${slug}">${title}</a></div>
      <div class="desc">
        ${desc}
      </div>
      <div class="tags">${logos.map((l) => `<img src="/img/thumbnails/${l}.png">`).join("\n")}</div>
      <div class="clearboth"></div>
    </div>
  </div></div>`;

const LIST = `<html><body><div class="filtercontainer"></div>
  ${entry("10-off-on-klook-4006", "10% OFF on Klook", "Get 10% OFF on hotels, tours, and activities with your RCBC Credit Card!", ["mastercard", "visa", "jcb"])}
  ${entry("avc2026", "Anantara Vacation Club Getaway for only &#8369;11,500", "Premium cards &amp; more", ["mastercard"])}
  ${entry("10-off-on-klook-4006", "10% OFF on Klook", "listed twice", ["visa"])}
</body></html>`;

test("the list page gives each promo once, with its title, summary, picture and card networks", () => {
  const list = parseList(LIST);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    slug: "10-off-on-klook-4006", title: "10% OFF on Klook", summary: "Get 10% OFF on hotels, tours, and activities with your RCBC Credit Card!",
    image: "https://rcbccredit.com/img/thumbnails/promos/10-off-on-klook-4006.jpg", networks: ["visa", "mastercard", "jcb"],
  });
  assert.equal(list[1].title, "Anantara Vacation Club Getaway for only ₱11,500");
  assert.equal(list[1].summary, "Premium cards & more");
  assert.deepEqual(list[1].networks, ["mastercard"]);
});

test("a page with no promos gives none", () => {
  assert.deepEqual(parseList("<html><body>Maintenance</body></html>"), []);
});

const DETAIL = `<html><head><style>body{color:red}</style></head><body>
<section><div class="insidearthldr"><div class="creaditchldr"><div class="title"><h1>10% OFF on Klook</h1></div></div>
<div class="insideimghldr">
  <!-- <div class="datehldr">
        October 16 - November 18, 2026
  </div> -->
  <div style="font-family: 'Jost'">
    <style>#rcbc-promo-section { font-family: 'Jost'; }</style>
    <p>Save big on hotels with your <b>RCBC Credit Card</b>!</p>
    <p>10% OFF (Up to &#8369;2,000)<br>Min. spend of &#8369;10,000 on Klook hotels</p>
    <p><b>HOW TO AVAIL:</b></p><ol><li>Open the Klook app.</li><li>Enter the promo code.</li></ol>
    <script>track()</script>
    <p>Per DTI Fair Trade Permit No. FTEB-269942 Series of 2026</p>
  </div>
</div></div></section>
<footer>Contact us</footer></body></html>`;

test("a promo's page gives its period, its mechanics as text, and its DTI permit", () => {
  const d = parseDetail(DETAIL);
  assert.equal(d.period, "October 16 - November 18, 2026");
  assert.equal(d.starts, "2026-10-16");
  assert.equal(d.ends, "2026-11-18");
  assert.equal(d.permit, "FTEB-269942 Series of 2026");
  assert.equal(d.details, [
    "Save big on hotels with your RCBC Credit Card!",
    "",
    "10% OFF (Up to ₱2,000)",
    "Min. spend of ₱10,000 on Klook hotels",
    "",
    "HOW TO AVAIL:",
    "",
    "• Open the Klook app.",
    "• Enter the promo code.",
    "",
    "Per DTI Fair Trade Permit No. FTEB-269942 Series of 2026",
  ].join("\n"));
  assert.doesNotMatch(d.details, /font-family|track\(\)|Contact us/);
});

test("with no date line, the period comes from the mechanics' promo period sentence", () => {
  const html = DETAIL.replace(/<!--[\s\S]*?-->/, "").replace("Save big", "The promo period is from September 15, 2026 to March 31, 2027. Save big");
  const d = parseDetail(html);
  assert.equal(d.starts, "2026-09-15");
  assert.equal(d.ends, "2027-03-31");
});

test("entities, numeric and named", () => {
  assert.equal(decode("&#8369;1,000 &amp; &ndash; &#x2019; &unknown;"), "₱1,000 & – ’ &unknown;");
  assert.equal(htmlText("<p>a</p><p></p><p></p><p>b</p>"), "a\n\nb");
});
