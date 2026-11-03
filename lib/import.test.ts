import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// Each bank is checked on its own: here RCBC's site is down and EastWest's answers (made-up pages, a local ledger).
const LIST = `<div class="card promo-card">
  <div class="card-img"><a href="/promos/sample-savings"><img src="/sites/default/files/sample.jpg"></a></div>
  <div class="card-content"><a href="/promos/sample-savings"><h3>20% savings at Sample Cafe</h3></a>
    <p>November 1, 2026 to December 31, 2099</p><div class="excerpt"><p>Enjoy 20% savings.</p></div></div>
  <div class="card-footer"><div class="pills-categories"><span class="pill-category pill-credit-cards">Credit Cards</span></div></div>
</div>
<div class="card promo-card">
  <div class="card-content"><a href="/promos/long-gone"><h3>10% savings at Old Cafe</h3></a>
    <p>January 1 to 31, 2020</p><div class="excerpt"><p>Over.</p></div></div>
  <div class="card-footer"><div class="pills-categories"><span class="pill-category pill-credit-cards">Credit Cards</span></div></div>
</div>`;
const DETAIL = `<section class="single-promo"><div class="promo-mechanics-wrap"><h2>Promo Mechanics</h2>
  <div class="field field--name-body field--type-text-with-summary field--item"><p>Minimum spend of Php 1,000.</p></div>
</div></section>`;

const BLANK_PAGE_TWO = (url: string) => {
  if (url === "https://www.eastwestbanker.com/promos") return new Response(`${LIST}<a href="?page=1" title="Go to last page">Last</a>`);
  if (url === "https://www.eastwestbanker.com/promos?page=1") return new Response("<html><body>Something went wrong</body></html>");
  return new Response(DETAIL);
};

test("one bank failing doesn't stop the others; promos the list shows as ended are left out", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.startsWith("https://rcbccredit.com")) return new Response("down", { status: 503 });
    if (url === "https://www.eastwestbanker.com/promos") return new Response(LIST);
    if (url.startsWith("https://www.eastwestbanker.com/promos/")) return new Response(DETAIL);
    return new Response("not found", { status: 404 });
  });
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [rcbc, eastwest] = await importAll("script");
  assert.equal(rcbc.bank, "rcbc");
  assert.match(rcbc.error ?? "", /answered 503/);
  assert.deepEqual(eastwest, { bank: "eastwest", result: { added: 1, updated: 0, gone: 0, removed: 0, read: 1, failed: 0, later: 0 } });
  const saved = JSON.parse(await readFile(path.join(dir, "promos/eastwest.json"), "utf8"));
  assert.deepEqual(saved.map((p: { id: string; ends: string; kind: string; details: string }) => [p.id, p.ends, p.kind, p.details]),
    [["eastwest:sample-savings", "2099-12-31", "discount", "Minimum spend of Php 1,000."]]);
});

test("an EastWest list page with no promos fails the check and saves nothing", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => BLANK_PAGE_TWO(url));
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [eastwest] = await importAll("script", ["eastwest"]);
  assert.match(eastwest.error ?? "", /page 2 had no promos/);
  await assert.rejects(readFile(path.join(dir, "promos/eastwest.json"), "utf8"));
});

test("a new promo whose own page says it already ended isn't added", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  const undated = LIST.replace("<p>November 1, 2026 to December 31, 2099</p>", "");
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(url === "https://www.eastwestbanker.com/promos" ? undated
    : DETAIL.replace("Minimum spend", "Promo period is from January 1 to 31, 2020. Minimum spend")));
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [eastwest] = await importAll("script", ["eastwest"]);
  assert.equal(eastwest.error, undefined);
  assert.equal(eastwest.result?.added, 0);
});

// BPI's list comes as JSON, twelve promos a page (here two), with how many the credit card tab has in all.
const BPI_JSON = "https://www.bpi.com.ph/content/bpi/ph/en/personal/rewards-and-promotions/promos/jcr:content/root/container/tabshorizontal.model.json";
const bpiArticle = (slug: string, ends: string, expired = false) => ({ heading: slug, description: "Enjoy 20% savings.", image: "", viewArticleLink: `/personal/rewards-and-promotions/promos/${slug}`,
  promoExpiryDate: ends, primaryTags: ["Credit cards"], expiredPage: expired });
const bpiPage = (size: number, articles: object[]) => JSON.stringify({ mapArticle: { "Credit cards": [{ articleListSize: size, listPage: articles }] } });
const BPI_DETAIL = `<h2 class="section-header__heading ga-section-text">Promo Mechanics</h2><div class="cmp-text"><p>Minimum spend of Php 1,000.</p></div><footer></footer>`;

test("BPI's list is read page by page; promos it shows as expired or past their Valid until are left out", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url === `${BPI_JSON}?sort=newest&page=1`) return new Response(bpiPage(4, [bpiArticle("sample-cafe", "Dec 31, 2099"), bpiArticle("expired-cafe", "Mar 08, 2026", true)]));
    if (url === `${BPI_JSON}?sort=newest&page=2`) return new Response(bpiPage(4, [bpiArticle("old-cafe", "Jan 31, 2020"), bpiArticle("undated-cafe", "")]));
    if (url.startsWith("https://www.bpi.com.ph/personal/rewards-and-promotions/promos/")) return new Response(BPI_DETAIL);
    return new Response("not found", { status: 404 });
  });
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [bpi] = await importAll("script", ["bpi"]);
  assert.deepEqual(bpi, { bank: "bpi", result: { added: 2, updated: 0, gone: 0, removed: 0, read: 2, failed: 0, later: 0 } });
  const saved = JSON.parse(await readFile(path.join(dir, "promos/bpi.json"), "utf8"));
  assert.deepEqual(saved.map((p: { id: string; ends: string; url: string }) => [p.id, p.ends, p.url]), [
    ["bpi:sample-cafe", "2099-12-31", "https://www.bpi.com.ph/personal/rewards-and-promotions/promos/sample-cafe"],
    ["bpi:undated-cafe", "", "https://www.bpi.com.ph/personal/rewards-and-promotions/promos/undated-cafe"],
  ]);
});

test("a BPI list page with no promos fails the check and saves nothing", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(url.endsWith("page=1") ? bpiPage(4, [bpiArticle("a", ""), bpiArticle("b", "")])
    : url.endsWith("page=2") ? bpiPage(4, []) : BPI_DETAIL));
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [bpi] = await importAll("script", ["bpi"]);
  assert.match(bpi.error ?? "", /BPI's promo list page 2 had no promos/);
  await assert.rejects(readFile(path.join(dir, "promos/bpi.json"), "utf8"));
});

test("a promo page that won't load is tried once, then left for the weekly round", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  let detailReads = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url === `${BPI_JSON}?sort=newest&page=1`) return new Response(bpiPage(1, [bpiArticle("loops-forever", "")]));
    detailReads += 1;
    throw new TypeError("redirect count exceeded");
  });
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [first] = await importAll("script", ["bpi"]);
  assert.deepEqual(first.result && [first.result.added, first.result.failed], [1, 1]);
  const [second] = await importAll("script", ["bpi"]);
  assert.deepEqual(second.result && [second.result.read, second.result.failed], [0, 0]);
  assert.equal(detailReads, 1);
  const [saved] = JSON.parse(await readFile(path.join(dir, "promos/bpi.json"), "utf8"));
  assert.equal(saved.details, "");
  assert.ok(saved.checked);
});

// Metrobank's list is one Next.js page with every promo it has run as JSON; a promo's page has its mechanics the same way.
const mbRecord = (slug: string, ends: string, types = ["Credit Card"]) => ({ slug: `/${slug}`, title: slug, description: "Enjoy 15% off.", startDate: "2026-10-01T00:00:00+08:00",
  expirationDate: ends, cards: [{ title: "Titanium Mastercard", cardTypes: types.map((name) => ({ name })) }] });
const nextPage = (data: object) => `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data } } })}</script></body></html>`;
const MB_LIST = nextPage({ promoDetails: [mbRecord("sample-cafe", "2099-12-31T23:59:59+08:00"), mbRecord("old-cafe", "2020-01-31T23:59:59+08:00"), mbRecord("debit-cafe", "2099-12-31T23:59:59+08:00", ["Debit Card"])] });
const MB_DETAIL = nextPage({ promosDetailsPageV2: { pageContent: [{ __typename: "PromoDetailSectionRecord", title: "<h2>Promo Mechanics</h2>", details: "<p>Minimum spend of PHP 1,500.</p>" }] } });

/** A response whose body sends `text` in pieces, then breaks off after `upTo` pieces if given. */
function streamed(text: string, upTo?: number): Response {
  const bytes = new TextEncoder().encode(text);
  const step = Math.ceil(bytes.length / 4);
  let sent = 0;
  return new Response(new ReadableStream({
    pull(c) {
      if (upTo !== undefined && sent === upTo) return c.error(new Error("connection reset"));
      if (sent * step >= bytes.length) return c.close();
      c.enqueue(bytes.slice(sent * step, (sent + 1) * step));
      sent += 1;
    },
  }));
}

test("Metrobank's list is one page of JSON: credit card promos that haven't ended come in, with their mechanics", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => url === "https://www.metrobank.com.ph/promos" ? streamed(MB_LIST)
    : url.startsWith("https://www.metrobank.com.ph/promos/") ? new Response(MB_DETAIL) : new Response("not found", { status: 404 }));
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [metrobank] = await importAll("script", ["metrobank"]);
  assert.deepEqual(metrobank, { bank: "metrobank", result: { added: 1, updated: 0, gone: 0, removed: 0, read: 1, failed: 0, later: 0 } });
  const saved = JSON.parse(await readFile(path.join(dir, "promos/metrobank.json"), "utf8"));
  assert.deepEqual(saved.map((p: { id: string; ends: string; networks: string[]; details: string; url: string }) => [p.id, p.ends, p.networks, p.details, p.url]), [
    ["metrobank:sample-cafe", "2099-12-31", ["mastercard"], "Promo Mechanics\nMinimum spend of PHP 1,500.", "https://www.metrobank.com.ph/promos/sample-cafe"],
  ]);
});

test("a Metrobank list that stops part way fails the check and saves nothing", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => url === "https://www.metrobank.com.ph/promos" ? streamed(MB_LIST, 2) : new Response(MB_DETAIL));
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [metrobank] = await importAll("script", ["metrobank"]);
  assert.match(metrobank.error ?? "", /stopped loading part way/);
  await assert.rejects(readFile(path.join(dir, "promos/metrobank.json"), "utf8"));
});

test("out of time, new promos not yet read wait for the next check; they keep the list's dates if their page fails", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  const list = nextPage({ promoDetails: [mbRecord("sample-cafe", "2099-12-31T23:59:59+08:00")] });
  t.mock.method(globalThis, "fetch", async (url: string) => url === "https://www.metrobank.com.ph/promos" ? new Response(list) : new Response("down", { status: 503 }));
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll, importBank } = await import("./import.ts");
  assert.deepEqual(await importBank("metrobank", "script", Date.now() - 1), { added: 0, updated: 0, gone: 0, removed: 0, read: 0, failed: 0, later: 1 });
  const [skipped] = await importAll("script", ["metrobank"], -1);
  assert.match(skipped.error ?? "", /wasn't time to check Metrobank/);
  const [failed] = await importAll("script", ["metrobank"]);
  assert.deepEqual(failed.result && [failed.result.added, failed.result.failed], [1, 1]);
  const [saved] = JSON.parse(await readFile(path.join(dir, "promos/metrobank.json"), "utf8"));
  assert.deepEqual([saved.starts, saved.ends, saved.details], ["2026-10-01", "2099-12-31", ""]);
});
